#!/usr/bin/env bash
# Idempotent dependency refresh for the Kommo Simulator (FastAPI app).
# Runs from /workspace after the repo is checked out.
set -euo pipefail

cd "$(dirname "$0")/.."

# The default image ships Python 3.12 but not the venv/ensurepip module.
# Install it once if missing (idempotent; no-op on snapshots that already have it).
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y python3-venv
fi

# Create the virtualenv if it does not exist yet, then refresh dependencies.
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
