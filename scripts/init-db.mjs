// Initialize Neon Postgres schema
// Usage: npm run init-db
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Add it to .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  console.log('🔄 Connecting to Neon...');
  const test = await pool.query('SELECT NOW() AS now, current_database() AS db');
  console.log(`✅ Connected to "${test.rows[0].db}" at ${test.rows[0].now}`);

  console.log('\n🚀 Running schema.sql...');
  await pool.query(schema);
  console.log('✅ Schema applied successfully');

  console.log('\n📊 Tables:');
  const tables = await pool.query(`
    SELECT table_name, (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_name = t.table_name AND table_schema = 'public'
    ) AS column_count
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  for (const t of tables.rows) {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS c FROM "${t.table_name}"`);
    console.log(`   ${t.table_name.padEnd(22)} ${String(countResult.rows[0].c).padStart(6)} rows  · ${t.column_count} cols`);
  }
  console.log('\n🎉 Done!');
}

main()
  .catch((err) => { console.error('❌ Error:', err.message); process.exit(1); })
  .finally(() => pool.end());
