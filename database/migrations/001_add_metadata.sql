-- Migration: Add metadata JSONB column to activity_logs
-- Run: psql -U postgres -d memobrain -f database/migrations/001_add_metadata.sql

-- Add metadata column for flexible additional data
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_metadata ON activity_logs USING GIN (metadata);

-- Example metadata structures:
-- Bill: {"amount": 500, "payment_method": "UPI", "reference": "TXN123"}
-- Task: {"priority": "high", "duration": "2 hours", "location": "Office"}
-- Event: {"location": "Home", "participants": ["John", "Jane"], "reminder": "1 day before"}
