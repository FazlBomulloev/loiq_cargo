from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampsMixin


class Setting(IdMixin, TimestampsMixin, Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    description: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
