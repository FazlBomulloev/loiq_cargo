from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class WaybillListRow(BaseModel):
    id: int
    number: str
    warehouse_id: int
    warehouse_name: str
    status: Literal["in_transit", "arrived"]
    goods_count: int
    received_count: int
    missing_count: int
    total_weight_kg: Decimal
    total_volume_m3: Decimal
    departed_at: datetime | None
    arrived_at: datetime | None


class WaybillGoodsRow(BaseModel):
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
    is_missing: bool
    is_unclaimed: bool
    received_at: datetime


class WaybillDetail(BaseModel):
    id: int
    number: str
    warehouse_id: int
    warehouse_name: str
    status: Literal["in_transit", "arrived"]
    total_weight_kg: Decimal
    total_volume_m3: Decimal
    total_cost_usd: Decimal
    departed_at: datetime | None
    arrived_at: datetime | None
    note: str | None
    goods: list[WaybillGoodsRow]


class ReceiveRequest(BaseModel):
    received_ids: list[int] = Field(default_factory=list)


class ReceiveResponse(BaseModel):
    shipment_id: int
    status: Literal["in_transit", "arrived"]
    received_count: int
    missing_count: int
    notified_count: int


class DeliveryGoodsRow(BaseModel):
    id: int
    description: str | None
    warehouse_name: str
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    freight_somoni: Decimal
    storage_days: int
    storage_paid_days: int
    storage_fee_somoni: Decimal
    arrived_in_dushanbe_at: datetime | None
    shipment_number: str | None


class DeliveryPreview(BaseModel):
    client_id: int
    client_code: str
    client_full_name: str
    phone: str
    telegram_verified: bool
    goods: list[DeliveryGoodsRow]
    total_freight_somoni: Decimal
    total_storage_somoni: Decimal
    total_to_pay_somoni: Decimal
    exchange_rate: Decimal
    free_storage_days: int
    storage_daily_coef_somoni: Decimal


class DeliveryConfirmRequest(BaseModel):
    client_code: str = Field(min_length=1, max_length=16)
    paid: bool
    note: str | None = Field(default=None, max_length=255)


class DeliveryConfirmResponse(BaseModel):
    client_code: str
    delivered_count: int
    total_paid_somoni: Decimal
    payment_status: Literal["paid", "debt"]
    delivered_at: datetime


class DeliveryHistoryRow(BaseModel):
    delivered_at: datetime
    client_id: int
    client_code: str
    client_full_name: str
    phone: str
    goods_count: int
    total_freight_somoni: Decimal
    total_storage_somoni: Decimal
    total_pay_somoni: Decimal
    payment_status: Literal["paid", "debt"]


class DeliveryHistoryResponse(BaseModel):
    period: Literal["7d", "30d", "90d", "all"]
    payment: Literal["paid", "debt", "all"]
    q: str | None
    total_count: int
    total_pay_somoni: Decimal
    total_debt_somoni: Decimal
    total_paid_somoni: Decimal
    rows: list[DeliveryHistoryRow]
