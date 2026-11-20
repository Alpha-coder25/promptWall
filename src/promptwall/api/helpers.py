"""Shared API helpers for structured error bodies and PromptWall response headers."""

from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from promptwall.core.pipeline import InspectionOutcome


def error_response(
    status_code: int,
    message: str,
    code: str,
    error_type: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        {"error": {"message": message, "type": error_type, "code": code}},
        status_code=status_code,
        headers=headers,
    )


def promptwall_headers(outcome: InspectionOutcome) -> dict[str, str]:
    return {
        "X-PromptWall-Request-Id": str(outcome.request_id),
        "X-PromptWall-Decision": outcome.decision,
        "X-PromptWall-Inspected": outcome.inspection_status,
    }


def refusal_body(outcome: InspectionOutcome, model: str, created: int) -> dict[str, Any]:
    return {
        "id": f"chatcmpl-pw-{outcome.request_id}",
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": outcome.refusal_text},
                "finish_reason": "content_filter",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
