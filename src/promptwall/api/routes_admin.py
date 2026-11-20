"""Admin API: projects, keys, policies and events. Separate auth scope from projects."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from promptwall.api.auth import require_admin
from promptwall.api.helpers import error_response
from promptwall.api.schemas import ApiKeyCreate, PolicyUpdate, ProjectCreate
from promptwall.core.policy import load_default_policy_text, parse_policy_yaml
from promptwall.storage.repositories import (
    create_api_key,
    create_project,
    get_project,
    list_events,
    revoke_api_key_by_id,
    set_policy,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


def _project_out(project: Any) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "name": project.name,
        "mode": project.mode,
        "fail_mode": project.fail_mode,
        "pinned_system_prompt_hash": project.pinned_system_prompt_hash,
        "store_raw_text": project.store_raw_text,
        "retention_days": project.retention_days,
    }


@router.post("/projects", status_code=201)
async def create_project_endpoint(payload: ProjectCreate, request: Request) -> JSONResponse:
    settings = request.app.state.settings
    if payload.policy_yaml is not None:
        policy_yaml = payload.policy_yaml
    else:
        policy_yaml = load_default_policy_text(settings.default_policy_path)
    try:
        parse_policy_yaml(policy_yaml)
    except ValueError as exc:
        return error_response(400, str(exc), "invalid_policy", "invalid_request_error")

    db = request.app.state.db
    async with db.session() as session:
        project, raw_key, policy = await create_project(
            session,
            name=payload.name,
            mode=payload.mode,
            fail_mode=payload.fail_mode,
            pinned_system_prompt_hash=payload.pinned_system_prompt_hash,
            store_raw_text=payload.store_raw_text,
            retention_days=payload.retention_days,
            policy_yaml=policy_yaml,
        )
        return JSONResponse(
            {
                "project": _project_out(project),
                "api_key": raw_key,
                "policy_version": policy.version,
            },
            status_code=201,
        )


@router.post("/projects/{project_id}/keys", status_code=201)
async def create_key_endpoint(
    project_id: uuid.UUID, payload: ApiKeyCreate, request: Request
) -> JSONResponse:
    db = request.app.state.db
    async with db.session() as session:
        project = await get_project(session, project_id)
        if project is None:
            return error_response(404, "Project not found.", "not_found", "invalid_request_error")
        key, raw_key = await create_api_key(session, project_id=project.id, label=payload.label)
        return JSONResponse(
            {"id": str(key.id), "api_key": raw_key, "label": key.label}, status_code=201
        )


@router.delete("/keys/{key_id}")
async def revoke_key_endpoint(key_id: uuid.UUID, request: Request) -> JSONResponse:
    db = request.app.state.db
    async with db.session() as session:
        revoked = await revoke_api_key_by_id(session, key_id)
        if not revoked:
            return error_response(404, "Key not found.", "not_found", "invalid_request_error")
        return JSONResponse({"revoked": True, "id": str(key_id)})


@router.put("/projects/{project_id}/policy")
async def update_policy_endpoint(
    project_id: uuid.UUID, payload: PolicyUpdate, request: Request
) -> JSONResponse:
    try:
        parse_policy_yaml(payload.policy_yaml)
    except ValueError as exc:
        return error_response(400, str(exc), "invalid_policy", "invalid_request_error")

    db = request.app.state.db
    async with db.session() as session:
        project = await get_project(session, project_id)
        if project is None:
            return error_response(404, "Project not found.", "not_found", "invalid_request_error")
        policy = await set_policy(
            session,
            project_id=project.id,
            policy_yaml=payload.policy_yaml,
            created_by="admin",
        )
        return JSONResponse(
            {
                "policy_version": policy.version,
                "active": policy.active,
                "created_at": policy.created_at.isoformat(),
            }
        )


@router.get("/events")
async def list_events_endpoint(
    request: Request,
    project_id: Annotated[uuid.UUID | None, Query()] = None,
    decision: Annotated[str | None, Query(pattern="^(allow|sanitize|block)$")] = None,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> JSONResponse:
    db = request.app.state.db
    async with db.session() as session:
        events = await list_events(
            session,
            project_id=project_id,
            decision=decision,
            start=start,
            end=end,
            limit=limit,
        )
        return JSONResponse(
            {
                "count": len(events),
                "events": [
                    {
                        "id": str(event.id),
                        "project_id": str(event.project_id),
                        "decision": event.decision,
                        "inspection_status": event.inspection_status,
                        "final_score": event.final_score,
                        "policy_version": event.policy_version,
                        "latency_ms": event.latency_ms,
                        "content_hash": event.content_hash,
                        "detector_versions": event.detector_versions,
                        "created_at": event.created_at.isoformat(),
                    }
                    for event in events
                ],
            }
        )
