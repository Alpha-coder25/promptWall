from __future__ import annotations

import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

# promptwall.main builds the application at import time for uvicorn. Tests import the
# factory, so provide harmless placeholders before that import happens.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_import_placeholder.db")
os.environ.setdefault("UPSTREAM_BASE_URL", "https://upstream.test/v1")
os.environ.setdefault("UPSTREAM_API_KEY", "sk-test-placeholder")
os.environ.setdefault("ADMIN_TOKEN", "admin-token-for-tests")

import httpx  # noqa: E402
import pytest  # noqa: E402
from pydantic import SecretStr  # noqa: E402

from promptwall.core.config import Settings  # noqa: E402
from promptwall.detection.taxonomy import load_taxonomy, seed_taxonomy  # noqa: E402
from promptwall.main import create_app  # noqa: E402
from promptwall.providers.base import CircuitBreaker  # noqa: E402
from promptwall.providers.openai_compat import OpenAICompatProvider  # noqa: E402
from promptwall.storage.db import Database  # noqa: E402
from promptwall.storage.models import Project  # noqa: E402
from promptwall.storage.repositories import create_project  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
CONFIGS = REPO_ROOT / "configs"
DEFAULT_POLICY = (CONFIGS / "default_policy.yaml").read_text(encoding="utf-8")

ADMIN_TOKEN = "admin-token-for-tests"
UPSTREAM_URL = "https://upstream.test/v1/chat/completions"


@dataclass
class Tenant:
    project: Project
    key: str


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}",
        upstream_base_url="https://upstream.test/v1",
        upstream_api_key=SecretStr("sk-test-upstream-secret"),
        admin_token=SecretStr(ADMIN_TOKEN),
        log_level="CRITICAL",
        config_dir=CONFIGS,
        auto_create_schema=False,
    )


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[object]:
    application = create_app(settings)
    db = Database(settings.database_url)
    await db.create_schema()

    application.state.settings = settings
    application.state.db = db
    application.state.provider = OpenAICompatProvider(
        base_url=settings.upstream_base_url,
        api_key=settings.upstream_api_key.get_secret_value(),
        breaker=CircuitBreaker(5, 30.0),
    )

    async with db.session() as session:
        await seed_taxonomy(session, load_taxonomy(settings.taxonomy_path))

    yield application

    await application.state.provider.aclose()
    await db.close()


@pytest.fixture
async def client(app: object) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as http:
        yield http


@pytest.fixture
async def tenant(app: object) -> Tenant:
    db: Database = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        project, raw_key, _policy = await create_project(
            session,
            name="test-project",
            mode="balanced",
            fail_mode="closed",
            pinned_system_prompt_hash=None,
            store_raw_text=False,
            retention_days=30,
            policy_yaml=DEFAULT_POLICY,
        )
    return Tenant(project=project, key=raw_key)


@pytest.fixture
async def second_tenant(app: object) -> Tenant:
    db: Database = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        project, raw_key, _policy = await create_project(
            session,
            name="other-project",
            mode="balanced",
            fail_mode="closed",
            pinned_system_prompt_hash=None,
            store_raw_text=False,
            retention_days=30,
            policy_yaml=DEFAULT_POLICY,
        )
    return Tenant(project=project, key=raw_key)


async def create_tenant(
    app: object, *, name: str, mode: str = "balanced", fail_mode: str = "closed"
) -> Tenant:
    db: Database = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        project, raw_key, _policy = await create_project(
            session,
            name=name,
            mode=mode,
            fail_mode=fail_mode,
            pinned_system_prompt_hash=None,
            store_raw_text=False,
            retention_days=30,
            policy_yaml=DEFAULT_POLICY,
        )
    return Tenant(project=project, key=raw_key)


def chat_payload(content: str, *, role: str = "user", **extra: object) -> dict[str, object]:
    return {
        "model": "gpt-4o-mini",
        "messages": [{"role": role, "content": content}],
        **extra,
    }


def auth_headers(tenant: Tenant) -> dict[str, str]:
    return {"Authorization": f"Bearer {tenant.key}"}


def admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}
