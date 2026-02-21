#!/bin/bash
set -e

COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"
ENV_FILE="$(dirname "$0")/.env"

# ── Preflight checks ──────────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found."
  echo "       Copy .env.example to .env and fill in your values first."
  exit 1
fi

# Warn if any critical secret is still the placeholder
for VAR in JWT_SECRET ENCRYPTION_KEY DB_PASSWORD; do
  VALUE=$(grep "^${VAR}=" "$ENV_FILE" | cut -d= -f2-)
  if [[ "$VALUE" == *"replace_with"* || -z "$VALUE" ]]; then
    echo "ERROR: $VAR is not set in .env. Please fill in a real value."
    exit 1
  fi
done

# ── Build & start ─────────────────────────────────────────────────────────────

echo ""
echo "  MemoBrain — Starting production stack"
echo "─────────────────────────────────────────"

echo "→ Building images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "→ Starting containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "  Waiting for services to become healthy..."
sleep 3

docker compose -f "$COMPOSE_FILE" ps

# Resolve the port from .env or default
APP_PORT=$(grep "^APP_PORT=" "$ENV_FILE" | cut -d= -f2-)
APP_PORT=${APP_PORT:-8091}

echo ""
echo "  ✓ MemoBrain is running at http://localhost:${APP_PORT}"
echo ""
echo "  Useful commands:"
echo "    Logs   →  docker compose logs -f"
echo "    Stop   →  ./stop.sh"
echo ""
