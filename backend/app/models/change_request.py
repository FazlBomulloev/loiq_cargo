from datetime import datetime
from typing import Any, TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin
from app.models.enums import ChangeRequestAction, ChangeRequestStatus
from app.models.pg_enum import pg_enum

if TYPE_CHECKING:
    from app.models.goods import Goods
    from app.models.user import User


class ChangeRequest(IdMixin, TimestampsMixin, Base):
    __tablename__ = "change_requests"

    author_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    goods_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("goods.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[ChangeRequestAction] = mapped_column(
        pg_enum(ChangeRequestAction, name="change_request_action"),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    status: Mapped[ChangeRequestStatus] = mapped_column(
        pg_enum(ChangeRequestStatus, name="change_request_status"),
        nullable=False,
        default=ChangeRequestStatus.PENDING,
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    decided_by_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    author: Mapped["User"] = relationship(
        foreign_keys=[author_id]
    )
    decided_by: Mapped["User | None"] = relationship(
        foreign_keys=[decided_by_id]
    )
    goods: Mapped["Goods | None"] = relationship()
