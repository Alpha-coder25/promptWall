#!/usr/bin/env bash
set -euo pipefail

# Apply migrations before serving. Migrations are idempotent.
cd /app
alembic upgrade head
exec uvicorn promptwall.main:app --host 0.0.0.0 --port 8000
