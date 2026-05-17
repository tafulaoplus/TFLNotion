// One-off diagnostic: inspect current Neon workspace snapshot.
// Usage:  node scripts/inspect-snapshot.mjs
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }
const sql = neon(url);

const rows = await sql`SELECT workspace_id, updated_at, updated_by, octet_length(data::text) AS size_bytes, data FROM workspace_snapshot`;
for (const r of rows) {
  console.log('---');
  console.log('workspace_id:', r.workspace_id);
  console.log('updated_at  :', r.updated_at);
  console.log('updated_by  :', r.updated_by);
  console.log('size_bytes  :', r.size_bytes);
  const d = r.data || {};
  const keys = Object.keys(d);
  console.log('top keys    :', keys.join(', '));
  console.log('counts:');
  for (const k of keys) {
    const v = d[k];
    if (Array.isArray(v)) console.log(`  ${k}: array[${v.length}]`);
  }
  if (Array.isArray(d.users)) {
    console.log('USERS:');
    for (const u of d.users) console.log(`  - ${u.name} [${u.role}] id=${u.id} pin=${u.pin}`);
  }
}
console.log('total rows:', rows.length);
