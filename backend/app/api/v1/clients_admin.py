import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import Client, Goods, GoodsStatus, UserRole
from app.schemas.staff import ClientAdminOut, ClientAdminUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/clients-admin", tags=["clients-admin"])


@router.get(
    "",
    response_model=list[ClientAdminOut],
    summary="Список клиентов (овнер): поиск и фильтр",
)
async def list_clients(
    q: str | None = Query(default=None, max_length=64),
    active: bool | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> list[ClientAdminOut]:
    stmt = (
        select(
            Client,
            func.count(Goods.id).label("goods_count"),
            func.sum(
                case(
                    (
                        Goods.status != GoodsStatus.DELIVERED,
                        1,
                    ),
                    else_=0,
                )
            ).label("active_goods_count"),
        )
        .outerjoin(Goods, Goods.client_id == Client.id)
        .group_by(Client.id)
        .order_by(Client.created_at.desc())
        .limit(500)
    )
    if active is not None:
        stmt = stmt.where(Client.is_active.is_(active))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Client.client_code.ilike(pattern),
                Client.full_name.ilike(pattern),
                Client.phone.ilike(pattern),
            )
        )
    rows = (await session.execute(stmt)).all()
    return [
        ClientAdminOut(
            id=c.id,
            client_code=c.client_code,
            full_name=c.full_name,
            phone=c.phone,
            city=c.city,
            telegram_status=c.telegram_status.value,
            is_active=c.is_active,
            created_at=c.created_at,
            goods_count=int(gc or 0),
            active_goods_count=int(ac or 0),
        )
        for c, gc, ac in rows
    ]


@router.patch(
    "/{client_id}",
    response_model=ClientAdminOut,
    summary="Изменить клиента (активность, имя, город)",
)
async def update_client(
    client_id: int,
    body: ClientAdminUpdate,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> ClientAdminOut:
    client = (
        await session.execute(
            select(Client).where(Client.id == client_id)
        )
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="клиент не найден",
        )
    updated = False
    if body.is_active is not None:
        client.is_active = body.is_active
        updated = True
    if body.full_name is not None:
        client.full_name = body.full_name.strip()
        updated = True
    if body.city is not None:
        client.city = body.city.strip() or None
        updated = True
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="нет полей для обновления",
        )
    await session.commit()

    counts = (
        await session.execute(
            select(
                func.count(Goods.id),
                func.sum(
                    case(
                        (
                            Goods.status
                            != GoodsStatus.DELIVERED,
                            1,
                        ),
                        else_=0,
                    )
                ),
            )
            .where(Goods.client_id == client.id)
        )
    ).one()
    log.info(
        "клиент %s обновлён", client.client_code
    )
    return ClientAdminOut(
        id=client.id,
        client_code=client.client_code,
        full_name=client.full_name,
        phone=client.phone,
        city=client.city,
        telegram_status=client.telegram_status.value,
        is_active=client.is_active,
        created_at=client.created_at,
        goods_count=int(counts[0] or 0),
        active_goods_count=int(counts[1] or 0),
    )
