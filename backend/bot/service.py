import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.models import Client
from app.models.enums import TelegramVerificationStatus

log = logging.getLogger(__name__)


async def find_by_chat(
    session: AsyncSession, chat_id: int
) -> Client | None:
    return (
        await session.execute(
            select(Client).where(
                Client.telegram_chat_id == chat_id
            )
        )
    ).scalar_one_or_none()


async def link_by_code(
    chat_id: int, code: str
) -> tuple[bool, Client | None]:
    code = code.strip()
    if not code:
        return False, None
    async with SessionLocal() as session:
        existing = await find_by_chat(session, chat_id)
        if existing is not None:
            return True, existing

        client = (
            await session.execute(
                select(Client).where(
                    Client.telegram_verification_code == code
                )
            )
        ).scalar_one_or_none()
        if client is None:
            log.info("верификация: код не найден %s", code)
            return False, None

        client.telegram_chat_id = chat_id
        client.telegram_status = (
            TelegramVerificationStatus.VERIFIED
        )
        client.telegram_verified_at = datetime.now(timezone.utc)
        client.telegram_verification_code = None
        await session.commit()
        log.info(
            "верификация ok: клиент %s → chat %s",
            client.client_code,
            chat_id,
        )
        return True, client


async def status_for_chat(chat_id: int) -> Client | None:
    async with SessionLocal() as session:
        return await find_by_chat(session, chat_id)
