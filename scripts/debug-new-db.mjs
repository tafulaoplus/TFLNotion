import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const url = process.env.DATABASE_URL_NEW;
console.log('URL set:', !!url);
console.log('URL length:', url?.length);
console.log('URL preview:', url?.slice(0, 30) + '...' + url?.slice(-40));

const pool = new Pool({ connectionString: url });
try {
  const r = await pool.query('SELECT 1 AS ok');
  console.log('✅ Query OK:', r.rows);
} catch (e) {
  console.log('Error name:', e.name);
  console.log('Error code:', e.code);
  console.log('Error message:', e.message);
  console.log('Error stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  if (e.cause) console.log('Cause:', e.cause);
} finally {
  await pool.end();
}
