from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ClientLoginRequest(BaseModel):
    client_code: str = Field(min_length=1, max_length=16)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    principal_kind: Literal["staff", "client"]


class StaffMe(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    warehouse_id: int | None
    is_active: bool
    kind: Literal["staff"] = "staff"


class ClientMe(BaseModel):
    id: int
    client_code: str
    full_name: str
    phone: str
    telegram_status: str
    is_active: bool
    kind: Literal["client"] = "client"
