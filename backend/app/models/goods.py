from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import GoodsStatus, PaymentStatus

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.shipment import Shipment
    from app.models.user import User
    from app.models.warehouse import Warehouse


class Goods(IdMixin, TimestampsMixin, Base):
    __tablename__ = "goods"
    __table_args__ = (
        CheckConstraint("weight_kg > 0", name="weight_positive"),
        CheckConstraint("volume_m3 > 0", name="volume_positive"),
    )

    client_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    warehouse_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    shipment_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("shipments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    received_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    weight_kg: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    volume_m3: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False
    )
    density_kg_m3: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )

    rate_usd_per_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )
    freight_cost_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    status: Mapped[GoodsStatus] = mapped_column(
        Enum(GoodsStatus, name="goods_status"),
        nullable=False,
        default=GoodsStatus.IN_CHINA,
        index=True,
    )
    is_unclaimed: Mapped[bool] = mapped_column(
        default=False, nullable=False, index=True
    )
    is_missing: Mapped[bool] = mapped_column(
        default=False, nullable=False
    )

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    arrived_in_dushanbe_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    storage_days_free: Mapped[int] = mapped_column(
        default=10, nullable=False
    )
    storage_fee_somoni: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        nullable=False,
        default=PaymentStatus.UNPAID,
    )

    client: Mapped["Client | None"] = relationship(
        back_populates="goods"
    )
    warehouse: Mapped["Warehouse"] = relationship(
        back_populates="goods"
    )
    shipment: Mapped["Shipment | None"] = relationship(
        back_populates="goods"
    )
    received_by: Mapped["User | None"] = relationship()
