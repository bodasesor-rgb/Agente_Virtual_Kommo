#!/usr/bin/env bash
# Simulador Kommo → Lucy en Hostinger (no requiere Lucy local)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export AGENT_WEBHOOK_URL="${AGENT_WEBHOOK_URL:-https://midnightblue-mosquito-424375.hostingersite.com/api/kommo/simulator}"

echo ""
echo "  Simulador  →  http://localhost:8000"
echo "  Lucy       →  Hostinger (OPEN_AI ya configurada)"
echo "  1. Abre el navegador"
echo "  2. Clic en lead Montserrat"
echo "  3. Escribe en el chat (Lucy tarda ~5-10 seg)"
echo ""

exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
