// Restore a workspace snapshot to production Neon DB.
// Usage:  node scripts/restore-snapshot.mjs "<path-to-json>"
// Example: node scripts/restore-snapshot.mjs "C:\Users\suntf\Downloads\tfl-workspace-2026-05-16.json"
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/restore-snapshot.mjs <path-to-json>'); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing in .env.local'); process.exit(1); }

const raw = await readFile(file, 'utf8');
const data = JSON.parse(raw);
// strip metadata fields that should not be stored
delete data._updatedBy; delete data.updatedAt; delete data.fetchedAt;
delete data.ok; delete data.exists; delete data._sizeBytes; delete data._slimMode; delete data._warning; delete data.updatedBy;

console.log('Restoring snapshot from:', file);
console.log('  users         :', (data.users||[]).length);
console.log('  tasks         :', (data.tasks||[]).length);
console.log('  documents     :', (data.documents||[]).length);
console.log('  notes         :', (data.notes||[]).length);
console.log('  salesEvents   :', (data.salesEvents||[]).length);
console.log('  lotterySales  :', (data.lotterySales||[]).length);
console.log('  attendance    :', (data.attendanceRecords||[]).length);

const sql = neon(url);
await sql`
  CREATE TABLE IF NOT EXISTS workspace_snapshot (
    workspace_id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
  )
`;

// Show what's currently there so we don't blindly overwrite
const cur = await sql`SELECT octet_length(data::text) AS sz, updated_at, updated_by, jsonb_array_length(COALESCE(data->'users','[]'::jsonb)) AS user_count FROM workspace_snapshot WHERE workspace_id='default'`;
if (cur.length) {
  console.log('\nCurrent DB row:');
  console.log('  size       :', cur[0].sz);
  console.log('  updated_at :', cur[0].updated_at);
  console.log('  updated_by :', cur[0].updated_by);
  console.log('  users      :', cur[0].user_count);
}

const json = JSON.stringify(data);
await sql`
  INSERT INTO workspace_snapshot (workspace_id, data, updated_by)
  VALUES ('default', ${json}::jsonb, 'restore-script')
  ON CONFLICT (workspace_id) DO UPDATE
  SET data = EXCLUDED.data, updated_at = NOW(), updated_by = EXCLUDED.updated_by
`;
console.log('\n✓ Restore complete. New size:', json.length, 'bytes');
