// Simulate the F5 race for stock saves to confirm the fix works.
// 1. Call POST /api/workspace/collection upsert (the new code path) for a test stock item.
// 2. Immediately GET /api/workspace and confirm the item is present.
// 3. Clean up via DELETE.
// 4. Confirm cleanup.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const HOST = process.env.TEST_HOST || 'https://tfl-notion-git-refactor-realtime-suntfl-s-projects.vercel.app';
// Note: using the preview URL — same Neon DB as production.
// You can override with: TEST_HOST=https://tfl-notion.vercel.app node scripts/test-stock-race.mjs

const testItem = {
  id: 'test-race-' + Date.now(),
  name: '[TEST-RACE] delete me',
  team: 'shared',
  unit: 'ชิ้น',
  totalQty: 1,
  availableQty: 1,
  photo: '',
  photoUrl: '',
  note: 'created by test-stock-race.mjs',
  createdAt: new Date().toISOString(),
};

let pass = 0, fail = 0;
function assert(c, label) {
  if (c) { console.log(`   ✅ ${label}`); pass++; }
  else   { console.log(`   ❌ ${label}`); fail++; }
}

console.log(`🧪 Testing stock save race fix against ${HOST}\n`);

// 1. Atomic upsert
console.log(`1. POST /api/workspace/collection (atomic upsert)`);
const upsertRes = await fetch(`${HOST}/api/workspace/collection`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collection: 'stockItems',
    op: 'upsert',
    record: testItem,
    updatedBy: 'test-race-script',
  }),
});
const upsertJson = await upsertRes.json();
assert(upsertRes.status === 200, `status 200 (got ${upsertRes.status})`);
assert(upsertJson.ok === true, 'ok=true');
console.log(`   → new array length: ${upsertJson.newLength}`);

// 2. Immediately fetch full snapshot to verify item is there
console.log(`\n2. GET /api/workspace (verify item present immediately)`);
const getRes = await fetch(`${HOST}/api/workspace`, { cache: 'no-store' });
const getJson = await getRes.json();
assert(getRes.status === 200, `status 200`);
const items = Array.isArray(getJson.stockItems) ? getJson.stockItems : [];
const found = items.find(x => String(x.id) === String(testItem.id));
assert(!!found, `test item appears in stockItems`);
if (found) console.log(`   → found: id=${found.id} name="${found.name}"`);

// 3. Clean up
console.log(`\n3. DELETE the test item`);
const delRes = await fetch(`${HOST}/api/workspace/collection`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collection: 'stockItems',
    op: 'delete',
    id: testItem.id,
    updatedBy: 'test-race-script',
  }),
});
const delJson = await delRes.json();
assert(delRes.status === 200, `status 200 (got ${delRes.status})`);
assert(delJson.ok === true, 'ok=true');

// 4. Verify gone
console.log(`\n4. GET again — verify item removed`);
const getRes2 = await fetch(`${HOST}/api/workspace`, { cache: 'no-store' });
const getJson2 = await getRes2.json();
const items2 = Array.isArray(getJson2.stockItems) ? getJson2.stockItems : [];
const found2 = items2.find(x => String(x.id) === String(testItem.id));
assert(!found2, `test item no longer in stockItems`);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Results: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
