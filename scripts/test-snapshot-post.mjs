// Test if posting a full snapshot with ad library competitor works
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const HOST = 'https://tfl-notion.vercel.app';
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

// 1. Read current snapshot
const cur = await newDb.query(`SELECT data FROM workspace_snapshot WHERE workspace_id='default'`);
const data = cur.rows[0].data;
console.log('Before:');
console.log(`  size: ${(JSON.stringify(data).length/1024).toFixed(1)} KB`);
console.log(`  adLibCompetitors: ${(data.adLibCompetitors||[]).length}`);

// 2. Add an ad lib competitor to the snapshot data
const testAd = {
  id: 'comp_test_' + Date.now(),
  pageUrl: 'https://www.facebook.com/test',
  name: '[diag test ad]',
  picture: '',
  adLibUrl: 'https://www.facebook.com/ads/library/?id=test',
  note: 'diagnostic test',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
const newData = {
  ...data,
  adLibCompetitors: [...(data.adLibCompetitors || []), testAd],
  _updatedBy: 'diag-snapshot-test',
};

const payload = JSON.stringify(newData);
console.log(`\nPosting full snapshot (${(payload.length/1024).toFixed(1)} KB)...`);

const t0 = Date.now();
const r = await fetch(`${HOST}/api/workspace`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: payload,
});
const ms = Date.now() - t0;
const j = await r.json();
console.log(`Status: ${r.status} (${ms}ms)`);
console.log(`Response: ${JSON.stringify(j).slice(0,200)}`);

// 3. Verify
const after = await newDb.query(`
  SELECT jsonb_array_length(COALESCE(data->'adLibCompetitors','[]'::jsonb)) AS n,
         updated_at, updated_by
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log('\nAfter:');
console.log(`  adLibCompetitors: ${after.rows[0].n}`);
console.log(`  updated_by:       ${after.rows[0].updated_by}`);
console.log(`  updated_at:       ${after.rows[0].updated_at.toISOString()}`);

await newDb.end();
