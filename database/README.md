# Database Setup

## Quick Setup (Manual)

1. **Create the database:**
   ```bash
   psql -U postgres -c "CREATE DATABASE memobrain;"
   ```

2. **Run the schema:**
   ```bash
   psql -U postgres -d memobrain -f database/schema.sql
   ```

## Using Setup Scripts

### First-time setup:
```bash
cd database
chmod +x setup.sh
./setup.sh
```

### Reset database (deletes all data):
```bash
cd database
chmod +x reset.sh
./reset.sh
```

## Environment Variables

You can customize the connection using these environment variables:
- `PGUSER` - PostgreSQL user (default: postgres)
- `PGPASSWORD` - PostgreSQL password
- `PGHOST` - Database host (default: localhost)
- `PGPORT` - Database port (default: 5432)

Example:
```bash
PGPASSWORD='your_password' ./setup.sh
```

## Schema Overview

| Table | Description |
|-------|-------------|
| `users` | User accounts |
| `user_settings` | AI provider + encrypted API key |
| `activities` | Activity templates (bills, tasks, events) |
| `activity_logs` | Logged instances with status/dates |
| `chat_sessions` | Conversation sessions |
| `chat_messages` | Individual messages with metadata |
| `brain_shares` | (Phase 2) Sharing between users |

## Verify Setup

After running the schema, verify tables exist:
```bash
psql -U postgres -d memobrain -c "\dt"
```

Expected output:
```
              List of relations
 Schema |      Name       | Type  |  Owner
--------+-----------------+-------+----------
 public | activities      | table | postgres
 public | activity_logs   | table | postgres
 public | brain_shares    | table | postgres
 public | chat_messages   | table | postgres
 public | chat_sessions   | table | postgres
 public | user_settings   | table | postgres
 public | users           | table | postgres
```
