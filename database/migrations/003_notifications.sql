-- Feature 5: Notification System

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,        -- 'overdue_bill', 'upcoming_bill', 'overdue_task'
  title       VARCHAR(500) NOT NULL,
  body        TEXT,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  log_id      UUID REFERENCES activity_logs(id) ON DELETE CASCADE,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_id, type)           -- deduplication
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, is_read, created_at DESC);

-- For future Web Push support
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT NULL;
