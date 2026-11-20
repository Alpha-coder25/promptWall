"""Project policy document (YAML) parsing and defaults."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

DEFAULT_REFUSAL_TEXT = (
    "This request was blocked by PromptWall because it matched prompt-injection policy."
)
DEFAULT_PLACEHOLDER = "[REMOVED BY PROMPTWALL]"


class ThresholdOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    low: float = Field(ge=0.0, le=1.0)
    high: float = Field(ge=0.0, le=1.0)


class PolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(default=1, ge=1)
    mode: Literal["strict", "balanced", "lenient"] | None = None
    refusal_text: str = DEFAULT_REFUSAL_TEXT
    sanitize_placeholder: str = DEFAULT_PLACEHOLDER
    thresholds: ThresholdOverride | None = None


def parse_policy_yaml(text: str) -> PolicyConfig:
    """Parse and validate policy YAML. Raises ValueError on malformed policy."""
    try:
        raw: Any = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ValueError(f"policy is not valid YAML: {exc}") from exc
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError("policy must be a YAML mapping")
    try:
        return PolicyConfig.model_validate(raw)
    except Exception as exc:
        raise ValueError(f"policy does not match the policy schema: {exc}") from exc


def load_default_policy_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    parse_policy_yaml(text)
    return text
