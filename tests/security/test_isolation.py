from __future__ import annotations

import uuid

import httpx
from sqlalchemy import select

from promptwall.storage.models import RequestRecord
from promptwall.storage.repositories import get_request, list_events
from tests.conftest import UPSTREAM_URL, Tenant, admin_headers, auth_headers, chat_payload

COMPLETION = {
    "id": "chatcmpl-upstream",
    "object": "chat.completion",
    "created": 1,
    "model": "gpt-4o-mini",
    "choices": [
        {"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}
    ],
}


async def test_project_key_cannot_read_events(client: httpx.AsyncClient, tenant: Tenant) -> None:
    response = await client.get("/admin/events", headers=auth_headers(tenant))
    assert response.status_code == 401


async def test_events_are_filtered_by_project(
    client: httpx.AsyncClient,
    tenant: Tenant,
    second_tenant: Tenant,
    respx_mock: object,
    app: object,
) -> None:
    respx_mock.post(UPSTREAM_URL).mock(  # type: ignore[attr-defined]
        return_value=httpx.Response(200, json=COMPLETION)
    )
    await client.post(
        "/v1/chat/completions", json=chat_payload("first tenant"), headers=auth_headers(tenant)
    )
    await client.post(
        "/v1/chat/completions",
        json=chat_payload("second tenant"),
        headers=auth_headers(second_tenant),
    )

    only_first = await client.get(
        "/admin/events",
        params={"project_id": str(tenant.project.id)},
        headers=admin_headers(),
    )
    only_second = await client.get(
        "/admin/events",
        params={"project_id": str(second_tenant.project.id)},
        headers=admin_headers(),
    )

    assert only_first.json()["count"] == 1
    assert only_second.json()["count"] == 1
    assert only_first.json()["events"][0]["project_id"] == str(tenant.project.id)
    assert only_second.json()["events"][0]["project_id"] == str(second_tenant.project.id)


async def test_repository_queries_enforce_tenancy(
    client: httpx.AsyncClient,
    tenant: Tenant,
    second_tenant: Tenant,
    respx_mock: object,
    app: object,
) -> None:
    respx_mock.post(UPSTREAM_URL).mock(  # type: ignore[attr-defined]
        return_value=httpx.Response(200, json=COMPLETION)
    )
    await client.post(
        "/v1/chat/completions", json=chat_payload("first tenant"), headers=auth_headers(tenant)
    )
    await client.post(
        "/v1/chat/completions",
        json=chat_payload("second tenant"),
        headers=auth_headers(second_tenant),
    )

    db = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        first_events = await list_events(session, project_id=tenant.project.id)
        second_events = await list_events(session, project_id=second_tenant.project.id)
        all_rows = (await session.execute(select(RequestRecord))).scalars().all()

    assert len(first_events) == 1
    assert len(second_events) == 1
    assert {row.project_id for row in first_events} == {tenant.project.id}
    assert {row.project_id for row in second_events} == {second_tenant.project.id}
    assert len(all_rows) == 2

    async with db.session() as session:
        cross_tenant_lookup = await get_request(
            session,
            project_id=second_tenant.project.id,
            request_id=first_events[0].id,
        )
    assert cross_tenant_lookup is None


async def test_unknown_project_id_returns_nothing(
    client: httpx.AsyncClient, tenant: Tenant, app: object
) -> None:
    db = app.state.db  # type: ignore[attr-defined]
    async with db.session() as session:
        events = await list_events(session, project_id=uuid.uuid4())
    assert events == []
