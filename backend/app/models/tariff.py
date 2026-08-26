from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin

if TYPE_CHECKING:
    from app.models.warehouse import Warehouse


class Tariff(IdMixin, TimestampsMixin, Base):
    __tablename__ = "tariffs"

    warehouse_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        default=True, nullable=False
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="USD"
    )
    note: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    warehouse: Mapped["Warehouse"] = relationship(
        back_populates="tariffs"
    )
    rows: Mapped[list["TariffRow"]] = relationship(
        back_populates="tariff",
        cascade="all, delete-orphan",
        order_by="TariffRow.density_from.desc()",
    )


class TariffRow(IdMixin, Base):
    __tablename__ = "tariff_rows"
    __table_args__ = (
        CheckConstraint(
            "density_to IS NULL OR density_to > density_from",
            name="density_range_valid",
        ),
        CheckConstraint(
            "rate_usd_per_kg > 0",
            name="rate_positive",
        ),
    )

    tariff_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tariffs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    density_from: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False
    )
    density_to: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    rate_usd_per_kg: Mapped[Decimal] = mapped_column(
        Numeric(8, 4), nullable=False
    )

    tariff: Mapped["Tariff"] = relationship(back_populates="rows")
