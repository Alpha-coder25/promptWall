"""Decision engine: policy decides what is permitted.

Detection produces scores; this module alone turns scores into allow, sanitize or
block. Decisions are made per message and then aggregated for the request.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from promptwall.core.channels import EXTERNAL_CHANNELS, Channel
from promptwall.core.scoring import thresholds_for


class Action(str, Enum):
    ALLOW = "allow"
    SANITIZE = "sanitize"
    BLOCK = "block"


@dataclass
class MessageVerdict:
    position: int
    channel: Channel
    score: float
    action: Action
    spans: list[tuple[int, int]] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def decide_message(
    *,
    mode: str,
    channel: Channel,
    score: float,
    has_spans: bool,
    override: tuple[float, float] | None = None,
) -> Action:
    """Decide one message's action from its score, channel and policy mode."""
    if channel is Channel.SYSTEM:
        # System messages are inspected for integrity but never rewritten.
        return Action.ALLOW

    low, high = thresholds_for(mode, channel, override)

    if score < low:
        return Action.ALLOW
    if score >= high:
        if channel in EXTERNAL_CHANNELS:
            return Action.SANITIZE if has_spans else Action.BLOCK
        return Action.BLOCK

    # Uncertain band.
    if mode == "strict":
        if channel in EXTERNAL_CHANNELS:
            return Action.SANITIZE if has_spans else Action.ALLOW
        return Action.BLOCK
    if mode == "balanced":
        return Action.SANITIZE if has_spans else Action.ALLOW
    return Action.ALLOW


def aggregate_action(verdicts: list[MessageVerdict]) -> Action:
    """Aggregate per-message actions into one request decision.

    A high-risk external message never blocks the whole request on its own; it is
    sanitized (or fully replaced) and the request continues. Only a block on a
    non-external channel blocks the request.
    """
    if any(v.action is Action.BLOCK and v.channel not in EXTERNAL_CHANNELS for v in verdicts):
        return Action.BLOCK
    if any(v.action in (Action.BLOCK, Action.SANITIZE) for v in verdicts):
        return Action.SANITIZE
    return Action.ALLOW
