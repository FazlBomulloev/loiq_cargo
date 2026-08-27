from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["dev", "test", "prod"] = "dev"
    app_debug: bool = True
    app_tz: str = "Asia/Dushanbe"
    log_level: str = "INFO"

    secret_key: str = Field(min_length=16)
    jwt_alg: str = "HS256"
    jwt_access_ttl_min: int = 1440

    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "loik"
    postgres_user: str = "loik"
    postgres_password: str = "loik"
    database_url: str | None = None

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0

    cors_origins_raw: str = Field(default="", alias="cors_origins")

    owner_email: str = "owner@loik.local"
    owner_password: str = "owner_change_me"

    tg_bot_token: str = ""
    tg_bot_username: str = "loiq_cargobot"

    @property
    def cors_origins(self) -> list[str]:
        return [
            x.strip()
            for x in self.cors_origins_raw.split(",")
            if x.strip()
        ]

    @property
    def sqlalchemy_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:"
            f"{self.postgres_password}@{self.postgres_host}:"
            f"{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
