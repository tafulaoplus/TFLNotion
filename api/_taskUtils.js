// Shared helpers for the Task Board API (refactor-realtime, Phase 2 step 3).
//
// Responsibilities:
//   1. dbRowToClient()   — translate a `tasks` DB row → the shape the frontend expects
//   2. dbRowToSnapshot() — translate a DB row → the JSONB shape used in workspace_snapshot
//   3. syncTasksToSnapshot() — rebuild `workspace_snapshot.data->'tasks'` so old clients
//                              that still poll the snapshot endpoint keep seeing fresh data
//
// IMPORTANT: workspace_snapshot is still the source of truth during the dual-write phase.
// Every write to the new `tasks` table must mirror to the snapshot's tasks array.
import { sql } from './_db.js';

/** Database column names (DB) ↔ client-facing names (JS object). */
const FIELD_MAP_DB_TO_CLIENT = {
  description: 'desc',   // legacy frontend uses `desc`
  // everything else passes through with same name
};

/** Convert a Postgres `tasks` row → the object shape the existing frontend uses.
 *  `due` is stored as DATE in DB but the frontend expects 'YYYY-MM-DD' string. */
export function dbRowToClient(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    emoji: row.emoji || '',
    name: row.name || '',
    desc: row.description || '',
    priority: row.priority || '',
    type: row.type || '',
    status: row.status || 'todo',
    due: row.due ? formatDateOnly(row.due) : '',
    file: row.file || '',
    created: row.created ? formatDateOnly(row.created) : '',
    position: row.position ?? 0,
    assignees: Array.isArray(row.assignees) ? row.assignees : [],
    version: row.version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Convert a DB row → the JSONB shape used in workspace_snapshot.data->'tasks'.
 *  Keeps the same key names that the existing frontend already understands. */
export function dbRowToSnapshot(row) {
  return {
    id: Number(row.id),
    emoji: row.emoji || '',
    name: row.name || '',
    desc: row.description || '',
    priority: row.priority || '',
    type: row.type || '',
    status: row.status || 'todo',
    due: row.due ? formatDateOnly(row.due) : '',
    file: row.file || '',
    created: row.created ? formatDateOnly(row.created) : '',
    assignees: Array.isArray(row.assignees) ? row.assignees : [],
  };
}

/** Postgres DATE → 'YYYY-MM-DD' (drop the time portion the driver adds). */
function formatDateOnly(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return String(d).slice(0, 10);
}

/** Rebuild `workspace_snapshot.data->'tasks'` from the current `tasks` table.
 *  Cheap (52 rows × small JSON) and guarantees old clients see consistent state.
 *  Should be called after every successful write to `tasks` (POST/PATCH/DELETE). */
export async function syncTasksToSnapshot(workspaceId) {
  // Pull all non-deleted tasks for this workspace
  const rows = await sql`
    SELECT id, emoji, name, description, priority, type, status,
           due, file, created, position, assignees
    FROM tasks
    WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
    ORDER BY position ASC NULLS LAST, id ASC
  `;
  const arr = rows.map(dbRowToSnapshot);
  const jsonArr = JSON.stringify(arr);

  // jsonb_set replaces only the 'tasks' key — does not touch any other field.
  // If workspace_snapshot row doesn't exist yet, create with just tasks (rare).
  await sql`
    INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
    VALUES (${workspaceId}, jsonb_build_object('tasks', ${jsonArr}::jsonb), 'tasks-api')
    ON CONFLICT (workspace_id) DO UPDATE
    SET data = jsonb_set(
      COALESCE(workspace_snapshot.data, '{}'::jsonb),
      '{tasks}',
      ${jsonArr}::jsonb,
      true
    ),
        updated_at = NOW(),
        updated_by = 'tasks-api'
  `;
  return arr.length;
}

/** Sanitize an incoming string → ensure 'YYYY-MM-DD' or null.
 *  Used for `due` and `created` which are DATE columns. */
export function sanitizeDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/** Whitelist of fields the client is allowed to set on POST/PATCH.
 *  Anything else in the body is silently ignored. */
export const ALLOWED_PATCH_FIELDS = [
  'emoji', 'name', 'description', 'desc',
  'priority', 'type', 'status',
  'due', 'file', 'created', 'position',
  'assignees',
];
