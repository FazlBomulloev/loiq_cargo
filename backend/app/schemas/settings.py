from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, model_validator


class SettingItem(BaseModel):
    key: str
    value: Any
    description: str | None
    default: Any
    kind: str  # "int" | "decimal" | "float"


class SettingsResponse(BaseModel):
    items: list[SettingItem]


class SettingsUpdateRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _non_empty(self) -> "SettingsUpdateRequest":
        if not self.values:
            raise ValueError("нет ключей для обновления")
        return self


class WarehouseUpdateRequest(BaseModel):
    truck_volume_m3: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    truck_weight_kg: Decimal | None = Field(
        default=None, gt=0, decimal_places=2
    )
    multiplier: Decimal | None = Field(
        default=None, gt=0, decimal_places=3
    )
    name: str | None = Field(default=None, min_length=1, max_length=64)
