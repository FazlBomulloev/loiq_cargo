from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GoodsReceiveRequest(BaseModel):
    client_code: str | None = Field(
        default=None, max_length=16
    )
    description: str | None = Field(
        default=None, max_length=255
    )
    weight_kg: Decimal = Field(gt=0, decimal_places=2)
    volume_m3: Decimal = Field(gt=0, decimal_places=3)
    accept_without_client: bool = False


class GoodsReceiveResponse(BaseModel):
    id: int
    client_code: str | None
    client_full_name: str | None
    is_unclaimed: bool
    description: str | None
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    rate_usd_per_kg: Decimal
    freight_usd: Decimal
    freight_somoni: Decimal
    status: str
    received_at: datetime
    notified: bool


class ClientLookup(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_code: str
    full_name: str
    phone: str
    telegram_status: Literal[
        "not_started", "pending", "verified"
    ]
    is_active: bool


class GoodsListRow(BaseModel):
    id: int
    client_code: str | None
    client_full_name: str | None
    description: str | None
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    status: Literal[
        "in_china", "in_transit", "in_dushanbe", "delivered"
    ]
    is_unclaimed: bool
    is_burning: bool
    burning_days: int | None
    received_at: datetime
    shipment_number: str | None


class WarehouseCounters(BaseModel):
    total: int
    in_china: int
    ready_to_ship: int
    burning: int
    unclaimed: int
