// GET  /api/workspace  → fetch full workspace snapshot
// POST /api/workspace  → save full workspace snapshot
//
// Snapshot model: stores all data as a single JSONB document for Firebase-like sync.
// For normalized queries, see /api/users, /api/tasks (future).
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from './_db.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT data, updated_at, updated_by
        FROM workspace_snapshot
        WHERE workspace_id = ${wsId}
        LIMIT 1
      `;
      if (!rows.length) {
        return res.json({ ok: true, exists: false, data: null });
      }
      const r = rows[0];
      return res.json({
        ok: true,
        exists: true,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        ...r.data,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // Vercel parses JSON automatically; if not, parse manually
      const payload = typeof body === 'string' ? JSON.parse(body) : body;
      const updatedBy = payload._updatedBy || 'unknown';

      // Strip server-managed keys before storing
      const dataToStore = { ...payload };
      delete dataToStore._updatedBy;
      delete dataToStore.updatedAt;
      delete dataToStore.fetchedAt;

      await sql`
        INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
        VALUES (${wsId}, ${JSON.stringify(dataToStore)}::jsonb, ${updatedBy})
        ON CONFLICT (workspace_id) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
      `;
      return res.json({ ok: true, updatedAt: new Date().toISOString() });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    return sendError(res, 500, 'Workspace operation failed', err);
  }
}
