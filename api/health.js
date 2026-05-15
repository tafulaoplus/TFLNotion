// GET /api/health — verify DB connection
import { sql, applyCors, sendError } from './_db.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const rows = await sql`SELECT NOW() AS now, current_database() AS db, version() AS version`;
    res.json({
      ok: true,
      db: rows[0].db,
      now: rows[0].now,
      version: (rows[0].version || '').split(' ').slice(0, 2).join(' '),
    });
  } catch (err) {
    sendError(res, 500, 'Database connection failed', err);
  }
}
