// FR-GATE-1/2: every message-routable operation is declared in the answer-contract manifest; the manifest tracks the handler sources (a new or removed block id changes it and must be reviewed); the number of operations that
// rest on a source scan alone can only go down. A scan never counts as FR-GATE-2 evidence, which is why those operations are listed as SOURCE_SCAN_ONLY rather than passed.
const test = require('node:test'); const assert = require('node:assert/strict'); const { spawnSync } = require('node:child_process'); const path = require('node:path');
require('ts-node/register/transpile-only');
const manifest = require('../../src/services/ask/answerContract/answerContractManifest.json');
const { ASK_OPERATION_DEFINITIONS, isAskMessageRoutableOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { blockIds } = require('../../scripts/lib/askBlockIdScan');
const { matchesOperationAnswerContract, operationAnswerContractCoverage } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');

/** Operations whose answer is only evidenced by a source scan. Lower this number when an operation gains a variant manifest with real-path or typed-builder evidence; it must never rise. */
const MAX_SOURCE_SCAN_ONLY = 108;
/** Typed contracts no test runs against their handler. Like the scan-only count this can only fall, and only because an operation gained real execution evidence (FR-GATE-2), never by relabelling. */
const MAX_TYPED_UNTESTED = 11;

test('every message-routable operation is in the manifest, and nothing else is', () => {
  const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => isAskMessageRoutableOperation(d.operationId)).map((d) => d.operationId).sort();
  assert.deepEqual(manifest.operations.map((o) => o.operationId).sort(), routable);
  assert.equal(manifest.operationCount, routable.length);
  for (const o of manifest.operations) assert.ok(o.handlerFiles.length > 0, `${o.operationId} has no handler registered for ${o.adapterKey}`);
});
test('runtime consumes only code-path-certified contracts and rejects scan-only or undeclared variants', () => {
  const certified = manifest.operations.filter((operation) => operation.evidenceTier === 'CODE_PATH_CONTRACT');
  assert.deepEqual(operationAnswerContractCoverage(), { covered: certified.length, total: manifest.operationCount });
  const operation = certified[0];
  const declaration = operation.emittedBlockIds.find((candidate) => operation.allowedBlockTypes.includes(candidate.slice(0, candidate.indexOf(':'))));
  const separator = declaration.indexOf(':');
  const type = declaration.slice(0, separator);
  const id = declaration.slice(separator + 1).replace(/\*$/, 'example');
  assert.equal(matchesOperationAnswerContract(operation.operationId, { status: 'ANSWERED', blocks: [{ type, id }], suggestions: [] }), true);
  assert.equal(matchesOperationAnswerContract(operation.operationId, { status: 'ANSWERED', blocks: [{ type, id: 'not-declared-by-the-handler' }], suggestions: [] }), false);
  const scanOnly = manifest.operations.find((candidate) => candidate.evidenceTier === 'SOURCE_SCAN_ONLY');
  const scanned = scanOnly.emittedBlockIds.find((candidate) => scanOnly.allowedBlockTypes.includes(candidate.slice(0, candidate.indexOf(':'))));
  const scanSeparator = scanned.indexOf(':');
  assert.equal(matchesOperationAnswerContract(scanOnly.operationId, { status: 'ANSWERED', blocks: [{ type: scanned.slice(0, scanSeparator), id: scanned.slice(scanSeparator + 1).replace(/\*$/, 'example') }], suggestions: [] }), false);
});
test('the committed manifest is current (run scripts/ask-answer-contract-manifest.js --write after changing a handler block id)', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '../../scripts/ask-answer-contract-manifest.js')], { env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
test('evidence tiers: scan-only operations cannot increase; every typed contract names a file that still defines it', () => {
  const scanOnly = manifest.operations.filter((o) => o.evidenceTier === 'SOURCE_SCAN_ONLY').length;
  assert.ok(scanOnly <= MAX_SOURCE_SCAN_ONLY, `${scanOnly} operations are scan-only; the ratchet is ${MAX_SOURCE_SCAN_ONLY}`);
  const typedUntested = manifest.operations.filter((o) => o.evidenceTier === 'TYPED_CONTRACT_UNTESTED_AGAINST_HANDLER').length;
  assert.ok(typedUntested <= MAX_TYPED_UNTESTED, `${typedUntested} typed contracts are untested against their handler; the ratchet is ${MAX_TYPED_UNTESTED}`);
  for (const o of manifest.operations.filter((x) => x.typedContract)) assert.ok(o.contract && o.contract.file, `${o.operationId}: contract ${o.typedContract} not found`);
  assert.ok(manifest.operations.every((o) => ['EXCLUSIVE_FILE', 'SHARED_FILE'].includes(o.attribution)));
});
test('block id scan reads block-shaped objects only (actions, filters and options are not blocks)', () => {
  assert.deepEqual(blockIds("{ type: 'SUMMARY', id: 'a-b', title: 'x' } { id: 'c-d', type: 'EVIDENCE' } { id: 'act-1', label: 'Go' } { type: 'TABLE', id: `row-${n}` }"), ['EVIDENCE:c-d', 'SUMMARY:a-b', 'TABLE:row-*']);
});

test('real-path evidence: every operation promoted by execution evidence has a test that really runs its handler, and its contract is exactly what that execution produced', () => {
  const fs = require('node:fs'); const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/services/ask/answerContract/realPathEvidence.json'), 'utf8')).operations;
  for (const [operationId, entry] of Object.entries(evidence)) {
    const file = path.join(__dirname, '../..', entry.test); assert.ok(fs.existsSync(file), `${operationId}: ${entry.test} is missing`);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, new RegExp(`capabilityInvoke\\('${operationId}'`), `${operationId}: the test does not run the handler through capabilityInvoke`);
    assert.match(source, /conformRealPath\(/, `${operationId}: the test does not compare against the evidence`);
    const row = manifest.operations.find((o) => o.operationId === operationId);
    assert.equal(row.evidenceTier, 'CODE_PATH_CONTRACT'); assert.deepEqual(row.emittedBlockIds, entry.observedBlocks, 'the runtime contract is the observed blocks, not a scan');
    assert.ok(entry.variants.length >= 2, `${operationId}: one variant is not evidence of the declared variants`);
  }
  // the two operations that reached the tier before real-path evidence existed rest on a source-text check; they are listed so they can only be replaced by real evidence, never grow
  const legacy = manifest.operations.filter((o) => o.evidenceTier === 'CODE_PATH_CONTRACT' && !evidence[o.operationId]).map((o) => o.operationId).sort();
  assert.deepEqual(legacy, ['CAPITAL_RESERVE_PLAN', 'INVENTORY_LOOKUP']);
  assert.ok(manifest.operations.filter((o) => o.evidenceTier === 'CODE_PATH_CONTRACT').length >= 5);
});
