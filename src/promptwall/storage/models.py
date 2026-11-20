"""SQLAlchemy declarative models. This module is the single source of truth for the schema."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("mode IN ('strict', 'balanced', 'lenient')", name="mode_valid"),
        CheckConstraint("fail_mode IN ('open', 'closed')", name="fail_mode_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="balanced")
    fail_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="closed")
    pinned_system_prompt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    store_raw_text: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False, default="default")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class AdminUser(Base):
    __tablename__ = "admin_users"
    __table_args__ = (CheckConstraint("role IN ('viewer', 'admin')", name="role_valid"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="viewer")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class Policy(Base):
    __tablename__ = "policies"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_policies_project_version"),
        Index(
            "uq_active_policy",
            "project_id",
            unique=True,
            postgresql_where=text("active"),
            sqlite_where=text("active = 1"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    policy_yaml: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class Session_(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("status IN ('normal', 'watched', 'quarantined')", name="status_valid"),
        Index("idx_sessions_project", "project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    external_user_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class RequestRecord(Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint("decision IN ('allow', 'sanitize', 'block')", name="decision_valid"),
        CheckConstraint(
            "inspection_status IN ('inspected', 'degraded', 'uninspected')",
            name="inspection_status_valid",
        ),
        Index("idx_requests_session", "session_id"),
        Index("idx_requests_project_created", "project_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True
    )
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    inspection_status: Mapped[str] = mapped_column(String(20), nullable=False)
    final_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detector_versions: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    redacted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    messages: Mapped[list[RequestMessage]] = relationship(
        back_populates="request", cascade="all, delete-orphan", passive_deletes=True
    )
    detections: Mapped[list[Detection]] = relationship(
        back_populates="request", cascade="all, delete-orphan", passive_deletes=True
    )


class RequestMessage(Base):
    __tablename__ = "request_messages"
    __table_args__ = (
        UniqueConstraint("request_id", "position", name="uq_request_messages_request_position"),
        CheckConstraint(
            "channel IN ('system', 'user', 'assistant', 'retrieved_document', 'tool_output')",
            name="channel_valid",
        ),
        Index("idx_messages_request", "request_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    trust_level: Mapped[str] = mapped_column(String(30), nullable=False)
    label_source: Mapped[str] = mapped_column(String(20), nullable=False, default="default")
    source_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    normalization_flags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    request: Mapped[RequestRecord] = relationship(back_populates="messages")


class Detection(Base):
    __tablename__ = "detections"
    __table_args__ = (
        CheckConstraint("layer IN ('heuristic', 'classifier', 'judge')", name="layer_valid"),
        Index("idx_detections_request", "request_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("request_messages.id", ondelete="CASCADE"), nullable=False
    )
    layer: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(
        ForeignKey("taxonomy_map.category", ondelete="RESTRICT"), nullable=False
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_span: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    detector_version: Mapped[str] = mapped_column(String(50), nullable=False)

    request: Mapped[RequestRecord] = relationship(back_populates="detections")


class TaxonomyMap(Base):
    __tablename__ = "taxonomy_map"

    category: Mapped[str] = mapped_column(String(60), primary_key=True)
    atlas_id: Mapped[str] = mapped_column(String(40), nullable=False)
    owasp_id: Mapped[str] = mapped_column(String(20), nullable=False)
    nist_function: Mapped[str] = mapped_column(String(20), nullable=False)
