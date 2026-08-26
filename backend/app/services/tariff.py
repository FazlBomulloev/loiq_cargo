from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Tariff, TariffRow, Warehouse
from app.services.settings_service import get_exchange_rate

MONEY = Decimal("0.01")
DENSITY = Decimal("1")


@dataclass(slots=True)
class Quote:
    warehouse_id: int
    warehouse_name: str
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    rate_usd_per_kg: Decimal
    freight_usd: Decimal
    freight_somoni: Decimal
    exchange_rate: Decimal
    density_from: Decimal
    density_to: Decimal | None


async def get_active_tariff(
    session: AsyncSession, warehouse_id: int
) -> Tariff | None:
    stmt = (
        select(Tariff)
        .where(
            Tariff.warehouse_id == warehouse_id,
            Tariff.is_active.is_(True),
        )
        .order_by(Tariff.effective_from.desc())
        .options(selectinload(Tariff.rows))
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def pick_row(
    rows: list[TariffRow], density: Decimal
) -> TariffRow | None:
    for row in rows:
        upper_ok = (
            row.density_to is None or density < row.density_to
        )
        if density >= row.density_from and upper_ok:
            return row
    return None


async def quote(
    session: AsyncSession,
    warehouse_id: int,
    weight_kg: Decimal,
    volume_m3: Decimal,
) -> Quote:
    if weight_kg <= 0 or volume_m3 <= 0:
        raise ValueError("вес и объём должны быть больше нуля")

    warehouse = (
        await session.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
    ).scalar_one_or_none()
    if warehouse is None:
        raise ValueError("склад не найден")

    tariff = await get_active_tariff(session, warehouse_id)
    if tariff is None or not tariff.rows:
        raise ValueError("нет активного тарифа у склада")

    density = (weight_kg / volume_m3).quantize(
        DENSITY, rounding=ROUND_HALF_UP
    )
    row = pick_row(list(tariff.rows), density)
    if row is None:
        raise ValueError("не нашли ставку для этой плотности")

    freight_usd = (row.rate_usd_per_kg * weight_kg).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )
    rate = await get_exchange_rate(session)
    freight_somoni = (freight_usd * rate).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )

    return Quote(
        warehouse_id=warehouse.id,
        warehouse_name=warehouse.name,
        weight_kg=weight_kg,
        volume_m3=volume_m3,
        density_kg_m3=density,
        rate_usd_per_kg=row.rate_usd_per_kg,
        freight_usd=freight_usd,
        freight_somoni=freight_somoni,
        exchange_rate=rate,
        density_from=row.density_from,
        density_to=row.density_to,
    )
