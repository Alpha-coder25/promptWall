from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select

from promptwall.storage.models import ApiKey
from tests.conftest import Tenant, admin_headers, auth_headers, chat_payload


async def test_missing_key_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post("/v1/chat/completions", json=chat_payload("hello"))
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_invalid_key_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/v1/chat/completions",
        json=chat_payload("hello"),
        headers={"Authorization": "Bearer pw_live_not-a-real-key"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_api_key"


@pytest.mark.parametrize(
    "header",
    ["Basic abc", "Bearer", "pw_live_raw-without-scheme"],
)
async def test_malformed_authorization_headers_are_rejected(
    client: httpx.AsyncClient, header: str
) -> None:
    response = await client.post(
        "/v1/chat/completions", json=chat_payload("hello"), headers={"Authorization": header}
    )
    assert response.status_code == 401


async def test_revoked_key_is_rejected(
    client: httpx.AsyncClient, tenant: Tenant, app: object
) -> None:
    db = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        key_row = (
            (await session.execute(select(ApiKey).where(ApiKey.project_id == tenant.project.id)))
            .scalars()
            .first()
        )
        assert key_row is not None
        key_id = key_row.id

    revoke = await client.delete(f"/admin/keys/{key_id}", headers=admin_headers())
    assert revoke.status_code == 200

    response = await client.post(
        "/v1/chat/completions", json=chat_payload("hello"), headers=auth_headers(tenant)
    )
    assert response.status_code == 401


async def test_only_the_key_hash_is_stored(
    client: httpx.AsyncClient, tenant: Tenant, app: object
) -> None:
    db = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        key_row = (
            (await session.execute(select(ApiKey).where(ApiKey.project_id == tenant.project.id)))
            .scalars()
            .first()
        )

    assert key_row is not None
    assert key_row.key_hash != tenant.key
    assert tenant.key not in key_row.key_hash
    assert len(key_row.key_hash) == 64
    assert tenant.key.startswith("pw_live_")
