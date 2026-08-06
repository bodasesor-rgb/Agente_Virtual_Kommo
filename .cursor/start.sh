#!/usr/bin/env bash
# Launch the Kommo Simulator dev server (FastAPI + uvicorn).
# Stays in the foreground so its logs remain visible to the agent.
set -euo pipefail

cd "$(dirname "$0")/.."

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
