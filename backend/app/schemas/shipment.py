from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    truck_volume_m3: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    truck_weight_kg: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    include_ids: list[int] | None = None
    exclude_ids: list[int] | None = None


class PlanGoodsRow(BaseModel):
    id: int
    client_code: str | None
    client_full_name: str | None
    description: str | None
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    density_group: Literal["dense", "medium", "light"]
    rate_usd_per_kg: Decimal
    freight_usd: Decimal
    received_at: datetime
    age_days: int
    is_burning: bool
    reason: Literal[
        "burning", "quota", "topup", "manual", "excluded"
    ]


class PlanGateStatus(BaseModel):
    ok: bool
    label: str
    detail: str


class PlanGroupStats(BaseModel):
    volume_m3: Decimal
    weight_kg: Decimal
    quota_m3: Decimal
    quota_pct: int
    count: int


class PlanResponse(BaseModel):
    warehouse_id: int
    warehouse_name: str
    truck_volume_m3: Decimal
    truck_weight_kg: Decimal
    target_cost_usd: Decimal
    fill_target_pct: int
    burning_days_threshold: int

    total_volume_m3: Decimal
    total_weight_kg: Decimal
    total_cost_usd: Decimal
    fill_pct: Decimal

    gate_fill: PlanGateStatus
    gate_cost: PlanGateStatus
    gate_weight: PlanGateStatus
    is_ready: bool

    groups: dict[
        Literal["dense", "medium", "light"], PlanGroupStats
    ]

    selected: list[PlanGoodsRow]
    left_behind: list[PlanGoodsRow]


class ConfirmRequest(BaseModel):
    goods_ids: list[int] = Field(min_length=1)
    truck_volume_m3: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    truck_weight_kg: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    note: str | None = Field(default=None, max_length=255)


class ShipmentGoodsRow(BaseModel):
    id: int
    client_code: str | None
    client_full_name: str | None
    description: str | None
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    freight_usd: Decimal
    status: str
    received_at: datetime


class ShipmentListRow(BaseModel):
    id: int
    number: str
    status: Literal["draft", "in_transit", "arrived", "closed"]
    goods_count: int
    total_volume_m3: Decimal
    total_weight_kg: Decimal
    total_cost_usd: Decimal
    fill_pct: Decimal | None
    departed_at: datetime | None
    arrived_at: datetime | None
    created_at: datetime


class ShipmentDetail(BaseModel):
    id: int
    number: str
    warehouse_id: int
    warehouse_name: str
    status: Literal["draft", "in_transit", "arrived", "closed"]
    truck_volume_m3: Decimal | None
    truck_weight_kg: Decimal | None
    total_volume_m3: Decimal
    total_weight_kg: Decimal
    total_cost_usd: Decimal
    fill_pct: Decimal | None
    note: str | None
    departed_at: datetime | None
    arrived_at: datetime | None
    created_at: datetime
    goods: list[ShipmentGoodsRow]
