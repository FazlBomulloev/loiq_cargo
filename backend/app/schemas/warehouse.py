from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class WarehouseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    is_source: bool
    truck_volume_m3: Decimal
    truck_weight_kg: Decimal
    multiplier: Decimal


class TariffRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    density_from: Decimal
    density_to: Decimal | None
    rate_usd_per_kg: Decimal


class TariffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    warehouse_id: int
    currency: str
    effective_from: str
    rows: list[TariffRowOut]
