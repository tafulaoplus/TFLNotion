// Look for OAuth Client Secret across both DBs + all JSONB fields
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const oldDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

async function search(label, pool) {
  console.log(`\n━━━━━ ${label} ━━━━━`);

  // Check googleDriveSettings
  const drive = await pool.query(`
    SELECT data->'googleDriveSettings' AS gd
    FROM workspace_snapshot WHERE workspace_id='default'
  `);
  const gd = drive.rows[0]?.gd;
  console.log('googleDriveSettings:');
  if (gd) {
    for (const [k, v] of Object.entries(gd)) {
      const displayV = typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '...' : v;
      console.log(`  ${k}: ${displayV}`);
    }
  } else {
    console.log('  (not found)');
  }

  // Scan ALL top-level data keys for any field containing "secret" or "client"
  const all = await pool.query(`SELECT data FROM workspace_snapshot WHERE workspace_id='default'`);
  const root = all.rows[0]?.data || {};
  console.log('\nKeys with "secret"/"client"/"oauth"/"token" in name:');
  function walk(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${k}` : k;
      const klow = k.toLowerCase();
      if (klow.includes('secret') || klow.includes('clientid') || klow.includes('client_id') ||
          klow.includes('clientsecret') || klow.includes('client_secret') ||
          (klow.includes('oauth') && typeof v === 'string')) {
        const dv = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : JSON.stringify(v);
        console.log(`  ${fullPath} = ${dv}`);
      }
      // Recurse one level into objects (not arrays)
      if (path.split('.').length < 2 && v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v, fullPath);
      }
    }
  }
  walk(root);
}

await search('OLD DB', oldDb);
await search('NEW DB', newDb);

await oldDb.end();
await newDb.end();
