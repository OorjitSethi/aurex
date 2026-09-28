#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -q -r backend/requirements.lock.txt
./scripts/build-engine.sh
if [ ! -d web/node_modules ]; then npm --prefix web ci; fi
npm --prefix web run build
printf '\nAurex is ready at http://127.0.0.1:8787\nKeep this window open. Press Ctrl+C to stop.\n\n'
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8787
