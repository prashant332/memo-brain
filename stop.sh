#!/bin/bash

COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"
ENV_FILE="$(dirname "$0")/.env"

echo ""
echo "  MemoBrain — Stopping production stack"
echo "─────────────────────────────────────────"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

echo ""
echo "  ✓ All containers stopped."
echo ""
echo "  Note: Your external Postgres data is untouched."
echo ""
