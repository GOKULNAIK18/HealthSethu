#!/usr/bin/env bash
set -euo pipefail

PORT=3000
if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Closing it first..."
  lsof -ti tcp:"${PORT}" | xargs kill -9
fi

cd frontend
npm install
npm run dev
