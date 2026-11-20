from __future__ import annotations

import httpx
import pytest

from tests.conftest import Tenant, auth_headers, chat_payload


async def test_streaming_is_rejected_loudly(client: httpx.AsyncClient, tenant: Tenant) -> None:
    response = await client.post(
        "/v1/chat/completions",
        json=chat_payload("hello", stream=True),
        headers=auth_headers(tenant),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_feature"


@pytest.mark.parametrize(
    "part",
    [
        {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
        {"type": "input_audio", "input_audio": {"data": "abc", "format": "wav"}},
        {"type": "audio", "audio": {"data": "abc"}},
        {"type": "video_url", "video_url": {"url": "x"}},
    ],
)
async def test_image_audio_and_unknown_parts_are_rejected(
    client: httpx.AsyncClient, tenant: Tenant, part: dict[str, object]
) -> None:
    response = await client.post(
        "/v1/chat/completions",
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": [part]}],
        },
        headers=auth_headers(tenant),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_feature"


async def test_too_many_messages_are_rejected(client: httpx.AsyncClient, tenant: Tenant) -> None:
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": f"message {i}"} for i in range(80)],
    }
    response = await client.post("/v1/chat/completions", json=payload, headers=auth_headers(tenant))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "request_too_large"


async def test_oversized_body_is_rejected(client: httpx.AsyncClient, tenant: Tenant) -> None:
    huge = "a" * 400_000
    response = await client.post(
        "/v1/chat/completions",
        json=chat_payload(huge),
        headers=auth_headers(tenant),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "request_too_large"


async def test_validation_errors_do_not_echo_content(
    client: httpx.AsyncClient, tenant: Tenant
) -> None:
    response = await client.post(
        "/v1/chat/completions",
        json={"model": "gpt-4o-mini", "messages": [], "temperature": 987.654},
        headers=auth_headers(tenant),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"
    assert "987.654" not in response.text
