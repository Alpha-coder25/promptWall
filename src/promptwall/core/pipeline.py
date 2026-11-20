"""Request inspection pipeline: provenance, normalization, detection, decision, audit.

The audit record is committed in one transaction before the caller forwards upstream
or refuses. Nothing here forwards or writes a response.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from promptwall.core.channels import (
    EXTERNAL_CHANNELS,
    FLAG_SYSTEM_PROMPT_MISMATCH,
    Provenance,
    resolve_provenance,
)
from promptwall.core.context import ProjectContext
from promptwall.core.decision import Action, MessageVerdict, aggregate_action, decide_message
from promptwall.core.scoring import normalization_anomaly, risk
from promptwall.detection.base import DetectionResult
from promptwall.detection.heuristics import DETECTOR_VERSION, heuristic_detector
from promptwall.detection.normalize import NormalizedContent, normalize
from promptwall.detection.sanitizer import sanitize_text
from promptwall.storage.models import Detection, RequestMessage, RequestRecord
from promptwall.telemetry.logging import get_logger

NORMALIZER_VERSION = "normalize/1"
FLAG_NORMALIZATION_FAILED = "NORMALIZATION_FAILED"
FLAG_DETECTOR_FAILED = "DETECTOR_FAILED"

logger = get_logger("promptwall.pipeline")


class InspectionUnavailable(RuntimeError):
    """Raised when the request cannot be inspected and fail_mode is closed."""


@dataclass
class IncomingMessage:
    position: int
    role: str
    content: str
    label_channel: str | None
    source_id: str | None
    forwardable: dict[str, Any]


@dataclass
class InspectionOutcome:
    request_id: uuid.UUID
    decision: str
    inspection_status: str
    final_score: float | None
    messages: list[dict[str, Any]]
    refusal_text: str
    placeholder: str
    policy_version: int | None
    blocked: bool
    latency_ms: int
    flags: list[str] = field(default_factory=list)
    degraded_reason: str | None = None


@dataclass
class _Resolved:
    message: IncomingMessage
    provenance: Provenance
    normalized: NormalizedContent
    detections: list[DetectionResult]
    verdict: MessageVerdict


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _identity_map(length: int) -> list[tuple[int, int]]:
    return [(index, index + 1) for index in range(length)]


def _fallback_normalized(text: str) -> NormalizedContent:
    return NormalizedContent(
        original_text=text,
        canonical_text=text,
        flags=[FLAG_NORMALIZATION_FAILED],
        offset_map=_identity_map(len(text)),
    )


def _resolve_message(message: IncomingMessage, project: ProjectContext) -> Provenance:
    provenance = resolve_provenance(message.role, message.label_channel, message.source_id)
    if (
        message.role == "system"
        and project.pinned_system_prompt_hash
        and sha256_text(message.content) != project.pinned_system_prompt_hash
    ):
        provenance.flags.append(FLAG_SYSTEM_PROMPT_MISMATCH)
    return provenance


def _threshold_override(project: ProjectContext) -> tuple[float, float] | None:
    override = project.policy.thresholds
    if override is None:
        return None
    return (override.low, override.high)


async def _persist(
    session: AsyncSession,
    *,
    project: ProjectContext,
    request_id: uuid.UUID,
    decision: str,
    inspection_status: str,
    final_score: float | None,
    latency_ms: int,
    content_hash: str,
    redacted_text: str | None,
    resolved: list[_Resolved],
) -> None:
    record = RequestRecord(
        id=request_id,
        project_id=project.project_id,
        decision=decision,
        inspection_status=inspection_status,
        final_score=final_score,
        policy_version=project.policy_version,
        detector_versions={
            "normalizer": NORMALIZER_VERSION,
            "heuristics": DETECTOR_VERSION,
        },
        latency_ms=latency_ms,
        content_hash=content_hash,
        redacted_text=redacted_text,
    )
    session.add(record)
    await session.flush()

    for item in resolved:
        row = RequestMessage(
            request_id=request_id,
            project_id=project.project_id,
            position=item.message.position,
            role=item.message.role,
            channel=item.provenance.channel.value,
            trust_level=item.provenance.trust_level.value,
            label_source=item.provenance.label_source,
            source_id=item.message.source_id,
            content_hash=sha256_text(item.message.content),
            normalization_flags=sorted(set(item.normalized.flags) | set(item.provenance.flags)),
        )
        session.add(row)
        await session.flush()
        for detection in item.detections:
            session.add(
                Detection(
                    request_id=request_id,
                    message_id=row.id,
                    layer="heuristic",
                    category=detection.category,
                    score=detection.score,
                    evidence_span={
                        **detection.evidence,
                        "start": detection.span[0] if detection.span else None,
                        "end": detection.span[1] if detection.span else None,
                    },
                    detector_version=detection.detector_version,
                )
            )
    await session.commit()


def _forwardable(
    message: IncomingMessage, verdict: MessageVerdict, placeholder: str
) -> dict[str, Any]:
    payload = {key: value for key, value in message.forwardable.items() if key != "x_promptwall"}
    content = message.content
    if verdict.action is Action.SANITIZE and verdict.spans:
        content = sanitize_text(message.content, verdict.spans, placeholder)
    elif verdict.action is Action.SANITIZE or (
        verdict.action is Action.BLOCK and verdict.channel in EXTERNAL_CHANNELS
    ):
        # External content that could not be span-sanitized is isolated: the message
        # stays in the request with its content fully replaced.
        content = placeholder
    payload["content"] = content
    return payload


async def inspect_and_record(
    session: AsyncSession,
    *,
    project: ProjectContext,
    messages: list[IncomingMessage],
) -> InspectionOutcome:
    started = time.perf_counter()
    request_id = uuid.uuid4()
    degraded: list[str] = []
    resolved: list[_Resolved] = []
    override = _threshold_override(project)
    placeholder = project.policy.sanitize_placeholder

    for message in messages:
        provenance = _resolve_message(message, project)
        try:
            normalized = normalize(message.content)
        except Exception:  # pragma: no cover - defensive; normalize is pure
            normalized = _fallback_normalized(message.content)
            degraded.append("normalization")
        try:
            detections = heuristic_detector.detect(normalized, provenance.channel)
        except Exception:
            detections = []
            degraded.append("heuristics")
            normalized.flags = [*normalized.flags, FLAG_DETECTOR_FAILED]

        heuristic_score = max((d.score for d in detections), default=0.0)
        anomaly = normalization_anomaly(normalized.flags)
        score = risk(heuristic_score, 0.0, anomaly, 0.0, provenance.channel)
        spans = [d.span for d in detections if d.span is not None]
        action = decide_message(
            mode=project.mode,
            channel=provenance.channel,
            score=score,
            has_spans=bool(spans),
            override=override,
        )
        verdict = MessageVerdict(
            position=message.position,
            channel=provenance.channel,
            score=score,
            action=action,
            spans=list(spans),
            flags=sorted(set(normalized.flags) | set(provenance.flags)),
        )
        resolved.append(
            _Resolved(
                message=message,
                provenance=provenance,
                normalized=normalized,
                detections=detections,
                verdict=verdict,
            )
        )

    aggregate = aggregate_action([item.verdict for item in resolved])
    inspection_status = "degraded" if degraded else "inspected"
    final_score = max((item.verdict.score for item in resolved), default=0.0)
    latency_ms = int((time.perf_counter() - started) * 1000)
    content_hash = sha256_text("\n".join(item.message.content for item in resolved))
    forwarded = [_forwardable(item.message, item.verdict, placeholder) for item in resolved]
    all_flags = sorted({flag for item in resolved for flag in item.verdict.flags})

    if project.store_raw_text:
        redacted_payload = [
            sanitize_text(item.message.content, item.verdict.spans, placeholder)
            for item in resolved
        ]
        redacted_text: str | None = json.dumps(redacted_payload)
    else:
        redacted_text = None

    try:
        await _persist(
            session,
            project=project,
            request_id=request_id,
            decision=aggregate.value,
            inspection_status=inspection_status,
            final_score=final_score,
            latency_ms=latency_ms,
            content_hash=content_hash,
            redacted_text=redacted_text,
            resolved=resolved,
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        logger.error(
            "audit_commit_failed",
            severity="emergency",
            error_type=type(exc).__name__,
            fail_mode=project.fail_mode,
            request_id=str(request_id),
            project_id=str(project.project_id),
        )
        if project.fail_mode == "closed":
            raise InspectionUnavailable("audit commit failed; fail_mode is closed") from exc
        return InspectionOutcome(
            request_id=request_id,
            decision="allow",
            inspection_status="uninspected",
            final_score=None,
            messages=[
                {k: v for k, v in item.message.forwardable.items() if k != "x_promptwall"}
                for item in resolved
            ],
            refusal_text=project.policy.refusal_text,
            placeholder=placeholder,
            policy_version=project.policy_version,
            blocked=False,
            latency_ms=latency_ms,
            flags=all_flags,
            degraded_reason="audit_commit_failed_fail_open",
        )

    if degraded:
        logger.warning(
            "inspection_degraded",
            layers=sorted(set(degraded)),
            request_id=str(request_id),
            project_id=str(project.project_id),
        )
    logger.info(
        "request_inspected",
        decision=aggregate.value,
        inspection_status=inspection_status,
        final_score=final_score,
        latency_ms=latency_ms,
        message_count=len(resolved),
        request_id=str(request_id),
        project_id=str(project.project_id),
    )

    return InspectionOutcome(
        request_id=request_id,
        decision=aggregate.value,
        inspection_status=inspection_status,
        final_score=final_score,
        messages=forwarded,
        refusal_text=project.policy.refusal_text,
        placeholder=placeholder,
        policy_version=project.policy_version,
        blocked=aggregate is Action.BLOCK,
        latency_ms=latency_ms,
        flags=all_flags,
        degraded_reason=",".join(sorted(set(degraded))) if degraded else None,
    )
