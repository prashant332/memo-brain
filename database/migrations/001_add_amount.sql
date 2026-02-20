-- Migration: Add amount column to activity_logs
-- Run: psql -U postgres -d memobrain -f database/migrations/001_add_amount.sql

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) DEFAULT NULL;

-- Create index for amount queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_amount ON activity_logs(amount) WHERE amount IS NOT NULL;
