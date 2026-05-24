-- =============================================================================
-- Migration 001: Task Board schema
-- =============================================================================
-- Purpose: Create normalized tables for Task Board module so we can switch from
--          full-snapshot saves (workspace_snapshot JSONB) to per-task PATCH.
--
-- Strategy: 100% ADDITIVE.
--   - No DROP TABLE / TRUNCATE / DROP COLUMN
--   - Existing data in workspace_snapshot is NOT touched
--   - Safe to re-run (IF NOT EXISTS guards everywhere)
--
-- Rollback: see 001_task_board_schema.rollback.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. tasks — main task records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id            BIGINT       PRIMARY KEY,                       -- keep existing Date.now() ids
  workspace_id  TEXT         NOT NULL DEFAULT 'default',         -- multi-tenant ready
  emoji         TEXT,
  name          TEXT         NOT NULL,
  description   TEXT         NOT NULL DEFAULT '',
  priority      TEXT,                                            -- 'low' | 'mid' | 'high'
  type          TEXT,                                            -- 'doc' | 'video' | 'task'
  status        TEXT         NOT NULL DEFAULT 'todo',            -- 'todo' | 'inprogress' | 'review' | 'done'
  due           TEXT,                                            -- YYYY-MM-DD (TEXT to match existing data shape)
  file_url      TEXT,                                            -- renamed from `file` to avoid SQL reserved-ish word
  sort_order    INTEGER      NOT NULL DEFAULT 0,                 -- for drag-reorder
  created_by    BIGINT,                                          -- user id (no FK yet — users still in JSONB)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),             -- auto-updated by trigger
  version       INTEGER      NOT NULL DEFAULT 1,                 -- optimistic locking; bumped by trigger
  deleted_at    TIMESTAMPTZ                                      -- soft delete (NULL = active)
);

-- Indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_active
  ON tasks (workspace_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated
  ON tasks (workspace_id, updated_at DESC);
  -- ⭐ critical for "since" polling: GET /api/tasks?since=<ts> uses this

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status
  ON tasks (workspace_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_due
  ON tasks (workspace_id, due) WHERE deleted_at IS NULL AND due IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. task_assignees — many-to-many task <-> user
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id      BIGINT       NOT NULL,
  user_id      BIGINT       NOT NULL,
  assigned_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  assigned_by  BIGINT,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user
  ON task_assignees (user_id);


-- -----------------------------------------------------------------------------
-- 3. task_checklists — sub-checklist items per task (future feature, table ready)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_checklists (
  id          BIGSERIAL    PRIMARY KEY,
  task_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  done        BOOLEAN      NOT NULL DEFAULT false,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  done_at     TIMESTAMPTZ,
  done_by     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_task_checklists_task
  ON task_checklists (task_id, sort_order);


-- -----------------------------------------------------------------------------
-- 4. task_comments — comments per task (future feature, table ready)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_comments (
  id          BIGSERIAL    PRIMARY KEY,
  task_id     BIGINT       NOT NULL,
  user_id     BIGINT       NOT NULL,
  body        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments (task_id, created_at DESC) WHERE deleted_at IS NULL;


-- -----------------------------------------------------------------------------
-- 5. Trigger: auto-bump version + updated_at on every UPDATE of tasks
-- -----------------------------------------------------------------------------
-- Enables optimistic locking. A PATCH with stale `version` will match 0 rows
-- (because the API uses `WHERE id=? AND version=?`) and the API returns 409.
CREATE OR REPLACE FUNCTION tasks_bump_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version    = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop+recreate the trigger (idempotent). NOTE: dropping a TRIGGER is metadata,
-- not data — it does not violate the "no DROP TABLE" rule.
DROP TRIGGER IF EXISTS trigger_tasks_bump_version ON tasks;
CREATE TRIGGER trigger_tasks_bump_version
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_bump_version();


-- -----------------------------------------------------------------------------
-- Verification (informational — comment in real production)
-- -----------------------------------------------------------------------------
-- Run after to confirm:
--   SELECT count(*) FROM tasks;            -- expect 0 before backfill
--   SELECT count(*) FROM task_assignees;   -- expect 0
--   SELECT count(*) FROM task_checklists;  -- expect 0
--   SELECT count(*) FROM task_comments;    -- expect 0
--   \d tasks                               -- check all columns + indexes exist

COMMIT;
