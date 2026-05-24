// Compare task counts + timestamps on both DBs.
// If user did anything via the new task API, NEW.tasks will diverge from OLD.tasks.
import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const oldDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

async function snap(label, pool) {
  const r = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM tasks WHERE workspace_id='default') AS tasks_n,
      (SELECT max(updated_at) FROM tasks WHERE workspace_id='default') AS tasks_latest_update,
      (SELECT max(version) FROM tasks WHERE workspace_id='default') AS tasks_max_version,
      (SELECT updated_at FROM workspace_snapshot WHERE workspace_id='default') AS snap_updated,
      (SELECT updated_by FROM workspace_snapshot WHERE workspace_id='default') AS snap_updated_by,
      (SELECT jsonb_array_length(COALESCE(data->'activityLog','[]'::jsonb)) FROM workspace_snapshot WHERE workspace_id='default') AS activity_n
  `);
  const x = r.rows[0];
  const tasksAge = x.tasks_latest_update ? Math.floor((Date.now() - new Date(x.tasks_latest_update).getTime()) / 1000) : null;
  const snapAge = x.snap_updated ? Math.floor((Date.now() - new Date(x.snap_updated).getTime()) / 1000) : null;
  console.log(`${label}:`);
  console.log(`  tasks count:        ${x.tasks_n}`);
  console.log(`  tasks latest:       ${x.tasks_latest_update?.toISOString?.() || '(null)'} ${tasksAge != null ? `(${tasksAge}s ago)` : ''}`);
  console.log(`  tasks max version:  ${x.tasks_max_version}`);
  console.log(`  snapshot updated:   ${x.snap_updated?.toISOString?.()} ${snapAge != null ? `(${snapAge}s ago)` : ''}`);
  console.log(`  snapshot updated_by:${x.snap_updated_by}`);
  console.log(`  activityLog entries:${x.activity_n}`);
  return { ...x, tasksAge, snapAge };
}

console.log(`🔍 Cutover status — ${new Date().toISOString()}\n`);
const o = await snap('OLD', oldDb);
console.log('');
const n = await snap('NEW', newDb);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (n.tasksAge != null && n.tasksAge < 120) {
  console.log(`✅ CUTOVER CONFIRMED — NEW DB received task write ${n.tasksAge}s ago`);
} else if (o.tasksAge != null && o.tasksAge < 120 && (n.tasksAge == null || n.tasksAge > o.tasksAge)) {
  console.log(`⚠️ STILL ON OLD — OLD DB received task write ${o.tasksAge}s ago, NEW did not`);
} else {
  console.log(`ℹ️ NO RECENT WRITES to either DB — please do a write action in the app (e.g. add a task, drag a task, edit a name)`);
}

await oldDb.end();
await newDb.end();
