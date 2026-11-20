"""Application settings. Missing required settings stop startup with a clear message."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_config_dir() -> Path:
    env = os.environ.get("CONFIG_DIR")
    if env:
        return Path(env)
    repo_root = Path(__file__).resolve().parents[3]
    if (repo_root / "configs").is_dir():
        return repo_root / "configs"
    return Path("configs")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    database_url: str
    upstream_base_url: str
    upstream_api_key: SecretStr
    admin_token: SecretStr
    log_level: str = "INFO"

    max_request_bytes: int = Field(default=262_144, gt=0)
    max_messages: int = Field(default=64, gt=0)

    upstream_connect_timeout_seconds: float = Field(default=5.0, gt=0)
    upstream_read_timeout_seconds: float = Field(default=60.0, gt=0)
    upstream_max_connections: int = Field(default=20, gt=0)
    circuit_breaker_failures: int = Field(default=5, gt=0)
    circuit_breaker_reset_seconds: float = Field(default=30.0, gt=0)

    config_dir: Path = Field(default_factory=_default_config_dir)
    auto_create_schema: bool = False

    @property
    def taxonomy_path(self) -> Path:
        return self.config_dir / "taxonomy" / "atlas_owasp_nist_map.yaml"

    @property
    def default_policy_path(self) -> Path:
        return self.config_dir / "default_policy.yaml"


def load_settings() -> Settings:
    """Load settings, turning pydantic's error into a readable startup failure."""
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        missing = sorted(
            str(err["loc"][0]).upper()
            for err in exc.errors()
            if err.get("type") == "missing" and err.get("loc")
        )
        if missing:
            raise RuntimeError(
                "PromptWall cannot start; missing required settings: "
                + ", ".join(missing)
                + ". Set them in the environment or in .env (see .env.example)."
            ) from None
        raise RuntimeError(f"PromptWall cannot start; invalid settings: {exc}") from None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
