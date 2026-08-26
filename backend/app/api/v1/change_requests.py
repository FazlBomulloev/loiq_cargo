import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.models import (
    ChangeRequest,
    Goods,
    GoodsStatus,
    User,
    UserRole,
    Warehouse,
)
from app.models.enums import (
    ChangeRequestAction,
    ChangeRequestStatus,
)
from app.schemas.change_request import (
    ChangeRequestCreate,
    ChangeRequestDecision,
    ChangeRequestOut,
    GoodsPreview,
)
from app.services import tariff as tariff_svc

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/change-requests",
    tags=["change-requests"],
)

DENSITY = Decimal("1")
MONEY = Decimal("0.01")

_EDIT_FIELDS = {"description", "weight_kg", "volume_m3"}


def _goods_preview(g: Goods | None) -> GoodsPreview | None:
    if g is None:
        return None
    return GoodsPreview(
        id=g.id,
        client_code=(g.client.client_code if g.client else None),
        client_full_name=(
            g.client.full_name if g.client else None
        ),
        description=g.description,
        weight_kg=Decimal(g.weight_kg),
        volume_m3=Decimal(g.volume_m3),
        density_kg_m3=Decimal(g.density_kg_m3),
        status=g.status.value,
        warehouse_id=g.warehouse_id,
        warehouse_name=g.warehouse.name if g.warehouse else "—",
    )


def _to_out(cr: ChangeRequest) -> ChangeRequestOut:
    author: User = cr.author
    return ChangeRequestOut(
        id=cr.id,
        author_id=cr.author_id,
        author_name=author.full_name if author else "—",
        warehouse_id=(
            author.warehouse_id if author else None
        ),
        goods_id=cr.goods_id,
        action=cr.action.value,
        payload=cr.payload or {},
        status=cr.status.value,
        reason=cr.reason,
        created_at=cr.created_at,
        decided_at=cr.decided_at,
        decision_note=cr.decision_note,
        goods_preview=_goods_preview(cr.goods),
    )


def _validate_edit_payload(payload: dict[str, Any]) -> None:
    keys = set(payload.keys())
    unknown = keys - _EDIT_FIELDS
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "недопустимые поля в заявке: "
                + ", ".join(sorted(unknown))
            ),
        )
    if not keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="в заявке нет изменений",
        )
    for key in ("weight_kg", "volume_m3"):
        if key in payload:
            try:
                val = Decimal(str(payload[key]))
            except (TypeError, ValueError, ArithmeticError) as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key}: некорректное число",
                ) from e
            if val <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key} должен быть больше нуля",
                )
    if "description" in payload:
        desc = payload["description"]
        if desc is not None and not isinstance(desc, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="description должен быть строкой или null",
            )


@router.post(
    "",
    response_model=ChangeRequestOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать заявку на изменение (сотрудник склада)",
)
async def create_change_request(
    body: ChangeRequestCreate,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(
            UserRole.CHINA_STAFF, UserRole.DUSHANBE_STAFF
        )
    ),
) -> ChangeRequestOut:
    if body.action == "edit_goods":
        _validate_edit_payload(body.payload)
        if body.goods_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="для правки нужен goods_id",
            )

    if body.goods_id is not None:
        goods = (
            await session.execute(
                select(Goods).where(Goods.id == body.goods_id)
            )
        ).scalar_one_or_none()
        if goods is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="товар не найден",
            )
        if (
            principal.role == UserRole.CHINA_STAFF
            and goods.warehouse_id
            != principal.user.warehouse_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="товар другого склада",
            )

    cr = ChangeRequest(
        author_id=principal.user.id,
        goods_id=body.goods_id,
        action=ChangeRequestAction(body.action),
        payload=body.payload,
        status=ChangeRequestStatus.PENDING,
        reason=body.reason,
    )
    session.add(cr)
    await session.commit()
    return await _reload(session, cr.id)


async def _reload(
    session: AsyncSession, cr_id: int
) -> ChangeRequestOut:
    stmt = (
        select(ChangeRequest)
        .where(ChangeRequest.id == cr_id)
        .options(
            selectinload(ChangeRequest.author),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.client),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.warehouse),
        )
    )
    cr = (await session.execute(stmt)).scalar_one()
    return _to_out(cr)


@router.get(
    "",
    response_model=list[ChangeRequestOut],
    summary="Список заявок (mine / pending / all для овнера)",
)
async def list_change_requests(
    scope: Literal["mine", "pending", "all"] = Query(
        default="mine"
    ),
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(
            UserRole.CHINA_STAFF,
            UserRole.DUSHANBE_STAFF,
            UserRole.OWNER,
        )
    ),
) -> list[ChangeRequestOut]:
    stmt = (
        select(ChangeRequest)
        .options(
            selectinload(ChangeRequest.author),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.client),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.warehouse),
        )
        .order_by(ChangeRequest.created_at.desc())
        .limit(500)
    )

    if scope == "mine":
        if not principal.is_staff:
            return []
        stmt = stmt.where(
            ChangeRequest.author_id == principal.user.id
        )
    elif scope == "pending":
        stmt = stmt.where(
            ChangeRequest.status
            == ChangeRequestStatus.PENDING
        )
        if principal.role != UserRole.OWNER:
            stmt = stmt.where(
                ChangeRequest.author_id == principal.user.id
            )
    else:  # all
        if principal.role != UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="только овнер видит все заявки",
            )

    rows = (await session.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


async def _apply_edit_goods(
    session: AsyncSession, cr: ChangeRequest
) -> None:
    if cr.goods_id is None or cr.goods is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар удалён или не привязан к заявке",
        )
    goods: Goods = cr.goods
    if goods.status != GoodsStatus.IN_CHINA:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "правка возможна только пока товар "
                "на складе Китая"
            ),
        )
    payload = cr.payload or {}
    _validate_edit_payload(payload)

    if "description" in payload:
        desc = payload["description"]
        goods.description = (
            desc.strip() if isinstance(desc, str) and desc.strip()
            else None
        )
    if "weight_kg" in payload:
        goods.weight_kg = Decimal(str(payload["weight_kg"]))
    if "volume_m3" in payload:
        goods.volume_m3 = Decimal(str(payload["volume_m3"]))

    density = (
        Decimal(goods.weight_kg) / Decimal(goods.volume_m3)
    ).quantize(DENSITY, rounding=ROUND_HALF_UP)
    goods.density_kg_m3 = density

    tariff = await tariff_svc.get_active_tariff(
        session, goods.warehouse_id
    )
    if tariff is not None and tariff.rows:
        row = tariff_svc.pick_row(list(tariff.rows), density)
        if row is not None:
            goods.rate_usd_per_kg = row.rate_usd_per_kg
            goods.freight_cost_usd = (
                row.rate_usd_per_kg
                * Decimal(goods.weight_kg)
            ).quantize(MONEY, rounding=ROUND_HALF_UP)


async def _apply_delete_goods(
    session: AsyncSession, cr: ChangeRequest
) -> None:
    if cr.goods_id is None or cr.goods is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар уже удалён или не привязан",
        )
    goods: Goods = cr.goods
    if goods.status != GoodsStatus.IN_CHINA:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "удалить можно только пока товар на складе Китая"
            ),
        )
    if goods.shipment_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="товар уже привязан к партии",
        )
    await session.delete(goods)
    cr.goods_id = None


@router.post(
    "/{cr_id}/decide",
    response_model=ChangeRequestOut,
    summary="Решение по заявке (овнер): применить или отклонить",
)
async def decide_change_request(
    cr_id: int,
    body: ChangeRequestDecision,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> ChangeRequestOut:
    if not body.approve and not (body.decision_note or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="при отклонении обязателен комментарий",
        )

    stmt = (
        select(ChangeRequest)
        .where(ChangeRequest.id == cr_id)
        .options(
            selectinload(ChangeRequest.author),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.client),
            selectinload(ChangeRequest.goods)
            .selectinload(Goods.warehouse),
        )
        .with_for_update()
    )
    cr = (await session.execute(stmt)).scalar_one_or_none()
    if cr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="заявка не найдена",
        )
    if cr.status != ChangeRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="решение уже принято",
        )

    if body.approve:
        if cr.action == ChangeRequestAction.EDIT_GOODS:
            await _apply_edit_goods(session, cr)
        elif cr.action == ChangeRequestAction.DELETE_GOODS:
            await _apply_delete_goods(session, cr)
        # other — фиксируем только решение
        cr.status = ChangeRequestStatus.APPLIED
    else:
        cr.status = ChangeRequestStatus.REJECTED

    cr.decided_by_id = principal.user.id
    cr.decided_at = datetime.now(timezone.utc)
    cr.decision_note = body.decision_note

    await session.commit()
    log.info(
        "заявка %s: %s (действие %s)",
        cr.id, cr.status.value, cr.action.value,
    )
    return await _reload(session, cr.id)


@router.post(
    "/goods/{goods_id}/direct-edit",
    response_model=ChangeRequestOut,
    summary="Прямая правка товара овнером (без заявки)",
)
async def direct_edit(
    goods_id: int,
    body: ChangeRequestCreate,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> ChangeRequestOut:
    if body.action not in ("edit_goods", "delete_goods"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "прямая правка поддерживает "
                "edit_goods / delete_goods"
            ),
        )
    if body.action == "edit_goods":
        _validate_edit_payload(body.payload)

    goods = (
        await session.execute(
            select(Goods)
            .where(Goods.id == goods_id)
            .options(
                selectinload(Goods.client),
                selectinload(Goods.warehouse),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if goods is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="товар не найден",
        )

    cr = ChangeRequest(
        author_id=principal.user.id,
        goods_id=goods.id,
        action=ChangeRequestAction(body.action),
        payload=body.payload,
        status=ChangeRequestStatus.APPLIED,
        reason=body.reason,
        decided_by_id=principal.user.id,
        decided_at=datetime.now(timezone.utc),
    )
    session.add(cr)
    await session.flush()

    cr.goods = goods
    if body.action == "edit_goods":
        await _apply_edit_goods(session, cr)
    else:
        await _apply_delete_goods(session, cr)

    await session.commit()
    log.info(
        "прямая правка овнером: cr=%s действие=%s",
        cr.id, cr.action.value,
    )
    return await _reload(session, cr.id)
