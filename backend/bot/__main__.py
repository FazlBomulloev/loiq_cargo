import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from app.core.config import get_settings
from bot.handlers import router

log = logging.getLogger("bot")


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format=(
            "%(asctime)s %(levelname)-5s %(name)s :: %(message)s"
        ),
    )
    if not settings.tg_bot_token:
        log.warning("TG_BOT_TOKEN не задан, бот не стартует")
        return

    bot = Bot(
        token=settings.tg_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    dp.include_router(router)

    me = await bot.get_me()
    log.info("бот запущен: @%s", me.username)
    try:
        await dp.start_polling(bot, allowed_updates=["message"])
    finally:
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        sys.exit(0)
