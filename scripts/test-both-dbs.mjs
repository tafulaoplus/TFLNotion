// Quick connectivity test for old + new Neon DBs
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function ping(label, url) {
  if (!url) { console.log(`❌ ${label}: env var not set`); return; }
  const pool = new Pool({ connectionString: url });
  try {
    const r = await pool.query('SELECT current_database() AS db, version() AS v, NOW() AS now');
    const host = url.match(/@([^/]+)/)?.[1] || '?';
    console.log(`✅ ${label}`);
    console.log(`   host:    ${host}`);
    console.log(`   db:      ${r.rows[0].db}`);
    console.log(`   version: ${r.rows[0].v.split(',')[0]}`);
    console.log(`   server time: ${r.rows[0].now.toISOString()}`);
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
  } finally {
    await pool.end();
  }
}

console.log('🔌 Testing connections to both Neon projects...\n');
await ping('OLD (DATABASE_URL)',     process.env.DATABASE_URL);
console.log('');
await ping('NEW (DATABASE_URL_NEW)', process.env.DATABASE_URL_NEW);
