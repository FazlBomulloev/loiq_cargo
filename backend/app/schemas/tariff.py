from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class TariffRowIn(BaseModel):
    density_from: Decimal = Field(ge=0, decimal_places=2)
    density_to: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    rate_usd_per_kg: Decimal | None = Field(
        default=None, gt=0, decimal_places=4
    )
    rate_usd_per_m3: Decimal | None = Field(
        default=None, gt=0, decimal_places=4
    )

    @model_validator(mode="after")
    def _one_rate(self) -> "TariffRowIn":
        kg = self.rate_usd_per_kg
        m3 = self.rate_usd_per_m3
        if kg is None and m3 is None:
            raise ValueError(
                "нужно указать ставку: rate_usd_per_kg "
                "или rate_usd_per_m3"
            )
        if kg is not None and m3 is not None:
            raise ValueError(
                "в одной строке нельзя задать сразу $/кг и $/м³"
            )
        return self


class TariffRowFull(BaseModel):
    id: int
    density_from: Decimal
    density_to: Decimal | None
    rate_usd_per_kg: Decimal | None
    rate_usd_per_m3: Decimal | None


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
