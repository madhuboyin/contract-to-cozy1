const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape test, not a DB integration test (there is no
// test database — see docs/product/decision-platform/README.md), mirroring
// decisionThreadServiceGovernance.test.js's pattern for the shared factory
// createSnapshotDecisionFamilyAdapter now uses across five decision
// families (Phase 3 review finding 4 delivery step 6).

const {
  refinanceOpportunityDecisionFamilyAdapter,
  homeCapitalTimelineWindowDecisionFamilyAdapter,
  ownershipCostChangeDecisionFamilyAdapter,
  savingsBenefitMatchDecisionFamilyAdapter,
  coverageQuestionDecisionFamilyAdapter,
} = require('../../src/services/decisionPlatform/domainSnapshotAdapters.ts');

const factorySource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/snapshotDecisionFamilyAdapter.ts'), 'utf8');

test('the shared factory imports and uses every Phase 7A transition-contract function, same as the HVAC adapter', () => {
  assert.match(factorySource, /isLifecycleTransitionAllowed/);
  assert.match(factorySource, /isContextTransitionAllowed/);
  assert.match(factorySource, /computeContextStatus/);
});

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

test('every lifecycleStatus write inside an update/updateMany call is preceded by an isLifecycleTransitionAllowed check', () => {
  const blocks = updateCallBlocks(factorySource).filter((block) => /lifecycleStatus:\s*'([A-Z_]+)'/.test(block.text));
  assert.ok(blocks.length > 0, 'expected at least one lifecycleStatus transition write to exist');
  for (const block of blocks) {
    const target = block.text.match(/lifecycleStatus:\s*'([A-Z_]+)'/)[1];
    const before = factorySource.slice(0, block.start);
    const guardIndex = before.lastIndexOf('isLifecycleTransitionAllowed(');
    assert.ok(guardIndex >= 0, `no isLifecycleTransitionAllowed guard found before writing lifecycleStatus: '${target}'`);
    const guardCall = factorySource.slice(guardIndex, factorySource.indexOf(')', guardIndex) + 1);
    assert.match(guardCall, new RegExp(`'${target}'`), `guard before writing '${target}' does not reference '${target}'`);
  }
});

test('contextStatus inside an update/updateMany call is only ever assigned from a variable, never a literal', () => {
  const blocks = updateCallBlocks(factorySource).filter((block) => /contextStatus:/.test(block.text));
  assert.ok(blocks.length > 0, 'expected at least one contextStatus transition write to exist');
  for (const block of blocks) {
    const expression = block.text.match(/contextStatus:\s*([^,\n]+)[,\n]/)[1].trim();
    assert.doesNotMatch(expression, /^'[A-Z_]+'$/, `contextStatus assigned a hardcoded literal (${expression})`);
  }
});

test('every optimistic-concurrency write filters by the current version and increments it', () => {
  const versionedWrites = [...factorySource.matchAll(/updateMany\(\{\s*where:\s*\{[^}]*version:/g)];
  assert.ok(versionedWrites.length > 0, 'expected at least one version-checked updateMany call');
  for (const match of versionedWrites) {
    const windowEnd = factorySource.indexOf('});', match.index);
    const block = factorySource.slice(match.index, windowEnd);
    assert.match(block, /version:\s*\{\s*increment:\s*1\s*\}/, 'version-checked update does not increment version');
  }
});

test('a version-conflict (updateResult.count === 0) always throws DecisionThreadVersionConflictError, never fails silently', () => {
  const guards = [...factorySource.matchAll(/updateResult\.count === 0/g)];
  assert.ok(guards.length > 0, 'expected at least one updateResult.count === 0 guard');
  for (const match of guards) {
    const line = factorySource.slice(match.index, factorySource.indexOf('\n', match.index));
    assert.match(line, /throw new DecisionThreadVersionConflictError/);
  }
});

test('thread creation always sets activeIdentityKey and catches P2002 on it to resume the winning thread (Phase 3 review finding 2 parity)', () => {
  assert.match(factorySource, /activeIdentityKey:\s*identityKey/);
  assert.match(factorySource, /error\?\.code === 'P2002'/);
  assert.match(factorySource, /activeIdentityKey/);
});

test('the resume path recomputes only when the source digest changed, and is a true no-op read otherwise', () => {
  assert.match(factorySource, /previousSnapshot\.inputDigest === source\.inputDigest/);
  assert.match(factorySource, /recomputed:\s*false/);
});

test('all five snapshot adapters expose every method the DecisionFamilyAdapter contract requires', () => {
  for (const adapter of [
    refinanceOpportunityDecisionFamilyAdapter,
    homeCapitalTimelineWindowDecisionFamilyAdapter,
    ownershipCostChangeDecisionFamilyAdapter,
    savingsBenefitMatchDecisionFamilyAdapter,
    coverageQuestionDecisionFamilyAdapter,
  ]) {
    assert.equal(typeof adapter.isEligiblePrimaryEntity, 'function');
    assert.equal(typeof adapter.selectThread, 'function');
    assert.equal(typeof adapter.createOrResumeThread, 'function');
    assert.equal(typeof adapter.decisionDefinitionId, 'string');
    assert.equal(typeof adapter.primaryEntityType, 'string');
  }
});
