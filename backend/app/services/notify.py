import logging
from datetime import datetime
from decimal import Decimal

import httpx

from app.core.config import get_settings
from app.models import Client, Goods, Warehouse

log = logging.getLogger(__name__)

_MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября",
    "декабря",
]


def _ru_date(d: datetime) -> str:
    return f"{d.day} {_MONTHS[d.month - 1]}"


def _short(g: Goods) -> str:
    parts: list[str] = []
    if g.description:
        parts.append(g.description)
    parts.append(f"{int(g.weight_kg)} кг")
    vol = Decimal(g.volume_m3).quantize(Decimal("0.01"))
    parts.append(f"{vol} м³")
    return ", ".join(parts)


def _msg_arrived_china(g: Goods, wh: Warehouse) -> str:
    return (
        f"Ваш товар от {_ru_date(g.received_at)} прибыл на "
        f"склад {wh.name} (Китай): {_short(g)}."
    )


def _msg_departed(g: Goods, wh: Warehouse) -> str:
    return (
        f"Ваш товар от {_ru_date(g.received_at)} отправлен из "
        f"склада {wh.name}: {_short(g)}. "
        "Ожидайте прибытия в Душанбе."
    )


def _msg_arrived_dushanbe(g: Goods) -> str:
    return (
        f"Ваш товар от {_ru_date(g.received_at)} прибыл в "
        f"Душанбе: {_short(g)}. "
        "Первые 10 дней хранения — бесплатно."
    )


async def _send(chat_id: int, text: str) -> bool:
    settings = get_settings()
    token = settings.tg_bot_token
    if not token:
        log.debug("уведомление пропущено: нет TG_BOT_TOKEN")
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code >= 400:
            log.warning(
                "телеграм отклонил уведомление (%s): %s",
                resp.status_code, resp.text[:200],
            )
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("не удалось отправить уведомление: %s", exc)
        return False


async def notify_arrived_china(
    client: Client | None, g: Goods, wh: Warehouse
) -> None:
    if client is None or client.telegram_chat_id is None:
        return
    await _send(
        client.telegram_chat_id, _msg_arrived_china(g, wh)
    )


async def notify_departed(
    client: Client | None, g: Goods, wh: Warehouse
) -> None:
    if client is None or client.telegram_chat_id is None:
        return
    await _send(client.telegram_chat_id, _msg_departed(g, wh))


async def notify_arrived_dushanbe(
    client: Client | None, g: Goods
) -> None:
    if client is None or client.telegram_chat_id is None:
        return
    await _send(
        client.telegram_chat_id, _msg_arrived_dushanbe(g)
    )
