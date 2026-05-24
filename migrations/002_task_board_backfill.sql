-- =============================================================================
-- Migration 002: Task Board backfill from workspace_snapshot
-- =============================================================================
-- Purpose: Copy existing tasks from workspace_snapshot.data->'tasks' (JSONB)
--          into the new normalized tables created by migration 001.
--
-- Safety:
--   - workspace_snapshot is NOT modified (read-only source)
--   - Idempotent: ON CONFLICT DO NOTHING — safe to re-run
--   - Skips rows with malformed data instead of erroring out
--
-- Run only AFTER migration 001 succeeded.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backfill tasks table
-- -----------------------------------------------------------------------------
-- Reads every workspace_snapshot row, unpacks its data->'tasks' JSONB array,
-- and inserts each task as a new row.
INSERT INTO tasks (
  id, workspace_id, emoji, name, description, priority, type, status, due,
  file_url, sort_order, created_by, created_at, updated_at, version
)
SELECT
  (arr.elem ->> 'id')::BIGINT                                  AS id,
  ws.workspace_id                                              AS workspace_id,
  arr.elem ->> 'emoji'                                         AS emoji,
  COALESCE(arr.elem ->> 'name', '(untitled)')                  AS name,
  COALESCE(arr.elem ->> 'desc', '')                            AS description,
  arr.elem ->> 'priority'                                      AS priority,
  arr.elem ->> 'type'                                          AS type,
  COALESCE(arr.elem ->> 'status', 'todo')                      AS status,
  NULLIF(arr.elem ->> 'due', '')                               AS due,
  arr.elem ->> 'file'                                          AS file_url,
  arr.ordinality::int                                          AS sort_order,
  NULL::BIGINT                                                 AS created_by,
  NOW()                                                        AS created_at,
  NOW()                                                        AS updated_at,
  1                                                            AS version
FROM workspace_snapshot ws
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(ws.data -> 'tasks', '[]'::jsonb)
) WITH ORDINALITY AS arr(elem, ordinality)
WHERE
  arr.elem ->> 'id' IS NOT NULL
  AND arr.elem ->> 'id' ~ '^[0-9]+$'        -- only numeric ids (skip malformed)
  AND arr.elem ->> 'name' IS NOT NULL
ON CONFLICT (id) DO NOTHING;                -- never overwrite existing row


-- -----------------------------------------------------------------------------
-- 2. Backfill task_assignees join table
-- -----------------------------------------------------------------------------
-- For each task with an assignees array, insert one row per (task_id, user_id).
INSERT INTO task_assignees (task_id, user_id, assigned_at)
SELECT
  (task_elem ->> 'id')::BIGINT  AS task_id,
  (assignee #>> '{}')::BIGINT   AS user_id,
  NOW()                         AS assigned_at
FROM workspace_snapshot ws
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(ws.data -> 'tasks', '[]'::jsonb)
) AS task_elem
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(task_elem -> 'assignees', '[]'::jsonb)
) AS assignee
WHERE
  task_elem ->> 'id' IS NOT NULL
  AND task_elem ->> 'id' ~ '^[0-9]+$'
  AND assignee IS NOT NULL
  AND jsonb_typeof(assignee) IN ('number','string')
  AND (assignee #>> '{}') ~ '^[0-9]+$'
ON CONFLICT (task_id, user_id) DO NOTHING;  -- idempotent


-- -----------------------------------------------------------------------------
-- Verification queries (run manually after COMMIT to confirm)
-- -----------------------------------------------------------------------------
-- Count check — should match JSONB array length:
--   SELECT
--     (SELECT count(*) FROM tasks)                                 AS tasks_count,
--     (SELECT jsonb_array_length(data->'tasks') FROM workspace_snapshot
--      WHERE workspace_id = 'default')                             AS snapshot_count;
--
-- Sample inspection:
--   SELECT id, name, status, due, version, updated_at FROM tasks LIMIT 10;
--
-- Assignee count:
--   SELECT count(*) FROM task_assignees;

COMMIT;
