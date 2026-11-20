from __future__ import annotations

import pytest

from promptwall.core.channels import Channel
from promptwall.core.scoring import (
    MODE_THRESHOLDS,
    normalization_anomaly,
    risk,
    thresholds_for,
)
from promptwall.detection.normalize import (
    FLAG_ENCODED_VIEW,
    FLAG_MIXED_SCRIPT,
    FLAG_UNICODE_TAGS,
    FLAG_ZERO_WIDTH,
)


def test_risk_is_bounded() -> None:
    assert 0.0 <= risk(0.0) <= 1.0
    assert 0.0 <= risk(1.0, n=1.0) <= 1.0


def test_risk_increases_with_heuristic_score() -> None:
    scores = [risk(h) for h in (0.0, 0.3, 0.6, 0.9)]
    assert scores == sorted(scores)
    assert scores[0] < 0.2


def test_quiet_content_stays_below_every_low_threshold() -> None:
    quiet = risk(0.0)
    for low, _high in MODE_THRESHOLDS.values():
        assert quiet < low


def test_normalization_anomaly_is_zero_without_flags() -> None:
    assert normalization_anomaly([]) == 0.0
    assert normalization_anomaly([FLAG_ENCODED_VIEW]) == 0.0


def test_normalization_anomaly_grows_with_invisible_characters() -> None:
    zero_width = normalization_anomaly([FLAG_ZERO_WIDTH])
    mixed = normalization_anomaly([FLAG_ZERO_WIDTH, FLAG_MIXED_SCRIPT, FLAG_UNICODE_TAGS])
    assert 0.0 < zero_width < mixed <= 1.0


@pytest.mark.parametrize("mode", list(MODE_THRESHOLDS))
def test_external_channels_get_lower_thresholds(mode: str) -> None:
    user_low, user_high = thresholds_for(mode, Channel.USER)
    ext_low, ext_high = thresholds_for(mode, Channel.RETRIEVED_DOCUMENT)

    assert ext_low == pytest.approx(max(0.0, user_low - 0.1))
    assert ext_high == pytest.approx(max(0.0, user_high - 0.1))


def test_policy_threshold_override_is_applied() -> None:
    assert thresholds_for("balanced", Channel.USER, (0.2, 0.5)) == (0.2, 0.5)
    low, high = thresholds_for("balanced", Channel.TOOL_OUTPUT, (0.2, 0.5))
    assert low == pytest.approx(0.1)
    assert high == pytest.approx(0.4)
