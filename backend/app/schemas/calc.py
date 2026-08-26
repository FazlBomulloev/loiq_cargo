from decimal import Decimal

from pydantic import BaseModel, Field


class CalcRequest(BaseModel):
    warehouse_id: int = Field(gt=0)
    weight_kg: Decimal = Field(gt=0, decimal_places=2)
    volume_m3: Decimal = Field(gt=0, decimal_places=3)


class CalcResponse(BaseModel):
    warehouse_id: int
    warehouse_name: str
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    density_from: Decimal
    density_to: Decimal | None
    rate_usd_per_kg: Decimal
    freight_usd: Decimal
    freight_somoni: Decimal
    exchange_rate: Decimal
