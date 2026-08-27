import logging

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User, UserRole

log = logging.getLogger(__name__)


_email_adapter = TypeAdapter(EmailStr)


def _email_looks_valid(email: str) -> bool:
    try:
        _email_adapter.validate_python(email)
    except ValidationError:
        return False
    return True


async def ensure_owner() -> None:
    settings = get_settings()
    email = settings.owner_email.lower()

    if not _email_looks_valid(email):
        log.error(
            "OWNER_EMAIL='%s' невалиден (reserved TLD или "
            "неверный формат) — овнер не будет создан. "
            "Смените OWNER_EMAIL в .env.",
            email,
        )
        return

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
