#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."; pwd)"
LOG_DIR="${USER_DIR:-$HOME/yapflows}/log"
mkdir -p "$LOG_DIR"

trap 'kill 0' INT TERM EXIT

"$INSTALL_DIR/backend/venv/bin/uvicorn" src.server:app --reload --host 0.0.0.0 --port 8000 --app-dir "$INSTALL_DIR/backend" &

cd "$INSTALL_DIR/frontend"
npm run dev &

wait
