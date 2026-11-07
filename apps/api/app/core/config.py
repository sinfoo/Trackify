from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./fintech.db"
    cors_origins: str = "http://localhost:3000"

    # Auth
    jwt_secret: str = "dev-only-change-me-0123456789abcdef0123456789abcdef"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False
    login_max_attempts: int = 5
    login_window_seconds: int = 300

    # AI providers. Keys stay server-side and are never returned by the API.
    ai_provider: Literal["mock", "anthropic", "openai"] = "mock"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    default_model: str = ""
    llm_timeout_seconds: float = 20.0
    llm_max_retries: int = 1

    # Payments: simulation only. There is no live mode by design.
    payment_provider: Literal["simulated"] = "simulated"
    currency: str = "TND"
    high_value_threshold: Decimal = Decimal("2000")
    velocity_max_attempts: int = 3
    velocity_window_minutes: int = 10
    failed_attempts_threshold: int = 3
    approval_ttl_hours: int = 24

    # Demo
    demo_password: str = "Demo!2026"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
