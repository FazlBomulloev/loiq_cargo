import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User, UserRole

log = logging.getLogger(__name__)


async def ensure_owner() -> None:
    settings = get_settings()
    email = settings.owner_email.lower()
    async with SessionLocal() as session:
        existing = (
            await session.execute(
                select(User).where(User.role == UserRole.OWNER)
            )
        ).scalar_one_or_none()
        if existing is not None:
            log.info("овнер уже существует: %s", existing.email)
            return
        owner = User(
            email=email,
            full_name="Овнер",
            password_hash=hash_password(settings.owner_password),
            role=UserRole.OWNER,
            warehouse_id=None,
            is_active=True,
        )
        session.add(owner)
        await session.commit()
        log.warning(
            "создан овнер по умолчанию: %s "
            "(смените пароль в настройках)",
            email,
        )
