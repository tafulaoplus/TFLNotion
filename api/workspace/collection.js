// Per-collection atomic updates — avoids the full-snapshot last-writer-wins problem
// for high-concurrency operations (check-in, sales, lottery, etc).
//
// POST /api/workspace/collection
//   body: { collection: 'attendanceRecords', op: 'upsert', record: {...} }
//   body: { collection: 'attendanceRecords', op: 'delete', id: 'rec-1' }
//
// Uses Postgres JSONB operations inside a single atomic transaction so two clients
// hitting this endpoint simultaneously cannot lose each other's writes.
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from '../_db.js';

// Whitelist of collections allowed via this endpoint
const ALLOWED = new Set([
  'attendanceRecords', 'leaveRequests',
  'salesEvents', 'lotterySales',
  'notifications', 'activityLog',
  'tasks', 'documents', 'notes',
  'stockItems', 'stockCheckouts',
  'liveAnalytics', 'liveSessions', 'adLibCompetitors',
  'fbDrafts', 'giveawayInventory',
]);

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'Method not allowed');
  }

  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;

  try {
    const body = req.body || {};
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const { collection, op, record, id, updatedBy } = payload;

    if (!collection || !ALLOWED.has(collection)) {
      return sendError(res, 400, `Unknown or disallowed collection: ${collection}`);
    }
    if (op !== 'upsert' && op !== 'delete') {
      return sendError(res, 400, `Unknown op: ${op} (expected upsert|delete)`);
    }

    // Read-modify-write inside a single SQL statement to be atomic per-row
    // (neon serverless driver runs each tagged template as one statement)
    if (op === 'upsert') {
      if (!record || record.id == null) {
        return sendError(res, 400, 'upsert requires record.id');
      }
      const recordJson = JSON.stringify(record);
      const recIdStr = String(record.id);
      // CTE: read current array → filter out any record with same id → append new → write back
      const result = await sql`
        WITH cur AS (
          SELECT data FROM workspace_snapshot WHERE workspace_id = ${wsId} FOR UPDATE
        ),
        existing AS (
          SELECT COALESCE(cur.data->${collection}, '[]'::jsonb) AS arr FROM cur
        ),
        filtered AS (
          SELECT COALESCE(
            jsonb_agg(elem),
            '[]'::jsonb
          ) AS arr
          FROM existing, jsonb_array_elements(existing.arr) elem
          WHERE elem->>'id' <> ${recIdStr}
        ),
        merged AS (
          SELECT COALESCE(filtered.arr, '[]'::jsonb) || ${recordJson}::jsonb AS arr FROM filtered
        )
        UPDATE workspace_snapshot
        SET data = jsonb_set(COALESCE(data, '{}'::jsonb), ARRAY[${collection}], (SELECT arr FROM merged), true),
            updated_at = NOW(),
            updated_by = ${updatedBy || 'unknown'}
        WHERE workspace_id = ${wsId}
        RETURNING jsonb_array_length(data->${collection}) AS new_length
      `;
      if (!result.length) {
        // No row yet → insert new snapshot with just this collection
        const newData = JSON.stringify({ [collection]: [record] });
        await sql`
          INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
          VALUES (${wsId}, ${newData}::jsonb, ${updatedBy || 'unknown'})
        `;
        return res.json({ ok: true, op, newLength: 1 });
      }
      return res.json({ ok: true, op, newLength: result[0].new_length });
    }

    if (op === 'delete') {
      if (id == null) return sendError(res, 400, 'delete requires id');
      const idStr = String(id);
      const result = await sql`
        WITH cur AS (
          SELECT data FROM workspace_snapshot WHERE workspace_id = ${wsId} FOR UPDATE
        ),
        existing AS (
          SELECT COALESCE(cur.data->${collection}, '[]'::jsonb) AS arr FROM cur
        ),
        filtered AS (
          SELECT COALESCE(
            jsonb_agg(elem),
            '[]'::jsonb
          ) AS arr
          FROM existing, jsonb_array_elements(existing.arr) elem
          WHERE elem->>'id' <> ${idStr}
        )
        UPDATE workspace_snapshot
        SET data = jsonb_set(COALESCE(data, '{}'::jsonb), ARRAY[${collection}], (SELECT arr FROM filtered), true),
            updated_at = NOW(),
            updated_by = ${updatedBy || 'unknown'}
        WHERE workspace_id = ${wsId}
        RETURNING jsonb_array_length(data->${collection}) AS new_length
      `;
      return res.json({ ok: true, op, newLength: result.length ? result[0].new_length : 0 });
    }
  } catch (err) {
    return sendError(res, 500, 'Collection update failed', err);
  }
}
