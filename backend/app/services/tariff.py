from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Tariff, TariffRow, Warehouse
from app.services.settings_service import get_exchange_rate

MONEY = Decimal("0.01")
DENSITY = Decimal("1")
RATE = Decimal("0.0001")


RateMode = Literal["per_kg", "per_m3"]


@dataclass(slots=True)
class Quote:
    warehouse_id: int
    warehouse_name: str
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    mode: RateMode
    rate_usd_per_kg: Decimal
    rate_usd_per_m3: Decimal | None
    freight_usd: Decimal
    freight_somoni: Decimal
    exchange_rate: Decimal
    density_from: Decimal
    density_to: Decimal | None


def row_mode(row: TariffRow) -> RateMode:
    return "per_m3" if row.rate_usd_per_m3 is not None else "per_kg"


def compute_freight_usd(
    row: TariffRow,
    weight_kg: Decimal,
    volume_m3: Decimal,
) -> Decimal:
    if row.rate_usd_per_m3 is not None:
        raw = Decimal(row.rate_usd_per_m3) * Decimal(volume_m3)
    else:
        raw = Decimal(row.rate_usd_per_kg or 0) * Decimal(weight_kg)
    return raw.quantize(MONEY, rounding=ROUND_HALF_UP)


def effective_rate_per_kg(
    row: TariffRow,
    weight_kg: Decimal,
    volume_m3: Decimal,
) -> Decimal:
    """Эффективная ставка $/кг для отчётности (Goods, накладные)."""
    if row.rate_usd_per_kg is not None:
        return Decimal(row.rate_usd_per_kg)
    if weight_kg <= 0:
        return Decimal("0")
    freight = compute_freight_usd(row, weight_kg, volume_m3)
    return (freight / Decimal(weight_kg)).quantize(
        RATE, rounding=ROUND_HALF_UP
    )


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

    freight_usd = compute_freight_usd(row, weight_kg, volume_m3)
    rate = await get_exchange_rate(session)
    freight_somoni = (freight_usd * rate).quantize(
        MONEY, rounding=ROUND_HALF_UP
    )
    effective_kg = effective_rate_per_kg(row, weight_kg, volume_m3)

    return Quote(
        warehouse_id=warehouse.id,
        warehouse_name=warehouse.name,
        weight_kg=weight_kg,
        volume_m3=volume_m3,
        density_kg_m3=density,
        mode=row_mode(row),
        rate_usd_per_kg=effective_kg,
        rate_usd_per_m3=(
            Decimal(row.rate_usd_per_m3)
            if row.rate_usd_per_m3 is not None else None
        ),
        freight_usd=freight_usd,
        freight_somoni=freight_somoni,
        exchange_rate=rate,
        density_from=row.density_from,
        density_to=row.density_to,
    )
