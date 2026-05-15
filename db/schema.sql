-- ============================================================
-- TFL+ Workspace — Neon Postgres Schema
-- Run via: npm run init-db
-- ============================================================

-- Workspaces (multi-tenant support)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'TFL+ Workspace',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspaces (id, name)
VALUES ('default', 'TFL+ Workspace')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  init TEXT,
  role TEXT NOT NULL DEFAULT 'member',           -- 'admin' | 'social' | 'member'
  color TEXT,
  email TEXT,
  avatar TEXT,                                    -- base64 data URL
  pin TEXT,                                       -- 6-digit PIN (stored as plain — localStorage compat)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  emoji TEXT,
  name TEXT NOT NULL,
  description TEXT,
  assignees JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [userId, userId, ...]
  priority TEXT,                                   -- references opts (status='priority', id=...)
  type TEXT,
  status TEXT,
  due DATE,
  file TEXT,
  created DATE,
  position INT DEFAULT 0,                          -- manual ordering
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignees ON tasks USING GIN (assignees);

-- ============================================================
-- DOCUMENTS (Library)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id BIGINT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  icon TEXT,
  name TEXT NOT NULL,
  by_user_id BIGINT,
  ws TEXT,                                         -- workspace label
  upd TEXT,                                        -- display date
  vis TEXT,                                        -- display "เข้าชมล่าสุด"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_workspace ON documents(workspace_id);

-- ============================================================
-- NOTES (Google Keep style, per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id BIGINT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id BIGINT,
  title TEXT,
  body TEXT,
  color TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);

-- ============================================================
-- LIVE SESSIONS (Facebook Live analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  hour INT,
  presenter TEXT,
  hashtag TEXT,
  duration TEXT,
  has_giveaway BOOLEAN DEFAULT FALSE,
  views BIGINT DEFAULT 0,
  unique_viewers BIGINT DEFAULT 0,
  new_followers BIGINT DEFAULT 0,
  avg_watch_time NUMERIC DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  link_clicks BIGINT DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  notes TEXT,
  audience JSONB,                                  -- demographics, distribution, retention
  audience_manual JSONB,                           -- extra manual entry data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_workspace ON live_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_live_date ON live_sessions(date);
CREATE INDEX IF NOT EXISTS idx_live_presenter ON live_sessions(presenter);

-- ============================================================
-- OPTIONS (status / priority / type tag definitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS opts (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                              -- 'status' | 'priority' | 'type'
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  bg TEXT,
  position INT DEFAULT 0,
  PRIMARY KEY (workspace_id, type, id)
);
CREATE INDEX IF NOT EXISTS idx_opts_type ON opts(workspace_id, type);

-- Seed default options
INSERT INTO opts (workspace_id, type, id, label, color, bg, position) VALUES
  ('default', 'status', 'todo',       'ยังไม่ได้เริ่ม',         '#6b7280', '#f3f4f6', 1),
  ('default', 'status', 'inprogress', 'อยู่ระหว่างดำเนินการ',  '#1d4ed8', '#dbeafe', 2),
  ('default', 'status', 'review',     'แก้ไข',                  '#b45309', '#fef3c7', 3),
  ('default', 'status', 'done',       'เสร็จ',                  '#059669', '#d1fae5', 4),
  ('default', 'priority', 'low',  'ต่ำ',   '#059669', '#d1fae5', 1),
  ('default', 'priority', 'mid',  'กลาง', '#b45309', '#fef3c7', 2),
  ('default', 'priority', 'high', 'สูง',  '#dc2626', '#fee2e2', 3),
  ('default', 'type', 'doc',   'เอกสาร',     '#7c3aed', '#f3eafe', 1),
  ('default', 'type', 'video', 'คลิปวิดีโอ', '#be185d', '#fce7f3', 2),
  ('default', 'type', 'task',  'งานทั่วไป',  '#1d4ed8', '#dbeafe', 3)
ON CONFLICT (workspace_id, type, id) DO NOTHING;

-- ============================================================
-- WORKSPACE META (columnWidths, nextIds, settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_meta (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, key)
);

-- ============================================================
-- SNAPSHOT TABLE (single-row JSONB for full-state sync — like Firebase)
-- Frontend can use this for full sync, normalized tables for queries
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_snapshot (
  workspace_id TEXT PRIMARY KEY DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','tasks','documents','notes','live_sessions','workspace_meta','workspace_snapshot']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t);
  END LOOP;
END $$;
