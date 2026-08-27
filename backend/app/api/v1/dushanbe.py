import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import (
    Client,
    Goods,
    GoodsStatus,
    PaymentStatus,
    Shipment,
    ShipmentStatus,
    UserRole,
    Warehouse,
)
from app.schemas.dushanbe import (
    DeliveryConfirmRequest,
    DeliveryConfirmResponse,
    DeliveryGoodsRow,
    DeliveryHistoryResponse,
    DeliveryHistoryRow,
    DeliveryPreview,
    ReceiveRequest,
    ReceiveResponse,
    WaybillDetail,
    WaybillGoodsRow,
    WaybillListRow,
)
from app.services import notify, settings_service, storage

log = logging.getLogger(__name__)

router = APIRouter(prefix="/dushanbe", tags=["dushanbe"])

MONEY = Decimal("0.01")


def _guard_dushanbe(principal: Principal) -> None:
    if principal.role not in (
        UserRole.DUSHANBE_STAFF, UserRole.OWNER,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="доступ только для склада Душанбе",
        )


@router.get(
    "/waybills",
    response_model=list[WaybillListRow],
    summary="Накладные (партии в пути / принятые)",
)
async def list_waybills(
    status_filter: Literal[
        "incoming", "arrived", "all"
    ] = Query(default="incoming", alias="filter"),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> list[WaybillListRow]:
    _guard_dushanbe(principal)

    stmt = (
        select(
            Shipment,
            Warehouse,
            func.count(Goods.id).label("goods_count"),
            func.sum(
                case(
                    (Goods.status == GoodsStatus.IN_DUSHANBE, 1),
                    (Goods.status == GoodsStatus.DELIVERED, 1),
                    else_=0,
                )
            ).label("received_count"),
            func.sum(
                case((Goods.is_missing.is_(True), 1), else_=0)
            ).label("missing_count"),
        )
        .join(Warehouse, Warehouse.id == Shipment.warehouse_id)
        .outerjoin(Goods, Goods.shipment_id == Shipment.id)
        .group_by(Shipment.id, Warehouse.id)
        .order_by(Shipment.departed_at.desc().nulls_last())
        .limit(200)
    )
    if status_filter == "incoming":
        stmt = stmt.where(
            Shipment.status == ShipmentStatus.IN_TRANSIT
        )
    elif status_filter == "arrived":
        stmt = stmt.where(
            Shipment.status == ShipmentStatus.ARRIVED
        )
    else:
        stmt = stmt.where(
            Shipment.status.in_(
                (
                    ShipmentStatus.IN_TRANSIT,
                    ShipmentStatus.ARRIVED,
                )
            )
        )

    rows = (await session.execute(stmt)).all()
    out: list[WaybillListRow] = []
    for sh, wh, cnt, recv, miss in rows:
        out.append(
            WaybillListRow(
                id=sh.id,
                number=sh.number,
                warehouse_id=wh.id,
                warehouse_name=wh.name,
                status=sh.status.value,
                goods_count=int(cnt or 0),
                received_count=int(recv or 0),
                missing_count=int(miss or 0),
                total_weight_kg=Decimal(sh.total_weight_kg),
                total_volume_m3=Decimal(sh.total_volume_m3),
                departed_at=sh.departed_at,
                arrived_at=sh.arrived_at,
            )
        )
    return out


async def _load_waybill(
    session: AsyncSession, shipment_id: int
) -> tuple[Shipment, Warehouse]:
    stmt = (
        select(Shipment)
        .where(Shipment.id == shipment_id)
        .options(
            selectinload(Shipment.warehouse),
            selectinload(Shipment.goods).selectinload(Goods.client),
        )
    )
    sh = (await session.execute(stmt)).scalar_one_or_none()
    if sh is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="партия не найдена",
        )
    if sh.status not in (
        ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="партия не в статусе накладной",
        )
    return sh, sh.warehouse


def _waybill_detail(sh: Shipment, wh: Warehouse) -> WaybillDetail:
    goods_rows: list[WaybillGoodsRow] = []
    for g in sorted(sh.goods, key=lambda x: x.received_at):
        goods_rows.append(
            WaybillGoodsRow(
                id=g.id,
                client_code=(
                    g.client.client_code if g.client else None
                ),
                client_full_name=(
                    g.client.full_name if g.client else None
                ),
                description=g.description,
                weight_kg=Decimal(g.weight_kg),
                volume_m3=Decimal(g.volume_m3),
                density_kg_m3=Decimal(g.density_kg_m3),
                status=g.status.value,
                is_missing=g.is_missing,
                is_unclaimed=g.is_unclaimed,
                received_at=g.received_at,
            )
        )
    return WaybillDetail(
        id=sh.id,
        number=sh.number,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        status=sh.status.value,
        total_weight_kg=Decimal(sh.total_weight_kg),
        total_volume_m3=Decimal(sh.total_volume_m3),
        total_cost_usd=Decimal(sh.total_cost_usd),
        departed_at=sh.departed_at,
        arrived_at=sh.arrived_at,
        note=sh.note,
        goods=goods_rows,
    )


@router.get(
    "/waybills/{shipment_id}",
    response_model=WaybillDetail,
    summary="Накладная (детали)",
)
async def get_waybill(
    shipment_id: int,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> WaybillDetail:
    _guard_dushanbe(principal)
    sh, wh = await _load_waybill(session, shipment_id)
    return _waybill_detail(sh, wh)


@router.post(
    "/waybills/{shipment_id}/receive",
    response_model=ReceiveResponse,
    summary="Принять партию: отметить полученные товары",
)
async def receive_waybill(
    shipment_id: int,
    body: ReceiveRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> ReceiveResponse:
    _guard_dushanbe(principal)

    stmt = (
        select(Shipment)
        .where(Shipment.id == shipment_id)
        .options(
            selectinload(Shipment.goods).selectinload(Goods.client),
        )
        .with_for_update()
    )
    sh = (await session.execute(stmt)).scalar_one_or_none()
    if sh is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="партия не найдена",
        )
    if sh.status != ShipmentStatus.IN_TRANSIT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="партия уже принята",
        )

    goods_by_id = {g.id: g for g in sh.goods}
    received = {int(x) for x in body.received_ids}
    unknown = received - set(goods_by_id.keys())
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "часть отмеченных товаров не из этой партии"
            ),
        )

    now = datetime.now(timezone.utc)
    notify_targets: list[Goods] = []
    received_count = 0
    missing_count = 0

    for g in sh.goods:
        if g.id in received:
            if g.status != GoodsStatus.IN_TRANSIT:
                continue
            g.status = GoodsStatus.IN_DUSHANBE
            g.arrived_in_dushanbe_at = now
            g.is_missing = False
            received_count += 1
            notify_targets.append(g)
        else:
            g.is_missing = True
            missing_count += 1

    sh.status = ShipmentStatus.ARRIVED
    sh.arrived_at = now

    await session.commit()

    notified = 0
    for g in notify_targets:
        client = g.client
        if client is None or client.telegram_chat_id is None:
            continue
        try:
            await notify.notify_arrived_dushanbe(client, g)
            notified += 1
        except asyncio.CancelledError:
            raise
        except (RuntimeError, ValueError, OSError) as exc:
            log.warning(
                "уведомление о прибытии не ушло: %s", exc
            )

    log.info(
        "накладная %s принята: получено=%s, недостача=%s",
        sh.number, received_count, missing_count,
    )
    return ReceiveResponse(
        shipment_id=sh.id,
        status=sh.status.value,
        received_count=received_count,
        missing_count=missing_count,
        notified_count=notified,
    )


async def _client_by_code(
    session: AsyncSession, code: str
) -> Client:
    client = (
        await session.execute(
            select(Client).where(
                Client.client_code == code.strip().upper()
            )
        )
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"клиент {code} не найден",
        )
    return client


@router.get(
    "/delivery/lookup",
    response_model=DeliveryPreview,
    summary="Превью выдачи по коду клиента",
)
async def delivery_lookup(
    code: str = Query(min_length=1, max_length=16),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> DeliveryPreview:
    _guard_dushanbe(principal)
    client = await _client_by_code(session, code)

    stmt = (
        select(Goods)
        .where(
            Goods.client_id == client.id,
            Goods.status == GoodsStatus.IN_DUSHANBE,
        )
        .options(
            selectinload(Goods.warehouse),
            selectinload(Goods.shipment),
        )
        .order_by(Goods.arrived_in_dushanbe_at.asc())
    )
    goods_rows = (await session.execute(stmt)).scalars().all()

    cfg = await storage.get_storage_config(session)
    rate = await settings_service.get_exchange_rate(session)

    delivery_rows: list[DeliveryGoodsRow] = []
    total_freight = Decimal("0.00")
    total_storage = Decimal("0.00")
    for g in goods_rows:
        accr = storage.compute_storage(g, cfg)
        freight_som = (
            Decimal(g.freight_cost_usd or 0) * rate
        ).quantize(MONEY, rounding=ROUND_HALF_UP)
        total_freight += freight_som
        total_storage += accr.fee_somoni
        delivery_rows.append(
            DeliveryGoodsRow(
                id=g.id,
                description=g.description,
                warehouse_name=g.warehouse.name,
                weight_kg=Decimal(g.weight_kg),
                volume_m3=Decimal(g.volume_m3),
                density_kg_m3=Decimal(g.density_kg_m3),
                freight_somoni=freight_som,
                storage_days=accr.days_since_arrival,
                storage_paid_days=accr.paid_days,
                storage_fee_somoni=accr.fee_somoni,
                arrived_in_dushanbe_at=(
                    g.arrived_in_dushanbe_at
                ),
                shipment_number=(
                    g.shipment.number if g.shipment else None
                ),
            )
        )

    return DeliveryPreview(
        client_id=client.id,
        client_code=client.client_code,
        client_full_name=client.full_name,
        phone=client.phone,
        telegram_verified=(
            client.telegram_chat_id is not None
        ),
        goods=delivery_rows,
        total_freight_somoni=total_freight.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        total_storage_somoni=total_storage.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        total_to_pay_somoni=(
            total_freight + total_storage
        ).quantize(MONEY, rounding=ROUND_HALF_UP),
        exchange_rate=rate,
        free_storage_days=cfg.free_days,
        storage_daily_coef_somoni=cfg.daily_coef_somoni,
    )


@router.post(
    "/delivery",
    response_model=DeliveryConfirmResponse,
    summary="Полная выдача клиенту",
)
async def deliver(
    body: DeliveryConfirmRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> DeliveryConfirmResponse:
    _guard_dushanbe(principal)
    client = await _client_by_code(session, body.client_code)

    stmt = (
        select(Goods)
        .where(
            Goods.client_id == client.id,
            Goods.status == GoodsStatus.IN_DUSHANBE,
        )
        .with_for_update()
    )
    goods_rows = (await session.execute(stmt)).scalars().all()
    if not goods_rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="у клиента нет товаров к выдаче",
        )

    cfg = await storage.get_storage_config(session)
    rate = await settings_service.get_exchange_rate(session)
    now = datetime.now(timezone.utc)

    total = Decimal("0.00")
    payment_status = (
        PaymentStatus.PAID if body.paid else PaymentStatus.DEBT
    )
    for g in goods_rows:
        accr = storage.compute_storage(g, cfg, now=now)
        freight_som = (
            Decimal(g.freight_cost_usd or 0) * rate
        ).quantize(MONEY, rounding=ROUND_HALF_UP)
        g.storage_fee_somoni = accr.fee_somoni
        g.status = GoodsStatus.DELIVERED
        g.delivered_at = now
        g.payment_status = payment_status
        total += freight_som + accr.fee_somoni

    await session.commit()

    log.info(
        "выдача %s: %s товаров, к оплате %s c., статус=%s",
        client.client_code, len(goods_rows), total,
        payment_status.value,
    )
    return DeliveryConfirmResponse(
        client_code=client.client_code,
        delivered_count=len(goods_rows),
        total_paid_somoni=total.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        payment_status=payment_status.value,
        delivered_at=now,
    )


@router.get(
    "/delivery/history",
    response_model=DeliveryHistoryResponse,
    summary="История выдач (фильтры + поиск по коду / имени / телефону)",
)
async def delivery_history(
    period: Literal["7d", "30d", "90d", "all"] = Query(default="30d"),
    payment: Literal["paid", "debt", "all"] = Query(default="all"),
    q: str | None = Query(default=None, max_length=64),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> DeliveryHistoryResponse:
    _guard_dushanbe(principal)

    now = datetime.now(timezone.utc)
    since: datetime | None
    if period == "7d":
        since = now - timedelta(days=7)
    elif period == "30d":
        since = now - timedelta(days=30)
    elif period == "90d":
        since = now - timedelta(days=90)
    else:
        since = None

    stmt = (
        select(Goods, Client)
        .join(Client, Client.id == Goods.client_id)
        .where(
            Goods.status == GoodsStatus.DELIVERED,
            Goods.delivered_at.is_not(None),
        )
        .order_by(Goods.delivered_at.desc())
    )
    if since is not None:
        stmt = stmt.where(Goods.delivered_at >= since)
    if payment == "paid":
        stmt = stmt.where(Goods.payment_status == PaymentStatus.PAID)
    elif payment == "debt":
        stmt = stmt.where(Goods.payment_status == PaymentStatus.DEBT)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Client.client_code.ilike(pat),
                Client.full_name.ilike(pat),
                Client.phone.ilike(pat),
            )
        )

    rate = await settings_service.get_exchange_rate(session)

    # Группируем по (client_id, delivered_at, payment_status).
    # При «полной выдаче» все goods одного клиента получают одинаковый
    # delivered_at (до миллисекунды) — этого достаточно, чтобы объединить.
    Bucket = tuple[int, datetime, str]
    buckets: dict[Bucket, dict] = {}

    for goods, client in (await session.execute(stmt)).all():
        assert goods.delivered_at is not None
        key: Bucket = (
            client.id,
            goods.delivered_at,
            goods.payment_status.value,
        )
        b = buckets.setdefault(
            key,
            {
                "client": client,
                "count": 0,
                "freight": Decimal("0.00"),
                "storage": Decimal("0.00"),
            },
        )
        freight_som = (
            Decimal(goods.freight_cost_usd or 0) * rate
        ).quantize(MONEY, rounding=ROUND_HALF_UP)
        b["count"] = int(b["count"]) + 1
        b["freight"] = Decimal(b["freight"]) + freight_som
        b["storage"] = Decimal(b["storage"]) + Decimal(
            goods.storage_fee_somoni or 0
        )

    rows: list[DeliveryHistoryRow] = []
    total_pay = Decimal("0.00")
    total_paid = Decimal("0.00")
    total_debt = Decimal("0.00")

    ordered = sorted(
        buckets.items(), key=lambda kv: kv[0][1], reverse=True
    )
    for (cid, when, pay_status), b in ordered:
        client: Client = b["client"]
        pay = (
            Decimal(b["freight"]) + Decimal(b["storage"])
        ).quantize(MONEY, rounding=ROUND_HALF_UP)
        total_pay += pay
        if pay_status == PaymentStatus.PAID.value:
            total_paid += pay
        else:
            total_debt += pay
        rows.append(
            DeliveryHistoryRow(
                delivered_at=when,
                client_id=cid,
                client_code=client.client_code,
                client_full_name=client.full_name,
                phone=client.phone,
                goods_count=int(b["count"]),
                total_freight_somoni=Decimal(b["freight"]).quantize(
                    MONEY, rounding=ROUND_HALF_UP
                ),
                total_storage_somoni=Decimal(b["storage"]).quantize(
                    MONEY, rounding=ROUND_HALF_UP
                ),
                total_pay_somoni=pay,
                payment_status=pay_status,
            )
        )

    return DeliveryHistoryResponse(
        period=period,
        payment=payment,
        q=(q.strip() if q else None) or None,
        total_count=len(rows),
        total_pay_somoni=total_pay.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        total_paid_somoni=total_paid.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        total_debt_somoni=total_debt.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        rows=rows[:500],
    )
