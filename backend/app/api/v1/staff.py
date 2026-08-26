import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, require_staff
from app.core.db import get_session
from app.core.security import hash_password
from app.models import User, UserRole, Warehouse
from app.schemas.staff import (
    StaffCreate,
    StaffOut,
    StaffPasswordUpdate,
    StaffUpdate,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/staff", tags=["staff-admin"])


def _to_out(u: User) -> StaffOut:
    return StaffOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role.value,
        warehouse_id=u.warehouse_id,
        warehouse_name=u.warehouse.name if u.warehouse else None,
        is_active=u.is_active,
        created_at=u.created_at,
    )


async def _warehouse_or_error(
    session: AsyncSession, warehouse_id: int
) -> Warehouse:
    wh = (
        await session.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
    ).scalar_one_or_none()
    if wh is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="указанный склад не существует",
        )
    return wh


def _require_warehouse_for_role(
    role: str, warehouse_id: int | None
) -> None:
    if role == UserRole.CHINA_STAFF.value:
        if warehouse_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "у сотрудника склада Китая должен быть "
                    "warehouse_id"
                ),
            )
    else:
        if warehouse_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "склад привязывается только к роли "
                    "«сотрудник Китая»"
                ),
            )


@router.get(
    "",
    response_model=list[StaffOut],
    summary="Список сотрудников (овнер)",
)
async def list_staff(
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> list[StaffOut]:
    rows = (
        await session.execute(
            select(User)
            .options(selectinload(User.warehouse))
            .order_by(User.role, User.full_name)
        )
    ).scalars().all()
    return [_to_out(u) for u in rows]


@router.post(
    "",
    response_model=StaffOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать сотрудника",
)
async def create_staff(
    body: StaffCreate,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> StaffOut:
    _require_warehouse_for_role(body.role, body.warehouse_id)
    if body.warehouse_id is not None:
        await _warehouse_or_error(session, body.warehouse_id)

    user = User(
        email=body.email.lower(),
        full_name=body.full_name.strip(),
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
        warehouse_id=body.warehouse_id,
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="сотрудник с таким email уже существует",
        ) from exc

    fresh = (
        await session.execute(
            select(User)
            .where(User.id == user.id)
            .options(selectinload(User.warehouse))
        )
    ).scalar_one()
    log.info(
        "сотрудник создан: %s (%s)", fresh.email, fresh.role.value
    )
    return _to_out(fresh)


async def _get_user(
    session: AsyncSession, user_id: int
) -> User:
    user = (
        await session.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.warehouse))
        )
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="сотрудник не найден",
        )
    return user


@router.patch(
    "/{user_id}",
    response_model=StaffOut,
    summary="Изменить сотрудника",
)
async def update_staff(
    user_id: int,
    body: StaffUpdate,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> StaffOut:
    user = await _get_user(session, user_id)
    updated = False
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
        updated = True
    if body.is_active is not None:
        if user.id == principal.user.id and not body.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="нельзя деактивировать самого себя",
            )
        user.is_active = body.is_active
        updated = True
    if body.warehouse_id is not None:
        if user.role != UserRole.CHINA_STAFF:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "склад привязывается только к роли Китая"
                ),
            )
        await _warehouse_or_error(session, body.warehouse_id)
        user.warehouse_id = body.warehouse_id
        updated = True
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="нет полей для обновления",
        )
    await session.commit()
    fresh = await _get_user(session, user_id)
    log.info("сотрудник обновлён: %s", fresh.email)
    return _to_out(fresh)


@router.post(
    "/{user_id}/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Смена пароля сотрудника",
)
async def change_password(
    user_id: int,
    body: StaffPasswordUpdate,
    session: AsyncSession = Depends(get_session),
    _principal: Principal = Depends(
        require_staff(UserRole.OWNER)
    ),
) -> None:
    user = await _get_user(session, user_id)
    user.password_hash = hash_password(body.password)
    await session.commit()
    log.info("пароль сотрудника %s сброшен", user.email)
