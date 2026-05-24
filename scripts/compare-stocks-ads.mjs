import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const oldDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

async function check(label, pool) {
  const r = await pool.query(`
    SELECT
      jsonb_array_length(COALESCE(data->'stockItems','[]'::jsonb)) AS stock_n,
      jsonb_array_length(COALESCE(data->'adLibCompetitors','[]'::jsonb)) AS ad_n,
      updated_at, updated_by
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  const x = r.rows[0];
  const age = Math.floor((Date.now() - new Date(x.updated_at).getTime())/1000);
  console.log(`${label}:`);
  console.log(`  stockItems:        ${x.stock_n}`);
  console.log(`  adLibCompetitors:  ${x.ad_n}`);
  console.log(`  snapshot updated:  ${age}s ago by ${x.updated_by}`);

  // Show actual ad lib entries
  const ads = await pool.query(`
    SELECT jsonb_array_elements(COALESCE(data->'adLibCompetitors','[]'::jsonb)) AS p
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  if (ads.rows.length) {
    console.log(`  ad entries:`);
    ads.rows.forEach((r,i) => console.log(`    ${i+1}. ${r.p.name||r.p.url||'(unnamed)'}`));
  }

  // Show actual stock items
  const stocks = await pool.query(`
    SELECT jsonb_array_elements(COALESCE(data->'stockItems','[]'::jsonb)) AS p
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  if (stocks.rows.length) {
    console.log(`  stock entries:`);
    stocks.rows.forEach((r,i) => console.log(`    ${i+1}. ${r.p.name||'(unnamed)'} (id=${r.p.id})`));
  }
}

await check('OLD', oldDb);
console.log('');
await check('NEW', newDb);

await oldDb.end();
await newDb.end();
