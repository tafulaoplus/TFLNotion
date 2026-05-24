# Migrations — Task Board refactor

> ⚠️ **Project rule:** NEVER run a migration without explicit user confirmation
> ("ยืนยัน รันได้เลย").
> All migrations are **additive only** — no `DROP TABLE`, no `TRUNCATE`.

## Phase 2 — Task Board (Option A: additive ALTER TABLE)

> Discovered during inspection: the `tasks` table already exists in Neon
> (created by `db/schema.sql`) but has 0 rows. All 52 real tasks live in
> `workspace_snapshot.data->'tasks'`. Migration uses ALTER TABLE to evolve
> the existing empty `tasks` table additively — no DROP, no rename.

| # | File | Purpose | Idempotent? |
|---|---|---|---|
| 001 | [`001_task_board_schema.sql`](001_task_board_schema.sql) | ALTER tasks ADD COLUMN (version, deleted_at, created_by) + new indexes + new trigger + task_checklists + task_comments | ✅ yes (uses `IF NOT EXISTS` / `CREATE OR REPLACE`) |
| 001r | [`001_task_board_schema.rollback.sql`](001_task_board_schema.rollback.sql) | Rollback notes (feature-flag based; hard rollback as commented SQL) | — |
| 002 | [`002_task_board_backfill.sql`](002_task_board_backfill.sql) | Copy 52 tasks from `workspace_snapshot.data->'tasks'` into the (now-evolved) `tasks` table — keeps `assignees` in JSONB column | ✅ yes (uses `ON CONFLICT DO NOTHING`) |
| 002r | [`002_task_board_backfill.rollback.sql`](002_task_board_backfill.rollback.sql) | Rollback notes | — |

## Execution order

1. Run **001** first (creates empty tables + trigger).
2. Verify via `\d tasks` that columns + indexes exist.
3. Run **002** (backfill from JSONB into new tables).
4. Verify row counts match `jsonb_array_length(data->'tasks')` from snapshot.
5. Frontend continues to write to BOTH JSONB and new tables (dual-write) — no risk yet.
6. Only after 24-48h of monitoring → flip feature flag to read from new tables.

## Re-runnability

Both files can be re-run safely:
- 001 → `IF NOT EXISTS` guards skip already-created objects
- 002 → `ON CONFLICT DO NOTHING` skips already-backfilled rows

## Rollback strategy

The **primary rollback is a frontend feature flag**:
- Set `USE_TASK_API = false` in client → reverts to old `saveAll()` workflow
- Tables remain in DB (empty or full, doesn't matter — unused)
- No data loss because `workspace_snapshot` is still source of truth

**Hard rollback (DROP TABLE)** is documented in `*.rollback.sql` as commented SQL
but **requires explicit admin approval** per project rules.

## Source of truth during dual-write phase

- `workspace_snapshot.data->'tasks'` → still source of truth ✅
- `tasks` / `task_assignees` → mirror copy (will become source of truth in next phase)
