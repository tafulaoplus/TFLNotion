// Inspect the EXISTING tasks table (read-only)
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('🔍 Inspecting existing schema (READ-ONLY)…\n');

  const exists = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='tasks'
    ) AS exists
  `);
  console.log(`tasks table exists: ${exists.rows[0].exists}`);

  if (exists.rows[0].exists) {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tasks'
      ORDER BY ordinal_position
    `);
    console.log('\nColumns in existing tasks table:');
    for (const c of cols.rows) {
      console.log(`  ${c.column_name.padEnd(20)} ${c.data_type.padEnd(28)} ${c.is_nullable==='NO'?'NOT NULL':'NULL'}  default: ${c.column_default || '-'}`);
    }

    const count = await pool.query(`SELECT count(*)::int AS n FROM tasks`);
    console.log(`\nRow count in existing tasks table: ${count.rows[0].n}`);

    if (count.rows[0].n > 0) {
      const sample = await pool.query(`SELECT id, name, status FROM tasks ORDER BY id DESC LIMIT 5`);
      console.log('\nSample rows:');
      for (const r of sample.rows) {
        console.log(`  id=${r.id}  status=${r.status}  name=${(r.name||'').slice(0,40)}`);
      }
    }
  }

  // Also check workspace_snapshot tasks count for comparison
  const snap = await pool.query(`
    SELECT jsonb_array_length(COALESCE(data->'tasks', '[]'::jsonb)) AS n
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  console.log(`\nworkspace_snapshot.data->'tasks' length: ${snap.rows[0]?.n ?? 0}`);

  // Check all related new tables I tried to create
  const newTables = ['task_assignees', 'task_checklists', 'task_comments'];
  for (const t of newTables) {
    const r = await pool.query(`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ex
    `, [t]);
    console.log(`${t} exists: ${r.rows[0].ex}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
