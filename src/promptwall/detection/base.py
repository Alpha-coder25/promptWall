"""Detector interface shared by every detection layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from promptwall.core.channels import Channel
from promptwall.detection.normalize import NormalizedContent


@dataclass(frozen=True)
class DetectionResult:
    """One category hit from one detector.

    span is a (start, end) character span in the ORIGINAL text, or None when the
    signal cannot be located there. evidence is redacted: it never carries raw
    message content.
    """

    detector: str
    category: str
    score: float
    span: tuple[int, int] | None = None
    detector_version: str = "unknown"
    evidence: dict[str, Any] = field(default_factory=dict)


class Detector(Protocol):
    name: str
    version: str

    def detect(self, content: NormalizedContent, channel: Channel) -> list[DetectionResult]: ...
