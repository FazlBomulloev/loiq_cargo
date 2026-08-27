import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import api_v1
from app.bootstrap import ensure_owner
from app.core.config import get_settings
from app.core.limiter import limiter
from app.services import scheduler

_settings = get_settings()

logging.basicConfig(
    level=_settings.log_level,
    format=(
        "%(asctime)s %(levelname)-5s %(name)s :: %(message)s"
    ),
)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("старт приложения, окружение=%s", _settings.app_env)
    await ensure_owner()
    scheduler.start_scheduler()
    yield
    scheduler.stop_scheduler()
    log.info("остановка приложения")


app = FastAPI(
    title="Loik Cargo API",
    version="0.1.0",
    lifespan=lifespan,
    debug=_settings.app_debug,
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded, _rate_limit_exceeded_handler
)
app.add_middleware(SlowAPIMiddleware)

if _settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_v1)
