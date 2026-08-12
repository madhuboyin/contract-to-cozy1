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
