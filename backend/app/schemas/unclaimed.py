from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class UnclaimedRow(BaseModel):
    id: int
    warehouse_id: int
    warehouse_name: str
    description: str | None
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    status: Literal[
        "in_china", "in_transit", "in_dushanbe", "delivered"
    ]
    received_at: datetime
    shipment_number: str | None


class BindClientRequest(BaseModel):
    client_code: str = Field(min_length=1, max_length=16)


class BindClientResponse(BaseModel):
    goods_id: int
    client_id: int
    client_code: str
    client_full_name: str
    notified: bool
