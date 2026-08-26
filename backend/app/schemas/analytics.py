from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


Period = Literal["7d", "30d", "90d", "all"]


class KpiTile(BaseModel):
    label: str
    value: str
    hint: str | None = None
    tone: Literal["neutral", "good", "warn", "crit"] = "neutral"


class WarehouseStat(BaseModel):
    warehouse_id: int
    warehouse_name: str
    active_goods: int
    burning_goods: int
    unclaimed_goods: int
    shipments_in_period: int
    revenue_somoni: Decimal


class ShipmentBrief(BaseModel):
    id: int
    number: str
    warehouse_name: str
    status: str
    goods_count: int
    total_cost_usd: Decimal
    fill_pct: Decimal | None
    departed_at: datetime | None


class OwnerDashboard(BaseModel):
    period: Period
    revenue_somoni: Decimal
    revenue_paid_somoni: Decimal
    revenue_debt_somoni: Decimal
    delivered_count: int
    shipments_count: int
    avg_fill_pct: Decimal | None
    avg_shipment_cost_usd: Decimal | None
    active_goods_total: int
    in_china: int
    in_transit: int
    in_dushanbe: int
    burning_count: int
    unclaimed_count: int
    missing_count: int
    pending_requests: int
    storage_pending_somoni: Decimal
    storage_pending_goods: int
    new_clients_in_period: int

    warehouses: list[WarehouseStat]
    recent_shipments: list[ShipmentBrief]


class ClientHistoryItem(BaseModel):
    delivered_at: datetime
    goods_count: int
    total_freight_somoni: Decimal
    total_storage_somoni: Decimal
    payment_status: Literal["paid", "debt"]


class ClientAnalytics(BaseModel):
    total_delivered_count: int
    total_freight_somoni: Decimal
    total_storage_somoni: Decimal
    total_paid_somoni: Decimal
    total_debt_somoni: Decimal
    active_freight_estimate_somoni: Decimal
    avg_transit_days: float | None
    history: list[ClientHistoryItem]
