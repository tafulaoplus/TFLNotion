-- =============================================================================
-- Migration 002 (Option A): Backfill tasks from workspace_snapshot
-- =============================================================================
-- Purpose: Copy 52 existing tasks from workspace_snapshot.data->'tasks' (JSONB)
--          into the now-evolved `tasks` table.
--
-- Strategy: 100% additive + idempotent.
--   - workspace_snapshot is READ-ONLY (untouched)
--   - ON CONFLICT (id) DO NOTHING — re-run safe
--   - WHERE filters skip malformed rows instead of erroring
--   - Writes into EXISTING columns: assignees (JSONB), due (DATE), file, position
--
-- Run only AFTER migration 001 succeeded.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backfill tasks rows from JSONB array
-- -----------------------------------------------------------------------------
INSERT INTO tasks (
  id, workspace_id,
  emoji, name, description, priority, type, status,
  due, file, created, position,
  assignees,
  created_at, updated_at, version
)
SELECT
  (arr.elem ->> 'id')::BIGINT                          AS id,
  ws.workspace_id                                      AS workspace_id,
  arr.elem ->> 'emoji'                                 AS emoji,
  COALESCE(arr.elem ->> 'name', '(untitled)')          AS name,
  COALESCE(arr.elem ->> 'desc', '')                    AS description,
  arr.elem ->> 'priority'                              AS priority,
  arr.elem ->> 'type'                                  AS type,
  COALESCE(arr.elem ->> 'status', 'todo')              AS status,

  -- Cast due to DATE (existing column type). Empty string → NULL.
  -- Use safe cast to avoid hard error on malformed dates.
  CASE
    WHEN NULLIF(arr.elem ->> 'due', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (arr.elem ->> 'due')::DATE
    ELSE NULL
  END                                                  AS due,

  arr.elem ->> 'file'                                  AS file,

  -- `created` is DATE in old schema. Map from JSONB 'created' if present + valid.
  CASE
    WHEN NULLIF(arr.elem ->> 'created', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (arr.elem ->> 'created')::DATE
    ELSE NULL
  END                                                  AS created,

  arr.ordinality::int                                  AS position,

  -- Keep assignees as the same JSONB array (matches existing column shape)
  COALESCE(arr.elem -> 'assignees', '[]'::jsonb)       AS assignees,

  NOW()                                                AS created_at,
  NOW()                                                AS updated_at,
  1                                                    AS version
FROM workspace_snapshot ws
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(ws.data -> 'tasks', '[]'::jsonb)
) WITH ORDINALITY AS arr(elem, ordinality)
WHERE
  arr.elem ->> 'id' IS NOT NULL
  AND arr.elem ->> 'id' ~ '^[0-9]+$'              -- only numeric ids
  AND arr.elem ->> 'name' IS NOT NULL
ON CONFLICT (id) DO NOTHING;                       -- idempotent: never overwrite

-- Note: assignees stored directly in `tasks.assignees` JSONB column.
-- No separate task_assignees insertion needed for Option A.


-- -----------------------------------------------------------------------------
-- Verification queries (run manually after COMMIT to confirm)
-- -----------------------------------------------------------------------------
-- Row count comparison (should be equal):
--   SELECT
--     (SELECT count(*) FROM tasks WHERE workspace_id='default')             AS tasks_count,
--     (SELECT jsonb_array_length(data->'tasks') FROM workspace_snapshot
--      WHERE workspace_id='default')                                        AS snapshot_count;
--
-- Sample inspection:
--   SELECT id, name, status, due, version, jsonb_array_length(assignees) AS assignees_n
--   FROM tasks ORDER BY id DESC LIMIT 10;
--
-- Schema check (verify new columns present):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='tasks' AND column_name IN ('version','deleted_at','created_by');

COMMIT;
