import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_client_only
from app.core.config import get_settings
from app.core.db import get_session
from app.core.security import hash_password
from app.models import Client, Goods, GoodsStatus, Warehouse
from app.models.enums import (
    PaymentStatus,
    TelegramVerificationStatus,
)
from app.schemas.analytics import (
    ClientAnalytics,
    ClientHistoryItem,
)
from app.schemas.client import (
    ClientRegisterRequest,
    ClientRegisterResponse,
    ClientSummary,
    GoodsListItem,
    VerifyCodeResponse,
)
from app.services import client_codes, settings_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/clients", tags=["clients"])
_settings = get_settings()


def _deep_link(code: str) -> str:
    return f"https://t.me/{_settings.tg_bot_username}?start={code}"


@router.post(
    "/register",
    response_model=ClientRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация клиента",
)
async def register(
    body: ClientRegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> ClientRegisterResponse:
    if await client_codes.is_phone_taken(session, body.phone):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="телефон уже зарегистрирован",
        )

    code = await client_codes.generate_client_code(session)
    tg_code = client_codes.generate_tg_verification_code()

    client = Client(
        client_code=code,
        full_name=body.full_name.strip(),
        phone=body.phone,
        city=(body.city or "").strip() or None,
        password_hash=hash_password(body.password),
        telegram_verification_code=tg_code,
        telegram_status=TelegramVerificationStatus.PENDING,
    )
    session.add(client)
    await session.commit()

    log.info("зарегистрирован клиент %s", code)
    return ClientRegisterResponse(
        client_code=code,
        telegram_verification_code=tg_code,
        telegram_deep_link=_deep_link(tg_code),
    )


@router.get(
    "/me/verify-code",
    response_model=VerifyCodeResponse,
    summary="Код и статус верификации Telegram",
)
async def get_verify_code(
    principal: Principal = Depends(require_client_only()),
    session: AsyncSession = Depends(get_session),
) -> VerifyCodeResponse:
    c = principal.client
    if c.telegram_verification_code is None:
        c.telegram_verification_code = (
            client_codes.generate_tg_verification_code()
        )
        if c.telegram_status == (
            TelegramVerificationStatus.NOT_STARTED
        ):
            c.telegram_status = TelegramVerificationStatus.PENDING
        await session.commit()

    return VerifyCodeResponse(
        telegram_verification_code=c.telegram_verification_code,
        telegram_status=c.telegram_status.value,
        telegram_deep_link=_deep_link(
            c.telegram_verification_code
        ),
    )


@router.post(
    "/me/verify-code/regenerate",
    response_model=VerifyCodeResponse,
    summary="Сгенерировать новый код Telegram",
)
async def regenerate_verify_code(
    principal: Principal = Depends(require_client_only()),
    session: AsyncSession = Depends(get_session),
) -> VerifyCodeResponse:
    c = principal.client
    if c.telegram_status == TelegramVerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram уже подтверждён",
        )
    c.telegram_verification_code = (
        client_codes.generate_tg_verification_code()
    )
    c.telegram_status = TelegramVerificationStatus.PENDING
    await session.commit()
    return VerifyCodeResponse(
        telegram_verification_code=c.telegram_verification_code,
        telegram_status=c.telegram_status.value,
        telegram_deep_link=_deep_link(
            c.telegram_verification_code
        ),
    )


@router.get(
    "/me/summary",
    response_model=ClientSummary,
    summary="KPI клиента",
)
async def summary(
    principal: Principal = Depends(require_client_only()),
    session: AsyncSession = Depends(get_session),
) -> ClientSummary:
    cid = principal.client.id

    counts_rows = (
        await session.execute(
            select(Goods.status, func.count(Goods.id))
            .where(
                Goods.client_id == cid,
                Goods.status != GoodsStatus.DELIVERED,
            )
            .group_by(Goods.status)
        )
    ).all()
    counts: dict[GoodsStatus, int] = {
        s: n for s, n in counts_rows
    }

    oldest_in_dsh = (
        await session.execute(
            select(func.min(Goods.arrived_in_dushanbe_at)).where(
                Goods.client_id == cid,
                Goods.status == GoodsStatus.IN_DUSHANBE,
            )
        )
    ).scalar_one_or_none()

    oldest_days: int | None = None
    if oldest_in_dsh is not None:
        delta = datetime.now(timezone.utc) - oldest_in_dsh
        oldest_days = max(delta.days, 0)

    debt = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(Goods.storage_fee_somoni), 0
                )
            ).where(
                Goods.client_id == cid,
                Goods.payment_status == PaymentStatus.DEBT,
            )
        )
    ).scalar_one() or Decimal("0")

    return ClientSummary(
        in_china_count=counts.get(GoodsStatus.IN_CHINA, 0),
        in_transit_count=counts.get(GoodsStatus.IN_TRANSIT, 0),
        in_dushanbe_count=counts.get(GoodsStatus.IN_DUSHANBE, 0),
        in_dushanbe_oldest_days=oldest_days,
        debt_somoni=Decimal(debt),
    )


@router.get(
    "/me/analytics",
    response_model=ClientAnalytics,
    summary="Расширенная статистика клиента",
)
async def analytics(
    principal: Principal = Depends(require_client_only()),
    session: AsyncSession = Depends(get_session),
) -> ClientAnalytics:
    cid = principal.client.id
    rate = await settings_service.get_exchange_rate(session)
    money = Decimal("0.01")

    delivered = (
        await session.execute(
            select(Goods)
            .where(
                Goods.client_id == cid,
                Goods.status == GoodsStatus.DELIVERED,
            )
            .order_by(Goods.delivered_at.desc())
        )
    ).scalars().all()

    total_freight = Decimal("0.00")
    total_storage = Decimal("0.00")
    total_paid = Decimal("0.00")
    total_debt = Decimal("0.00")

    day_buckets: dict[
        tuple[datetime, str], dict[str, Decimal | int]
    ] = {}
    for g in delivered:
        freight = (
            Decimal(g.freight_cost_usd or 0) * rate
        ).quantize(money, rounding=ROUND_HALF_UP)
        storage_fee = Decimal(g.storage_fee_somoni or 0)
        total_freight += freight
        total_storage += storage_fee
        total_paid_here = freight + storage_fee
        if g.payment_status == PaymentStatus.PAID:
            total_paid += total_paid_here
        else:
            total_debt += total_paid_here

        day = (
            g.delivered_at.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if g.delivered_at
            else datetime.now(timezone.utc)
        )
        key = (day, g.payment_status.value)
        b = day_buckets.setdefault(
            key,
            {
                "goods_count": 0,
                "freight": Decimal("0.00"),
                "storage": Decimal("0.00"),
            },
        )
        b["goods_count"] = int(b["goods_count"]) + 1
        b["freight"] = Decimal(b["freight"]) + freight
        b["storage"] = Decimal(b["storage"]) + storage_fee

    history: list[ClientHistoryItem] = [
        ClientHistoryItem(
            delivered_at=day,
            goods_count=int(b["goods_count"]),
            total_freight_somoni=Decimal(b["freight"]).quantize(
                money, rounding=ROUND_HALF_UP
            ),
            total_storage_somoni=Decimal(b["storage"]).quantize(
                money, rounding=ROUND_HALF_UP
            ),
            payment_status=status_,
        )
        for (day, status_), b in sorted(
            day_buckets.items(),
            key=lambda kv: kv[0][0],
            reverse=True,
        )
    ]

    active_freight = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        func.coalesce(
                            Goods.freight_cost_usd, 0
                        ) * rate
                    ),
                    0,
                )
            ).where(
                Goods.client_id == cid,
                Goods.status.in_(
                    (
                        GoodsStatus.IN_CHINA,
                        GoodsStatus.IN_TRANSIT,
                        GoodsStatus.IN_DUSHANBE,
                    )
                ),
            )
        )
    ).scalar_one() or Decimal("0")

    transit_deltas: list[float] = []
    for g in delivered:
        if (
            g.arrived_in_dushanbe_at is None
            or g.received_at is None
        ):
            continue
        delta = (
            g.arrived_in_dushanbe_at - g.received_at
        ).total_seconds() / 86400
        if delta >= 0:
            transit_deltas.append(delta)
    avg_transit = (
        sum(transit_deltas) / len(transit_deltas)
        if transit_deltas
        else None
    )

    return ClientAnalytics(
        total_delivered_count=len(delivered),
        total_freight_somoni=total_freight.quantize(
            money, rounding=ROUND_HALF_UP
        ),
        total_storage_somoni=total_storage.quantize(
            money, rounding=ROUND_HALF_UP
        ),
        total_paid_somoni=total_paid.quantize(
            money, rounding=ROUND_HALF_UP
        ),
        total_debt_somoni=total_debt.quantize(
            money, rounding=ROUND_HALF_UP
        ),
        active_freight_estimate_somoni=Decimal(
            active_freight
        ).quantize(money, rounding=ROUND_HALF_UP),
        avg_transit_days=(
            round(avg_transit, 1)
            if avg_transit is not None
            else None
        ),
        history=history[:20],
    )


@router.get(
    "/me/goods",
    response_model=list[GoodsListItem],
    summary="Список товаров клиента",
)
async def my_goods(
    principal: Principal = Depends(require_client_only()),
    session: AsyncSession = Depends(get_session),
) -> list[GoodsListItem]:
    cid = principal.client.id
    burning_threshold_days: int = int(
        await settings_service.get_value(
            session, "burning_days_threshold", 20
        )
    )

    rate = await settings_service.get_exchange_rate(session)
    money = Decimal("0.01")

    rows = (
        await session.execute(
            select(Goods)
            .where(Goods.client_id == cid)
            .order_by(Goods.received_at.desc())
            .options(
                selectinload(Goods.warehouse),
                selectinload(Goods.shipment),
            )
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    result: list[GoodsListItem] = []
    for g in rows:
        wh: Warehouse = g.warehouse
        received_age_days = (now - g.received_at).days
        is_burning = (
            g.status == GoodsStatus.IN_CHINA
            and received_age_days >= burning_threshold_days
        )
        burning_days = (
            received_age_days if is_burning else None
        )
        freight_somoni: Decimal | None = None
        if g.freight_cost_usd is not None:
            freight_somoni = (g.freight_cost_usd * rate).quantize(
                money, rounding=ROUND_HALF_UP
            )
        result.append(
            GoodsListItem(
                id=g.id,
                description=g.description,
                warehouse_code=wh.code.value,
                warehouse_name=wh.name,
                weight_kg=g.weight_kg,
                volume_m3=g.volume_m3,
                density_kg_m3=g.density_kg_m3,
                status=g.status.value,
                is_burning=is_burning,
                burning_days=burning_days,
                received_at=g.received_at,
                arrived_in_dushanbe_at=g.arrived_in_dushanbe_at,
                freight_somoni=freight_somoni,
                storage_fee_somoni=g.storage_fee_somoni,
                shipment_number=(
                    g.shipment.number if g.shipment else None
                ),
            )
        )
    return result
