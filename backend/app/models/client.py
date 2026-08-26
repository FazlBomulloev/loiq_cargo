from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import TelegramVerificationStatus
from app.models.pg_enum import pg_enum

if TYPE_CHECKING:
    from app.models.goods import Goods


class Client(IdMixin, TimestampsMixin, Base):
    __tablename__ = "clients"

    client_code: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(
        String(160), nullable=False
    )
    phone: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False
    )
    city: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    telegram_chat_id: Mapped[int | None] = mapped_column(
        BigInteger, unique=True, nullable=True
    )
    telegram_verification_code: Mapped[str | None] = mapped_column(
        String(12), unique=True, nullable=True
    )
    telegram_status: Mapped[TelegramVerificationStatus] = (
        mapped_column(
            pg_enum(
                TelegramVerificationStatus,
                name="telegram_verification_status",
            ),
            nullable=False,
            default=TelegramVerificationStatus.NOT_STARTED,
        )
    )
    telegram_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        default=True, nullable=False
    )

    goods: Mapped[list["Goods"]] = relationship(
        back_populates="client"
    )
