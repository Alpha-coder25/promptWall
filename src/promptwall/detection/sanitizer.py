"""Span-based sanitization of the ORIGINAL text."""

from __future__ import annotations

from collections.abc import Iterable


def merge_spans(spans: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    ordered = sorted((max(0, start), max(0, end)) for start, end in spans if end > start)
    merged: list[tuple[int, int]] = []
    for start, end in ordered:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def sanitize_text(original_text: str, spans: Iterable[tuple[int, int]], placeholder: str) -> str:
    """Replace offending spans in the original text with a placeholder."""
    pieces: list[str] = []
    cursor = 0
    for start, end in merge_spans(spans):
        start = min(start, len(original_text))
        end = min(end, len(original_text))
        if start < cursor or end <= start:
            continue
        pieces.append(original_text[cursor:start])
        pieces.append(placeholder)
        cursor = end
    pieces.append(original_text[cursor:])
    return "".join(pieces)
