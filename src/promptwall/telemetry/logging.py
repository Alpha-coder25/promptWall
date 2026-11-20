"""Structured JSON logging.

Message content is never passed to the logger. Log calls carry identifiers, counts,
scores and error types only.
"""

from __future__ import annotations

import logging

import structlog
from structlog.types import Processor

_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def configure_logging(level: str = "INFO") -> None:
    level_number = _LEVELS.get(level.upper(), logging.INFO)
    logging.basicConfig(level=level_number, format="%(message)s")
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ]
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level_number),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "promptwall") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[no-any-return]


def bind_request_context(request_id: str, project_id: str | None = None) -> None:
    structlog.contextvars.bind_contextvars(request_id=request_id, project_id=project_id)


def clear_request_context() -> None:
    structlog.contextvars.clear_contextvars()
