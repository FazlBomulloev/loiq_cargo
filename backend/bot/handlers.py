import logging

from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from bot import service, texts

log = logging.getLogger(__name__)
router = Router(name="verification")


@router.message(CommandStart(deep_link=True))
async def on_start_deep(message: Message) -> None:
    parts = (message.text or "").split(maxsplit=1)
    code = parts[1] if len(parts) > 1 else ""
    chat_id = message.chat.id
    ok, client = await service.link_by_code(chat_id, code)
    if ok and client is not None:
        await message.answer(
            texts.VERIFIED_OK.format(code=client.client_code)
        )
        return
    await message.answer(texts.BAD_CODE)


@router.message(CommandStart())
async def on_start(message: Message) -> None:
    chat_id = message.chat.id
    client = await service.status_for_chat(chat_id)
    if client is not None:
        await message.answer(
            texts.HELLO_ALREADY.format(
                name=client.full_name, code=client.client_code
            )
        )
        return
    await message.answer(texts.HELLO_UNKNOWN)


@router.message(Command("verify"))
async def on_verify(message: Message) -> None:
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        await message.answer(texts.VERIFY_USAGE)
        return
    ok, client = await service.link_by_code(
        message.chat.id, parts[1].strip()
    )
    if ok and client is not None:
        await message.answer(
            texts.VERIFIED_OK.format(code=client.client_code)
        )
        return
    await message.answer(texts.BAD_CODE)


@router.message(Command("status"))
async def on_status(message: Message) -> None:
    client = await service.status_for_chat(message.chat.id)
    if client is None:
        await message.answer(texts.STATUS_UNLINKED)
        return
    await message.answer(
        texts.STATUS_LINKED.format(
            code=client.client_code, name=client.full_name
        )
    )


@router.message(Command("help"))
async def on_help(message: Message) -> None:
    await message.answer(texts.BOT_HELP)
