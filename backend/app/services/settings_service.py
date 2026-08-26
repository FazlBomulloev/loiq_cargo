from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting

DEFAULTS: dict[str, Any] = {
    "burning_days_threshold": 20,
    "fill_target_pct": 90,
    "target_cost_usd": 27000,
    "density_quota_dense_pct": 40,
    "density_quota_medium_pct": 35,
    "density_quota_light_pct": 25,
    "free_storage_days": 10,
    "storage_daily_coef_somoni": 5.0,
    "exchange_rate_somoni_per_usd": 10.98,
}


async def get_all(session: AsyncSession) -> dict[str, Any]:
    rows = (await session.execute(select(Setting))).scalars().all()
    return {r.key: r.value for r in rows}


async def get_value(
    session: AsyncSession, key: str, default: Any = None
) -> Any:
    row = (
        await session.execute(
            select(Setting).where(Setting.key == key)
        )
    ).scalar_one_or_none()
    if row is None:
        return default if default is not None else DEFAULTS.get(key)
    return row.value


async def get_exchange_rate(session: AsyncSession) -> Decimal:
    raw = await get_value(session, "exchange_rate_somoni_per_usd")
    return Decimal(str(raw))
