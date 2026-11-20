"""Application factory and ASGI entry point."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text

from promptwall.api.auth import AuthError
from promptwall.api.helpers import error_response
from promptwall.api.routes_admin import router as admin_router
from promptwall.api.routes_proxy import router as proxy_router
from promptwall.api.schemas import ApiError
from promptwall.core.config import Settings, get_settings
from promptwall.detection.taxonomy import load_taxonomy, seed_taxonomy
from promptwall.providers.base import CircuitBreaker
from promptwall.providers.openai_compat import OpenAICompatProvider
from promptwall.storage.db import Database
from promptwall.telemetry.logging import configure_logging, get_logger

logger = get_logger("promptwall.main")
VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = Database(resolved.database_url)
        app.state.settings = resolved
        app.state.db = db
        if resolved.auto_create_schema:
            await db.create_schema()
        try:
            entries = load_taxonomy(resolved.taxonomy_path)
            async with db.session() as session:
                await seed_taxonomy(session, entries)
        except Exception as exc:
            logger.warning("taxonomy_seed_failed", error_type=type(exc).__name__)

        provider = OpenAICompatProvider(
            base_url=resolved.upstream_base_url,
            api_key=resolved.upstream_api_key.get_secret_value(),
            connect_timeout_seconds=resolved.upstream_connect_timeout_seconds,
            read_timeout_seconds=resolved.upstream_read_timeout_seconds,
            max_connections=resolved.upstream_max_connections,
            breaker=CircuitBreaker(
                resolved.circuit_breaker_failures, resolved.circuit_breaker_reset_seconds
            ),
        )
        app.state.provider = provider
        yield
        await provider.aclose()
        await db.close()

    app = FastAPI(title="PromptWall", version=VERSION, lifespan=lifespan)

    @app.middleware("http")
    async def limit_request_body(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path == "/v1/chat/completions":
            header = request.headers.get("content-length")
            if header is not None:
                try:
                    length = int(header)
                except ValueError:
                    length = 0
                if length > resolved.max_request_bytes:
                    return error_response(
                        400,
                        f"Request body exceeds {resolved.max_request_bytes} bytes.",
                        "request_too_large",
                        "invalid_request_error",
                    )
        return await call_next(request)

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.message, exc.code, exc.error_type)

    @app.exception_handler(AuthError)
    async def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
        # One generic response for missing, invalid and revoked credentials.
        return JSONResponse(
            {
                "error": {
                    "message": "Invalid credentials.",
                    "type": "authentication_error",
                    "code": "invalid_api_key",
                }
            },
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Do not echo input values: they may contain message content.
        return error_response(
            400, "Request validation failed.", "invalid_request", "invalid_request_error"
        )

    app.include_router(proxy_router)
    app.include_router(admin_router)

    @app.get("/healthz")
    async def healthz(request: Request) -> JSONResponse:
        db: Database = request.app.state.db
        database_ok = True
        try:
            async with db.session() as session:
                await session.execute(text("SELECT 1"))
        except Exception:
            database_ok = False
        status = "ok" if database_ok else "degraded"
        return JSONResponse(
            {
                "status": status,
                "database": "ok" if database_ok else "unavailable",
                "version": VERSION,
            },
            status_code=200 if database_ok else 503,
        )

    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("promptwall.main:app", host="0.0.0.0", port=8000)


__all__ = ["app", "create_app", "run"]
