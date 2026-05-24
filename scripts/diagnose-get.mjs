import { Pool } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEW });

// Reproduce what api/workspace.js GET does
const meta = await pool.query(`
  SELECT octet_length(data::text) AS size_bytes, updated_at, updated_by
  FROM workspace_snapshot
  WHERE workspace_id = 'default'
  LIMIT 1
`);
const sizeBytes = Number(meta.rows[0].size_bytes) || 0;
console.log(`snapshot size: ${sizeBytes} bytes (${(sizeBytes/1024).toFixed(1)} KB)`);
console.log(`>2MB threshold? ${sizeBytes > 2 * 1024 * 1024}`);

// Check the integer fields that could overflow
const counters = await pool.query(`
  SELECT
    data->'nextTaskId' AS next_task_id,
    data->'nextDocId' AS next_doc_id,
    data->'nextNotifId' AS next_notif_id,
    data->'nextSalesId' AS next_sales_id,
    data->'nextLotteryId' AS next_lottery_id,
    data->'nextAttendanceId' AS next_attendance_id,
    data->'nextLeaveId' AS next_leave_id,
    data->'nextGiveawayId' AS next_giveaway_id,
    data->'nextActivityId' AS next_activity_id,
    data->'nextHolidayId' AS next_holiday_id,
    data->'nextFbDraftId' AS next_fb_draft_id
  FROM workspace_snapshot WHERE workspace_id='default'
`);
console.log('\nCounters in snapshot:');
const POSTGRES_INT_MAX = 2147483647;
for (const [k, v] of Object.entries(counters.rows[0])) {
  const n = Number(v);
  const overflow = n > POSTGRES_INT_MAX;
  console.log(`  ${k}: ${v} ${overflow ? '🔴 OVERFLOW (>2.1B)' : '✓'}`);
}

// Test the slim mode query that's failing
try {
  console.log('\nTesting slim mode query...');
  const r = await pool.query(`
    SELECT (data->'nextTaskId')::int AS n FROM workspace_snapshot WHERE workspace_id='default'
  `);
  console.log(`  nextTaskId cast: ${r.rows[0].n} ✓`);
} catch (e) {
  console.log(`  ❌ FAILS: ${e.message}`);
}

await pool.end();
