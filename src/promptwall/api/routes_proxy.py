"""OpenAI Chat Completions compatible proxy."""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from promptwall.api.auth import require_project
from promptwall.api.helpers import error_response, promptwall_headers, refusal_body
from promptwall.api.schemas import (
    ChatCompletionRequest,
    RequestTooLargeError,
    UnsupportedFeatureError,
    extract_text_content,
)
from promptwall.core.context import ProjectContext
from promptwall.core.pipeline import IncomingMessage, InspectionUnavailable, inspect_and_record
from promptwall.providers.base import UpstreamUnavailable

router = APIRouter()


@router.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    payload: ChatCompletionRequest,
    project: Annotated[ProjectContext, Depends(require_project)],
) -> Response:
    settings = request.app.state.settings

    if payload.stream:
        raise UnsupportedFeatureError("Streaming is not supported by this gateway.")
    if len(payload.messages) > settings.max_messages:
        raise RequestTooLargeError(f"Request has more than {settings.max_messages} messages.")

    incoming: list[IncomingMessage] = []
    for position, message in enumerate(payload.messages):
        text = extract_text_content(message.content)
        forwardable = message.model_dump(mode="json", exclude_none=True)
        forwardable.pop("x_promptwall", None)
        label = message.x_promptwall
        incoming.append(
            IncomingMessage(
                position=position,
                role=message.role,
                content=text,
                label_channel=label.channel if label is not None else None,
                source_id=label.source_id if label is not None else None,
                forwardable=forwardable,
            )
        )

    db = request.app.state.db
    try:
        async with db.session() as session:
            outcome = await inspect_and_record(session, project=project, messages=incoming)
    except InspectionUnavailable:
        return error_response(
            503,
            "Inspection is unavailable and the project fail_mode is closed.",
            "inspection_unavailable",
            "gateway_error",
        )

    headers = promptwall_headers(outcome)

    if outcome.blocked:
        return JSONResponse(
            refusal_body(outcome, payload.model, int(time.time())),
            status_code=200,
            headers=headers,
        )

    provider = request.app.state.provider
    try:
        upstream = await provider.create_chat_completion(
            payload.forwardable_payload(outcome.messages)
        )
    except UpstreamUnavailable:
        return error_response(
            502,
            "The upstream provider is unavailable. The request was inspected.",
            "upstream_unavailable",
            "upstream_error",
            headers,
        )

    if upstream.status_code >= 400:
        try:
            body = upstream.json()
        except ValueError:
            body = {
                "error": {
                    "message": "The upstream provider returned an error.",
                    "type": "upstream_error",
                    "code": "upstream_error",
                }
            }
        return JSONResponse(body, status_code=upstream.status_code, headers=headers)

    try:
        body = upstream.json()
    except ValueError:
        return error_response(
            502,
            "The upstream provider returned a non-JSON response.",
            "upstream_error",
            "upstream_error",
            headers,
        )

    return JSONResponse(body, status_code=upstream.status_code, headers=headers)
