const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { DATA_POINT_DEFINITIONS } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');

// BICC-1A.1 / BICC-OPS-004: the reach inventory is generated from the registries and is internally consistent.
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reach-')), 'inventory.json');
const run = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/ask-bicc-reach-inventory.js'), `--json=${out}`], { encoding: 'utf8' });
const inventory = run.status === 0 ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;

test('the inventory script runs offline and succeeds', () => {
  assert.equal(run.status, 0, run.stderr);
  assert.equal(inventory.scope, 'DETERMINISTIC_REACH_EVIDENCE_NO_GATE_CLAIMED');
});

test('the denominators equal the registries, with no hand-counted totals', () => {
  assert.equal(inventory.operations.total, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.equal(inventory.dataPoints.total, DATA_POINT_DEFINITIONS.length);
  assert.equal(Object.values(inventory.operations.byRoute).reduce((a, b) => a + b, 0), inventory.operations.total);
  assert.equal(Object.values(inventory.dataPoints.byStatus).reduce((a, b) => a + b, 0), inventory.dataPoints.total);
});

test('identifiers are unique and every row is classified', () => {
  assert.equal(inventory.dataPoints.duplicateIds, 0);
  assert.equal(new Set(inventory.operations.rows.map((row) => row.id)).size, inventory.operations.total);
  for (const row of inventory.operations.rows) assert.ok(row.route, row.id);
  for (const row of inventory.dataPoints.rows) assert.ok(row.status, row.id);
});

test('the missing-target list is exactly the unreachable or colliding data points', () => {
  const expected = inventory.dataPoints.rows.filter((row) => row.status !== 'REACHABLE').map((row) => row.id).sort();
  assert.deepEqual(inventory.missingTargets.map((row) => row.id).sort(), expected);
  for (const row of inventory.missingTargets) assert.ok(['MISSING_ALIAS_OR_CUE', 'ALIAS_COLLISION'].includes(row.gap));
});

test('no operation is reported as a certified fast path while no certificate exists', () => {
  assert.equal(inventory.operations.byRoute.CERTIFIED_FAST_PATH ?? 0, inventory.operations.rows.filter((row) => row.fastPathCertified > 0 && row.route === 'CERTIFIED_FAST_PATH').length);
});
