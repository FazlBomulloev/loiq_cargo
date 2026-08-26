from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Goods
from app.services import settings_service

MONEY = Decimal("0.01")


@dataclass(slots=True)
class StorageConfig:
    free_days: int
    daily_coef_somoni: Decimal


async def get_storage_config(
    session: AsyncSession,
) -> StorageConfig:
    free = int(
        await settings_service.get_value(
            session, "free_storage_days", 10
        )
    )
    coef = Decimal(
        str(
            await settings_service.get_value(
                session, "storage_daily_coef_somoni", 5.0
            )
        )
    )
    return StorageConfig(free_days=free, daily_coef_somoni=coef)


@dataclass(slots=True)
class StorageAccrual:
    days_since_arrival: int
    paid_days: int
    fee_somoni: Decimal


def compute_storage(
    goods: Goods,
    cfg: StorageConfig,
    now: datetime | None = None,
) -> StorageAccrual:
    if goods.arrived_in_dushanbe_at is None:
        return StorageAccrual(
            days_since_arrival=0,
            paid_days=0,
            fee_somoni=Decimal("0.00"),
        )
    ref = now or datetime.now(timezone.utc)
    days = (ref - goods.arrived_in_dushanbe_at).days
    if days < 0:
        days = 0
    free = int(goods.storage_days_free or cfg.free_days)
    paid = max(0, days - free)
    fee = (cfg.daily_coef_somoni * Decimal(paid)).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )
    return StorageAccrual(
        days_since_arrival=days,
        paid_days=paid,
        fee_somoni=fee,
    )
