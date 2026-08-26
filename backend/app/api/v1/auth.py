import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.config import get_settings
from app.core.db import get_session
from app.core.security import create_access_token, verify_password
from app.models import Client, User
from app.schemas.auth import (
    ClientLoginRequest,
    ClientMe,
    StaffLoginRequest,
    StaffMe,
    TokenResponse,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()


def _bad_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="неверный логин или пароль",
    )


@router.post(
    "/staff/login",
    response_model=TokenResponse,
    summary="Вход сотрудника (email + пароль)",
)
async def staff_login(
    body: StaffLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    user = (
        await session.execute(
            select(User).where(User.email == body.email.lower())
        )
    ).scalar_one_or_none()
    if not user or not user.is_active:
        log.info("вход сотрудника: не найден %s", body.email)
        raise _bad_credentials()
    if not verify_password(body.password, user.password_hash):
        log.info(
            "вход сотрудника: неверный пароль %s", body.email
        )
        raise _bad_credentials()

    token = create_access_token(
        subject=f"staff:{user.id}",
        extra={"role": user.role.value},
    )
    return TokenResponse(
        access_token=token,
        expires_in=_settings.jwt_access_ttl_min * 60,
        principal_kind="staff",
    )


@router.post(
    "/client/login",
    response_model=TokenResponse,
    summary="Вход клиента (код клиента + пароль)",
)
async def client_login(
    body: ClientLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    code = body.client_code.strip().upper()
    client = (
        await session.execute(
            select(Client).where(Client.client_code == code)
        )
    ).scalar_one_or_none()
    if not client or not client.is_active:
        log.info("вход клиента: не найден %s", code)
        raise _bad_credentials()
    if not verify_password(body.password, client.password_hash):
        log.info("вход клиента: неверный пароль %s", code)
        raise _bad_credentials()

    token = create_access_token(
        subject=f"client:{client.id}",
        extra={"client_code": client.client_code},
    )
    return TokenResponse(
        access_token=token,
        expires_in=_settings.jwt_access_ttl_min * 60,
        principal_kind="client",
    )


@router.get(
    "/me",
    response_model=StaffMe | ClientMe,
    summary="Кто я",
)
async def me(
    principal: Principal = Depends(get_current_principal),
) -> StaffMe | ClientMe:
    if principal.is_staff:
        u = principal.user
        return StaffMe(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            warehouse_id=u.warehouse_id,
            is_active=u.is_active,
        )
    c = principal.client
    return ClientMe(
        id=c.id,
        client_code=c.client_code,
        full_name=c.full_name,
        phone=c.phone,
        telegram_status=c.telegram_status.value,
        is_active=c.is_active,
    )
