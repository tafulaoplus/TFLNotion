// One-off migration runner — executes a single SQL file in a transaction.
// Usage: node scripts/run-migration.mjs migrations/001_task_board_schema.sql
// Reads DATABASE_URL from .env.local
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
// Load .env.local first (preferred), then .env as fallback
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env.local');
  process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

const filePath = resolve(sqlFile);
const sqlText = readFileSync(filePath, 'utf8');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log(`📄 File: ${filePath}`);
  console.log(`📏 Size: ${sqlText.length} chars`);

  console.log('\n🔄 Connecting to Neon…');
  const ping = await pool.query('SELECT NOW() AS now, current_database() AS db');
  console.log(`✅ Connected to "${ping.rows[0].db}" at ${ping.rows[0].now.toISOString()}`);

  console.log('\n🚀 Executing migration…');
  const t0 = Date.now();
  try {
    await pool.query(sqlText);
    const ms = Date.now() - t0;
    console.log(`✅ Migration executed successfully in ${ms} ms`);
  } catch (err) {
    console.error('❌ Migration FAILED');
    console.error(`   Code: ${err.code}`);
    console.error(`   Msg:  ${err.message}`);
    if (err.position) console.error(`   Pos:  char ${err.position}`);
    process.exit(1);
  }

  console.log('\n📊 Post-migration state:');
  const tables = await pool.query(`
    SELECT table_name,
           (SELECT count(*) FROM information_schema.columns
            WHERE table_name = t.table_name AND table_schema = 'public') AS cols
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  for (const r of tables.rows) {
    const cnt = await pool.query(`SELECT count(*)::int AS n FROM "${r.table_name}"`);
    console.log(`   ${r.table_name.padEnd(28)}  cols:${String(r.cols).padStart(3)}  rows:${String(cnt.rows[0].n).padStart(6)}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
