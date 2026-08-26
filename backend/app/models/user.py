from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import UserRole
from app.models.pg_enum import pg_enum

if TYPE_CHECKING:
    from app.models.warehouse import Warehouse


class User(IdMixin, TimestampsMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(160), unique=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(
        String(120), nullable=False
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, name="user_role"), nullable=False
    )
    warehouse_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        default=True, nullable=False
    )

    warehouse: Mapped["Warehouse | None"] = relationship(
        back_populates="users"
    )
