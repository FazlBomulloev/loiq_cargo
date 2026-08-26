import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.models import Goods, GoodsStatus
from app.services import storage

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def accrue_storage_once() -> int:
    async with SessionLocal() as session:
        cfg = await storage.get_storage_config(session)
        stmt = select(Goods).where(
            Goods.status == GoodsStatus.IN_DUSHANBE,
            Goods.arrived_in_dushanbe_at.is_not(None),
        )
        rows = (await session.execute(stmt)).scalars().all()
        now = datetime.now(timezone.utc)
        touched = 0
        for g in rows:
            accr = storage.compute_storage(g, cfg, now=now)
            if g.storage_fee_somoni != accr.fee_somoni:
                await session.execute(
                    update(Goods)
                    .where(Goods.id == g.id)
                    .values(
                        storage_fee_somoni=accr.fee_somoni,
                    )
                )
                touched += 1
        await session.commit()
        log.info(
            "простой начислен: обновлено %s из %s товаров",
            touched, len(rows),
        )
        return touched


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    sched = AsyncIOScheduler(timezone="Asia/Dushanbe")
    sched.add_job(
        accrue_storage_once,
        CronTrigger(hour=3, minute=0),
        id="accrue_storage_daily",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    sched.start()
    _scheduler = sched
    log.info("планировщик запущен: ежедневно в 03:00 (Душанбе)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    log.info("планировщик остановлен")
