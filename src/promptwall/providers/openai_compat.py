"""OpenAI Chat Completions compatible upstream adapter."""

from __future__ import annotations

from typing import Any

import httpx

from promptwall.providers.base import CircuitBreaker, UpstreamUnavailable
from promptwall.telemetry.logging import get_logger

logger = get_logger("promptwall.provider")


class OpenAICompatProvider:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        connect_timeout_seconds: float = 5.0,
        read_timeout_seconds: float = 60.0,
        max_connections: int = 20,
        breaker: CircuitBreaker | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(read_timeout_seconds, connect=connect_timeout_seconds),
            limits=httpx.Limits(
                max_connections=max_connections,
                max_keepalive_connections=max(1, max_connections // 2),
            ),
        )
        self._breaker = breaker or CircuitBreaker(5, 30.0)

    @property
    def breaker(self) -> CircuitBreaker:
        return self._breaker

    async def create_chat_completion(self, payload: dict[str, Any]) -> httpx.Response:
        if not self._breaker.allows_request():
            raise UpstreamUnavailable("circuit breaker is open")
        try:
            response = await self._client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers={
                    "authorization": f"Bearer {self._api_key}",
                    "content-type": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            self._breaker.record_failure()
            logger.warning("upstream_request_failed", error_type=type(exc).__name__)
            raise UpstreamUnavailable("upstream request failed") from exc

        if response.status_code >= 500:
            self._breaker.record_failure()
        else:
            self._breaker.record_success()
        return response

    async def aclose(self) -> None:
        await self._client.aclose()
