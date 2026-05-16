// GET  /api/workspace  → fetch full workspace snapshot
// POST /api/workspace  → save full workspace snapshot
//
// Snapshot model: stores all data as a single JSONB document for Firebase-like sync.
// For normalized queries, see /api/users, /api/tasks (future).
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from './_db.js';

// Self-heal: ensure table exists on every call (cheap idempotent op)
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS workspace_snapshot (
      workspace_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;
}

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;

  try {
    await ensureTable();
    if (req.method === 'GET') {
      // First check size cheaply
      const meta = await sql`
        SELECT octet_length(data::text) AS size_bytes, updated_at, updated_by
        FROM workspace_snapshot
        WHERE workspace_id = ${wsId}
        LIMIT 1
      `;
      if (!meta.length) {
        return res.json({ ok: true, exists: false, data: null });
      }
      const sizeBytes = Number(meta[0].size_bytes) || 0;
      // If oversized, fetch only critical fields via JSON paths (skip large arrays)
      if (sizeBytes > 2 * 1024 * 1024) {
        const slim = await sql`
          SELECT
            data->'users' AS users,
            data->'opts' AS opts,
            data->'columnWidths' AS column_widths,
            (data->'nextTaskId')::int AS next_task_id,
            (data->'nextDocId')::int AS next_doc_id,
            data->'lotterySales' AS lottery_sales,
            data->'lotterySettings' AS lottery_settings,
            updated_at, updated_by
          FROM workspace_snapshot
          WHERE workspace_id = ${wsId}
          LIMIT 1
        `;
        const s = slim[0] || {};
        return res.json({
          ok: true,
          exists: true,
          updatedAt: s.updated_at,
          updatedBy: s.updated_by,
          _sizeBytes: sizeBytes,
          _slimMode: true,
          _warning: 'Workspace data oversized — only critical fields returned. Run /api/wipe-snapshot to reset.',
          users: s.users || [],
          opts: s.opts || null,
          columnWidths: s.column_widths || null,
          nextTaskId: s.next_task_id || 100,
          nextDocId: s.next_doc_id || 100,
          lotterySales: s.lottery_sales || [],
          lotterySettings: s.lottery_settings || {},
          tasks: [],
          documents: [],
          notes: [],
          liveSessions: [],
          notifications: [],
          salesEvents: [],
          activityLog: [],
        });
      }
      // Normal path
      const rows = await sql`
        SELECT data, updated_at, updated_by
        FROM workspace_snapshot
        WHERE workspace_id = ${wsId}
        LIMIT 1
      `;
      const r = rows[0];
      return res.json({
        ok: true,
        exists: true,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        _sizeBytes: sizeBytes,
        ...(r.data || {}),
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
