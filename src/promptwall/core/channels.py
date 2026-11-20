"""Message channels, trust levels and provenance rules."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Channel(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    RETRIEVED_DOCUMENT = "retrieved_document"
    TOOL_OUTPUT = "tool_output"


class TrustLevel(str, Enum):
    TRUSTED = "trusted"
    STANDARD = "standard"
    UNTRUSTED_EXTERNAL = "untrusted_external"


# Highest to lowest: system, then user/assistant, then external content.
TRUST_RANK: dict[Channel, int] = {
    Channel.SYSTEM: 3,
    Channel.USER: 2,
    Channel.ASSISTANT: 2,
    Channel.RETRIEVED_DOCUMENT: 1,
    Channel.TOOL_OUTPUT: 1,
}

RANK_TRUST_LEVEL: dict[int, TrustLevel] = {
    3: TrustLevel.TRUSTED,
    2: TrustLevel.STANDARD,
    1: TrustLevel.UNTRUSTED_EXTERNAL,
}

ROLE_DEFAULT_CHANNEL: dict[str, Channel] = {
    "system": Channel.SYSTEM,
    "user": Channel.USER,
    "assistant": Channel.ASSISTANT,
    "tool": Channel.TOOL_OUTPUT,
}

EXTERNAL_CHANNELS: frozenset[Channel] = frozenset({Channel.RETRIEVED_DOCUMENT, Channel.TOOL_OUTPUT})

FLAG_PROVENANCE_RAISE_ATTEMPT = "PROVENANCE_RAISE_ATTEMPT"
FLAG_UNKNOWN_LABEL = "UNKNOWN_LABEL"
FLAG_SYSTEM_PROMPT_MISMATCH = "SYSTEM_PROMPT_MISMATCH"


@dataclass
class Provenance:
    channel: Channel
    trust_level: TrustLevel
    label_source: str  # "default" or "app"
    source_id: str | None = None
    flags: list[str] = field(default_factory=list)


def resolve_provenance(role: str, label_channel: str | None, source_id: str | None) -> Provenance:
    """Resolve the channel for a message.

    Labels may lower trust below the role default, never raise it. Rejected labels
    are ignored and flagged. System messages keep the system channel: they are
    inspected for integrity and never rewritten.
    """
    default_channel = ROLE_DEFAULT_CHANNEL.get(role, Channel.USER)
    default_rank = TRUST_RANK[default_channel]
    flags: list[str] = []

    if label_channel is None:
        return Provenance(
            channel=default_channel,
            trust_level=RANK_TRUST_LEVEL[default_rank],
            label_source="default",
            source_id=source_id,
        )

    try:
        labeled = Channel(str(label_channel).strip().lower())
    except ValueError:
        return Provenance(
            channel=default_channel,
            trust_level=RANK_TRUST_LEVEL[default_rank],
            label_source="default",
            source_id=source_id,
            flags=[FLAG_UNKNOWN_LABEL],
        )

    if default_channel is Channel.SYSTEM:
        # Content that is already trusted cannot be relabeled; keep it in system.
        if labeled is not Channel.SYSTEM:
            flags.append(FLAG_PROVENANCE_RAISE_ATTEMPT)
        return Provenance(
            channel=Channel.SYSTEM,
            trust_level=TrustLevel.TRUSTED,
            label_source="default",
            source_id=source_id,
            flags=flags,
        )

    if TRUST_RANK[labeled] > default_rank:
        return Provenance(
            channel=default_channel,
            trust_level=RANK_TRUST_LEVEL[default_rank],
            label_source="default",
            source_id=source_id,
            flags=[FLAG_PROVENANCE_RAISE_ATTEMPT],
        )

    return Provenance(
        channel=labeled,
        trust_level=RANK_TRUST_LEVEL[TRUST_RANK[labeled]],
        label_source="app",
        source_id=source_id,
    )
