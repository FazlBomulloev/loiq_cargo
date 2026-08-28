from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import WarehouseCode
from app.models.pg_enum import pg_enum

if TYPE_CHECKING:
    from app.models.goods import Goods
    from app.models.shipment import Shipment
    from app.models.tariff import Tariff
    from app.models.user import User


class Warehouse(IdMixin, TimestampsMixin, Base):
    __tablename__ = "warehouses"

    code: Mapped[WarehouseCode] = mapped_column(
        pg_enum(WarehouseCode, name="warehouse_code"),
        unique=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_source: Mapped[bool] = mapped_column(
        default=True, nullable=False
    )

    truck_volume_m3: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("110.00")
    )
    truck_weight_kg: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("27000.00")
    )
    multiplier: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=Decimal("1.000")
    )
    address: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )

    users: Mapped[list["User"]] = relationship(
        back_populates="warehouse"
    )
    goods: Mapped[list["Goods"]] = relationship(
        back_populates="warehouse"
    )
    shipments: Mapped[list["Shipment"]] = relationship(
        back_populates="warehouse"
    )
    tariffs: Mapped[list["Tariff"]] = relationship(
        back_populates="warehouse"
    )
