const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  isLifecycleTransitionAllowed,
  isContextTransitionAllowed,
} = require('../../src/services/decisionPlatform/decisionThreadTransitions.ts');

// This is a governance/source-shape test, not a DB integration test (there is
// no test database — see docs/product/decision-platform/README.md). It
// asserts decisionThreadService.ts is structurally wired to the Phase 7A
// transition contract rather than reimplementing lifecycle/context rules
// ad hoc, mirroring how tests/ask/askGovernance.test.js already asserts
// required patterns inside askOrchestrator.service.ts without a live DB.

const source = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionThreadService.ts'), 'utf8');
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

test('decisionThreadService imports and uses every Phase 7A transition-contract function', () => {
  assert.match(source, /isLifecycleTransitionAllowed/);
  assert.match(source, /isContextTransitionAllowed/);
  assert.match(source, /computeContextStatus/);
});

// Both checks below deliberately scope to update/updateMany calls only.
// The very first lifecycleStatus/contextStatus assignment happens inside
// decisionThread.create(...) at thread creation — there is no prior state to
// transition from there, so FRD §10.2/§10.3's transition tables (which
// govern from -> to pairs) do not apply to that initial value.
function updateCallBlocks(text) {
  const blocks = [];
  const pattern = /\.(?:updateMany|update)\(\{/g;
  let match;
  while ((match = pattern.exec(text))) {
    const end = text.indexOf('});', match.index);
    blocks.push({ start: match.index, text: text.slice(match.index, end) });
  }
  return blocks;
}

test('every lifecycleStatus write inside an update/updateMany call is preceded by an isLifecycleTransitionAllowed check in the same function', () => {
  const blocks = updateCallBlocks(source).filter((block) => /lifecycleStatus:\s*'([A-Z_]+)'/.test(block.text));
  assert.ok(blocks.length > 0, 'expected at least one lifecycleStatus transition write to exist');
  for (const block of blocks) {
    const target = block.text.match(/lifecycleStatus:\s*'([A-Z_]+)'/)[1];
    const before = source.slice(0, block.start);
    const guardIndex = before.lastIndexOf('isLifecycleTransitionAllowed(');
    assert.ok(guardIndex >= 0, `no isLifecycleTransitionAllowed guard found before writing lifecycleStatus: '${target}'`);
    const guardCall = source.slice(guardIndex, source.indexOf(')', guardIndex) + 1);
    assert.match(guardCall, new RegExp(`'${target}'`), `guard before writing '${target}' does not reference '${target}'`);
  }
});

test('contextStatus inside an update/updateMany call is only ever assigned from a variable, never a literal', () => {
  const blocks = updateCallBlocks(source).filter((block) => /contextStatus:/.test(block.text));
  assert.ok(blocks.length > 0, 'expected at least one contextStatus transition write to exist');
  for (const block of blocks) {
    const expression = block.text.match(/contextStatus:\s*([^,\n]+)[,\n]/)[1].trim();
    assert.doesNotMatch(expression, /^'[A-Z_]+'$/, `contextStatus assigned a hardcoded literal (${expression}) inside an update call; must derive from computeContextStatus()`);
  }
});

test('every optimistic-concurrency write filters by the current version and increments it', () => {
  const versionedWrites = [...source.matchAll(/updateMany\(\{\s*where:\s*\{[^}]*version:/g)];
  assert.ok(versionedWrites.length > 0, 'expected at least one version-checked updateMany call');
  for (const match of versionedWrites) {
    const windowEnd = source.indexOf('});', match.index);
    const block = source.slice(match.index, windowEnd);
    assert.match(block, /version:\s*\{\s*increment:\s*1\s*\}/, 'version-checked update does not increment version');
  }
});

test('a version-conflict (updateResult.count === 0) always throws DecisionThreadVersionConflictError, never fails silently', () => {
  const guards = [...source.matchAll(/updateResult\.count === 0/g)];
  assert.ok(guards.length > 0, 'expected at least one updateResult.count === 0 guard');
  for (const match of guards) {
    const line = source.slice(match.index, source.indexOf('\n', match.index));
    assert.match(line, /throw new DecisionThreadVersionConflictError/);
  }
});

test('the transition contract itself still passes its own governance suite (sanity check on the imported functions)', () => {
  assert.equal(isLifecycleTransitionAllowed('OPEN', 'READY_TO_COMPARE'), true);
  assert.equal(isContextTransitionAllowed('CURRENT', 'STALE'), true);
});

// Phase 3 review finding 2: "exactly one active Decision Thread" is
// DB-enforced via activeIdentityKey's unique constraint (schema.prisma),
// set only while a thread is in the active lifecycle set. These two checks
// catch a future ABANDONED/COMPLETED/ARCHIVED or reopen write site that
// forgets to keep it in sync, the same way the lifecycleStatus-guard check
// above catches a future write skipping isLifecycleTransitionAllowed.
const TERMINAL_LIFECYCLE_STATUSES = new Set(['ABANDONED', 'COMPLETED', 'ARCHIVED']);

test('every write into a terminal lifecycleStatus also clears activeIdentityKey', () => {
  const blocks = updateCallBlocks(source).filter((block) => {
    const match = block.text.match(/lifecycleStatus:\s*'([A-Z_]+)'/);
    return match && TERMINAL_LIFECYCLE_STATUSES.has(match[1]);
  });
  assert.ok(blocks.length > 0, 'expected at least one terminal lifecycleStatus write to exist');
  for (const block of blocks) {
    assert.match(block.text, /activeIdentityKey:\s*null/, `terminal lifecycleStatus write does not clear activeIdentityKey: ${block.text.slice(0, 120)}`);
  }
});

test('decisionThread.create always sets activeIdentityKey', () => {
  const createIndex = source.indexOf('tx.decisionThread.create(');
  assert.ok(createIndex >= 0, 'expected a decisionThread.create call');
  const end = source.indexOf('});', createIndex);
  const block = source.slice(createIndex, end);
  assert.match(block, /activeIdentityKey:/, 'decisionThread.create does not set activeIdentityKey');
});

test('createHvacDecisionThread catches a P2002 on activeIdentityKey and resumes the winning thread instead of failing the request', () => {
  assert.match(source, /error\?\.code === 'P2002'/);
  assert.match(source, /activeIdentityKey/);
  const catchIndex = source.indexOf("error?.code === 'P2002'");
  const catchBlockEnd = source.indexOf('\n  }\n', catchIndex);
  const catchBlock = source.slice(catchIndex, catchBlockEnd);
  assert.match(catchBlock, /selectHvacDecisionThread/, 'P2002 recovery does not re-select the winning thread');
  assert.match(catchBlock, /continueHvacDecisionThread/, 'P2002 recovery does not resume the winning thread');
});

// DecisionThreadExecutionLink has @@unique([decisionThreadId, askExecutionId])
// (schema.prisma) -- a bare .create() would throw P2002 on any retried Ask
// turn that reuses the same executionId against the same thread. Both link
// writes must be createMany + skipDuplicates instead, matching this file's
// own linkPreferenceReferences precedent.
test('every DecisionThreadExecutionLink write is createMany + skipDuplicates, never a bare create (retry must be idempotent, not throw P2002)', () => {
  assert.doesNotMatch(source, /decisionThreadExecutionLink\.create\(/, 'a bare .create() on decisionThreadExecutionLink is not retry-safe given its @@unique([decisionThreadId, askExecutionId]) constraint');
  const writes = [...source.matchAll(/decisionThreadExecutionLink\.createMany\(\{/g)];
  assert.equal(writes.length, 2, 'expected exactly two DecisionThreadExecutionLink writes (CREATED in createHvacDecisionThread, CONTINUED in continueHvacDecisionThread)');
  for (const match of writes) {
    const windowEnd = source.indexOf('});', match.index);
    const block = source.slice(match.index, windowEnd);
    assert.match(block, /skipDuplicates:\s*true/, 'DecisionThreadExecutionLink createMany call is missing skipDuplicates: true');
  }
});

// Ask Intelligence FRD §10 continuity audit trail: a normal (non-creation)
// HVAC continuation must be able to attribute its DecisionThreadExecutionLink
// back to the AskExecution that triggered it, not just the initial-creation
// flow.
test('executionId is threaded from executeOperationCore through both HVAC continuation call sites', () => {
  assert.match(orchestratorSource, /async function executeOperationCore\(input: \{[^}]*executionId: string/, 'executeOperationCore\'s input type must carry executionId');
  assert.match(orchestratorSource, /case 'HVAC_DECISION_START': return hvacDecisionStartResult\([^)]*input\.executionId\)/);
  assert.match(orchestratorSource, /case 'HVAC_DECISION_CONTINUE': return hvacDecisionContinueResult\([^)]*input\.executionId\)/);
  const continuationCalls = [...orchestratorSource.matchAll(/decisionThreadService\.continueHvacDecisionThread\(([^)]*)\)/g)];
  assert.ok(continuationCalls.length >= 2, 'expected at least the two HVAC handler call sites');
  for (const match of continuationCalls) {
    assert.match(match[1], /executionId/, `continueHvacDecisionThread call does not pass executionId: ${match[0]}`);
  }
});
