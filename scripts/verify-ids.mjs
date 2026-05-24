// Proper ID-set comparison between snapshot and table (fix EXCEPT bug)
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`
  WITH
    snap_ids AS (
      SELECT (elem->>'id')::bigint AS id
      FROM workspace_snapshot,
           jsonb_array_elements(data->'tasks') elem
      WHERE workspace_id='default' AND elem->>'id' ~ '^[0-9]+$'
    ),
    tbl_ids AS (
      SELECT id FROM tasks WHERE workspace_id='default'
    ),
    only_snap AS (SELECT id FROM snap_ids EXCEPT SELECT id FROM tbl_ids),
    only_tbl  AS (SELECT id FROM tbl_ids EXCEPT SELECT id FROM snap_ids)
  SELECT
    (SELECT count(*)::int FROM only_snap) AS missing_from_table,
    (SELECT count(*)::int FROM only_tbl)  AS extra_in_table,
    (SELECT array_agg(id) FROM (SELECT id FROM only_snap LIMIT 5) s) AS missing_sample,
    (SELECT array_agg(id) FROM (SELECT id FROM only_tbl LIMIT 5) s) AS extra_sample
`);

const x = r.rows[0];
console.log('🔍 ID-set comparison snapshot ↔ table');
console.log(`   missing from table: ${x.missing_from_table} ${x.missing_from_table===0?'✅':'❌'}`);
console.log(`   extra in table:     ${x.extra_in_table} ${x.extra_in_table===0?'✅':'❌'}`);
if (x.missing_sample) console.log(`   missing sample: ${JSON.stringify(x.missing_sample)}`);
if (x.extra_sample) console.log(`   extra sample:   ${JSON.stringify(x.extra_sample)}`);

await pool.end();
