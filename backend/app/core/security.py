from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

_settings = get_settings()

_MAX_BCRYPT_BYTES = 72


def _prepare(raw: str) -> bytes:
    """bcrypt считает только первые 72 байта — режем длинные."""
    return raw.encode("utf-8")[:_MAX_BCRYPT_BYTES]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(
        _prepare(raw), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(raw), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


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
