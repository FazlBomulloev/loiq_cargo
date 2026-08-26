from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class StaffOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Literal["china_staff", "dushanbe_staff", "owner"]
    warehouse_id: int | None
    warehouse_name: str | None
    is_active: bool
    created_at: datetime


class StaffCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    role: Literal["china_staff", "dushanbe_staff", "owner"]
    warehouse_id: int | None = None


class StaffUpdate(BaseModel):
    full_name: str | None = Field(
        default=None, min_length=2, max_length=120
    )
    is_active: bool | None = None
    warehouse_id: int | None = None


class StaffPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class ClientAdminOut(BaseModel):
    id: int
    client_code: str
    full_name: str
    phone: str
    city: str | None
    telegram_status: Literal[
        "not_started", "pending", "verified"
    ]
    is_active: bool
    created_at: datetime
    goods_count: int
    active_goods_count: int


class ClientAdminUpdate(BaseModel):
    is_active: bool | None = None
    full_name: str | None = Field(
        default=None, min_length=2, max_length=160
    )
    city: str | None = Field(default=None, max_length=80)
