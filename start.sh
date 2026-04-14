#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting PDF Editor..."

# Backend (run from backend dir so relative imports resolve)
(cd "$ROOT/backend" && "$ROOT/venv/bin/uvicorn" main:app --reload --port 8000) &
BACKEND_PID=$!

# Frontend
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
