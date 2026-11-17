#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8000 --workers 1 --env-file .env.server.local
