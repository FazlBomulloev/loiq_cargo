from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

_storage_uri = (
    f"redis://{_settings.redis_host}:"
    f"{_settings.redis_port}/{_settings.redis_db}"
)

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
    strategy="fixed-window",
    default_limits=[],
)
