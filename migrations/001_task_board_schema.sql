-- =============================================================================
-- Migration 001 (Option A): Task Board schema — additive ALTER TABLE
-- =============================================================================
-- Purpose: Evolve the EXISTING `tasks` table (empty, 0 rows) so it supports
--          optimistic locking + soft-delete + "since" polling, without
--          dropping or recreating anything.
--
-- IMPORTANT context discovered before this migration:
--   - `tasks` table already exists in Neon (created by db/schema.sql via init-db)
--   - It has 0 rows — all real data lives in workspace_snapshot.data->'tasks' (52 records)
--   - Existing schema uses: assignees JSONB, due DATE, file TEXT, position INTEGER
--   - We will REUSE those columns (not rename/recreate)
--
-- Strategy: 100% ADDITIVE.
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS  (no DROP, no rename)
--   - CREATE TABLE IF NOT EXISTS for net-new tables
--   - CREATE OR REPLACE FUNCTION for trigger function
--   - DROP TRIGGER IF EXISTS / CREATE TRIGGER is idempotent metadata change
--   - workspace_snapshot is NOT touched
--
-- Rollback: see 001_task_board_schema.rollback.sql (feature-flag based)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Evolve existing `tasks` table (additive only)
-- -----------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version    INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by BIGINT;

-- Reuse existing columns as-is:
--   id BIGINT PRIMARY KEY                ← same
--   workspace_id TEXT (FK)               ← same
--   emoji TEXT                           ← same
--   name TEXT NOT NULL                   ← same
--   description TEXT                     ← same (will write '' for empty)
--   assignees JSONB DEFAULT '[]'         ← REUSE (no separate join table needed)
--   priority / type / status TEXT        ← same
--   due DATE                             ← REUSE (backfill will cast YYYY-MM-DD)
--   file TEXT                            ← REUSE (no rename to file_url)
--   created DATE                         ← keep, will populate from JSONB
--   position INTEGER                     ← REUSE (no rename to sort_order)
--   created_at / updated_at TIMESTAMPTZ  ← same

-- -----------------------------------------------------------------------------
-- 2. New indexes for incremental sync + soft-delete filtering
-- -----------------------------------------------------------------------------
-- ⭐ Critical for reducing Neon transfer:
-- GET /api/tasks?since=<timestamp>  → uses this index, returns 0-3 KB instead of full snapshot.
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated
  ON tasks (workspace_id, updated_at DESC);

-- Soft-delete filtering: every "list active tasks" query uses this.
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_active
  ON tasks (workspace_id) WHERE deleted_at IS NULL;

-- (existing indexes from db/schema.sql remain in place:
--    idx_tasks_workspace, idx_tasks_due, idx_tasks_status, idx_tasks_assignees GIN)


-- -----------------------------------------------------------------------------
-- 3. task_checklists — sub-checklist items per task (future feature, empty table)
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
-- 4. task_comments — comments per task (future feature, empty table)
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
-- Replaces the existing trg_tasks_updated_at trigger (which only set updated_at).
-- Our function does updated_at AND version+1 — superset of old behaviour.
CREATE OR REPLACE FUNCTION tasks_bump_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version    = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotent: drop+create trigger (metadata only, no data touched)
DROP TRIGGER IF EXISTS trigger_tasks_bump_version ON tasks;
CREATE TRIGGER trigger_tasks_bump_version
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_bump_version();

-- Note: the original `trg_tasks_updated_at` trigger from db/schema.sql is left
-- in place. Both will fire BEFORE UPDATE and set updated_at = NOW(). The
-- order doesn't matter because they assign the same value. Our trigger also
-- handles version bumping which the original doesn't. Safe to coexist.


-- -----------------------------------------------------------------------------
-- Verification (run after this migration to confirm)
-- -----------------------------------------------------------------------------
-- \d tasks                                                 -- check columns
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='tasks' AND column_name IN ('version','deleted_at','created_by');
-- SELECT count(*) FROM tasks;                              -- expect 0 (backfill is step 2)
-- SELECT count(*) FROM task_checklists;                    -- expect 0
-- SELECT count(*) FROM task_comments;                      -- expect 0

COMMIT;
