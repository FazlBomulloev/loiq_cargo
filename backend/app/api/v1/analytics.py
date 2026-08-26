import logging
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import (
    ChangeRequest,
    ChangeRequestStatus,
    Client,
    Goods,
    GoodsStatus,
    PaymentStatus,
    Shipment,
    ShipmentStatus,
    UserRole,
    Warehouse,
)
from app.schemas.analytics import (
    OwnerDashboard,
    Period,
    ShipmentBrief,
    WarehouseStat,
)
from app.services import settings_service, storage

log = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

MONEY = Decimal("0.01")


def _period_start(period: Period, now: datetime) -> datetime | None:
    if period == "7d":
        return now - timedelta(days=7)
    if period == "30d":
        return now - timedelta(days=30)
    if period == "90d":
        return now - timedelta(days=90)
    return None


@router.get(
    "/owner",
    response_model=OwnerDashboard,
    summary="Дашборд овнера: выручка, партии, простой, заявки",
)
async def owner_dashboard(
    period: Period = Query(default="30d"),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> OwnerDashboard:
    now = datetime.now(timezone.utc)
    since = _period_start(period, now)

    rate = await settings_service.get_exchange_rate(session)
    burning_days = int(
        await settings_service.get_value(
            session, "burning_days_threshold", 20
        )
    )
    cfg = await storage.get_storage_config(session)

    freight_somoni_expr = (
        func.coalesce(Goods.freight_cost_usd, 0) * rate
    )

    revenue_stmt = select(
        func.coalesce(
            func.sum(
                case(
                    (
                        Goods.payment_status == PaymentStatus.PAID,
                        freight_somoni_expr
                        + func.coalesce(
                            Goods.storage_fee_somoni, 0
                        ),
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("paid_sum"),
        func.coalesce(
            func.sum(
                case(
                    (
                        Goods.payment_status == PaymentStatus.DEBT,
                        freight_somoni_expr
                        + func.coalesce(
                            Goods.storage_fee_somoni, 0
                        ),
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("debt_sum"),
        func.count(Goods.id).label("delivered"),
    ).where(Goods.status == GoodsStatus.DELIVERED)
    if since is not None:
        revenue_stmt = revenue_stmt.where(
            Goods.delivered_at >= since
        )
    rev = (await session.execute(revenue_stmt)).one()

    counts_stmt = (
        select(Goods.status, func.count(Goods.id))
        .where(Goods.status != GoodsStatus.DELIVERED)
        .group_by(Goods.status)
    )
    status_counts_rows = (
        await session.execute(counts_stmt)
    ).all()
    status_counts = {s: int(n) for s, n in status_counts_rows}

    burning_stmt = select(
        func.count(Goods.id)
    ).where(
        Goods.status == GoodsStatus.IN_CHINA,
        Goods.received_at
        <= now - timedelta(days=burning_days),
    )
    burning_count = int(
        (await session.execute(burning_stmt)).scalar_one() or 0
    )

    unclaimed_count = int(
        (
            await session.execute(
                select(func.count(Goods.id)).where(
                    Goods.is_unclaimed.is_(True),
                    Goods.status != GoodsStatus.DELIVERED,
                )
            )
        ).scalar_one() or 0
    )

    missing_count = int(
        (
            await session.execute(
                select(func.count(Goods.id)).where(
                    Goods.is_missing.is_(True),
                    Goods.status != GoodsStatus.DELIVERED,
                )
            )
        ).scalar_one() or 0
    )

    pending_requests = int(
        (
            await session.execute(
                select(func.count(ChangeRequest.id)).where(
                    ChangeRequest.status
                    == ChangeRequestStatus.PENDING,
                )
            )
        ).scalar_one() or 0
    )

    shipments_stmt = select(
        func.count(Shipment.id).label("cnt"),
        func.avg(Shipment.fill_pct).label("avg_fill"),
        func.avg(Shipment.total_cost_usd).label("avg_cost"),
    ).where(Shipment.status != ShipmentStatus.DRAFT)
    if since is not None:
        shipments_stmt = shipments_stmt.where(
            Shipment.departed_at >= since
        )
    sh_stats = (await session.execute(shipments_stmt)).one()

    storage_stmt = select(Goods).where(
        Goods.status == GoodsStatus.IN_DUSHANBE,
        Goods.arrived_in_dushanbe_at.is_not(None),
    )
    live_storage = (
        await session.execute(storage_stmt)
    ).scalars().all()
    storage_pending_sum = Decimal("0.00")
    storage_pending_goods = 0
    for g in live_storage:
        accr = storage.compute_storage(g, cfg, now=now)
        if accr.fee_somoni > 0:
            storage_pending_sum += accr.fee_somoni
            storage_pending_goods += 1

    new_clients_stmt = select(func.count(Client.id))
    if since is not None:
        new_clients_stmt = new_clients_stmt.where(
            Client.created_at >= since
        )
    new_clients = int(
        (await session.execute(new_clients_stmt)).scalar_one() or 0
    )

    wh_rows = (
        await session.execute(
            select(Warehouse).order_by(Warehouse.name)
        )
    ).scalars().all()
    warehouse_stats: list[WarehouseStat] = []
    for wh in wh_rows:
        wh_active = int(
            (
                await session.execute(
                    select(func.count(Goods.id)).where(
                        Goods.warehouse_id == wh.id,
                        Goods.status != GoodsStatus.DELIVERED,
                    )
                )
            ).scalar_one() or 0
        )
        wh_burn = int(
            (
                await session.execute(
                    select(func.count(Goods.id)).where(
                        Goods.warehouse_id == wh.id,
                        Goods.status == GoodsStatus.IN_CHINA,
                        Goods.received_at
                        <= now - timedelta(days=burning_days),
                    )
                )
            ).scalar_one() or 0
        )
        wh_uncl = int(
            (
                await session.execute(
                    select(func.count(Goods.id)).where(
                        Goods.warehouse_id == wh.id,
                        Goods.is_unclaimed.is_(True),
                        Goods.status != GoodsStatus.DELIVERED,
                    )
                )
            ).scalar_one() or 0
        )
        wh_ship_stmt = select(func.count(Shipment.id)).where(
            Shipment.warehouse_id == wh.id,
            Shipment.status != ShipmentStatus.DRAFT,
        )
        if since is not None:
            wh_ship_stmt = wh_ship_stmt.where(
                Shipment.departed_at >= since
            )
        wh_ships = int(
            (await session.execute(wh_ship_stmt)).scalar_one() or 0
        )

        wh_rev_stmt = select(
            func.coalesce(
                func.sum(
                    freight_somoni_expr
                    + func.coalesce(
                        Goods.storage_fee_somoni, 0
                    )
                ),
                0,
            )
        ).where(
            Goods.warehouse_id == wh.id,
            Goods.status == GoodsStatus.DELIVERED,
        )
        if since is not None:
            wh_rev_stmt = wh_rev_stmt.where(
                Goods.delivered_at >= since
            )
        wh_rev = Decimal(
            (
                await session.execute(wh_rev_stmt)
            ).scalar_one() or 0
        ).quantize(MONEY, rounding=ROUND_HALF_UP)

        warehouse_stats.append(
            WarehouseStat(
                warehouse_id=wh.id,
                warehouse_name=wh.name,
                active_goods=wh_active,
                burning_goods=wh_burn,
                unclaimed_goods=wh_uncl,
                shipments_in_period=wh_ships,
                revenue_somoni=wh_rev,
            )
        )

    recent_stmt = (
        select(Shipment, Warehouse, func.count(Goods.id))
        .join(Warehouse, Warehouse.id == Shipment.warehouse_id)
        .outerjoin(Goods, Goods.shipment_id == Shipment.id)
        .where(Shipment.status != ShipmentStatus.DRAFT)
        .group_by(Shipment.id, Warehouse.id)
        .order_by(Shipment.created_at.desc())
        .limit(5)
    )
    recent_rows = (await session.execute(recent_stmt)).all()
    recent_shipments = [
        ShipmentBrief(
            id=sh.id,
            number=sh.number,
            warehouse_name=wh.name,
            status=sh.status.value,
            goods_count=int(cnt or 0),
            total_cost_usd=Decimal(sh.total_cost_usd),
            fill_pct=(
                Decimal(sh.fill_pct)
                if sh.fill_pct is not None
                else None
            ),
            departed_at=sh.departed_at,
        )
        for sh, wh, cnt in recent_rows
    ]

    paid = Decimal(rev.paid_sum or 0).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )
    debt = Decimal(rev.debt_sum or 0).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )

    avg_fill = (
        Decimal(sh_stats.avg_fill).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if sh_stats.avg_fill is not None
        else None
    )
    avg_cost = (
        Decimal(sh_stats.avg_cost).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        if sh_stats.avg_cost is not None
        else None
    )

    return OwnerDashboard(
        period=period,
        revenue_somoni=(paid + debt).quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        revenue_paid_somoni=paid,
        revenue_debt_somoni=debt,
        delivered_count=int(rev.delivered or 0),
        shipments_count=int(sh_stats.cnt or 0),
        avg_fill_pct=avg_fill,
        avg_shipment_cost_usd=avg_cost,
        active_goods_total=sum(status_counts.values()),
        in_china=status_counts.get(GoodsStatus.IN_CHINA, 0),
        in_transit=status_counts.get(GoodsStatus.IN_TRANSIT, 0),
        in_dushanbe=status_counts.get(
            GoodsStatus.IN_DUSHANBE, 0
        ),
        burning_count=burning_count,
        unclaimed_count=unclaimed_count,
        missing_count=missing_count,
        pending_requests=pending_requests,
        storage_pending_somoni=storage_pending_sum.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        storage_pending_goods=storage_pending_goods,
        new_clients_in_period=new_clients,
        warehouses=warehouse_stats,
        recent_shipments=recent_shipments,
    )
