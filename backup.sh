#!/bin/bash
set -e

COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"
ENV_FILE="$(dirname "$0")/.env"
BACKUP_DIR="$(dirname "$0")/backups"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found."
  exit 1
fi

DB_NAME=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(grep "^DB_USER=" "$ENV_FILE" | cut -d= -f2-)
DB_NAME=${DB_NAME:-memobrain}
DB_USER=${DB_USER:-memobrain}

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/memobrain_${TIMESTAMP}.sql.gz"

echo ""
echo "  MemoBrain — Database Backup"
echo "─────────────────────────────────────────"
echo "→ Dumping database '${DB_NAME}'..."

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "  ✓ Backup saved: $BACKUP_FILE ($SIZE)"
echo ""

# Keep only the last 10 backups
BACKUP_COUNT=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  echo "→ Pruning old backups (keeping last 10)..."
  ls -t "$BACKUP_DIR"/*.sql.gz | tail -n +11 | xargs rm -f
  echo "  ✓ Done."
fi
echo ""
