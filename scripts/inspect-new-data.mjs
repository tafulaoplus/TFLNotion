// Read what's in NEW DB right now — stock items + ad library competitors + recent tasks
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

console.log('🔍 What\'s in NEW DB right now\n');

// Stock items
const stock = await newDb.query(`
  SELECT jsonb_array_elements(COALESCE(data->'stockItems','[]'::jsonb)) AS item
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log(`📦 STOCK ITEMS (${stock.rows.length}):`);
stock.rows.forEach((r, i) => {
  const it = r.item;
  console.log(`  ${i+1}. ${it.name} — team:${it.team} qty:${it.availableQty}/${it.totalQty} ${it.unit||'ชิ้น'}`);
  console.log(`     id=${it.id}`);
  if (it.createdAt) console.log(`     created=${it.createdAt}`);
});

// Stock checkouts
const co = await newDb.query(`
  SELECT jsonb_array_elements(COALESCE(data->'stockCheckouts','[]'::jsonb)) AS c
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log(`\n🚚 STOCK CHECKOUTS (${co.rows.length}):`);
co.rows.forEach((r, i) => {
  const c = r.c;
  console.log(`  ${i+1}. ${c.id} — ${c.eventName||'(no name)'} status:${c.status}`);
});

// Ad library competitors
const ads = await newDb.query(`
  SELECT jsonb_array_elements(COALESCE(data->'adLibCompetitors','[]'::jsonb)) AS p
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log(`\n📢 AD LIBRARY COMPETITORS (${ads.rows.length}):`);
ads.rows.forEach((r, i) => {
  const p = r.p;
  console.log(`  ${i+1}. ${p.name||'(no name)'}`);
  if (p.url) console.log(`     URL: ${p.url}`);
  if (p.pic) console.log(`     pic: ${p.pic.slice(0,60)}...`);
  if (p.adUrl) console.log(`     ad lib: ${p.adUrl.slice(0,60)}...`);
  if (p.note) console.log(`     note: ${p.note}`);
});

// Recent tasks (from the new tasks table, not snapshot)
const recentTasks = await newDb.query(`
  SELECT id, name, status, version, created_at, updated_at
  FROM tasks
  WHERE workspace_id='default' AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 5
`);
console.log(`\n📝 5 NEWEST TASKS (from tasks table):`);
recentTasks.rows.forEach((t, i) => {
  const created = new Date(t.created_at);
  const ageMin = Math.floor((Date.now() - created.getTime()) / 60000);
  console.log(`  ${i+1}. "${t.name}" — status:${t.status} v${t.version}`);
  console.log(`     id=${t.id} | created ${ageMin}min ago`);
});

await newDb.end();
