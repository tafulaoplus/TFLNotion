// GET    /api/tasks?workspace=default&since=<ISO>  → list tasks (incremental if `since`)
// POST   /api/tasks                                 → create a new task
//
// Phase 2 step 3 (refactor-realtime).
// Replaces the old "POST full workspace snapshot" path for task changes.
// `since` filter is the BIG WIN: returns only changed/deleted tasks (~1 KB)
// instead of the full snapshot (~1-2 MB) on every poll.
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from './_db.js';
import {
  dbRowToClient,
  syncTasksToSnapshot,
  sanitizeDate,
  ALLOWED_PATCH_FIELDS,
} from './_taskUtils.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;

  try {
    // -------------------------------------------------------------------------
    // GET — list active tasks; if `since` provided, return incremental delta
    //       (changed + deleted since that timestamp)
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const since = req.query && req.query.since;
      const now = new Date().toISOString();

      if (since) {
        // Validate ISO timestamp
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return sendError(res, 400, 'invalid `since` parameter (expect ISO timestamp)');
        }
        // Pull anything that changed (including soft-deleted) after `since`
        const rows = await sql`
          SELECT id, workspace_id, emoji, name, description, priority, type, status,
                 due, file, created, position, assignees, version,
                 created_at, updated_at, deleted_at, created_by
          FROM tasks
          WHERE workspace_id = ${wsId}
            AND updated_at > ${sinceDate.toISOString()}
          ORDER BY updated_at ASC
        `;
        const active = rows.filter(r => !r.deleted_at).map(dbRowToClient);
        const deletedIds = rows.filter(r => r.deleted_at).map(r => Number(r.id));
        return res.json({
          ok: true,
          now,
          since,
          tasks: active,
          deletedIds,
          _meta: { changed: active.length, deleted: deletedIds.length },
        });
      }

      // No since → full list (used on initial page load)
      const rows = await sql`
        SELECT id, workspace_id, emoji, name, description, priority, type, status,
               due, file, created, position, assignees, version,
               created_at, updated_at, deleted_at, created_by
        FROM tasks
        WHERE workspace_id = ${wsId} AND deleted_at IS NULL
        ORDER BY position ASC NULLS LAST, id ASC
      `;
      return res.json({
        ok: true,
        now,
        tasks: rows.map(dbRowToClient),
        _meta: { total: rows.length },
      });
    }

    // -------------------------------------------------------------------------
    // POST — create new task. Server generates id to avoid client collisions.
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      const body = req.body || {};
      const data = typeof body === 'string' ? JSON.parse(body) : body;

      const name = (data.name || '').trim();
      if (!name) return sendError(res, 400, '`name` is required');

      // Server-generated id: timestamp(ms) × 1000 + random 0-999.
      // This minimizes collision when many clients create at once and stays
      // compatible with the existing Date.now() id space.
      const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

      const assignees = Array.isArray(data.assignees) ? data.assignees : [];
      const due = sanitizeDate(data.due);
      const created = sanitizeDate(data.created);

      const inserted = await sql`
        INSERT INTO tasks (
          id, workspace_id, emoji, name, description, priority, type, status,
          due, file, created, position, assignees, created_by
        ) VALUES (
          ${newId}, ${wsId},
          ${data.emoji || null},
          ${name},
          ${(data.desc ?? data.description) || ''},
          ${data.priority || null},
          ${data.type || null},
          ${data.status || 'todo'},
          ${due},
          ${data.file || null},
          ${created},
          ${data.position ?? 0},
          ${JSON.stringify(assignees)}::jsonb,
          ${data.createdBy || null}
        )
        RETURNING *
      `;

      // Dual-write: keep workspace_snapshot in sync for backward compatibility
      await syncTasksToSnapshot(wsId);

      return res.json({ ok: true, task: dbRowToClient(inserted[0]) });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    return sendError(res, 500, 'Tasks API failed', err);
  }
}
