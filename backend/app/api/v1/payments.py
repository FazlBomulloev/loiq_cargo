import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, distinct, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import (
    Client,
    Goods,
    GoodsStatus,
    PaymentStatus,
    UserRole,
)
from app.schemas.payment import (
    DebtRow,
    DebtsResponse,
    PaymentSummary,
    SettleRequest,
    SettleResponse,
)
from app.services import settings_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

MONEY = Decimal("0.01")


def _guard(principal: Principal) -> None:
    if principal.role not in (
        UserRole.DUSHANBE_STAFF, UserRole.OWNER,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="доступ только для Душанбе / овнера",
        )


@router.get(
    "",
    response_model=DebtsResponse,
    summary="Задолженности и оплаты по клиентам",
)
async def list_debts(
    status_filter: Literal["debt", "paid", "all"] = Query(
        default="debt", alias="filter"
    ),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> DebtsResponse:
    _guard(principal)

    rate = await settings_service.get_exchange_rate(session)

    freight_somoni_expr = (
        func.coalesce(Goods.freight_cost_usd, 0) * rate
    )

    stmt = (
        select(
            Client.id,
            Client.client_code,
            Client.full_name,
            Client.phone,
            (Client.telegram_chat_id.is_not(None)).label(
                "tg_verified"
            ),
            func.max(Goods.delivered_at).label("delivered_at"),
            func.count(Goods.id).label("goods_count"),
            func.sum(freight_somoni_expr).label(
                "freight_somoni"
            ),
            func.sum(
                func.coalesce(Goods.storage_fee_somoni, 0)
            ).label("storage_somoni"),
            Goods.payment_status,
        )
        .join(Client, Client.id == Goods.client_id)
        .where(Goods.status == GoodsStatus.DELIVERED)
        .group_by(Client.id, Goods.payment_status)
        .order_by(func.max(Goods.delivered_at).desc())
    )
    if status_filter == "debt":
        stmt = stmt.where(
            Goods.payment_status == PaymentStatus.DEBT
        )
    elif status_filter == "paid":
        stmt = stmt.where(
            Goods.payment_status == PaymentStatus.PAID
        )

    rows = (await session.execute(stmt)).all()

    debt_rows: list[DebtRow] = []
    for r in rows:
        freight = Decimal(r.freight_somoni or 0).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        storage_sum = Decimal(r.storage_somoni or 0).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        total = (freight + storage_sum).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        debt_rows.append(
            DebtRow(
                client_id=r.id,
                client_code=r.client_code,
                client_full_name=r.full_name,
                phone=r.phone,
                telegram_verified=bool(r.tg_verified),
                delivered_at=r.delivered_at,
                goods_count=int(r.goods_count),
                freight_somoni=freight,
                storage_somoni=storage_sum,
                total_somoni=total,
                payment_status=r.payment_status.value,
            )
        )

    summary_stmt = select(
        func.sum(
            case(
                (
                    Goods.payment_status == PaymentStatus.PAID,
                    freight_somoni_expr
                    + func.coalesce(Goods.storage_fee_somoni, 0),
                ),
                else_=0,
            )
        ).label("paid_sum"),
        func.sum(
            case(
                (
                    Goods.payment_status == PaymentStatus.DEBT,
                    freight_somoni_expr
                    + func.coalesce(Goods.storage_fee_somoni, 0),
                ),
                else_=0,
            )
        ).label("debt_sum"),
        func.count(
            distinct(
                case(
                    (
                        Goods.payment_status
                        == PaymentStatus.DEBT,
                        Goods.client_id,
                    ),
                    else_=None,
                )
            )
        ).label("debt_clients"),
        func.count(
            distinct(
                case(
                    (
                        Goods.payment_status
                        == PaymentStatus.PAID,
                        Goods.client_id,
                    ),
                    else_=None,
                )
            )
        ).label("paid_clients"),
    ).where(Goods.status == GoodsStatus.DELIVERED)

    s = (await session.execute(summary_stmt)).one()
    summary = PaymentSummary(
        delivered_paid_somoni=Decimal(s.paid_sum or 0).quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        delivered_debt_somoni=Decimal(s.debt_sum or 0).quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
        debt_clients=int(s.debt_clients or 0),
        paid_clients=int(s.paid_clients or 0),
    )

    return DebtsResponse(
        summary=summary,
        rows=debt_rows,
        status_filter=status_filter,
    )


@router.post(
    "/settle",
    response_model=SettleResponse,
    summary="Закрыть долг клиента (перевести в оплачено)",
)
async def settle_debt(
    body: SettleRequest,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.DUSHANBE_STAFF, UserRole.OWNER)
    ),
) -> SettleResponse:
    _guard(principal)

    code = body.client_code.strip().upper()
    client = (
        await session.execute(
            select(Client).where(Client.client_code == code)
        )
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"клиент {code} не найден",
        )

    goods_rows = (
        await session.execute(
            select(Goods)
            .where(
                Goods.client_id == client.id,
                Goods.status == GoodsStatus.DELIVERED,
                Goods.payment_status == PaymentStatus.DEBT,
            )
            .with_for_update()
        )
    ).scalars().all()

    if not goods_rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="у клиента нет непогашенных долгов",
        )

    rate = await settings_service.get_exchange_rate(session)
    total = Decimal("0.00")
    now = datetime.now(timezone.utc)

    ids = [g.id for g in goods_rows]
    for g in goods_rows:
        freight_som = (
            Decimal(g.freight_cost_usd or 0) * rate
        ).quantize(MONEY, rounding=ROUND_HALF_UP)
        total += freight_som + Decimal(g.storage_fee_somoni or 0)

    await session.execute(
        update(Goods)
        .where(Goods.id.in_(ids))
        .values(payment_status=PaymentStatus.PAID)
    )
    await session.commit()

    log.info(
        "долг закрыт: клиент=%s товаров=%s сумма=%s c. в=%s",
        code, len(ids), total, now.isoformat(),
    )
    return SettleResponse(
        client_code=code,
        settled_count=len(ids),
        total_somoni=total.quantize(
            MONEY, rounding=ROUND_HALF_UP
        ),
    )
