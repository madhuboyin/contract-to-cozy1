// FR-GATE-1/2: every message-routable operation is declared in the answer-contract manifest; the manifest tracks the handler sources (a new or removed block id changes it and must be reviewed); the number of operations that
// rest on a source scan alone can only go down. A scan never counts as FR-GATE-2 evidence, which is why those operations are listed as SOURCE_SCAN_ONLY rather than passed.
const test = require('node:test'); const assert = require('node:assert/strict'); const { spawnSync } = require('node:child_process'); const path = require('node:path');
require('ts-node/register/transpile-only');
const manifest = require('../../src/services/ask/answerContract/answerContractManifest.json');
const { ASK_OPERATION_DEFINITIONS, isAskMessageRoutableOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { blockIds } = require('../../scripts/lib/askBlockIdScan');

/** Operations whose answer is only evidenced by a source scan. Lower this number when an operation gains a variant manifest with real-path or typed-builder evidence; it must never rise. */
const MAX_SOURCE_SCAN_ONLY = 109;

test('every message-routable operation is in the manifest, and nothing else is', () => {
  const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => isAskMessageRoutableOperation(d.operationId)).map((d) => d.operationId).sort();
  assert.deepEqual(manifest.operations.map((o) => o.operationId).sort(), routable);
  assert.equal(manifest.operationCount, routable.length);
  for (const o of manifest.operations) assert.ok(o.handlerFiles.length > 0, `${o.operationId} has no handler registered for ${o.adapterKey}`);
});
test('the committed manifest is current (run scripts/ask-answer-contract-manifest.js --write after changing a handler block id)', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '../../scripts/ask-answer-contract-manifest.js')], { env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
test('evidence tiers: scan-only operations cannot increase; every typed contract names a file that still defines it', () => {
  const scanOnly = manifest.operations.filter((o) => o.evidenceTier === 'SOURCE_SCAN_ONLY').length;
  assert.ok(scanOnly <= MAX_SOURCE_SCAN_ONLY, `${scanOnly} operations are scan-only; the ratchet is ${MAX_SOURCE_SCAN_ONLY}`);
  for (const o of manifest.operations.filter((x) => x.typedContract)) assert.ok(o.contract && o.contract.file, `${o.operationId}: contract ${o.typedContract} not found`);
  assert.ok(manifest.operations.every((o) => ['EXCLUSIVE_FILE', 'SHARED_FILE'].includes(o.attribution)));
});
test('block id scan reads block-shaped objects only (actions, filters and options are not blocks)', () => {
  assert.deepEqual(blockIds("{ type: 'SUMMARY', id: 'a-b', title: 'x' } { id: 'c-d', type: 'EVIDENCE' } { id: 'act-1', label: 'Go' } { type: 'TABLE', id: `row-${n}` }"), ['EVIDENCE:c-d', 'SUMMARY:a-b', 'TABLE:row-*']);
});
