# PromptWall

PromptWall is a self-hosted LLM application security gateway: an OpenAI Chat
Completions compatible proxy (MVP subset) that inspects prompts for injection and
records a durable, auditable security decision before anything is forwarded upstream.

This repository currently implements **Week 1**: the working gateway, reversible
normalization, heuristic detection, the decision engine, tenant authentication and a
transactional audit log. Classifier, LLM judge, tool-call enforcement, streaming,
dashboard, SDK, evaluation harness and other providers are **not** built yet; see
[docs/limitations.md](docs/limitations.md).

Detection and enforcement are separate modules. Detection scores content; the decision
engine decides what is permitted. Nothing in this week overwrites original message
text: sanitization replaces spans in the original text by offset, and the audit record
stores hashes and redacted evidence, never raw content by default.

## Quickstart (Docker)

```bash
cp .env.example .env        # set UPSTREAM_API_KEY and ADMIN_TOKEN
docker compose up --build
```

The API applies migrations on start and listens on `http://localhost:8000`.
`GET /healthz` reports API status and database connectivity.

Create a project (this is the only time the key is shown):

```bash
curl -s -X POST http://localhost:8000/admin/projects \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "demo", "mode": "balanced", "fail_mode": "closed"}'
```

Point the OpenAI SDK at the gateway:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="pw_live_...")
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize this support ticket."}],
)
print(response.choices[0].message.content)
```

Every response carries `X-PromptWall-Request-Id`, `X-PromptWall-Decision`
(`allow`, `sanitize`, `block`) and `X-PromptWall-Inspected`
(`inspected`, `degraded`, `uninspected`). A blocked request returns HTTP 200 with a
normal chat completion whose `finish_reason` is `content_filter`; nothing is sent
upstream.

## Local development

```bash
python -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# SQLite is fine for local runs and tests; PostgreSQL is the supported default.
export DATABASE_URL="sqlite+aiosqlite:///./promptwall.db"
export UPSTREAM_BASE_URL="https://api.openai.com/v1"
export UPSTREAM_API_KEY="sk-..."
export ADMIN_TOKEN="local-admin-token"

alembic upgrade head
uvicorn promptwall.main:app --reload
```

Run the checks:

```bash
ruff check . && ruff format --check . && mypy && pytest
```

Run the end-to-end smoke demo (starts from a fresh SQLite database and a stub
upstream, and prints one allowed, one sanitized and one blocked request):

```bash
python demo/week1_smoke.py
```

## API surface (Week 1)

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/chat/completions` | project key | Proxy with inspection |
| `GET /healthz` | none | Status and database connectivity |
| `POST /admin/projects` | admin token | Create project, returns key once |
| `POST /admin/projects/{id}/keys` | admin token | Issue another key |
| `DELETE /admin/keys/{id}` | admin token | Revoke a key |
| `PUT /admin/projects/{id}/policy` | admin token | Create a new active policy version |
| `GET /admin/events` | admin token | Filter by project, decision, time range |

Project keys look like `pw_live_` + 32 random URL-safe bytes. Only the SHA-256 hash is
stored. Admin and project scopes are separate; both comparisons are constant time.

### Provenance labels

A message may carry `x_promptwall: {channel, source_id}`. Channels are `system`,
`user`, `assistant`, `retrieved_document` and `tool_output`. A label may lower trust
below the role default (for example `user` → `retrieved_document`), never raise it.
Rejected labels are ignored and flagged `PROVENANCE_RAISE_ATTEMPT`. The field is
stripped before forwarding.

### Supported request features

Non-streaming chat completions with text content parts, `model`, `temperature`,
`max_tokens`, `response_format`, `tools` and `tool_choice`, plus standard sampling
parameters. `stream: true` and image/audio content parts return HTTP 400 with
`code: unsupported_feature`. Oversized requests (bytes or message count) return HTTP
400 with `code: request_too_large`.

## Dependency notes

All versions are pinned in `pyproject.toml`. Reasons for dependencies beyond the core
brief list:

- `psycopg[binary]` — PostgreSQL driver for SQLAlchemy.
- `greenlet` — required by SQLAlchemy's asyncio bridge.
- `PyYAML` — policy and taxonomy configuration files.
- `aiosqlite` (dev) — fast SQLite unit/integration tests, per the brief.
- `openai` (dev) — official SDK used by the compatibility test.
- `respx` (dev) — mock upstream HTTP in tests.
- `pytest-asyncio`, `aiosqlite`, `mypy`, `ruff` (dev) — test and quality tooling named in the brief.

## Repository layout

```
src/promptwall/
  api/         routes_proxy.py, routes_admin.py, auth.py, schemas.py
  core/        config.py, context.py, channels.py, policy.py, pipeline.py,
               scoring.py, decision.py
  detection/   base.py, normalize.py, heuristics.py, sanitizer.py, taxonomy.py
  providers/   base.py, openai_compat.py
  storage/     db.py, models.py, repositories.py, migrations/
  telemetry/   logging.py
configs/       default_policy.yaml, taxonomy/atlas_owasp_nist_map.yaml
demo/          week1_smoke.py
tests/         unit/, integration/, evasion/, compatibility/, security/
docs/          limitations.md
frontend/      separate React console (fixture data, deployable on Vercel)
```

## Frontend console

`frontend/` is an independent Vite + React + TypeScript security console. It does not
change or import the Python gateway, and it runs on clearly labelled fixture data until a
gateway URL is configured. See [frontend/README.md](frontend/README.md) for screens, the
proposed API contract, and Vercel deployment (root directory `frontend`).

## Security posture

- The audit record (request, message provenance, detections, decision) is committed in
  one transaction before forwarding or refusing.
- Failures are explicit: every request is `inspected`, `degraded` or `uninspected`, and
  a fail-open pass-through is marked in the response header, not silent.
- URLs found in content are inspected as text and never fetched.
- Logs are structured JSON and never contain message content.
- Scoring weights and thresholds are **PROVISIONAL** this week and are not benchmark
  results. No protection rate is claimed anywhere in this repository.

## License

MIT. See [LICENSE](LICENSE).
