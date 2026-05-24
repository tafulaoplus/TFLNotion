import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

const r = await pool.query(`
  SELECT jsonb_array_elements(COALESCE(data->'users','[]'::jsonb)) AS u
  FROM workspace_snapshot WHERE workspace_id='default'
`);

console.log('All users in DB:');
console.log('  count:', r.rows.length);
console.log('');
r.rows.forEach((row, i) => {
  const u = row.u;
  console.log(`  ${i+1}. name="${u.name}" id=${JSON.stringify(u.id)} role=${u.role} email=${u.email}`);
});

await pool.end();
