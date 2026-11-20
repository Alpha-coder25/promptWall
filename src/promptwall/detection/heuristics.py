"""Heuristic detectors.

Patterns live in one table (SIGNALS) rather than scattered through code. Each signal
has a category and a weight between 0.3 and 0.9. Signals in the same category are
combined with noisy-or. Detectors score the canonical view and every decoded view,
and the maximum per category is kept.

These are PROVISIONAL heuristics; Week 2 replaces the hand-written weights with
calibrated values.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from promptwall.core.channels import Channel
from promptwall.detection.base import DetectionResult
from promptwall.detection.normalize import NormalizedContent, map_canonical_span

DETECTOR_VERSION = "heuristics/1"

CATEGORY_INSTRUCTION_OVERRIDE = "INSTRUCTION_OVERRIDE"
CATEGORY_ROLE_INJECTION = "ROLE_INJECTION"
CATEGORY_PROMPT_LEAKAGE = "PROMPT_LEAKAGE"
CATEGORY_DELIMITER_ABUSE = "DELIMITER_ABUSE"
CATEGORY_DATA_EXFILTRATION = "DATA_EXFILTRATION"
CATEGORY_ENCODED_PAYLOAD = "ENCODED_PAYLOAD"


@dataclass(frozen=True)
class Signal:
    name: str
    category: str
    pattern: re.Pattern[str]
    weight: float
    description: str = ""


def _sig(
    name: str,
    category: str,
    pattern: str,
    weight: float,
    description: str = "",
) -> Signal:
    if not 0.3 <= weight <= 0.9:
        raise ValueError(f"signal weight out of range: {name}")
    return Signal(
        name=name,
        category=category,
        pattern=re.compile(pattern, re.IGNORECASE | re.MULTILINE),
        weight=weight,
        description=description,
    )


SIGNALS: tuple[Signal, ...] = (
    # ---------------------------------------------------------------- override
    _sig(
        "override.previous_instructions",
        CATEGORY_INSTRUCTION_OVERRIDE,
        r"\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}?"
        r"\b(?:previous|prior|above|earlier|preceding|all)\b[^.\n]{0,25}?"
        r"\b(?:instructions?|rules?|prompts?|directions?|guidelines?|guardrails?)\b",
        0.9,
        "verb + qualifier + instruction noun",
    ),
    _sig(
        "override.standalone_above",
        CATEGORY_INSTRUCTION_OVERRIDE,
        r"\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:of\s+)?the\s+"
        r"(?:above|previous|prior)\s*(?:[.!?]|$)",
        0.6,
        "ignore the above (sentence end)",
    ),
    _sig(
        "override.new_instructions",
        CATEGORY_INSTRUCTION_OVERRIDE,
        r"\bnew\s+(?:instructions?|rules?|system\s+prompt)\s*:",
        0.6,
        "new instructions header",
    ),
    _sig(
        "override.from_now_on",
        CATEGORY_INSTRUCTION_OVERRIDE,
        r"\bfrom\s+now\s+on\b[^.\n]{0,40}\b(?:you|ignore|respond|answer|reply|behave)\b",
        0.5,
    ),
    _sig(
        "override.do_not_follow",
        CATEGORY_INSTRUCTION_OVERRIDE,
        r"\b(?:do\s+not|don't|stop)\s+follow(?:ing)?\s+(?:your|the|my)\s+"
        r"(?:instructions?|rules?|guidelines?|system\s+prompt)\b",
        0.7,
    ),
    # -------------------------------------------------------------------- role
    _sig(
        "role.chat_template_tokens",
        CATEGORY_ROLE_INJECTION,
        r"<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>"
        r"|<\|endoftext\|>|\[/?INST\]|<<\s*/?\s*SYS\s*>>",
        0.85,
        "chat template control tokens",
    ),
    _sig(
        "role.you_are_now",
        CATEGORY_ROLE_INJECTION,
        r"\byou\s+are\s+now\s+(?:a|an|the|my|in|DAN\b|no\s+longer|operating|running|free)",
        0.6,
    ),
    _sig(
        "role.act_as_unrestricted",
        CATEGORY_ROLE_INJECTION,
        r"\bact\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|uncensored|evil|jailbroken|DAN)\b",
        0.7,
    ),
    _sig(
        "role.act_as_without_limits",
        CATEGORY_ROLE_INJECTION,
        r"\bact\s+as\b[^.\n]{0,40}\b(?:no|without)\s+"
        r"(?:restrictions?|rules?|filters?|limits?|guidelines?)\b",
        0.6,
    ),
    _sig(
        "role.fake_system_line",
        CATEGORY_ROLE_INJECTION,
        r"^\s*(?:system|assistant)\s*:",
        0.6,
        "fake system/assistant header at line start",
    ),
    _sig(
        "role.jailbreak_mode",
        CATEGORY_ROLE_INJECTION,
        r"\b(?:do\s+anything\s+now|DAN\s+mode|jailbreak\s+mode|developer\s+mode\s+enabled)\b",
        0.6,
    ),
    _sig(
        "role.new_persona",
        CATEGORY_ROLE_INJECTION,
        r"\byour\s+(?:new\s+)?(?:role|persona)\s+(?:is|will\s+be)\b",
        0.5,
    ),
    # ---------------------------------------------------------------- leakage
    _sig(
        "leakage.reveal_prompt",
        CATEGORY_PROMPT_LEAKAGE,
        r"\b(?:reveal|show|print|repeat|output|display|tell\s+me)\b[^.\n]{0,40}?"
        r"\b(?:system\s+prompt|initial\s+(?:instructions?|prompt)|hidden\s+instructions?"
        r"|your\s+instructions?|your\s+prompt|the\s+prompt\s+above)\b",
        0.85,
    ),
    _sig(
        "leakage.what_is_your_prompt",
        CATEGORY_PROMPT_LEAKAGE,
        r"\bwhat\s+(?:is|are)\s+your\s+(?:system\s+)?(?:prompt|instructions)\b",
        0.55,
    ),
    _sig(
        "leakage.verbatim",
        CATEGORY_PROMPT_LEAKAGE,
        r"\bverbatim\b[^.\n]{0,30}\b(?:prompt|instructions)\b",
        0.5,
    ),
    # -------------------------------------------------------------- delimiters
    _sig(
        "delimiter.fake_close_then_instruction",
        CATEGORY_DELIMITER_ABUSE,
        r"<\s*/\s*(?:system|instructions?|prompt|context|document)\s*>\s*[^.\n]{0,80}?"
        r"\b(?:ignore|disregard|you\s+are|reveal|send|new\s+instructions)\b",
        0.7,
    ),
    _sig(
        "delimiter.fence_role_header",
        CATEGORY_DELIMITER_ABUSE,
        r"```[^\n]*\n\s*(?:system|assistant)\s*:",
        0.6,
    ),
    _sig(
        "delimiter.fake_open_then_role",
        CATEGORY_DELIMITER_ABUSE,
        r"<\s*(?:system|instructions?)\s*>\s*[^.\n]{0,40}?"
        r"\b(?:you\s+are|ignore|new\s+rules|reveal)\b",
        0.6,
    ),
    # ----------------------------------------------------------- exfiltration
    _sig(
        "exfil.send_to_url",
        CATEGORY_DATA_EXFILTRATION,
        r"\b(?:send|post|upload|transmit|email|forward|exfiltrate|share)\b"
        r"[^.\n]{0,60}?\b(?:to|at)\b\s*(?:https?://\S*|www\.\S*|\S+@\S+\.\S+)",
        0.75,
    ),
    _sig(
        "exfil.markdown_image_query",
        CATEGORY_DATA_EXFILTRATION,
        r"!\[[^\]]*\]\(\s*https?://[^)\s]*\?[^)\s]+\)",
        0.8,
        "markdown image whose URL query can carry data",
    ),
    _sig(
        "exfil.data_into_url",
        CATEGORY_DATA_EXFILTRATION,
        r"\b(?:include|append|put|encode)\b[^.\n]{0,40}\b"
        r"(?:conversation|history|context|prompt|secrets?|data)\b[^.\n]{0,30}"
        r"\b(?:in|into)\s+(?:the\s+)?(?:url|query|image|link)\b",
        0.7,
    ),
)


def _noisy_or(weights: list[float]) -> float:
    remaining = 1.0
    for weight in weights:
        remaining *= 1.0 - weight
    return min(1.0 - remaining, 0.99)


def _redacted_preview(text: str) -> str:
    """Mask content so evidence never stores raw user text."""
    return "".join(char if char in " \n\t" else "*" for char in text[:80])


class HeuristicDetector:
    name = "heuristics"
    version = DETECTOR_VERSION

    def detect(
        self, content: NormalizedContent, channel: Channel | None = None
    ) -> list[DetectionResult]:
        results = self._score_canonical(content)
        results.extend(self._score_decoded_views(content))
        results.sort(key=lambda result: result.score, reverse=True)
        return results

    def _score_canonical(self, content: NormalizedContent) -> list[DetectionResult]:
        by_category: dict[str, list[tuple[Signal, re.Match[str]]]] = {}
        for signal in SIGNALS:
            for match in signal.pattern.finditer(content.canonical_text):
                by_category.setdefault(signal.category, []).append((signal, match))

        results: list[DetectionResult] = []
        for category, hits in by_category.items():
            best_per_signal: dict[str, float] = {}
            for signal, _match in hits:
                best_per_signal[signal.name] = max(
                    best_per_signal.get(signal.name, 0.0), signal.weight
                )
            score = _noisy_or(list(best_per_signal.values()))
            top_signal, top_match = max(hits, key=lambda item: item[0].weight)
            span = map_canonical_span(content.offset_map, top_match.start(), top_match.end())
            results.append(
                DetectionResult(
                    detector=self.name,
                    category=category,
                    score=score,
                    span=span,
                    detector_version=self.version,
                    evidence={
                        "signal": top_signal.name,
                        "preview": _redacted_preview(top_match.group(0)),
                        "view": "canonical",
                        "flags": list(content.flags),
                    },
                )
            )
        return results

    def _score_decoded_views(self, content: NormalizedContent) -> list[DetectionResult]:
        results: list[DetectionResult] = []
        for index, view in enumerate(content.decoded_views):
            for signal in SIGNALS:
                match = signal.pattern.search(view)
                if match is None:
                    continue
                span = (
                    content.decoded_view_spans[index]
                    if index < len(content.decoded_view_spans)
                    else None
                )
                results.append(
                    DetectionResult(
                        detector=self.name,
                        category=CATEGORY_ENCODED_PAYLOAD,
                        score=max(signal.weight, 0.85),
                        span=span,
                        detector_version=self.version,
                        evidence={
                            "signal": signal.name,
                            "preview": _redacted_preview(match.group(0)),
                            "view": "decoded",
                            "flags": list(content.flags),
                        },
                    )
                )
                break
        return results


heuristic_detector = HeuristicDetector()
