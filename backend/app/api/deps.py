from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import decode_access_token
from app.models import Client, User, UserRole

_bearer = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class Principal:
    kind: str  # "staff" | "client"
    user: User | None = None
    client: Client | None = None

    @property
    def is_staff(self) -> bool:
        return self.kind == "staff" and self.user is not None

    @property
    def is_client(self) -> bool:
        return self.kind == "client" and self.client is not None

    @property
    def role(self) -> UserRole | None:
        return self.user.role if self.user else None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> Principal:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized("нет токена авторизации")
    try:
        payload = decode_access_token(creds.credentials)
    except ValueError as exc:
        raise _unauthorized(str(exc)) from exc

    sub = payload.get("sub", "")
    kind, sep, raw_id = sub.partition(":")
    if not sep or kind not in {"staff", "client"}:
        raise _unauthorized("некорректный субъект токена")
    try:
        principal_id = int(raw_id)
    except ValueError as exc:
        raise _unauthorized("некорректный id в токене") from exc

    if kind == "staff":
        user = (
            await session.execute(
                select(User).where(User.id == principal_id)
            )
        ).scalar_one_or_none()
        if not user or not user.is_active:
            raise _unauthorized("сотрудник не найден или отключён")
        return Principal(kind="staff", user=user)

    client = (
        await session.execute(
            select(Client).where(Client.id == principal_id)
        )
    ).scalar_one_or_none()
    if not client or not client.is_active:
        raise _unauthorized("клиент не найден или отключён")
    return Principal(kind="client", client=client)


def require_staff(
    *roles: UserRole,
):
    allowed = set(roles) if roles else set(UserRole)

    async def _guard(
        principal: Principal = Depends(get_current_principal),
    ) -> Principal:
        if not principal.is_staff or principal.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="недостаточно прав",
            )
        return principal

    return _guard


def require_owner():
    return require_staff(UserRole.OWNER)


def require_client_only():
    async def _guard(
        principal: Principal = Depends(get_current_principal),
    ) -> Principal:
        if not principal.is_client:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="доступ только для клиентов",
            )
        return principal

    return _guard


def assert_own_warehouse(
    principal: Principal, warehouse_id: int
) -> None:
    if principal.role == UserRole.OWNER:
        return
    if not principal.is_staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="доступ запрещён",
        )
    if principal.user.warehouse_id != warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="склад вне зоны ответственности",
        )
