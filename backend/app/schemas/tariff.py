from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TariffRowIn(BaseModel):
    density_from: Decimal = Field(ge=0, decimal_places=2)
    density_to: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    rate_usd_per_kg: Decimal = Field(gt=0, decimal_places=4)


class TariffRowFull(BaseModel):
    id: int
    density_from: Decimal
    density_to: Decimal | None
    rate_usd_per_kg: Decimal


class TariffIn(BaseModel):
    note: str | None = Field(default=None, max_length=255)
    rows: list[TariffRowIn] = Field(min_length=1, max_length=20)


class TariffFull(BaseModel):
    id: int
    warehouse_id: int
    warehouse_name: str
    currency: str
    is_active: bool
    effective_from: datetime
    note: str | None
    created_at: datetime
    rows: list[TariffRowFull]


class TariffActivateRequest(BaseModel):
    effective_from: datetime | None = None
