// GET    /api/tasks/:id        → fetch one task
// PATCH  /api/tasks/:id        → update with optimistic locking (body must contain `version`)
// DELETE /api/tasks/:id        → soft delete (sets deleted_at = NOW)
//
// Phase 2 step 3 (refactor-realtime).
// PATCH is the BIG WIN for writes: ~200-500 bytes instead of full snapshot (~1 MB).
//
// Optimistic locking:
//   - Client sends the version it last saw.
//   - Server: UPDATE ... WHERE id = ? AND version = ?
//   - If 0 rows updated → another writer changed it first → return 409 Conflict
//     with the current state so client can rebase and retry.
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from '../_db.js';
import {
  dbRowToClient,
  syncTasksToSnapshot,
  sanitizeDate,
  ALLOWED_PATCH_FIELDS,
} from '../_taskUtils.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const idRaw = req.query && req.query.id;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return sendError(res, 400, `invalid id: ${idRaw}`);
  }
  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;

  try {
    // -------------------------------------------------------------------------
    // GET — fetch one task by id
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, workspace_id, emoji, name, description, priority, type, status,
               due, file, created, position, assignees, version,
               created_at, updated_at, deleted_at, created_by
        FROM tasks
        WHERE id = ${id} AND workspace_id = ${wsId} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'Task not found' });
      }
      return res.json({ ok: true, task: dbRowToClient(rows[0]) });
    }

    // -------------------------------------------------------------------------
    // PATCH — update one task with optimistic locking
    // -------------------------------------------------------------------------
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      const expectedVersion = Number(body.version);
      if (!Number.isFinite(expectedVersion)) {
        return sendError(res, 400, '`version` is required in body for optimistic locking');
      }

      // First fetch the current row — needed for conflict response + to merge unchanged fields
      const currentRows = await sql`
        SELECT id, workspace_id, emoji, name, description, priority, type, status,
               due, file, created, position, assignees, version,
               created_at, updated_at, deleted_at, created_by
        FROM tasks
        WHERE id = ${id} AND workspace_id = ${wsId}
        LIMIT 1
      `;
      if (!currentRows.length) {
        return res.status(404).json({ ok: false, error: 'Task not found' });
      }
      const current = currentRows[0];

      if (current.deleted_at) {
        return res.status(410).json({
          ok: false,
          error: 'Task was deleted',
          deletedAt: current.deleted_at,
        });
      }

      // Optimistic-locking conflict check (before we even try UPDATE)
      if (Number(current.version) !== expectedVersion) {
        return res.status(409).json({
          ok: false,
          error: 'version mismatch — task was modified by another user',
          serverVersion: Number(current.version),
          clientVersion: expectedVersion,
          task: dbRowToClient(current),  // give client the latest so it can rebase
        });
      }

      // Build new values — only apply whitelisted fields the client sent.
      // Anything not in body keeps its current DB value.
      const next = {
        emoji:       body.emoji       !== undefined ? body.emoji       : current.emoji,
        name:        body.name        !== undefined ? body.name        : current.name,
        description: (body.description !== undefined ? body.description
                       : (body.desc !== undefined ? body.desc : current.description)),
        priority:    body.priority    !== undefined ? body.priority    : current.priority,
        type:        body.type        !== undefined ? body.type        : current.type,
        status:      body.status      !== undefined ? body.status      : current.status,
        due:         body.due         !== undefined ? sanitizeDate(body.due)     : current.due,
        file:        body.file        !== undefined ? body.file        : current.file,
        created:     body.created     !== undefined ? sanitizeDate(body.created) : current.created,
        position:    body.position    !== undefined ? body.position    : current.position,
        assignees:   Array.isArray(body.assignees) ? body.assignees    : current.assignees,
      };

      // Validate `name` not blank-able to empty
      if (typeof next.name !== 'string' || !next.name.trim()) {
        return sendError(res, 400, '`name` cannot be empty');
      }

      // UPDATE with version guard. The BEFORE-UPDATE trigger will bump version+updated_at.
      const updated = await sql`
        UPDATE tasks SET
          emoji       = ${next.emoji},
          name        = ${next.name},
          description = ${next.description},
          priority    = ${next.priority},
          type        = ${next.type},
          status      = ${next.status},
          due         = ${next.due},
          file        = ${next.file},
          created     = ${next.created},
          position    = ${next.position},
          assignees   = ${JSON.stringify(next.assignees)}::jsonb
        WHERE id = ${id}
          AND workspace_id = ${wsId}
          AND version = ${expectedVersion}
          AND deleted_at IS NULL
        RETURNING *
      `;

      if (!updated.length) {
        // Lost the race between our SELECT and our UPDATE.
        // Re-fetch and return 409 so client can retry.
        const fresh = await sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`;
        return res.status(409).json({
          ok: false,
          error: 'version changed between read and write — please retry',
          task: fresh.length ? dbRowToClient(fresh[0]) : null,
        });
      }

      // Dual-write: keep workspace_snapshot in sync
      await syncTasksToSnapshot(wsId);

      return res.json({ ok: true, task: dbRowToClient(updated[0]) });
    }

    // -------------------------------------------------------------------------
    // DELETE — soft delete (sets deleted_at). Optionally checks version.
    // -------------------------------------------------------------------------
    if (req.method === 'DELETE') {
      // Optional version check (if client wants safety)
      const expectedVersion = req.query && req.query.version != null
        ? Number(req.query.version) : null;

      let result;
      if (expectedVersion !== null && Number.isFinite(expectedVersion)) {
        result = await sql`
          UPDATE tasks SET deleted_at = NOW()
          WHERE id = ${id} AND workspace_id = ${wsId}
            AND version = ${expectedVersion} AND deleted_at IS NULL
          RETURNING *
        `;
      } else {
        result = await sql`
          UPDATE tasks SET deleted_at = NOW()
          WHERE id = ${id} AND workspace_id = ${wsId} AND deleted_at IS NULL
          RETURNING *
        `;
      }

      if (!result.length) {
        return res.status(404).json({
          ok: false,
          error: 'Task not found or already deleted (or version mismatch)',
        });
      }

      // Dual-write: remove from workspace_snapshot's tasks array
      await syncTasksToSnapshot(wsId);

      return res.json({ ok: true, id, deletedAt: result[0].deleted_at });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    return sendError(res, 500, 'Task operation failed', err);
  }
}
