// Read-only verification that the backfill matched the snapshot.
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('🔍 Verifying backfill (READ-ONLY)…\n');

  // Counts
  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM tasks WHERE workspace_id='default') AS table_count,
      (SELECT jsonb_array_length(data->'tasks') FROM workspace_snapshot WHERE workspace_id='default') AS snapshot_count
  `);
  const { table_count, snapshot_count } = counts.rows[0];
  console.log(`tasks table rows:                ${table_count}`);
  console.log(`workspace_snapshot tasks rows:   ${snapshot_count}`);
  console.log(`Match: ${table_count === snapshot_count ? '✅ YES' : '❌ NO'}\n`);

  // IDs match check
  const idCheck = await pool.query(`
    WITH snap_ids AS (
      SELECT (elem->>'id')::bigint AS id
      FROM workspace_snapshot,
           jsonb_array_elements(data->'tasks') elem
      WHERE workspace_id='default' AND elem->>'id' ~ '^[0-9]+$'
    ),
    tbl_ids AS (
      SELECT id FROM tasks WHERE workspace_id='default'
    )
    SELECT
      (SELECT count(*)::int FROM snap_ids) AS snap_n,
      (SELECT count(*)::int FROM tbl_ids) AS tbl_n,
      (SELECT count(*)::int FROM snap_ids EXCEPT SELECT id FROM tbl_ids) AS only_in_snap,
      (SELECT count(*)::int FROM tbl_ids EXCEPT SELECT id FROM snap_ids) AS only_in_tbl
  `);
  console.log('ID set comparison:');
  console.log(`   snapshot ids:    ${idCheck.rows[0].snap_n}`);
  console.log(`   table ids:       ${idCheck.rows[0].tbl_n}`);
  console.log(`   only in snap:    ${idCheck.rows[0].only_in_snap} ${idCheck.rows[0].only_in_snap === 0 ? '✅' : '⚠️'}`);
  console.log(`   only in table:   ${idCheck.rows[0].only_in_tbl}`);

  // New column samples
  const cols = await pool.query(`
    SELECT id, name, status, due, version, deleted_at, jsonb_array_length(assignees) AS asn_n
    FROM tasks WHERE workspace_id='default' ORDER BY id DESC LIMIT 5
  `);
  console.log('\nSample rows (5 newest):');
  for (const r of cols.rows) {
    console.log(`   id=${r.id} v${r.version} status=${r.status||'-'} due=${r.due||'-'} asn=${r.asn_n} name="${(r.name||'').slice(0,30)}"`);
  }

  // Schema verification
  const newCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='tasks' AND column_name IN ('version','deleted_at','created_by')
    ORDER BY column_name
  `);
  console.log('\nNew columns present:');
  for (const c of newCols.rows) console.log(`   ✓ ${c.column_name}`);

  // Indexes
  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE tablename='tasks' ORDER BY indexname
  `);
  console.log('\nIndexes on tasks:');
  for (const i of idx.rows) console.log(`   - ${i.indexname}`);

  // Triggers
  const trig = await pool.query(`
    SELECT trigger_name FROM information_schema.triggers WHERE event_object_table='tasks' ORDER BY trigger_name
  `);
  console.log('\nTriggers on tasks:');
  for (const t of trig.rows) console.log(`   - ${t.trigger_name}`);

  // Distinct status values (to make sure all tasks have valid status)
  const statuses = await pool.query(`
    SELECT status, count(*)::int n FROM tasks WHERE workspace_id='default' GROUP BY status ORDER BY n DESC
  `);
  console.log('\nStatus distribution:');
  for (const s of statuses.rows) console.log(`   ${(s.status||'(null)').padEnd(15)} ${s.n}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
