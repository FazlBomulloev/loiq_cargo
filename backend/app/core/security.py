from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

_settings = get_settings()
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd.verify(raw, hashed)


def create_access_token(
    subject: str,
    extra: dict[str, Any] | None = None,
    ttl_min: int | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(
        minutes=ttl_min or _settings.jwt_access_ttl_min
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload, _settings.secret_key, algorithm=_settings.jwt_alg
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            _settings.secret_key,
            algorithms=[_settings.jwt_alg],
        )
    except JWTError as exc:
        raise ValueError("недействительный токен") from exc
