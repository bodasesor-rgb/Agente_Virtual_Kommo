#!/usr/bin/env bash
# Arranca el simulador Kommo (requiere Lucy en :3000 para modo completo)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Simulador → http://localhost:8000"
echo "Lucy esperada en → ${AGENT_WEBHOOK_URL:-http://localhost:3000/api/kommo/simulator}"
exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
