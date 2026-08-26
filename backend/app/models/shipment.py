from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import ShipmentStatus

if TYPE_CHECKING:
    from app.models.goods import Goods
    from app.models.warehouse import Warehouse


class Shipment(IdMixin, TimestampsMixin, Base):
    __tablename__ = "shipments"

    number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False
    )
    warehouse_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[ShipmentStatus] = mapped_column(
        Enum(ShipmentStatus, name="shipment_status"),
        nullable=False,
        default=ShipmentStatus.DRAFT,
        index=True,
    )
    departed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    arrived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    truck_volume_m3: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    truck_weight_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    total_volume_m3: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )
    total_weight_kg: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    total_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )

    fill_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    note: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    warehouse: Mapped["Warehouse"] = relationship(
        back_populates="shipments"
    )
    goods: Mapped[list["Goods"]] = relationship(
        back_populates="shipment"
    )
