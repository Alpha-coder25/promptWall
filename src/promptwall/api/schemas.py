"""Pydantic request/response schemas for the proxy and admin API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiError(Exception):
    """An error that the API should render as a structured error body."""

    def __init__(self, status_code: int, message: str, code: str, error_type: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.error_type = error_type


class UnsupportedFeatureError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(400, message, "unsupported_feature", "unsupported_feature")


class RequestTooLargeError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(400, message, "request_too_large", "invalid_request_error")


class ProvenanceLabel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    channel: str | None = None
    source_id: str | None = Field(default=None, max_length=200)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[dict[str, Any]] | None = None
    name: str | None = None
    x_promptwall: ProvenanceLabel | None = None


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str
    messages: list[ChatMessage] = Field(min_length=1)
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: dict[str, Any] | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | dict[str, Any] | None = None
    stream: bool = False

    def forwardable_payload(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        payload = self.model_dump(mode="json", exclude_none=True)
        payload.pop("stream", None)
        payload.pop("x_promptwall", None)
        payload["messages"] = messages
        return payload


_IMAGE_PART_TYPES = {"image", "image_url", "input_image"}
_AUDIO_PART_TYPES = {"audio", "input_audio"}


def extract_text_content(content: str | list[dict[str, Any]] | None) -> str:
    """Flatten supported text content parts. Rejects image and audio parts loudly."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    texts: list[str] = []
    for part in content:
        if not isinstance(part, dict):
            raise UnsupportedFeatureError("Each content part must be an object.")
        part_type = str(part.get("type", "")).lower()
        if part_type in _IMAGE_PART_TYPES:
            raise UnsupportedFeatureError("Image content parts are not supported.")
        if part_type in _AUDIO_PART_TYPES:
            raise UnsupportedFeatureError("Audio content parts are not supported.")
        if part_type != "text":
            raise UnsupportedFeatureError(f"Content part type '{part_type}' is not supported.")
        text = part.get("text")
        if not isinstance(text, str):
            raise UnsupportedFeatureError("Text content parts require a 'text' string.")
        texts.append(text)
    return "\n".join(texts)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    mode: Literal["strict", "balanced", "lenient"] = "balanced"
    fail_mode: Literal["open", "closed"] = "closed"
    pinned_system_prompt_hash: str | None = Field(default=None, max_length=64)
    store_raw_text: bool = False
    retention_days: int = Field(default=30, ge=1, le=3650)
    policy_yaml: str | None = None


class ApiKeyCreate(BaseModel):
    label: str = Field(default="default", min_length=1, max_length=100)


class PolicyUpdate(BaseModel):
    policy_yaml: str = Field(min_length=1)


class ProjectOut(BaseModel):
    id: str
    name: str
    mode: str
    fail_mode: str
    pinned_system_prompt_hash: str | None
    store_raw_text: bool
    retention_days: int


class ProjectCreatedOut(BaseModel):
    project: ProjectOut
    api_key: str
    policy_version: int


class ApiKeyCreatedOut(BaseModel):
    id: str
    api_key: str
    label: str
