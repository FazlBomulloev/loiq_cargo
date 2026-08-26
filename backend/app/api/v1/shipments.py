import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    Principal,
    assert_own_warehouse,
    require_staff,
)
from app.core.db import get_session
from app.models import (
    Goods,
    GoodsStatus,
    Shipment,
    ShipmentStatus,
    UserRole,
    Warehouse,
)
from app.schemas.shipment import (
    ConfirmRequest,
    PlanGateStatus,
    PlanGoodsRow,
    PlanGroupStats,
    PlanRequest,
    PlanResponse,
    ShipmentDetail,
    ShipmentGoodsRow,
    ShipmentListRow,
)
from app.services import dispatch, notify

log = logging.getLogger(__name__)

router = APIRouter(tags=["shipments"])


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


def _row_from_candidate(c: dispatch.Candidate) -> PlanGoodsRow:
    g = c.goods
    client_code = g.client.client_code if g.client else None
    client_name = g.client.full_name if g.client else None
    return PlanGoodsRow(
        id=g.id,
        client_code=client_code,
        client_full_name=client_name,
        description=g.description,
        weight_kg=Decimal(g.weight_kg),
        volume_m3=Decimal(g.volume_m3),
        density_kg_m3=Decimal(g.density_kg_m3),
        density_group=c.density_group,
        rate_usd_per_kg=Decimal(g.rate_usd_per_kg or 0),
        freight_usd=Decimal(g.freight_cost_usd or 0),
        received_at=g.received_at,
        age_days=c.age_days,
        is_burning=c.is_burning,
        reason=c.reason,
    )


def _plan_to_response(plan: dispatch.PlanResult) -> PlanResponse:
    fill_ok = plan.fill_pct >= plan.fill_target_pct
    cost_ok = plan.total_cost >= plan.target_cost_usd
    weight_ok = plan.total_weight <= plan.truck_weight

    gate_fill = PlanGateStatus(
        ok=fill_ok,
        label=f"заполненность ≥ {plan.fill_target_pct}%",
        detail=f"сейчас {plan.fill_pct}%",
    )
    gate_cost = PlanGateStatus(
        ok=cost_ok,
        label=f"стоимость ≥ ${int(plan.target_cost_usd):,}".replace(
            ",", " "
        ),
        detail=f"сейчас ${plan.total_cost}",
    )
    gate_weight = PlanGateStatus(
        ok=weight_ok,
        label=f"вес ≤ {int(plan.truck_weight)} кг",
        detail=f"сейчас {plan.total_weight} кг",
    )
    return PlanResponse(
        warehouse_id=plan.warehouse.id,
        warehouse_name=plan.warehouse.name,
        truck_volume_m3=plan.truck_volume,
        truck_weight_kg=plan.truck_weight,
        target_cost_usd=plan.target_cost_usd,
        fill_target_pct=plan.fill_target_pct,
        burning_days_threshold=plan.burning_days,
        total_volume_m3=plan.total_volume,
        total_weight_kg=plan.total_weight,
        total_cost_usd=plan.total_cost,
        fill_pct=plan.fill_pct,
        gate_fill=gate_fill,
        gate_cost=gate_cost,
        gate_weight=gate_weight,
        is_ready=fill_ok and cost_ok and weight_ok,
        groups={
            g: PlanGroupStats(
                volume_m3=s.volume,
                weight_kg=s.weight,
                quota_m3=s.quota,
                quota_pct=s.quota_pct,
                count=s.count,
            )
            for g, s in plan.groups.items()
        },
        selected=[_row_from_candidate(c) for c in plan.selected],
        left_behind=[
            _row_from_candidate(c) for c in plan.left_behind
        ],
    )


@router.post(
    "/warehouses/{warehouse_id}/shipments/plan",
    response_model=PlanResponse,
    summary="Построить план отправки (превью, без сохранения)",
)
async def build_plan(
    warehouse_id: int,
    body: PlanRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> PlanResponse:
    assert_own_warehouse(principal, warehouse_id)
    wh = await _warehouse_or_404(session, warehouse_id)
    plan = await dispatch.build_plan(
        session=session,
        warehouse=wh,
        truck_vol_override=body.truck_volume_m3,
        truck_wt_override=body.truck_weight_kg,
        include_ids=body.include_ids,
        exclude_ids=body.exclude_ids,
    )
    return _plan_to_response(plan)


async def _next_seq_today(
    session: AsyncSession, warehouse_id: int, now: datetime
) -> int:
    day_start = datetime(
        now.year, now.month, now.day, tzinfo=timezone.utc
    )
    count = (
        await session.execute(
            select(func.count(Shipment.id)).where(
                Shipment.warehouse_id == warehouse_id,
                Shipment.created_at >= day_start,
            )
        )
    ).scalar_one()
    return int(count) + 1


@router.post(
    "/warehouses/{warehouse_id}/shipments",
    response_model=ShipmentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Подтвердить и создать партию (fуpа отправляется)",
)
async def create_shipment(
    warehouse_id: int,
    body: ConfirmRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.CHINA_STAFF, UserRole.OWNER)
    ),
) -> ShipmentDetail:
    assert_own_warehouse(principal, warehouse_id)
    wh = await _warehouse_or_404(session, warehouse_id)

    ids = list({int(x) for x in body.goods_ids})
    if not ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="список товаров пуст",
        )

    goods_rows = (
        await session.execute(
            select(Goods)
            .where(Goods.id.in_(ids))
            .options(selectinload(Goods.client))
            .with_for_update()
        )
    ).scalars().all()

    if len(goods_rows) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="часть товаров не найдена",
        )
    for g in goods_rows:
        if g.warehouse_id != wh.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"товар {g.id} привязан к другому складу"
                ),
            )
        if g.status != GoodsStatus.IN_CHINA:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"товар {g.id} не в статусе «на складе Китая»"
                ),
            )
        if g.shipment_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"товар {g.id} уже привязан к партии"
                ),
            )

    truck_vol = (
        body.truck_volume_m3
        if body.truck_volume_m3 is not None
        else Decimal(wh.truck_volume_m3)
    )
    truck_wt = (
        body.truck_weight_kg
        if body.truck_weight_kg is not None
        else Decimal(wh.truck_weight_kg)
    )

    total_vol = sum(
        (Decimal(g.volume_m3) for g in goods_rows),
        start=Decimal("0"),
    )
    total_wt = sum(
        (Decimal(g.weight_kg) for g in goods_rows),
        start=Decimal("0"),
    )
    total_cost = sum(
        (Decimal(g.freight_cost_usd or 0) for g in goods_rows),
        start=Decimal("0"),
    )
    if total_wt > truck_wt:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "перегруз по весу: "
                f"{total_wt} > {truck_wt} кг"
            ),
        )
    if total_vol > truck_vol:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "перегруз по объёму: "
                f"{total_vol} > {truck_vol} м³"
            ),
        )

    now = datetime.now(timezone.utc)
    seq = await _next_seq_today(session, wh.id, now)
    number = dispatch.make_shipment_number(wh.code.value, now, seq)

    vol_pct = (
        total_vol / truck_vol * 100 if truck_vol else Decimal("0")
    )
    wt_pct = (
        total_wt / truck_wt * 100 if truck_wt else Decimal("0")
    )
    fill_pct = max(vol_pct, wt_pct)

    shipment = Shipment(
        number=number,
        warehouse_id=wh.id,
        status=ShipmentStatus.IN_TRANSIT,
        departed_at=now,
        truck_volume_m3=truck_vol,
        truck_weight_kg=truck_wt,
        total_volume_m3=total_vol,
        total_weight_kg=total_wt,
        total_cost_usd=total_cost,
        fill_pct=fill_pct,
        note=body.note,
    )
    session.add(shipment)
    await session.flush()

    notify_targets: list[tuple[Goods, Warehouse]] = []
    for g in goods_rows:
        g.shipment_id = shipment.id
        g.status = GoodsStatus.IN_TRANSIT
        notify_targets.append((g, wh))

    await session.commit()
    await session.refresh(shipment)

    for g, w in notify_targets:
        if g.client is None or g.client.telegram_chat_id is None:
            continue
        try:
            await notify.notify_departed(g.client, g, w)
        except asyncio.CancelledError:
            raise
        except (RuntimeError, ValueError, OSError) as exc:
            log.warning(
                "уведомление об отправке не ушло: %s", exc
            )

    log.info(
        "партия создана: %s склад=%s товаров=%s",
        number, wh.code.value, len(goods_rows),
    )

    return await _shipment_detail(session, shipment.id, wh)


async def _shipment_detail(
    session: AsyncSession,
    shipment_id: int,
    warehouse: Warehouse | None = None,
) -> ShipmentDetail:
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
    wh = warehouse or sh.warehouse
    goods_rows: list[ShipmentGoodsRow] = []
    for g in sorted(sh.goods, key=lambda x: x.received_at):
        goods_rows.append(
            ShipmentGoodsRow(
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
                freight_usd=Decimal(g.freight_cost_usd or 0),
                status=g.status.value,
                received_at=g.received_at,
            )
        )
    return ShipmentDetail(
        id=sh.id,
        number=sh.number,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        status=sh.status.value,
        truck_volume_m3=(
            Decimal(sh.truck_volume_m3)
            if sh.truck_volume_m3 is not None
            else None
        ),
        truck_weight_kg=(
            Decimal(sh.truck_weight_kg)
            if sh.truck_weight_kg is not None
            else None
        ),
        total_volume_m3=Decimal(sh.total_volume_m3),
        total_weight_kg=Decimal(sh.total_weight_kg),
        total_cost_usd=Decimal(sh.total_cost_usd),
        fill_pct=(
            Decimal(sh.fill_pct) if sh.fill_pct is not None else None
        ),
        note=sh.note,
        departed_at=sh.departed_at,
        arrived_at=sh.arrived_at,
        created_at=sh.created_at,
        goods=goods_rows,
    )


@router.get(
    "/warehouses/{warehouse_id}/shipments",
    response_model=list[ShipmentListRow],
    summary="Партии склада",
)
async def list_shipments(
    warehouse_id: int,
    status_filter: Literal[
        "all", "in_transit", "arrived", "closed"
    ] = Query(default="all", alias="filter"),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(
            UserRole.CHINA_STAFF,
            UserRole.DUSHANBE_STAFF,
            UserRole.OWNER,
        )
    ),
) -> list[ShipmentListRow]:
    if principal.role == UserRole.CHINA_STAFF:
        assert_own_warehouse(principal, warehouse_id)
    await _warehouse_or_404(session, warehouse_id)

    stmt = (
        select(
            Shipment,
            func.count(Goods.id).label("goods_count"),
        )
        .outerjoin(Goods, Goods.shipment_id == Shipment.id)
        .where(Shipment.warehouse_id == warehouse_id)
        .group_by(Shipment.id)
        .order_by(Shipment.created_at.desc())
        .limit(limit)
    )
    if status_filter != "all":
        stmt = stmt.where(
            Shipment.status == ShipmentStatus(status_filter)
        )
    rows = (await session.execute(stmt)).all()
    out: list[ShipmentListRow] = []
    for sh, cnt in rows:
        out.append(
            ShipmentListRow(
                id=sh.id,
                number=sh.number,
                status=sh.status.value,
                goods_count=int(cnt or 0),
                total_volume_m3=Decimal(sh.total_volume_m3),
                total_weight_kg=Decimal(sh.total_weight_kg),
                total_cost_usd=Decimal(sh.total_cost_usd),
                fill_pct=(
                    Decimal(sh.fill_pct)
                    if sh.fill_pct is not None
                    else None
                ),
                departed_at=sh.departed_at,
                arrived_at=sh.arrived_at,
                created_at=sh.created_at,
            )
        )
    return out


@router.get(
    "/shipments/{shipment_id}",
    response_model=ShipmentDetail,
    summary="Детали партии (список товаров)",
)
async def get_shipment(
    shipment_id: int,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(
            UserRole.CHINA_STAFF,
            UserRole.DUSHANBE_STAFF,
            UserRole.OWNER,
        )
    ),
) -> ShipmentDetail:
    detail = await _shipment_detail(session, shipment_id)
    if principal.role == UserRole.CHINA_STAFF:
        assert_own_warehouse(principal, detail.warehouse_id)
    return detail
