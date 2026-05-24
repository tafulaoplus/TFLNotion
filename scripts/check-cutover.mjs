// Check if production has cut over to NEW DB.
// Reads `updated_at` on both DBs to see which one is receiving recent writes.
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const oldDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

async function check(label, pool) {
  const r = await pool.query(`
    SELECT updated_at, updated_by,
           jsonb_array_length(COALESCE(data->'activityLog','[]'::jsonb)) AS act_n
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  if (!r.rows.length) {
    console.log(`${label}: no snapshot row`);
    return;
  }
  const ts = new Date(r.rows[0].updated_at);
  const age = Math.floor((Date.now() - ts.getTime()) / 1000);
  console.log(`${label}:`);
  console.log(`  updated_at: ${ts.toISOString()} (${age}s ago)`);
  console.log(`  updated_by: ${r.rows[0].updated_by}`);
  console.log(`  activityLog entries: ${r.rows[0].act_n}`);
}

console.log('🔍 Checking which DB is receiving writes from production...\n');
console.log(`Current time: ${new Date().toISOString()}\n`);
await check('OLD', oldDb);
console.log('');
await check('NEW', newDb);
console.log('\n→ If NEW.updated_at is RECENT (< 30s ago) = cutover success ✓');
console.log('→ If OLD.updated_at is more recent = still using OLD (redeploy not done yet, or env not saved)');

await oldDb.end();
await newDb.end();
