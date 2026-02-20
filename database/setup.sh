#!/bin/bash

# MemoBrain Database Setup Script
# Run this script to create the database and apply the schema

echo "=== MemoBrain Database Setup ==="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Database configuration
DB_NAME="memobrain"
DB_USER="${PGUSER:-postgres}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"

echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Create database
echo "Creating database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "Database '$DB_NAME' created successfully."
else
    echo "Database '$DB_NAME' may already exist (continuing...)"
fi

# Run schema
echo ""
echo "Applying schema..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/schema.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "=== Setup Complete ==="
    echo "Database '$DB_NAME' is ready to use."
else
    echo ""
    echo "Error applying schema. Please check the error messages above."
    exit 1
fi
