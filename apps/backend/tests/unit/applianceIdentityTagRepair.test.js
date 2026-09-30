const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

require('ts-node/register');

// One-time repair of appliance identity tags erased by older edits (FRD v1.174).

let existingItem = null;
let updateManyCount = 1;
const updateManyCalls = [];
const emitted = [];
const txMock = { inventoryItem: { updateMany: async (args) => { updateManyCalls.push(args); return { count: updateManyCount }; } } };
const prismaMock = {
  inventoryItem: { findFirst: async () => existingItem },
  $transaction: async (callback) => callback(txMock),
};
function mockModule(relativePath, exports) {
  const modulePath = require.resolve(relativePath);
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}
mockModule('../../src/lib/prisma.ts', { prisma: prismaMock });
mockModule('../../src/propertyChanges/propertyChange.service.ts', { emitPropertyChangeWithTransaction: async (tx, input) => { emitted.push(input); return { change: { id: 'c1' }, deduped: false }; } });
mockModule('../../src/services/analytics/index.ts', {
  analyticsEmitter: { track: () => undefined },
  AnalyticsEvent: { SYSTEM_ADDED: 'SYSTEM_ADDED', INVENTORY_ITEM_CREATED: 'INVENTORY_ITEM_CREATED' },
  AnalyticsModule: { PROPERTY: 'PROPERTY', INVENTORY: 'INVENTORY' },
  AnalyticsFeature: { PROPERTY_PROFILE: 'PROPERTY_PROFILE', INVENTORY_ITEM: 'INVENTORY_ITEM' },
});
mockModule('../../src/services/homeEvents/homeEvents.autogen.ts', { HomeEventsAutoGen: { onInventoryItemCreated: async () => undefined } });
mockModule('../../src/services/applianceOracle.service.ts', { applianceOracleService: { recalculateLifespan: async () => undefined } });
mockModule('../../src/services/maintenancePrediction.service.ts', { generateForecast: async () => undefined });
mockModule('../../src/services/JobQueue.service.ts', { __esModule: true, default: { enqueueHomeDigitalTwinRefresh: async () => undefined } });
mockModule('../../src/services/decisionPlatform/decisionThreadService.ts', { markThreadStaleOnFactCorrection: async () => undefined });

const { InventoryService } = require('../../src/services/inventory.service.ts');
const { planApplianceIdentityTags } = require('../../src/services/majorAppliance.util.ts');
const service = new InventoryService();

const HASH = 'property_appliance::FRIDGE';
const VERSION = new Date('2026-09-01T00:00:00.000Z');
const row = (overrides = {}) => ({ id: 'item-1', category: 'APPLIANCE', tags: [], sourceHash: HASH, updatedAt: VERSION, ...overrides });
function reset(item, count = 1) { existingItem = item; updateManyCount = count; updateManyCalls.length = 0; emitted.length = 0; }

test('the plan restores only the missing identity tags, in place, and never removes anything', () => {
  assert.deepEqual(planApplianceIdentityTags(row({ tags: [] })), { action: 'RESTORE', type: 'FRIDGE', tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'], added: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] });
  assert.deepEqual(planApplianceIdentityTags(row({ tags: ['IMPORTED_BATCH_7', 'PROPERTY_APPLIANCE'] })), { action: 'RESTORE', type: 'FRIDGE', tags: ['IMPORTED_BATCH_7', 'PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'], added: ['APPLIANCE_TYPE:FRIDGE'] });
  assert.deepEqual(planApplianceIdentityTags(row({ tags: ['APPLIANCE_TYPE:FRIDGE', 'PROPERTY_APPLIANCE'] })), { action: 'OK', type: 'FRIDGE' });
});

test('the plan skips what it cannot safely repair and reports a contradicting type tag instead of choosing', () => {
  assert.deepEqual(planApplianceIdentityTags(row({ sourceHash: null })), { action: 'SKIP', reason: 'NO_CANONICAL_HASH' });
  assert.deepEqual(planApplianceIdentityTags(row({ sourceHash: 'property_appliance::' })), { action: 'SKIP', reason: 'NO_CANONICAL_HASH' });
  assert.deepEqual(planApplianceIdentityTags(row({ sourceHash: 'something::else' })), { action: 'SKIP', reason: 'NO_CANONICAL_HASH' });
  assert.deepEqual(planApplianceIdentityTags(row({ category: 'HVAC' })), { action: 'SKIP', reason: 'NOT_APPLIANCE' });
  // A second, different type tag (an older rename could leave one): never resolved by the repair.
  assert.deepEqual(planApplianceIdentityTags(row({ tags: ['APPLIANCE_TYPE:FREEZER'] })), { action: 'CONFLICT', type: 'FRIDGE', conflictingTypeTags: ['APPLIANCE_TYPE:FREEZER'] });
  assert.equal(planApplianceIdentityTags(row({ tags: ['APPLIANCE_TYPE:FRIDGE', 'APPLIANCE_TYPE:DRYER'] })).action, 'CONFLICT', 'a correct tag beside a wrong one is still a conflict');
});

test('restoring writes only the tags, only for the row version it read, and emits the standard change signal', async () => {
  reset(row({ tags: ['KEEP_ME'] }));
  const result = await service.restoreApplianceIdentityTags('property-1', 'item-1');
  assert.deepEqual(result, { status: 'RESTORED', type: 'FRIDGE', added: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] });
  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0].where, { id: 'item-1', propertyId: 'property-1', updatedAt: VERSION }, 'guarded against a concurrent edit');
  assert.deepEqual(updateManyCalls[0].data, { tags: ['KEEP_ME', 'PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] }, 'nothing but tags, and nothing removed');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].sourceEntityId, 'item-1');
  assert.deepEqual(emitted[0].changedFactKeys, ['inventory.items']);
  assert.match(emitted[0].sourceRevision, /^revised:/);
});

test('a legacy roomless appliance is repaired (the repair does not go through updateItem\'s room requirement)', async () => {
  reset(row({ tags: [] }));
  assert.equal(existingItem.roomId, undefined);
  assert.equal((await service.restoreApplianceIdentityTags('property-1', 'item-1')).status, 'RESTORED');
});

test('nothing is written or emitted for an already-correct, unclassified, non-appliance, conflicted or missing item', async () => {
  for (const [item, status] of [
    [row({ tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] }), 'UNCHANGED'],
    [row({ sourceHash: null }), 'SKIPPED'],
    [row({ category: 'HVAC' }), 'SKIPPED'],
    [row({ tags: ['APPLIANCE_TYPE:FREEZER'] }), 'CONFLICT'],
    [null, 'NOT_FOUND'],
  ]) {
    reset(item);
    assert.equal((await service.restoreApplianceIdentityTags('property-1', 'item-1')).status, status);
    assert.equal(updateManyCalls.length, 0, status);
    assert.equal(emitted.length, 0, status);
  }
});

test('a concurrent edit is skipped, not overwritten, and emits nothing', async () => {
  reset(row({ tags: [] }), 0);
  assert.deepEqual(await service.restoreApplianceIdentityTags('property-1', 'item-1'), { status: 'CHANGED_CONCURRENTLY' });
  assert.equal(emitted.length, 0);
});

test('it is idempotent: a second run on the repaired item finds nothing to do', async () => {
  reset(row({ tags: [] }));
  await service.restoreApplianceIdentityTags('property-1', 'item-1');
  reset(row({ tags: updateManyCalls[0]?.data.tags ?? ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:FRIDGE'] }));
  assert.equal((await service.restoreApplianceIdentityTags('property-1', 'item-1')).status, 'UNCHANGED');
});

// The script itself, executed with only Prisma and the service stubbed.
const backend = resolve(__dirname, '../..');
function runScript(args, fixtures, restoreResult) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', resolve(backend, 'tests/helpers/restoreApplianceTagsPreload.js'), 'scripts/restore-appliance-identity-tags.ts', ...args], {
    cwd: backend, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', FIXTURE_ITEMS: JSON.stringify(fixtures), ...(restoreResult ? { RESTORE_RESULT: JSON.stringify(restoreResult) } : {}) },
  });
  return { ...result, out: `${result.stdout}${result.stderr}` };
}
// Rows shaped like the script's own select (the stub returns these regardless, so a test pins the select separately).
const fixtures = [
  { id: 'a', propertyId: 'p1', name: 'Fridge', category: 'APPLIANCE', sourceHash: HASH, tags: [] },
  { id: 'b', propertyId: 'p1', name: 'Dishwasher', category: 'APPLIANCE', sourceHash: 'property_appliance::DISHWASHER', tags: ['PROPERTY_APPLIANCE', 'APPLIANCE_TYPE:DISHWASHER'] },
  { id: 'c', propertyId: 'p2', name: 'Basement freezer', category: 'APPLIANCE', sourceHash: HASH, tags: ['APPLIANCE_TYPE:FREEZER'] },
  { id: 'd', propertyId: 'p2', name: 'Dryer', category: 'APPLIANCE', sourceHash: 'property_appliance::DRYER', tags: ['PROPERTY_APPLIANCE'] },
];

test('the script selects every field the plan reads -- without `category` every row is skipped and nothing is repaired', () => {
  const { out } = runScript([], fixtures);
  const select = JSON.parse(out.match(/FINDMANY_SELECT (\{.*\})/)[1]);
  for (const field of ['id', 'propertyId', 'name', 'category', 'sourceHash', 'tags']) assert.equal(select[field], true, field);
});

test('script dry run: reports counts, samples and conflicts, queries only classified appliances, and writes nothing', () => {
  const { out, status } = runScript([], fixtures);
  assert.equal(status, 0, out);
  assert.match(out, /DRY RUN/);
  assert.match(out, /"category":"APPLIANCE"/);
  assert.match(out, /"startsWith":"property_appliance::"/);
  assert.match(out, /Classified appliances found \(canonical hash present\): 4/);
  assert.match(out, /already correct : 1/);
  assert.match(out, /to restore\s+: 2\s+\(across 2 properties\)/);
  assert.match(out, /conflicts\s+: 1/);
  assert.match(out, /\ba\s+property=p1\s+"Fridge"\s+type=FRIDGE\s+add: PROPERTY_APPLIANCE, APPLIANCE_TYPE:FRIDGE/);
  assert.match(out, /CONFLICTS[^\n]*\n\s+c\s+property=p2\s+"Basement freezer"\s+hash type=FRIDGE\s+conflicting tag\(s\): APPLIANCE_TYPE:FREEZER/);
  assert.doesNotMatch(out, /RESTORE_CALL/, 'a dry run must never call the writer');
  assert.match(out, /Dry run complete — no changes written/);
});

test('script --property limits the query, and --apply restores exactly the planned items and never the conflict', () => {
  const scoped = runScript(['--property=p2'], fixtures);
  assert.match(scoped.out, /"propertyId":"p2"/);

  const { out, status } = runScript(['--apply'], fixtures);
  assert.equal(status, 0, out);
  assert.match(out, /APPLY MODE/);
  const calls = [...out.matchAll(/RESTORE_CALL (\S+) (\S+)/g)].map((match) => `${match[1]}:${match[2]}`);
  assert.deepEqual(calls, ['p1:a', 'p2:d'], 'only the two restorable items; not the OK item and not the conflict');
  assert.match(out, /RESTORED\s+2/);
});

test('script --apply surfaces items edited mid-run so they can be re-run, and reports writer errors without stopping', () => {
  const concurrent = runScript(['--apply'], fixtures, { status: 'CHANGED_CONCURRENTLY' });
  assert.match(concurrent.out, /CHANGED_CONCURRENTLY\s+2/);
  assert.match(concurrent.out, /2 item\(s\) were edited while the script ran and were skipped, not overwritten\. Re-run to pick them up\./);
});

// The pgAdmin SQL twin cannot be executed here (no database), so the invariants a typo would break are pinned.
test('the SQL twin uses the same constants and rules as the plan, and is a dry run until COMMIT is typed', () => {
  const { readFileSync } = require('node:fs');
  const { PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX, APPLIANCE_TYPE_TAG_PREFIX, PROPERTY_APPLIANCE_TAG } = require('../../src/services/majorAppliance.util.ts');
  const sql = readFileSync(resolve(backend, 'scripts/2026-09-30-restore-appliance-identity-tags.sql'), 'utf8');
  const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

  // The literal lengths in left()/substring() must equal the real prefixes.
  assert.equal(PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX.length, 20);
  assert.equal(APPLIANCE_TYPE_TAG_PREFIX.length, 15);
  assert.ok(code.includes(`left(i."sourceHash", 20) = '${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}'`));
  assert.ok(code.includes('substring(i."sourceHash" from 21)'));
  assert.ok(code.includes(`left(t, 15) = '${APPLIANCE_TYPE_TAG_PREFIX}'`));
  assert.ok(code.includes(`'${PROPERTY_APPLIANCE_TAG}'`));
  // '_' is a LIKE wildcard, so the hash prefix must never be matched with LIKE.
  assert.doesNotMatch(code, /LIKE\s+'property_appliance/i);

  // Only APPLIANCE rows with a non-empty type; conflicts excluded from the write; only tags and updatedAt are set.
  const update = code.slice(code.indexOf('UPDATE inventory_items'), code.indexOf('ROLLBACK;'));
  assert.ok(update.includes("i.category = 'APPLIANCE'") && update.includes('length(i."sourceHash") > 20'));
  assert.match(update, /AND NOT EXISTS \(\s*SELECT 1 FROM unnest\(COALESCE\(i\.tags, ARRAY\[\]::text\[\]\)\) t\s*WHERE left\(t, 15\) = 'APPLIANCE_TYPE:' AND t <> /);
  assert.deepEqual([...update.matchAll(/^\s{2}("?\w+"?) = /gm)].map((match) => match[1]), ['tags', '"updatedAt"']);

  // A dry run until someone deliberately edits it: ROLLBACK is live, COMMIT appears only in comments.
  assert.match(code, /\bBEGIN;/);
  assert.match(code, /\bROLLBACK;/);
  assert.doesNotMatch(code, /^\s*COMMIT;/m);
});
