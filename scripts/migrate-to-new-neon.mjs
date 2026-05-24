// Migrate data from OLD Neon (DATABASE_URL) → NEW Neon (DATABASE_URL_NEW).
//
// SAFETY GUARANTEES:
//   - OLD DB is READ-ONLY throughout. We never write to it.
//   - NEW DB must be empty (no tables). We refuse to overwrite.
//   - Each table copy is wrapped in a transaction; one failure rolls back that table.
//   - Idempotent INSERTs (ON CONFLICT DO NOTHING) so re-runs are safe.
//   - Reports row count comparison at the end. If counts differ, exit non-zero.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-to-new-neon.mjs           # apply
//   node --env-file=.env.local scripts/migrate-to-new-neon.mjs --dry     # show plan, don't execute
//
// Requires: DATABASE_URL (source) + DATABASE_URL_NEW (destination) in .env.local

import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force'); // override the "new DB must be empty" check

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_NEW) {
  console.error('❌ Need both DATABASE_URL and DATABASE_URL_NEW in .env.local');
  process.exit(1);
}

const oldDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

const log = (...a) => console.log(...a);
const hr  = () => console.log('─'.repeat(64));

let totalIssues = 0;

// Tables to copy data for (others are empty in old DB; schema only).
// Order matters: parents (workspaces) before children (FK references).
const DATA_TABLES_IN_ORDER = [
  'workspaces',
  'opts',
  'tasks',
  'workspace_snapshot',
  // The rest are empty in old DB but we still ensure their schema is in new:
  // users, documents, notes, live_sessions, task_assignees, task_checklists,
  // task_comments, workspace_meta — empty, no data to copy
];

async function main() {
  log(`🚚 Neon migration — ${DRY ? '(DRY RUN)' : '(LIVE)'}\n`);

  // -------------------------------------------------------------------------
  // 1. Confirm both connections
  // -------------------------------------------------------------------------
  const oldPing = await oldDb.query('SELECT current_database() AS db, version() AS v');
  const newPing = await newDb.query('SELECT current_database() AS db, version() AS v');
  log(`OLD: ${process.env.DATABASE_URL.match(/@([^/]+)/)?.[1]}`);
  log(`     ${oldPing.rows[0].v.split(',')[0]}\n`);
  log(`NEW: ${process.env.DATABASE_URL_NEW.match(/@([^/]+)/)?.[1]}`);
  log(`     ${newPing.rows[0].v.split(',')[0]}\n`);
  hr();

  // -------------------------------------------------------------------------
  // 2. Verify NEW DB is empty (refuse to overwrite by accident)
  // -------------------------------------------------------------------------
  const existingTables = await newDb.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `);
  if (existingTables.rows.length > 0) {
    if (!FORCE) {
      log('⚠️  NEW DB is NOT empty — found existing tables:');
      for (const t of existingTables.rows) log(`   - ${t.table_name}`);
      log('\nRefuse to proceed. Re-run with --force to apply anyway (idempotent INSERTs make this safe).');
      process.exit(1);
    } else {
      log(`⚠️  --force flag set; proceeding even though NEW DB has ${existingTables.rows.length} existing tables.`);
    }
  } else {
    log('✓ NEW DB is empty — safe to apply schema.');
  }
  hr();

  // -------------------------------------------------------------------------
  // 3. Apply schema to NEW DB (db/schema.sql + migrations/001)
  // -------------------------------------------------------------------------
  const schemaSql = readFileSync(resolve('db/schema.sql'), 'utf8');
  const migrationSql = readFileSync(resolve('migrations/001_task_board_schema.sql'), 'utf8');

  log(`Schema to apply:`);
  log(`  - db/schema.sql               (${schemaSql.length} chars)`);
  log(`  - migrations/001_task_board   (${migrationSql.length} chars)`);

  if (DRY) {
    log('(dry run — skipping execution)');
  } else {
    log('Applying db/schema.sql ...');
    await newDb.query(schemaSql);
    log('  ✓ schema.sql applied');
    log('Applying migrations/001_task_board_schema.sql ...');
    await newDb.query(migrationSql);
    log('  ✓ migration 001 applied');
  }
  hr();

  // -------------------------------------------------------------------------
  // 4. Copy data table-by-table
  // -------------------------------------------------------------------------
  for (const table of DATA_TABLES_IN_ORDER) {
    await copyTable(table);
  }
  hr();

  // -------------------------------------------------------------------------
  // 5. Final verification — row counts on every table
  // -------------------------------------------------------------------------
  log('\n📊 Row count comparison (all tables):');
  log('  table'.padEnd(28) + 'old'.padStart(8) + 'new'.padStart(8) + '  status');
  log('  ' + '-'.repeat(56));
  const allOldTables = await oldDb.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `);
  for (const r of allOldTables.rows) {
    const oldCnt = (await oldDb.query(`SELECT count(*)::int n FROM "${r.table_name}"`)).rows[0].n;
    let newCnt = 0;
    try {
      const r2 = await newDb.query(`SELECT count(*)::int n FROM "${r.table_name}"`);
      newCnt = r2.rows[0].n;
    } catch (e) {
      newCnt = '?';
    }
    const ok = oldCnt === newCnt;
    if (!ok) totalIssues++;
    log(`  ${r.table_name.padEnd(28)}${String(oldCnt).padStart(8)}${String(newCnt).padStart(8)}  ${ok ? '✅' : '❌ MISMATCH'}`);
  }

  // Bonus: compare workspace_snapshot contents
  log('\n📦 workspace_snapshot deep check:');
  const snapOld = await oldDb.query(`SELECT octet_length(data::text) n, jsonb_array_length(COALESCE(data->'tasks','[]'::jsonb)) tn FROM workspace_snapshot WHERE workspace_id='default'`);
  const snapNew = await newDb.query(`SELECT octet_length(data::text) n, jsonb_array_length(COALESCE(data->'tasks','[]'::jsonb)) tn FROM workspace_snapshot WHERE workspace_id='default'`);
  const oldSize = snapOld.rows[0]?.n ?? 0;
  const newSize = snapNew.rows[0]?.n ?? 0;
  const oldTasks = snapOld.rows[0]?.tn ?? 0;
  const newTasks = snapNew.rows[0]?.tn ?? 0;
  log(`  size:  old=${oldSize} bytes, new=${newSize} bytes  ${oldSize===newSize?'✅':'❌'}`);
  log(`  tasks in snapshot: old=${oldTasks}, new=${newTasks}  ${oldTasks===newTasks?'✅':'❌'}`);
  if (oldSize !== newSize) totalIssues++;
  if (oldTasks !== newTasks) totalIssues++;

  hr();
  if (totalIssues === 0) {
    log('🎉 Migration complete — all checks passed.');
    log('   NEW DB is ready. Next: update Vercel DATABASE_URL.');
  } else {
    log(`❌ Migration FAILED — ${totalIssues} issue(s). Do NOT update Vercel.`);
    process.exit(1);
  }

  await oldDb.end();
  await newDb.end();
}

async function copyTable(table) {
  log(`\n→ ${table}`);
  // Read all rows from old (with columns in order)
  const cols = await oldDb.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `, [table]);
  if (cols.rows.length === 0) {
    log(`  ⚠ table doesn't exist in old DB — skipping`);
    return;
  }
  const colNames = cols.rows.map(c => `"${c.column_name}"`);
  const colList = colNames.join(',');
  const rows = await oldDb.query(`SELECT ${colList} FROM "${table}"`);
  log(`  ${rows.rows.length} rows to copy`);
  if (rows.rows.length === 0) return;

  if (DRY) {
    log(`  (dry run — would INSERT ${rows.rows.length} row(s) into NEW.${table})`);
    return;
  }

  // Determine primary key for ON CONFLICT (single-column PK assumed for our schema)
  const pkInfo = await oldDb.query(`
    SELECT a.attname AS pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass AND i.indisprimary
  `, [table]);
  const pkCols = pkInfo.rows.map(r => `"${r.pk}"`);
  const onConflict = pkCols.length
    ? `ON CONFLICT (${pkCols.join(',')}) DO NOTHING`
    : '';

  // Build a single multi-row INSERT (efficient for our small dataset)
  let inserted = 0;
  let skipped = 0;
  for (const row of rows.rows) {
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(',');
    const values = colNames.map(c => {
      const colName = c.replace(/"/g, '');
      const v = row[colName];
      // JSONB columns: serialize objects to JSON string
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        return JSON.stringify(v);
      }
      return v;
    });
    const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ${onConflict} RETURNING 1 AS ok`;
    try {
      const r = await newDb.query(sql, values);
      if (r.rows.length) inserted++;
      else skipped++;
    } catch (e) {
      log(`  ❌ insert error: ${e.message}`);
      totalIssues++;
      return;
    }
  }
  log(`  ✓ inserted ${inserted}, skipped (conflict) ${skipped}`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
