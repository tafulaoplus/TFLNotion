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
        SELECT data, updated_at, updated_by,
               octet_length(data::text) AS size_bytes
        FROM workspace_snapshot
        WHERE workspace_id = ${wsId}
        LIMIT 1
      `;
      if (!rows.length) {
        return res.json({ ok: true, exists: false, data: null });
      }
      const r = rows[0];
      const sizeBytes = Number(r.size_bytes) || 0;
      // Vercel response limit ~4.5MB. Strip heavy fields if oversized.
      let data = r.data || {};
      if (sizeBytes > 3 * 1024 * 1024 && Array.isArray(data.salesEvents)) {
        data = {
          ...data,
          salesEvents: data.salesEvents.map(s => {
            if (s && s.result && s.result.receiptData) {
              const { receiptData, ...resultRest } = s.result;
              return { ...s, result: { ...resultRest, _receiptStripped: true } };
            }
            return s;
          }),
        };
      }
      return res.json({
        ok: true,
        exists: true,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        _sizeBytes: sizeBytes,
        ...data,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const payload = typeof body === 'string' ? JSON.parse(body) : body;
      const updatedBy = payload._updatedBy || 'unknown';

      const dataToStore = { ...payload };
      delete dataToStore._updatedBy;
      delete dataToStore.updatedAt;
      delete dataToStore.fetchedAt;

      // Defensive: strip large base64 receiptData server-side too
      if (Array.isArray(dataToStore.salesEvents)) {
        dataToStore.salesEvents = dataToStore.salesEvents.map(s => {
          if (s && s.result && typeof s.result.receiptData === 'string' && s.result.receiptData.length > 200_000) {
            const { receiptData, ...rest } = s.result;
            return { ...s, result: { ...rest, _receiptStripped: true } };
          }
          return s;
        });
      }
      // Cap activityLog and notifications to last N to prevent unbounded growth
      if (Array.isArray(dataToStore.activityLog) && dataToStore.activityLog.length > 500) {
        dataToStore.activityLog = dataToStore.activityLog.slice(-500);
      }
      if (Array.isArray(dataToStore.notifications) && dataToStore.notifications.length > 200) {
        dataToStore.notifications = dataToStore.notifications.slice(-200);
      }

      const json = JSON.stringify(dataToStore);
      await sql`
        INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
        VALUES (${wsId}, ${json}::jsonb, ${updatedBy})
        ON CONFLICT (workspace_id) DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
      `;
      return res.json({ ok: true, updatedAt: new Date().toISOString(), sizeBytes: json.length });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    return sendError(res, 500, 'Workspace operation failed', err);
  }
}
