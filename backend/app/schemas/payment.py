from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class DebtRow(BaseModel):
    client_id: int
    client_code: str
    client_full_name: str
    phone: str
    telegram_verified: bool
    delivered_at: datetime
    goods_count: int
    freight_somoni: Decimal
    storage_somoni: Decimal
    total_somoni: Decimal
    payment_status: Literal["paid", "debt"]


class SettleRequest(BaseModel):
    client_code: str = Field(min_length=1, max_length=16)
    note: str | None = Field(default=None, max_length=255)


class SettleResponse(BaseModel):
    client_code: str
    settled_count: int
    total_somoni: Decimal


class PaymentSummary(BaseModel):
    delivered_paid_somoni: Decimal
    delivered_debt_somoni: Decimal
    debt_clients: int
    paid_clients: int


class DebtsResponse(BaseModel):
    summary: PaymentSummary
    rows: list[DebtRow]
    status_filter: Literal["debt", "paid", "all"]
