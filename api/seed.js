// POST /api/seed — push baseline data into Neon
// Use this to initialize a fresh database with sample users / opts / etc.
// Run once after init-db. Use ?secret=YOUR_SECRET if INIT_DB_SECRET is set.
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from './_db.js';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendError(res, 405, 'Use POST or GET');
  }
  const secret = process.env.INIT_DB_SECRET;
  if (secret && (req.query.secret || '') !== secret) {
    return sendError(res, 403, 'Invalid or missing ?secret=');
  }

  try {
    // Push baseline workspace snapshot
    const defaultUsers = [
      { id: 1, name: 'Tafu Lao Plus', init: 'T', role: 'admin',  color: '#8b5cf6', email: 'tafu@tfl.com' },
      { id: 2, name: 'noungning',      init: 'N', role: 'member', color: '#3b82f6', email: 'noungning@tfl.com' },
      { id: 3, name: 'paylay',         init: 'P', role: 'member', color: '#f59e0b', email: 'paylay@tfl.com' },
      { id: 4, name: 'Noii VINUTDA',   init: 'NV', role: 'member', color: '#10b981', email: 'noii@tfl.com' },
    ];

    // Check existing snapshot
    const existing = await sql`
      SELECT 1 FROM workspace_snapshot WHERE workspace_id = ${DEFAULT_WORKSPACE} LIMIT 1
    `;
    if (existing.length) {
      return res.json({
        ok: true,
        already: true,
        message: 'Workspace already has data — seed skipped',
      });
    }

    const payload = {
      users: defaultUsers,
      tasks: [],
      documents: [],
      notes: [],
      liveSessions: [],
      opts: {
        status: [
          { id: 'todo',       label: 'ยังไม่ได้เริ่ม',         color: '#6b7280', bg: '#f3f4f6' },
          { id: 'inprogress', label: 'อยู่ระหว่างดำเนินการ',  color: '#1d4ed8', bg: '#dbeafe' },
          { id: 'review',     label: 'แก้ไข',                  color: '#b45309', bg: '#fef3c7' },
          { id: 'done',       label: 'เสร็จ',                  color: '#059669', bg: '#d1fae5' },
        ],
        priority: [
          { id: 'low',  label: 'ต่ำ',   color: '#059669', bg: '#d1fae5' },
          { id: 'mid',  label: 'กลาง', color: '#b45309', bg: '#fef3c7' },
          { id: 'high', label: 'สูง',  color: '#dc2626', bg: '#fee2e2' },
        ],
        type: [
          { id: 'doc',   label: 'เอกสาร',     color: '#7c3aed', bg: '#f3eafe' },
          { id: 'video', label: 'คลิปวิดีโอ', color: '#be185d', bg: '#fce7f3' },
          { id: 'task',  label: 'งานทั่วไป',  color: '#1d4ed8', bg: '#dbeafe' },
        ],
      },
      columnWidths: { emoji:50, name:280, status:170, assignees:170, due:150, priority:110, type:140, desc:240, file:200, actions:80 },
      nextTaskId: 100,
      nextDocId: 100,
    };

    await sql`
      INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
      VALUES (${DEFAULT_WORKSPACE}, ${JSON.stringify(payload)}::jsonb, 'seed')
    `;

    res.json({
      ok: true,
      seeded: true,
      message: 'Baseline workspace data created',
      summary: {
        users: payload.users.length,
        statusOptions: payload.opts.status.length,
        priorityOptions: payload.opts.priority.length,
        typeOptions: payload.opts.type.length,
      },
    });
  } catch (err) {
    sendError(res, 500, 'Seed failed', err);
  }
}
