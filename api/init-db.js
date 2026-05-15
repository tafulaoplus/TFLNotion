// POST /api/init-db?secret=YOUR_SECRET  → run schema.sql
//
// Use this once after deploy to Vercel. Set INIT_DB_SECRET env var to protect.
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyCors, sendError } from './_db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendError(res, 405, 'Use POST or GET to initialize');
  }

  // Simple secret guard
  const secret = process.env.INIT_DB_SECRET;
  if (secret && (req.query.secret || '') !== secret) {
    return sendError(res, 403, 'Invalid or missing ?secret= parameter');
  }
  if (!process.env.DATABASE_URL) {
    return sendError(res, 500, 'DATABASE_URL not configured');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    await pool.query(schema);

    // List tables for confirmation
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    res.json({
      ok: true,
      message: 'Schema initialized successfully',
      tables: tables.rows.map((t) => t.table_name),
    });
  } catch (err) {
    sendError(res, 500, 'Schema initialization failed', err);
  } finally {
    await pool.end();
  }
}
