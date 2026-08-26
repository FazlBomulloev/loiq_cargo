import asyncio
import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    Principal,
    assert_own_warehouse,
    require_staff,
)
from app.core.db import get_session
from app.models import (
    Client,
    Goods,
    GoodsStatus,
    UserRole,
    Warehouse,
)
from app.schemas.goods import (
    ClientLookup,
    GoodsListRow,
    GoodsReceiveRequest,
    GoodsReceiveResponse,
    WarehouseCounters,
)
from app.services import notify, settings_service
from app.services import tariff as tariff_svc

log = logging.getLogger(__name__)

router = APIRouter(prefix="/warehouses", tags=["warehouse-goods"])


async def _warehouse_or_404(
    session: AsyncSession, warehouse_id: int
) -> Warehouse:
    wh = (
        await session.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
    ).scalar_one_or_none()
    if wh is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="склад не найден",
        )
    return wh


@router.get(
    "/{warehouse_id}/clients/lookup",
    response_model=ClientLookup | None,
    summary="Быстрый поиск клиента по коду (preview формы приёмки)",
)
async def lookup_client(
    warehouse_id: int,
    code: str = Query(min_length=1, max_length=16),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> ClientLookup | None:
    assert_own_warehouse(principal, warehouse_id)
    await _warehouse_or_404(session, warehouse_id)
    client = (
        await session.execute(
            select(Client).where(
                Client.client_code == code.strip().upper()
            )
        )
    ).scalar_one_or_none()
    if client is None:
        return None
    return ClientLookup.model_validate(client)


@router.post(
    "/{warehouse_id}/goods",
    response_model=GoodsReceiveResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Приёмка товара на складе Китая",
)
async def receive_goods(
    warehouse_id: int,
    body: GoodsReceiveRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> GoodsReceiveResponse:
    assert_own_warehouse(principal, warehouse_id)
    wh = await _warehouse_or_404(session, warehouse_id)

    client: Client | None = None
    is_unclaimed = False
    raw_code = (body.client_code or "").strip().upper()

    if raw_code:
        client = (
            await session.execute(
                select(Client).where(Client.client_code == raw_code)
            )
        ).scalar_one_or_none()
        if client is None:
            if not body.accept_without_client:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=(
                        f"клиент с кодом {raw_code} не найден. "
                        "Отметьте «без клиента», чтобы всё "
                        "равно принять."
                    ),
                )
            is_unclaimed = True
    else:
        if not body.accept_without_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Укажите код клиента или подтвердите "
                    "приёмку без клиента."
                ),
            )
        is_unclaimed = True

    density = (body.weight_kg / body.volume_m3).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    tariff = await tariff_svc.get_active_tariff(
        session, warehouse_id
    )
    if tariff is None or not tariff.rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="у склада нет активного тарифа",
        )
    row = tariff_svc.pick_row(list(tariff.rows), density)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="не нашли ставку для плотности",
        )
    freight_usd = (row.rate_usd_per_kg * body.weight_kg).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    rate = await settings_service.get_exchange_rate(session)
    freight_somoni = (freight_usd * rate).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    now = datetime.now(timezone.utc)
    goods = Goods(
        client_id=client.id if client else None,
        warehouse_id=wh.id,
        received_by_id=(
            principal.user.id if principal.is_staff else None
        ),
        description=(body.description or "").strip() or None,
        weight_kg=body.weight_kg,
        volume_m3=body.volume_m3,
        density_kg_m3=density,
        rate_usd_per_kg=row.rate_usd_per_kg,
        freight_cost_usd=freight_usd,
        status=GoodsStatus.IN_CHINA,
        is_unclaimed=is_unclaimed,
        received_at=now,
    )
    session.add(goods)
    await session.commit()
    await session.refresh(goods)

    notified = False
    if client is not None and client.telegram_chat_id is not None:
        try:
            await notify.notify_arrived_china(client, goods, wh)
            notified = True
        except asyncio.CancelledError:
            raise
        except (RuntimeError, ValueError, OSError) as exc:
            log.warning(
                "уведомление о приёмке не ушло: %s", exc
            )

    log.info(
        "приёмка: goods=%s склад=%s код=%s unclaimed=%s",
        goods.id,
        wh.code.value,
        raw_code or "-",
        is_unclaimed,
    )
    return GoodsReceiveResponse(
        id=goods.id,
        client_code=client.client_code if client else None,
        client_full_name=client.full_name if client else None,
        is_unclaimed=is_unclaimed,
        description=goods.description,
        weight_kg=goods.weight_kg,
        volume_m3=goods.volume_m3,
        density_kg_m3=goods.density_kg_m3,
        rate_usd_per_kg=goods.rate_usd_per_kg or Decimal("0"),
        freight_usd=goods.freight_cost_usd or Decimal("0"),
        freight_somoni=freight_somoni,
        status=goods.status.value,
        received_at=goods.received_at,
        notified=notified,
    )


@router.get(
    "/{warehouse_id}/goods",
    response_model=list[GoodsListRow],
    summary="Товары склада (для сотрудника склада / овнера)",
)
async def list_warehouse_goods(
    warehouse_id: int,
    status_filter: Literal[
        "all", "in_china", "in_transit", "in_dushanbe",
        "burning", "unclaimed", "ready_to_ship"
    ] = Query(default="all", alias="filter"),
    q: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=200, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> list[GoodsListRow]:
    assert_own_warehouse(principal, warehouse_id)
    await _warehouse_or_404(session, warehouse_id)

    burning_days: int = int(
        await settings_service.get_value(
            session, "burning_days_threshold", 20
        )
    )
    now = datetime.now(timezone.utc)

    stmt = (
        select(Goods)
        .where(Goods.warehouse_id == warehouse_id)
        .options(
            selectinload(Goods.client),
            selectinload(Goods.shipment),
        )
        .order_by(Goods.received_at.desc())
        .limit(limit)
    )

    if status_filter == "in_china":
        stmt = stmt.where(Goods.status == GoodsStatus.IN_CHINA)
    elif status_filter == "in_transit":
        stmt = stmt.where(Goods.status == GoodsStatus.IN_TRANSIT)
    elif status_filter == "in_dushanbe":
        stmt = stmt.where(Goods.status == GoodsStatus.IN_DUSHANBE)
    elif status_filter == "unclaimed":
        stmt = stmt.where(Goods.is_unclaimed.is_(True))
    elif status_filter == "ready_to_ship":
        stmt = stmt.where(
            Goods.status == GoodsStatus.IN_CHINA,
            Goods.shipment_id.is_(None),
        )
    # "burning" — фильтруем в питоне, чтобы учесть текущее время

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.outerjoin(Client, Goods.client_id == Client.id)
        stmt = stmt.where(
            or_(
                Client.client_code.ilike(pattern),
                Goods.description.ilike(pattern),
            )
        )

    rows = (await session.execute(stmt)).scalars().all()
    result: list[GoodsListRow] = []
    for g in rows:
        age = (now - g.received_at).days
        is_burning = (
            g.status == GoodsStatus.IN_CHINA
            and age >= burning_days
        )
        if status_filter == "burning" and not is_burning:
            continue
        result.append(
            GoodsListRow(
                id=g.id,
                client_code=(
                    g.client.client_code if g.client else None
                ),
                client_full_name=(
                    g.client.full_name if g.client else None
                ),
                description=g.description,
                weight_kg=g.weight_kg,
                volume_m3=g.volume_m3,
                density_kg_m3=g.density_kg_m3,
                status=g.status.value,
                is_unclaimed=g.is_unclaimed,
                is_burning=is_burning,
                burning_days=age if is_burning else None,
                received_at=g.received_at,
                shipment_number=(
                    g.shipment.number if g.shipment else None
                ),
            )
        )
    return result


@router.get(
    "/{warehouse_id}/counters",
    response_model=WarehouseCounters,
    summary="Счётчики по складу (для подзаголовка списка)",
)
async def counters(
    warehouse_id: int,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> WarehouseCounters:
    assert_own_warehouse(principal, warehouse_id)
    await _warehouse_or_404(session, warehouse_id)

    burning_days = int(
        await settings_service.get_value(
            session, "burning_days_threshold", 20
        )
    )
    now = datetime.now(timezone.utc)

    total = (
        await session.execute(
            select(func.count(Goods.id)).where(
                Goods.warehouse_id == warehouse_id
            )
        )
    ).scalar_one()

    in_china = (
        await session.execute(
            select(func.count(Goods.id)).where(
                Goods.warehouse_id == warehouse_id,
                Goods.status == GoodsStatus.IN_CHINA,
            )
        )
    ).scalar_one()

    ready = (
        await session.execute(
            select(func.count(Goods.id)).where(
                Goods.warehouse_id == warehouse_id,
                Goods.status == GoodsStatus.IN_CHINA,
                Goods.shipment_id.is_(None),
            )
        )
    ).scalar_one()

    unclaimed = (
        await session.execute(
            select(func.count(Goods.id)).where(
                Goods.warehouse_id == warehouse_id,
                Goods.is_unclaimed.is_(True),
                Goods.status != GoodsStatus.DELIVERED,
            )
        )
    ).scalar_one()

    burning_stmt = select(Goods.received_at).where(
        Goods.warehouse_id == warehouse_id,
        Goods.status == GoodsStatus.IN_CHINA,
    )
    ages = (await session.execute(burning_stmt)).scalars().all()
    burning = sum(
        1 for r in ages if (now - r).days >= burning_days
    )

    return WarehouseCounters(
        total=total,
        in_china=in_china,
        ready_to_ship=ready,
        burning=burning,
        unclaimed=unclaimed,
    )
