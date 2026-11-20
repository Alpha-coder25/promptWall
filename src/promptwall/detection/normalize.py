"""Reversible normalization.

The original text is never modified. This module produces a canonical view plus an
offset map back to the original, and extra decoded views that are scored in addition
to (never instead of) the canonical text.
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass, field

FLAG_ZERO_WIDTH = "ZERO_WIDTH"
FLAG_UNICODE_TAGS = "UNICODE_TAGS"
FLAG_VARIATION_SELECTOR = "VARIATION_SELECTOR"
FLAG_MIXED_SCRIPT = "MIXED_SCRIPT"
FLAG_ENCODED_VIEW = "ENCODED_VIEW"

# Zero-width and invisible formatting characters removed from the canonical view.
_ZERO_WIDTH_CODEPOINTS = frozenset(
    {0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0x2061, 0x2062, 0x2063, 0x180E, 0xFEFF}
)

# Lookalikes folded only inside mixed-script tokens.
_HOMOGLYPHS: dict[str, str] = {
    # Cyrillic lower
    "а": "a",
    "в": "b",
    "е": "e",
    "ё": "e",
    "к": "k",
    "м": "m",
    "н": "h",
    "о": "o",
    "р": "p",
    "с": "c",
    "т": "t",
    "у": "y",
    "х": "x",
    "і": "i",
    "ї": "i",
    "ј": "j",
    "ѕ": "s",
    "ԁ": "d",
    "һ": "h",
    "ӏ": "l",
    "ԛ": "q",
    "ԝ": "w",
    "ɡ": "g",
    # Cyrillic upper
    "А": "A",
    "В": "B",
    "Е": "E",
    "Ё": "E",
    "К": "K",
    "М": "M",
    "Н": "H",
    "О": "O",
    "Р": "P",
    "С": "C",
    "Т": "T",
    "У": "Y",
    "Х": "X",
    "І": "I",
    "Ї": "I",
    "Ј": "J",
    "Ѕ": "S",
    "Ӏ": "I",
    # Greek lower
    "α": "a",
    "β": "b",
    "γ": "y",
    "ε": "e",
    "ι": "i",
    "κ": "k",
    "ν": "v",
    "ο": "o",
    "ρ": "p",
    "τ": "t",
    "υ": "u",
    "χ": "x",
    "ω": "w",
    # Greek upper
    "Α": "A",
    "Β": "B",
    "Ε": "E",
    "Ζ": "Z",
    "Η": "H",
    "Ι": "I",
    "Κ": "K",
    "Μ": "M",
    "Ν": "N",
    "Ο": "O",
    "Ρ": "P",
    "Τ": "T",
    "Υ": "Y",
    "Χ": "X",
}

_BASE64_CANDIDATE = re.compile(
    r"(?<![A-Za-z0-9+/=_\-])[A-Za-z0-9+/_\-]{16,}={0,2}(?![A-Za-z0-9+/=_\-])"
)
_HEX_CANDIDATE = re.compile(r"(?<![0-9a-fA-Fx])[0-9a-fA-F]{16,}(?![0-9a-fA-F])")

_MIN_DECODED_LENGTH = 8
_MIN_TAG_DECODED_LENGTH = 4


@dataclass
class NormalizedContent:
    original_text: str
    canonical_text: str
    flags: list[str]
    offset_map: list[tuple[int, int]]
    decoded_views: list[str] = field(default_factory=list)
    # Parallel to decoded_views: span in the ORIGINAL text that produced the view.
    decoded_view_spans: list[tuple[int, int]] = field(default_factory=list)

    @property
    def all_views(self) -> list[str]:
        return [self.canonical_text, *self.decoded_views]


def _is_variation_selector(codepoint: int) -> bool:
    return 0xFE00 <= codepoint <= 0xFE0F or 0xE0100 <= codepoint <= 0xE01EF


def _is_tag_character(codepoint: int) -> bool:
    return 0xE0000 <= codepoint <= 0xE007F


def _script_of(char: str) -> str:
    name = unicodedata.name(char, "")
    if name.startswith("CYRILLIC"):
        return "cyrillic"
    if name.startswith("GREEK"):
        return "greek"
    if "LATIN" in name or (char.isascii() and char.isalpha()):
        return "latin"
    return "other"


def map_canonical_span(
    offset_map: list[tuple[int, int]], start: int, end: int
) -> tuple[int, int] | None:
    """Map a [start, end) span in canonical_text to the original text."""
    if not offset_map or start >= end or start >= len(offset_map):
        return None
    end = min(end, len(offset_map))
    span_start = offset_map[start][0]
    span_end = offset_map[end - 1][1]
    if span_end <= span_start:
        return None
    return (span_start, span_end)


def _looks_like_text(value: str, min_length: int = _MIN_DECODED_LENGTH) -> bool:
    if len(value) < min_length:
        return False
    if not any(char.isalpha() for char in value):
        return False
    return not any(not (char.isprintable() or char in "\n\r\t") for char in value)


def _fold_mixed_scripts(chars: list[str], flags: set[str]) -> None:
    index = 0
    length = len(chars)
    while index < length:
        if not chars[index].isalnum():
            index += 1
            continue
        end = index
        while end < length and chars[end].isalnum():
            end += 1
        scripts = {_script_of(chars[pos]) for pos in range(index, end) if chars[pos].isalpha()}
        if "latin" in scripts and (scripts & {"cyrillic", "greek"}):
            flags.add(FLAG_MIXED_SCRIPT)
            for pos in range(index, end):
                folded = _HOMOGLYPHS.get(chars[pos])
                if folded is not None:
                    chars[pos] = folded
        index = end


def _decode_base64_candidates(text: str) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for match in _BASE64_CANDIDATE.finditer(text):
        candidate = match.group(0)
        padded = candidate.replace("-", "+").replace("_", "/")
        padded += "=" * (-len(padded) % 4)
        try:
            decoded = base64.b64decode(padded, validate=True)
        except (binascii.Error, ValueError):
            continue
        try:
            value = decoded.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if _looks_like_text(value):
            found.append((value, match.start(), match.end()))
    return found


def _decode_hex_candidates(text: str) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for match in _HEX_CANDIDATE.finditer(text):
        candidate = match.group(0)
        if len(candidate) % 2 != 0:
            continue
        try:
            decoded = bytes.fromhex(candidate)
        except ValueError:
            continue
        try:
            value = decoded.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if _looks_like_text(value):
            found.append((value, match.start(), match.end()))
    return found


def normalize(text: str) -> NormalizedContent:
    """Build the canonical view, flags, offset map and decoded views."""
    chars: list[str] = []
    spans: list[tuple[int, int]] = []
    flag_set: set[str] = set()

    tag_chars: list[str] = []
    tag_span: tuple[int, int] | None = None

    for index, char in enumerate(text):
        codepoint = ord(char)
        if codepoint in _ZERO_WIDTH_CODEPOINTS:
            flag_set.add(FLAG_ZERO_WIDTH)
            continue
        if _is_variation_selector(codepoint):
            flag_set.add(FLAG_VARIATION_SELECTOR)
            continue
        if _is_tag_character(codepoint):
            flag_set.add(FLAG_UNICODE_TAGS)
            if 0xE0020 <= codepoint <= 0xE007E:
                tag_chars.append(chr(codepoint - 0xE0000))
            tag_span = (index, index + 1) if tag_span is None else (tag_span[0], index + 1)
            continue

        for normalized_char in unicodedata.normalize("NFKC", char):
            chars.append(normalized_char)
            spans.append((index, index + 1))

    _fold_mixed_scripts(chars, flag_set)

    canonical_text = "".join(chars)
    decoded_views: list[str] = []
    decoded_spans: list[tuple[int, int]] = []

    if tag_chars:
        decoded_tags = "".join(tag_chars)
        if _looks_like_text(decoded_tags, _MIN_TAG_DECODED_LENGTH) and tag_span is not None:
            decoded_views.append(decoded_tags)
            decoded_spans.append(tag_span)

    for value, start, end in [
        *_decode_base64_candidates(canonical_text),
        *_decode_hex_candidates(canonical_text),
    ]:
        span = map_canonical_span(spans, start, end)
        if span is None or value == canonical_text or value in decoded_views:
            continue
        decoded_views.append(value)
        decoded_spans.append(span)

    if decoded_views:
        flag_set.add(FLAG_ENCODED_VIEW)

    return NormalizedContent(
        original_text=text,
        canonical_text=canonical_text,
        flags=sorted(flag_set),
        offset_map=spans,
        decoded_views=decoded_views,
        decoded_view_spans=decoded_spans,
    )
