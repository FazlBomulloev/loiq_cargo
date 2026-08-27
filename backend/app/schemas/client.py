from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClientRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=6, max_length=32)
    city: str | None = Field(default=None, max_length=80)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("phone")
    @classmethod
    def _norm_phone(cls, v: str) -> str:
        cleaned = v.strip().replace(" ", "").replace("-", "")
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned.lstrip("0")
        return cleaned


class ClientRegisterResponse(BaseModel):
    client_code: str
    telegram_verification_code: str
    telegram_deep_link: str
    access_token: str
    expires_in: int
    principal_kind: Literal["client"] = "client"


class VerifyCodeResponse(BaseModel):
    telegram_verification_code: str
    telegram_status: str
    telegram_deep_link: str


class ClientSummary(BaseModel):
    in_china_count: int
    in_transit_count: int
    in_dushanbe_count: int
    in_dushanbe_oldest_days: int | None
    debt_somoni: Decimal


class GoodsListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str | None
    warehouse_code: str
    warehouse_name: str
    weight_kg: Decimal
    volume_m3: Decimal
    density_kg_m3: Decimal
    status: Literal[
        "in_china", "in_transit", "in_dushanbe", "delivered"
    ]
    is_burning: bool
    burning_days: int | None
    received_at: datetime
    arrived_in_dushanbe_at: datetime | None
    freight_somoni: Decimal | None
    storage_fee_somoni: Decimal | None
    shipment_number: str | None
