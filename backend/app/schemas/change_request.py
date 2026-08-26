from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChangeRequestCreate(BaseModel):
    goods_id: int | None = None
    action: Literal["edit_goods", "delete_goods", "other"]
    payload: dict[str, Any] = Field(default_factory=dict)
    reason: str | None = Field(default=None, max_length=500)


class GoodsPreview(BaseModel):
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
    warehouse_id: int
    warehouse_name: str


class ChangeRequestOut(BaseModel):
    id: int
    author_id: int
    author_name: str
    warehouse_id: int | None
    goods_id: int | None
    action: str
    payload: dict[str, Any]
    status: Literal["pending", "applied", "rejected"]
    reason: str | None
    created_at: datetime
    decided_at: datetime | None
    decision_note: str | None
    goods_preview: GoodsPreview | None = None


class ChangeRequestDecision(BaseModel):
    approve: bool
    decision_note: str | None = Field(
        default=None, max_length=500
    )
