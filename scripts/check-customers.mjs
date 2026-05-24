import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

const r = await pool.query(`
  SELECT
    jsonb_array_length(COALESCE(data->'salesCustomers','[]'::jsonb)) AS n,
    updated_at, updated_by
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log('salesCustomers in DB:', r.rows[0].n);
console.log('snapshot updated:', r.rows[0].updated_at, 'by', r.rows[0].updated_by);

// Distinct dates + counts
const byDate = await pool.query(`
  SELECT (elem->>'date') AS d, count(*)::int AS n
  FROM workspace_snapshot, jsonb_array_elements(COALESCE(data->'salesCustomers','[]'::jsonb)) elem
  WHERE workspace_id='default'
  GROUP BY d ORDER BY d
`);
console.log('\nBy date:');
byDate.rows.forEach(r => console.log(`  ${r.d || '(empty)'}: ${r.n}`));

// Distinct locations
const byLoc = await pool.query(`
  SELECT (elem->>'location') AS loc, count(*)::int AS n
  FROM workspace_snapshot, jsonb_array_elements(COALESCE(data->'salesCustomers','[]'::jsonb)) elem
  WHERE workspace_id='default'
  GROUP BY loc ORDER BY n DESC
`);
console.log('\nBy location:');
byLoc.rows.forEach(r => console.log(`  "${r.loc}": ${r.n}`));

// Sample 3 records
const sample = await pool.query(`
  SELECT elem AS c FROM workspace_snapshot, jsonb_array_elements(COALESCE(data->'salesCustomers','[]'::jsonb)) elem
  WHERE workspace_id='default' LIMIT 3
`);
console.log('\nSample records:');
sample.rows.forEach((r,i) => console.log(`  ${i+1}.`, JSON.stringify(r.c)));

await pool.end();
