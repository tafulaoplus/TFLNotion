// POST /api/wipe-snapshot — delete the workspace_snapshot row to recover from corrupt/oversized state.
// Protect via INIT_DB_SECRET if set, otherwise allow any (so admin UI can call it).
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from './_db.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendError(res, 405, 'Use POST');
  }
  const secret = process.env.INIT_DB_SECRET;
  if (secret && (req.query.secret || '') !== secret) {
    return sendError(res, 403, 'Invalid or missing ?secret=');
  }
  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;
  try {
    const r = await sql`DELETE FROM workspace_snapshot WHERE workspace_id = ${wsId} RETURNING workspace_id`;
    return res.json({ ok: true, deleted: r.length, workspaceId: wsId });
  } catch (err) {
    return sendError(res, 500, 'Wipe failed', err);
  }
}
