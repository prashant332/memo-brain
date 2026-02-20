-- MemoBrain Database Schema
-- Run: psql -U postgres -d memobrain -f database/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- User AI settings (BYOT - Bring Your Own Token)
CREATE TABLE user_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  ai_provider     VARCHAR(20) DEFAULT 'claude',  -- 'claude' | 'openai'
  api_key_enc     TEXT DEFAULT NULL,              -- Encrypted API key
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Activity templates
CREATE TABLE activities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(500) NOT NULL,
  category       VARCHAR(50) NOT NULL DEFAULT 'task',
  recurrence     VARCHAR(20) DEFAULT NULL,
  recurrence_day INTEGER DEFAULT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log entries
CREATE TABLE activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id  UUID REFERENCES activities(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'done',
  period       VARCHAR(20) DEFAULT NULL,
  metadata     JSONB DEFAULT '{}',
  due_date     TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) DEFAULT 'New Session',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ DEFAULT NULL
);

-- Chat messages
CREATE TABLE chat_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain shares (Phase 2)
CREATE TABLE brain_shares (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(20) DEFAULT 'read',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_user_id, shared_with_user_id)
);

-- Indexes
CREATE INDEX idx_activities_user      ON activities(user_id);
CREATE INDEX idx_activity_logs_user   ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_act    ON activity_logs(activity_id);
CREATE INDEX idx_activity_logs_period ON activity_logs(period);
CREATE INDEX idx_activity_logs_meta   ON activity_logs USING GIN (metadata);
CREATE INDEX idx_chat_messages_sess   ON chat_messages(session_id);
CREATE INDEX idx_chat_sessions_user   ON chat_sessions(user_id);
CREATE INDEX idx_user_settings_user   ON user_settings(user_id);
