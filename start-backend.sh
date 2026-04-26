#!/usr/bin/env bash
set -euo pipefail

PORT=8000
if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Closing it first..."
  lsof -ti tcp:"${PORT}" | xargs kill -9
fi

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --reload
