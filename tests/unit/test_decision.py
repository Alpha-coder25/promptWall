from __future__ import annotations

import pytest

from promptwall.core.channels import Channel
from promptwall.core.decision import Action, MessageVerdict, aggregate_action, decide_message


def _decide(mode: str, channel: Channel, score: float, has_spans: bool) -> Action:
    return decide_message(mode=mode, channel=channel, score=score, has_spans=has_spans)


def test_system_messages_are_never_rewritten() -> None:
    assert _decide("strict", Channel.SYSTEM, 0.99, True) is Action.ALLOW


def test_balanced_user_message_decisions() -> None:
    assert _decide("balanced", Channel.USER, 0.2, False) is Action.ALLOW
    assert _decide("balanced", Channel.USER, 0.5, True) is Action.SANITIZE
    assert _decide("balanced", Channel.USER, 0.5, False) is Action.ALLOW
    assert _decide("balanced", Channel.USER, 0.8, True) is Action.BLOCK


def test_strict_blocks_in_uncertain_band() -> None:
    assert _decide("strict", Channel.USER, 0.45, True) is Action.BLOCK


def test_lenient_allows_in_uncertain_band() -> None:
    assert _decide("lenient", Channel.USER, 0.6, True) is Action.ALLOW


def test_external_high_risk_is_sanitized_when_spans_exist() -> None:
    assert _decide("balanced", Channel.RETRIEVED_DOCUMENT, 0.8, True) is Action.SANITIZE
    assert _decide("balanced", Channel.TOOL_OUTPUT, 0.8, True) is Action.SANITIZE


def test_external_without_spans_requests_block() -> None:
    assert _decide("balanced", Channel.RETRIEVED_DOCUMENT, 0.8, False) is Action.BLOCK


def test_aggregate_user_block_blocks_request() -> None:
    verdicts = [
        MessageVerdict(0, Channel.USER, 0.1, Action.ALLOW),
        MessageVerdict(1, Channel.USER, 0.9, Action.BLOCK),
    ]
    assert aggregate_action(verdicts) is Action.BLOCK


def test_aggregate_external_block_does_not_block_request() -> None:
    verdicts = [
        MessageVerdict(0, Channel.USER, 0.1, Action.ALLOW),
        MessageVerdict(1, Channel.RETRIEVED_DOCUMENT, 0.9, Action.BLOCK),
    ]
    assert aggregate_action(verdicts) is Action.SANITIZE


def test_aggregate_sanitize_wins_over_allow() -> None:
    verdicts = [
        MessageVerdict(0, Channel.USER, 0.1, Action.ALLOW),
        MessageVerdict(1, Channel.USER, 0.5, Action.SANITIZE, [(0, 4)]),
    ]
    assert aggregate_action(verdicts) is Action.SANITIZE


def test_aggregate_all_allow() -> None:
    assert aggregate_action([MessageVerdict(0, Channel.USER, 0.0, Action.ALLOW)]) is Action.ALLOW


@pytest.mark.parametrize("mode", ["strict", "balanced", "lenient"])
def test_quiet_content_is_allowed_in_every_mode(mode: str) -> None:
    from promptwall.core.scoring import risk

    assert _decide(mode, Channel.USER, risk(0.0), False) is Action.ALLOW
