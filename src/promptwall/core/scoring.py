"""Risk scoring.

PROVISIONAL: every weight and threshold in this module is a placeholder. Week 2
replaces them with weights fitted by logistic regression on validation data and
thresholds chosen from measured false-positive targets. Do not cite these values as
benchmark results.
"""

from __future__ import annotations

import math

from promptwall.core.channels import EXTERNAL_CHANNELS, Channel
from promptwall.detection.normalize import (
    FLAG_ENCODED_VIEW,
    FLAG_MIXED_SCRIPT,
    FLAG_UNICODE_TAGS,
    FLAG_VARIATION_SELECTOR,
    FLAG_ZERO_WIDTH,
)

# PROVISIONAL weights for R = sigmoid(w_h*H + w_c*C + w_n*N + w_s*S + b_channel + b).
# The intercept keeps quiet, benign content well below the lowest threshold; without
# it a sigmoid would place an empty score at 0.5 and block everything in strict mode.
INTERCEPT = -3.0
WEIGHT_HEURISTIC = 5.0
WEIGHT_CLASSIFIER = 0.0  # classifier is Week 2; fixed at 0 this week
WEIGHT_NORMALIZATION = 1.0
WEIGHT_SESSION = 0.0  # session risk is deferred; fixed at 0

# PROVISIONAL per-channel bias.
CHANNEL_BIAS: dict[Channel, float] = {
    Channel.SYSTEM: 0.0,
    Channel.USER: 0.0,
    Channel.ASSISTANT: 0.0,
    Channel.RETRIEVED_DOCUMENT: 0.0,
    Channel.TOOL_OUTPUT: 0.0,
}

# PROVISIONAL (low, high) thresholds per mode.
MODE_THRESHOLDS: dict[str, tuple[float, float]] = {
    "strict": (0.3, 0.6),
    "balanced": (0.4, 0.7),
    "lenient": (0.5, 0.85),
}

# External content is scored with lower thresholds: subtract this from both.
EXTERNAL_THRESHOLD_SHIFT = 0.1

# PROVISIONAL anomaly weights per normalization flag. ENCODED_VIEW is deliberately
# zero: an encoded view only matters when it decodes to something detected, which the
# heuristics already score. A benign base64 blob should not raise risk by itself.
FLAG_ANOMALY_WEIGHTS: dict[str, float] = {
    FLAG_ZERO_WIDTH: 0.25,
    FLAG_UNICODE_TAGS: 0.6,
    FLAG_VARIATION_SELECTOR: 0.2,
    FLAG_MIXED_SCRIPT: 0.15,
    FLAG_ENCODED_VIEW: 0.0,
}


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def normalization_anomaly(flags: list[str] | tuple[str, ...]) -> float:
    """Map normalization flags to an anomaly score in [0, 1] with noisy-or."""
    remaining = 1.0
    for flag in set(flags):
        weight = FLAG_ANOMALY_WEIGHTS.get(flag, 0.0)
        remaining *= 1.0 - weight
    return min(1.0 - remaining, 0.95)


def risk(
    h: float,
    c: float = 0.0,
    n: float = 0.0,
    s: float = 0.0,
    channel: Channel = Channel.USER,
) -> float:
    """Combine component scores into one risk score."""
    linear = (
        WEIGHT_HEURISTIC * h
        + WEIGHT_CLASSIFIER * c
        + WEIGHT_NORMALIZATION * n
        + WEIGHT_SESSION * s
        + CHANNEL_BIAS[channel]
        + INTERCEPT
    )
    return round(_sigmoid(linear), 6)


def thresholds_for(
    mode: str,
    channel: Channel,
    override: tuple[float, float] | None = None,
) -> tuple[float, float]:
    low, high = override if override is not None else MODE_THRESHOLDS[mode]
    if channel in EXTERNAL_CHANNELS:
        low = max(0.0, low - EXTERNAL_THRESHOLD_SHIFT)
        high = max(0.0, high - EXTERNAL_THRESHOLD_SHIFT)
    return low, high
