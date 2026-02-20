-- Migration: Consolidate notes and amount into metadata JSONB
-- Run: psql -U postgres -d memobrain -f database/migrations/002_consolidate_metadata.sql

-- Step 1: Ensure metadata column exists
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Step 2: Migrate existing notes into metadata.notes
UPDATE activity_logs
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{notes}', to_jsonb(notes))
WHERE notes IS NOT NULL AND notes != '';

-- Step 3: Migrate existing amount into metadata.amount (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'activity_logs' AND column_name = 'amount') THEN
    UPDATE activity_logs
    SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{amount}', to_jsonb(amount))
    WHERE amount IS NOT NULL;

    -- Drop amount column
    ALTER TABLE activity_logs DROP COLUMN IF EXISTS amount;
  END IF;
END $$;

-- Step 4: Drop notes column
ALTER TABLE activity_logs DROP COLUMN IF EXISTS notes;

-- Step 5: Create GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_metadata ON activity_logs USING GIN (metadata);

-- Drop old amount index if exists
DROP INDEX IF EXISTS idx_activity_logs_amount;
