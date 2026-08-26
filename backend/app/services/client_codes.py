import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Client

_PREFIX = "LQ-"
_CODE_RE = re.compile(r"^LQ-(\d+)$")


def _next_number(current_max: int) -> str:
    n = current_max + 1
    return f"{_PREFIX}{n:03d}"


async def generate_client_code(session: AsyncSession) -> str:
    codes = (
        await session.execute(
            select(Client.client_code).where(
                Client.client_code.like("LQ-%")
            )
        )
    ).scalars().all()
    max_n = 0
    for code in codes:
        m = _CODE_RE.match(code)
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return _next_number(max_n)


async def is_phone_taken(
    session: AsyncSession, phone: str
) -> bool:
    exists = (
        await session.execute(
            select(func.count(Client.id)).where(
                Client.phone == phone
            )
        )
    ).scalar_one()
    return bool(exists)


def generate_tg_verification_code(nbytes: int = 6) -> str:
    return secrets.token_urlsafe(nbytes)[:10]
