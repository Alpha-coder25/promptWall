"""Authentication. Project keys and the admin token are separate scopes."""

from __future__ import annotations

import hmac

from fastapi import Request

from promptwall.core.context import ProjectContext
from promptwall.core.policy import PolicyConfig, parse_policy_yaml
from promptwall.storage.repositories import get_active_policy, resolve_api_key


class AuthError(Exception):
    """Authentication failure. The API renders one generic 401 for every case."""


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


async def require_project(request: Request) -> ProjectContext:
    token = _bearer_token(request)
    if token is None:
        raise AuthError("invalid credentials")

    db = request.app.state.db
    async with db.session() as session:
        project = await resolve_api_key(session, token)
        if project is None:
            raise AuthError("invalid credentials")

        policy_row = await get_active_policy(session, project.id)
        if policy_row is not None:
            try:
                policy = parse_policy_yaml(policy_row.policy_yaml)
            except ValueError:
                policy = PolicyConfig()
            policy_version: int | None = policy_row.version
        else:
            policy = PolicyConfig()
            policy_version = None

        return ProjectContext(
            project_id=project.id,
            name=project.name,
            mode=project.mode,
            fail_mode=project.fail_mode,
            pinned_system_prompt_hash=project.pinned_system_prompt_hash,
            store_raw_text=project.store_raw_text,
            policy_version=policy_version,
            policy=policy,
        )


async def require_admin(request: Request) -> None:
    token = _bearer_token(request)
    settings = request.app.state.settings
    if token is None or not _constant_time_equals(token, settings.admin_token.get_secret_value()):
        raise AuthError("invalid credentials")
