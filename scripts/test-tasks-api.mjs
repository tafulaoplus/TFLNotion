// Test the new /api/tasks endpoints by invoking handlers directly with mock req/res.
// Creates a tagged test task, PATCHes it, DELETEs it, then verifies cleanup.
// Safe to run against production — uses a clearly tagged name "[TEST-API]" so
// you can spot+delete it manually if anything goes wrong.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import listHandler from '../api/tasks.js';
import oneHandler from '../api/tasks/[id].js';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function mockReqRes(method, query = {}, body = null) {
  let statusCode = 200;
  let headers = {};
  let jsonBody = null;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (c) => { statusCode = c; return res; },
    json: (b) => { jsonBody = b; return res; },
    end: () => {},
  };
  const req = { method, query, body, headers: {} };
  return { req, res, get status() { return statusCode; }, get body() { return jsonBody; } };
}

async function call(handler, mock) {
  await handler(mock.req, mock.res);
  return { status: mock.status, body: mock.body };
}

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`   ✅ ${label}`); passed++; }
  else      { console.log(`   ❌ ${label}`); failed++; }
}

console.log('🧪 Testing /api/tasks endpoints (against production Neon)\n');

// ============================================================
// TEST 1: GET list — no since
// ============================================================
console.log('1. GET /api/tasks (full list)');
{
  const m = mockReqRes('GET', { workspace: 'default' });
  const { status, body } = await call(listHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body && body.ok === true, 'ok=true');
  assert(Array.isArray(body.tasks), 'tasks is array');
  assert(body.tasks.length === 52, `52 tasks (got ${body?.tasks?.length})`);
  assert(typeof body.now === 'string', 'now timestamp present');
}

// ============================================================
// TEST 2: GET list — with since (use very recent ISO → expect 0)
// ============================================================
console.log('\n2. GET /api/tasks?since=<now> (expect 0 changes)');
{
  const futureSince = new Date(Date.now() + 60_000).toISOString();
  const m = mockReqRes('GET', { workspace: 'default', since: futureSince });
  const { status, body } = await call(listHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body.tasks.length === 0, `0 changed tasks (got ${body.tasks?.length})`);
  assert(body.deletedIds.length === 0, `0 deleted ids (got ${body.deletedIds?.length})`);
}

// ============================================================
// TEST 3: POST create
// ============================================================
console.log('\n3. POST /api/tasks (create test task)');
const testName = `[TEST-API] ${new Date().toISOString()}`;
let createdId = null;
let createdVersion = null;
{
  const m = mockReqRes('POST', { workspace: 'default' }, {
    name: testName,
    emoji: '🧪',
    desc: 'created by test-tasks-api.mjs',
    priority: 'low',
    status: 'todo',
    assignees: [],
  });
  const { status, body } = await call(listHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body?.task?.id != null, 'task.id returned');
  assert(body?.task?.name === testName, 'name matches');
  assert(body?.task?.version === 1, 'version starts at 1');
  createdId = body?.task?.id;
  createdVersion = body?.task?.version;
  console.log(`   → created id=${createdId} v${createdVersion}`);
}

// ============================================================
// TEST 4: Verify dual-write to snapshot worked
// ============================================================
console.log('\n4. Verify dual-write: workspace_snapshot.data->tasks includes new task');
{
  const r = await pool.query(`
    SELECT count(*)::int AS n
    FROM workspace_snapshot,
         jsonb_array_elements(data->'tasks') elem
    WHERE workspace_id='default' AND (elem->>'id')::bigint = $1
  `, [createdId]);
  assert(r.rows[0].n === 1, `task ${createdId} appears in snapshot.data->'tasks'`);
}

// ============================================================
// TEST 5: GET one
// ============================================================
console.log('\n5. GET /api/tasks/:id');
{
  const m = mockReqRes('GET', { id: String(createdId), workspace: 'default' });
  const { status, body } = await call(oneHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body?.task?.id === createdId, 'id matches');
  assert(body?.task?.emoji === '🧪', 'emoji matches');
}

// ============================================================
// TEST 6: PATCH — happy path (correct version)
// ============================================================
console.log('\n6. PATCH /api/tasks/:id (correct version → success)');
{
  const m = mockReqRes('PATCH',
    { id: String(createdId), workspace: 'default' },
    { version: createdVersion, status: 'inprogress', priority: 'mid' }
  );
  const { status, body } = await call(oneHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body?.task?.status === 'inprogress', 'status updated');
  assert(body?.task?.priority === 'mid', 'priority updated');
  assert(body?.task?.version === createdVersion + 1, `version bumped to ${createdVersion + 1}`);
  createdVersion = body.task.version;
}

// ============================================================
// TEST 7: PATCH — stale version (should 409)
// ============================================================
console.log('\n7. PATCH with stale version (expect 409 conflict)');
{
  const m = mockReqRes('PATCH',
    { id: String(createdId), workspace: 'default' },
    { version: 1, status: 'done' }  // version 1 is stale (now at 2)
  );
  const { status, body } = await call(oneHandler, m);
  assert(status === 409, `status 409 (got ${status})`);
  assert(body?.ok === false, 'ok=false');
  assert(body?.serverVersion === createdVersion, `serverVersion=${createdVersion}`);
  assert(body?.task != null, 'returns current task for client rebase');
}

// ============================================================
// TEST 8: DELETE (soft delete)
// ============================================================
console.log('\n8. DELETE /api/tasks/:id (soft delete)');
{
  const m = mockReqRes('DELETE', { id: String(createdId), workspace: 'default' });
  const { status, body } = await call(oneHandler, m);
  assert(status === 200, `status 200 (got ${status})`);
  assert(body?.ok === true, 'ok=true');
  assert(body?.deletedAt != null, 'deletedAt returned');
}

// ============================================================
// TEST 9: After delete — GET should 404
// ============================================================
console.log('\n9. GET after delete (expect 404)');
{
  const m = mockReqRes('GET', { id: String(createdId), workspace: 'default' });
  const { status } = await call(oneHandler, m);
  assert(status === 404, `status 404 (got ${status})`);
}

// ============================================================
// TEST 10: After delete — snapshot no longer contains it
// ============================================================
console.log('\n10. Verify snapshot no longer contains the deleted task');
{
  const r = await pool.query(`
    SELECT count(*)::int AS n
    FROM workspace_snapshot,
         jsonb_array_elements(data->'tasks') elem
    WHERE workspace_id='default' AND (elem->>'id')::bigint = $1
  `, [createdId]);
  assert(r.rows[0].n === 0, `task ${createdId} removed from snapshot.data->'tasks'`);
}

// ============================================================
// TEST 11: GET ?since used right after delete — should include deletedId
// ============================================================
console.log('\n11. GET ?since (just before delete) should report deletedId');
{
  const since = new Date(Date.now() - 30_000).toISOString();
  const m = mockReqRes('GET', { workspace: 'default', since });
  const { status, body } = await call(listHandler, m);
  assert(status === 200, `status 200`);
  assert(Array.isArray(body.deletedIds), 'deletedIds present');
  assert(body.deletedIds.includes(createdId), `deletedIds includes ${createdId}`);
}

// ============================================================
// TEST 12: Final cleanup — verify test task gone from active list
// ============================================================
console.log('\n12. Final check: total active tasks back to 52');
{
  const m = mockReqRes('GET', { workspace: 'default' });
  const { body } = await call(listHandler, m);
  const stillThere = body.tasks.find(t => t.id === createdId);
  assert(!stillThere, 'test task not in active list');
  assert(body.tasks.length === 52, `52 active tasks (got ${body.tasks.length})`);
}

// ============================================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

await pool.end();
process.exit(failed > 0 ? 1 : 0);
