// Full read-only inventory of OLD Neon DB — used to plan migration
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('🔍 OLD DB inventory\n');

  // 1) Tables + row counts + size
  const tables = await pool.query(`
    SELECT t.table_name,
           (SELECT count(*) FROM information_schema.columns
            WHERE table_name = t.table_name AND table_schema = 'public') AS cols,
           pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) AS size
    FROM information_schema.tables t
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY pg_total_relation_size(quote_ident(t.table_name)::regclass) DESC
  `);

  console.log('TABLES:');
  console.log('  name'.padEnd(28) + 'cols'.padStart(5) + '  rows'.padStart(8) + '  size'.padStart(10));
  console.log('  ' + '-'.repeat(60));
  let totalRows = 0;
  for (const t of tables.rows) {
    const cnt = await pool.query(`SELECT count(*)::int AS n FROM "${t.table_name}"`);
    totalRows += cnt.rows[0].n;
    console.log(`  ${t.table_name.padEnd(28)}${String(t.cols).padStart(5)}  ${String(cnt.rows[0].n).padStart(6)}  ${t.size.padStart(10)}`);
  }
  console.log(`  TOTAL rows: ${totalRows}`);

  // 2) Indexes
  const idx = await pool.query(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public'
    ORDER BY tablename, indexname
  `);
  console.log(`\nINDEXES (${idx.rows.length}):`);
  for (const i of idx.rows) console.log(`  ${i.tablename}.${i.indexname}`);

  // 3) Triggers
  const trig = await pool.query(`
    SELECT event_object_table AS tbl, trigger_name, event_manipulation AS evt, action_timing AS timing
    FROM information_schema.triggers
    WHERE trigger_schema='public'
    ORDER BY event_object_table, trigger_name
  `);
  console.log(`\nTRIGGERS (${trig.rows.length}):`);
  for (const t of trig.rows) console.log(`  ${t.tbl}: ${t.trigger_name} (${t.timing} ${t.evt})`);

  // 4) Functions
  const fn = await pool.query(`
    SELECT proname AS name, pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    ORDER BY proname
  `);
  console.log(`\nFUNCTIONS (${fn.rows.length}):`);
  for (const f of fn.rows) console.log(`  ${f.name}()`);

  // 5) Sequences (for BIGSERIAL columns)
  const seq = await pool.query(`
    SELECT sequence_name, last_value
    FROM information_schema.sequences s
    LEFT JOIN LATERAL (
      SELECT last_value FROM pg_sequences ps
      WHERE ps.schemaname='public' AND ps.sequencename = s.sequence_name
    ) v ON true
    WHERE sequence_schema='public'
    ORDER BY sequence_name
  `);
  console.log(`\nSEQUENCES (${seq.rows.length}):`);
  for (const s of seq.rows) console.log(`  ${s.sequence_name} = ${s.last_value}`);

  // 6) Size of biggest JSONB row (the snapshot)
  const snap = await pool.query(`
    SELECT octet_length(data::text) AS snap_bytes,
           jsonb_array_length(COALESCE(data->'tasks','[]'::jsonb)) AS tasks_n,
           jsonb_array_length(COALESCE(data->'attendanceRecords','[]'::jsonb)) AS att_n,
           jsonb_array_length(COALESCE(data->'salesEvents','[]'::jsonb)) AS sales_n,
           jsonb_array_length(COALESCE(data->'stockItems','[]'::jsonb)) AS stock_n,
           jsonb_array_length(COALESCE(data->'stockCheckouts','[]'::jsonb)) AS ck_n,
           jsonb_array_length(COALESCE(data->'lotterySales','[]'::jsonb)) AS lot_n,
           jsonb_array_length(COALESCE(data->'liveAnalytics','[]'::jsonb)) AS live_n,
           jsonb_array_length(COALESCE(data->'notifications','[]'::jsonb)) AS notif_n,
           jsonb_array_length(COALESCE(data->'activityLog','[]'::jsonb)) AS act_n,
           jsonb_array_length(COALESCE(data->'users','[]'::jsonb)) AS users_n
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  const s = snap.rows[0];
  console.log('\nSNAPSHOT contents (workspace_snapshot row):');
  console.log(`  total size:           ${(s.snap_bytes/1024).toFixed(1)} KB`);
  console.log(`  users:                ${s.users_n}`);
  console.log(`  tasks (in JSONB):     ${s.tasks_n}`);
  console.log(`  attendance records:   ${s.att_n}`);
  console.log(`  sales events:         ${s.sales_n}`);
  console.log(`  stock items:          ${s.stock_n}`);
  console.log(`  stock checkouts:      ${s.ck_n}`);
  console.log(`  lottery sales:        ${s.lot_n}`);
  console.log(`  live analytics:       ${s.live_n}`);
  console.log(`  notifications:        ${s.notif_n}`);
  console.log(`  activity log:         ${s.act_n}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
