#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="/root/task"
cd "$TASK_DIR"

echo "[run] Installing Node.js dependencies..."
npm install --silent

echo "[run] Starting Docker Compose stack..."
docker compose -f "$TASK_DIR/docker-compose.yml" up -d --build

echo "[run] Waiting for PostgreSQL to become healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=40
until docker compose -f "$TASK_DIR/docker-compose.yml" exec -T postgres pg_isready -U ledgerlane -d ledgerlane >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[run] PostgreSQL did not become ready in time."
    docker compose -f "$TASK_DIR/docker-compose.yml" ps
    docker compose -f "$TASK_DIR/docker-compose.yml" logs postgres || true
    exit 1
  fi
  sleep 3
done
echo "[run] PostgreSQL is ready."

echo "[run] Verifying starter TypeScript build..."
npm run build

echo "[run] Waiting for application health endpoint..."
APP_ATTEMPTS=0
MAX_APP_ATTEMPTS=30
until curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; do
  APP_ATTEMPTS=$((APP_ATTEMPTS+1))
  if [ "$APP_ATTEMPTS" -ge "$MAX_APP_ATTEMPTS" ]; then
    echo "[run] Application did not become ready in time."
    docker compose -f "$TASK_DIR/docker-compose.yml" ps
    docker compose -f "$TASK_DIR/docker-compose.yml" logs app || true
    exit 1
  fi
  sleep 3
done

echo "[run] Application is responding on /health."
echo "[run] Readiness checks passed."
