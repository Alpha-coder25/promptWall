"""Repository layer.

Every function that reads or writes tenant data takes a project_id and filters on it.
The only exception is list_events(), which the admin scope may call without a project
filter to get a global view.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from promptwall.storage.models import ApiKey, Policy, Project, RequestRecord

KEY_PREFIX = "pw_live_"


def utcnow() -> datetime:
    return datetime.now(UTC)


def generate_api_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


async def create_project(
    session: AsyncSession,
    *,
    name: str,
    mode: str,
    fail_mode: str,
    pinned_system_prompt_hash: str | None,
    store_raw_text: bool,
    retention_days: int,
    policy_yaml: str,
    created_by: str = "admin",
) -> tuple[Project, str, Policy]:
    """Create a project, its first policy version and its first API key in one transaction.

    Returns the raw API key exactly once; only its hash is stored.
    """
    project = Project(
        name=name,
        mode=mode,
        fail_mode=fail_mode,
        pinned_system_prompt_hash=pinned_system_prompt_hash,
        store_raw_text=store_raw_text,
        retention_days=retention_days,
    )
    session.add(project)
    await session.flush()

    policy = Policy(
        project_id=project.id,
        version=1,
        policy_yaml=policy_yaml,
        active=True,
        created_by=created_by,
    )
    session.add(policy)

    raw_key = generate_api_key()
    session.add(
        ApiKey(
            project_id=project.id,
            key_hash=hash_api_key(raw_key),
            label="initial",
        )
    )
    await session.commit()
    return project, raw_key, policy


async def get_project(session: AsyncSession, project_id: uuid.UUID) -> Project | None:
    return await session.get(Project, project_id)


async def create_api_key(
    session: AsyncSession, *, project_id: uuid.UUID, label: str
) -> tuple[ApiKey, str]:
    raw_key = generate_api_key()
    key = ApiKey(project_id=project_id, key_hash=hash_api_key(raw_key), label=label)
    session.add(key)
    await session.commit()
    return key, raw_key


async def resolve_api_key(session: AsyncSession, raw_key: str) -> Project | None:
    """Resolve a live, unrevoked key to its project and record last use."""
    if not raw_key.startswith(KEY_PREFIX):
        return None
    result = await session.execute(
        select(ApiKey, Project)
        .join(Project, Project.id == ApiKey.project_id)
        .where(
            ApiKey.key_hash == hash_api_key(raw_key),
            ApiKey.revoked_at.is_(None),
            Project.archived_at.is_(None),
        )
    )
    row = result.first()
    if row is None:
        return None
    api_key = cast(ApiKey, row[0])
    project = cast(Project, row[1])
    api_key.last_used_at = utcnow()
    await session.commit()
    return project


async def revoke_api_key(
    session: AsyncSession, *, project_id: uuid.UUID, key_id: uuid.UUID
) -> bool:
    result = await session.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.project_id == project_id)
    )
    key = result.scalar_one_or_none()
    if key is None:
        return False
    if key.revoked_at is None:
        key.revoked_at = utcnow()
    await session.commit()
    return True


async def revoke_api_key_by_id(session: AsyncSession, key_id: uuid.UUID) -> bool:
    """Admin-scope revocation by key id."""
    key = await session.get(ApiKey, key_id)
    if key is None:
        return False
    if key.revoked_at is None:
        key.revoked_at = utcnow()
    await session.commit()
    return True


async def get_active_policy(session: AsyncSession, project_id: uuid.UUID) -> Policy | None:
    result = await session.execute(
        select(Policy).where(Policy.project_id == project_id, Policy.active.is_(True))
    )
    return result.scalar_one_or_none()


async def set_policy(
    session: AsyncSession,
    *,
    project_id: uuid.UUID,
    policy_yaml: str,
    created_by: str,
) -> Policy:
    """Create a new active policy version, deactivating the previous one."""
    current = (
        (await session.execute(select(Policy).where(Policy.project_id == project_id)))
        .scalars()
        .all()
    )
    next_version = max((p.version for p in current), default=0) + 1
    for policy in current:
        policy.active = False
    new_policy = Policy(
        project_id=project_id,
        version=next_version,
        policy_yaml=policy_yaml,
        active=True,
        created_by=created_by,
    )
    session.add(new_policy)
    await session.commit()
    return new_policy


async def list_events(
    session: AsyncSession,
    *,
    project_id: uuid.UUID | None,
    decision: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 50,
) -> list[RequestRecord]:
    """List requests. Tenant callers must pass project_id; None is for the admin scope."""
    stmt = select(RequestRecord).order_by(RequestRecord.created_at.desc()).limit(limit)
    if project_id is not None:
        stmt = stmt.where(RequestRecord.project_id == project_id)
    if decision is not None:
        stmt = stmt.where(RequestRecord.decision == decision)
    if start is not None:
        stmt = stmt.where(RequestRecord.created_at >= start)
    if end is not None:
        stmt = stmt.where(RequestRecord.created_at <= end)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_request(
    session: AsyncSession, *, project_id: uuid.UUID, request_id: uuid.UUID
) -> RequestRecord | None:
    result = await session.execute(
        select(RequestRecord).where(
            RequestRecord.id == request_id, RequestRecord.project_id == project_id
        )
    )
    return result.scalar_one_or_none()
