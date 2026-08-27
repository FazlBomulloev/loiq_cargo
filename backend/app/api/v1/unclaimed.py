import asyncio
import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import (
    Client,
    Goods,
    GoodsStatus,
    UserRole,
    Warehouse,
)
from app.schemas.unclaimed import (
    BindClientRequest,
    BindClientResponse,
    UnclaimedRow,
)
from app.services import notify

log = logging.getLogger(__name__)

router = APIRouter(tags=["unclaimed"])


@router.get(
    "/unclaimed",
    response_model=list[UnclaimedRow],
    summary="Товары без клиента (для овнера)",
)
async def list_unclaimed(
    warehouse_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> list[UnclaimedRow]:
    stmt = (
        select(Goods)
        .where(
            Goods.is_unclaimed.is_(True),
            Goods.status != GoodsStatus.DELIVERED,
        )
        .options(
            selectinload(Goods.warehouse),
            selectinload(Goods.shipment),
        )
        .order_by(Goods.received_at.desc())
        .limit(500)
    )
    if warehouse_id is not None:
        stmt = stmt.where(Goods.warehouse_id == warehouse_id)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        UnclaimedRow(
            id=g.id,
            warehouse_id=g.warehouse_id,
            warehouse_name=g.warehouse.name,
            description=g.description,
            weight_kg=Decimal(g.weight_kg),
            volume_m3=Decimal(g.volume_m3),
            density_kg_m3=Decimal(g.density_kg_m3),
            status=g.status.value,
            received_at=g.received_at,
            shipment_number=(
                g.shipment.number if g.shipment else None
            ),
        )
        for g in rows
    ]


@router.post(
    "/goods/{goods_id}/bind-client",
    response_model=BindClientResponse,
    summary="Привязать «без клиента» товар к реальному клиенту",
)
async def bind_client(
    goods_id: int,
    body: BindClientRequest,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> BindClientResponse:
    code = body.client_code.strip().upper()
    goods = (
        await session.execute(
            select(Goods)
            .where(Goods.id == goods_id)
            .options(selectinload(Goods.warehouse))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if goods is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="товар не найден",
        )
    if not goods.is_unclaimed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар уже привязан к клиенту",
        )
    if goods.status == GoodsStatus.DELIVERED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар уже выдан",
        )

    client = (
        await session.execute(
            select(Client).where(Client.client_code == code)
        )
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"клиент {code} не найден",
        )
    if not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="клиент деактивирован",
        )

    goods.client_id = client.id
    goods.is_unclaimed = False
    await session.commit()

    notified = False
    if client.telegram_chat_id is not None:
        try:
            wh: Warehouse = goods.warehouse
            if goods.status == GoodsStatus.IN_CHINA:
                await notify.notify_arrived_china(
                    client, goods, wh
                )
            elif goods.status == GoodsStatus.IN_TRANSIT:
                await notify.notify_departed(
                    client, goods, wh
                )
            elif goods.status == GoodsStatus.IN_DUSHANBE:
                await notify.notify_arrived_dushanbe(
                    client, goods
                )
            notified = True
        except asyncio.CancelledError:
            raise
        except (RuntimeError, ValueError, OSError) as exc:
            log.warning(
                "уведомление после привязки не ушло: %s", exc
            )

    log.info(
        "товар %s привязан к клиенту %s",
        goods.id, client.client_code,
    )
    return BindClientResponse(
        goods_id=goods.id,
        client_id=client.id,
        client_code=client.client_code,
        client_full_name=client.full_name,
        notified=notified,
    )


@router.delete(
    "/unclaimed/{goods_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить товар «без клиента» (только на складе КНР)",
)
async def delete_unclaimed(
    goods_id: int,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> None:
    goods = (
        await session.execute(
            select(Goods)
            .where(Goods.id == goods_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if goods is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="товар не найден",
        )
    if not goods.is_unclaimed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар привязан к клиенту — удалять нельзя",
        )
    if goods.status != GoodsStatus.IN_CHINA:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "удалять можно только товары на складе КНР "
                "(до отправки)"
            ),
        )
    if goods.shipment_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар уже в партии — сначала выньте из партии",
        )
    await session.delete(goods)
    await session.commit()
    log.info("товар %s (unclaimed) удалён овнером", goods_id)
