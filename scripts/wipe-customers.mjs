// Emergency wipe: clear all salesCustomers from DB
// Usage: node scripts/wipe-customers.mjs [--confirm]
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const CONFIRM = process.argv.includes('--confirm');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

const before = await pool.query(`
  SELECT jsonb_array_length(COALESCE(data->'salesCustomers','[]'::jsonb)) AS n
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log(`Before: ${before.rows[0].n} salesCustomers`);

if(!CONFIRM){
  console.log('\nDry run. Re-run with --confirm to actually wipe.');
  await pool.end();
  process.exit(0);
}

// Atomic update: set salesCustomers to empty array
await pool.query(`
  UPDATE workspace_snapshot
  SET data = jsonb_set(data, '{salesCustomers}', '[]'::jsonb, true),
      updated_at = NOW(),
      updated_by = 'admin-wipe-script'
  WHERE workspace_id = 'default'
`);

const after = await pool.query(`
  SELECT jsonb_array_length(COALESCE(data->'salesCustomers','[]'::jsonb)) AS n
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log(`After: ${after.rows[0].n} salesCustomers`);
console.log(`✅ Wiped ${before.rows[0].n} records`);

await pool.end();
