"""Provider adapter interface and circuit breaker."""

from __future__ import annotations

import time
from typing import Any, Protocol

import httpx


class UpstreamUnavailable(RuntimeError):
    """Upstream cannot be reached or the circuit breaker is open."""


class CircuitBreaker:
    """Simple consecutive-failure circuit breaker.

    closed -> open after `failure_threshold` consecutive failures;
    open -> half-open after `reset_seconds`; a success closes it again.
    """

    def __init__(self, failure_threshold: int, reset_seconds: float) -> None:
        self._failure_threshold = failure_threshold
        self._reset_seconds = reset_seconds
        self._failures = 0
        self._opened_at: float | None = None

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed" if self._failures < self._failure_threshold else "open"
        if time.monotonic() - self._opened_at >= self._reset_seconds:
            return "half_open"
        return "open"

    def allows_request(self) -> bool:
        return self.state in ("closed", "half_open")

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self._failure_threshold and self._opened_at is None:
            self._opened_at = time.monotonic()


class Provider(Protocol):
    async def create_chat_completion(self, payload: dict[str, Any]) -> httpx.Response: ...

    async def aclose(self) -> None: ...
