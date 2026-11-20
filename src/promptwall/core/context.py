"""Authenticated project context passed from the auth layer into the pipeline."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from promptwall.core.policy import PolicyConfig


@dataclass(frozen=True)
class ProjectContext:
    project_id: uuid.UUID
    name: str
    mode: str
    fail_mode: str
    pinned_system_prompt_hash: str | None
    store_raw_text: bool
    policy_version: int | None
    policy: PolicyConfig
