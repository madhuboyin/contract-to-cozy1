const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape tests, not DB integration tests (no test database
// — see docs/product/decision-platform/README.md). Mirrors the technique
// already used in tests/decisionPlatform/decisionThreadServiceGovernance.test.js.

const preferenceServiceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionPreferenceService.ts'), 'utf8');
const threadServiceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionThreadService.ts'), 'utf8');
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

function functionBody(source, functionSignaturePattern) {
  const match = source.match(functionSignaturePattern);
  assert.ok(match, `expected to find a function matching ${functionSignaturePattern}`);
  const start = match.index;
  // The function body's opening brace is the first '{' immediately followed
  // by a newline -- inline return-type object literals in this codebase's
  // style (e.g. "Promise<{ affectedThreadIds: string[] }>") stay on one
  // line, so searching for plain '{' would wrongly match inside the return
  // type instead of the actual body.
  const braceStart = source.indexOf('{\n', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced braces while extracting function body');
}

test('getActiveHvacPreferences only reads ACTIVE, non-expired rows — the structural enforcement of the FRD §22.2 zero-tolerance gate ("unconfirmed preference affecting a material result")', () => {
  const body = functionBody(preferenceServiceSource, /export async function getActiveHvacPreferences\(/);
  assert.match(body, /status:\s*'ACTIVE'/g);
  assert.match(body, /expiresAt:\s*\{\s*gt:\s*now\s*\}/);
});

test('revokeHvacPreference flips status to REVOKED and returns the affected thread ids rather than silently dropping them', () => {
  const body = functionBody(preferenceServiceSource, /export async function revokeHvacPreference\(/);
  assert.match(body, /status:\s*'REVOKED'/);
  assert.match(body, /affectedThreadIds/);
});

test('revokeHvacPreference checks authorization before revoking (subject ownership, not just existence)', () => {
  const body = functionBody(preferenceServiceSource, /export async function revokeHvacPreference\(/);
  assert.match(body, /PreferenceNotAuthorizedError/);
});

test('getActiveHvacPreferences reads a household preference for ANY authorized household member, not just the literal Household owner (FRD §7.4: a confirmed household plan affects every member\'s ranking)', () => {
  const body = functionBody(preferenceServiceSource, /export async function getActiveHvacPreferences\(/);
  assert.doesNotMatch(body, /ownerUserId:\s*userId/, 'the read path must not be scoped to only the household owner\'s own preferences');
});

test('saveOwnershipHorizonPreference IS scoped to the household owner — FRD §7.2 restricts managing a shared SENSITIVE preference to OWNER', () => {
  const body = functionBody(preferenceServiceSource, /export async function saveOwnershipHorizonPreference\(/);
  assert.match(body, /ownerUserId:\s*userId/);
});

test('saveOwnershipHorizonPreference never creates a Household as a side effect (FRD §7.2 owner-gated consent — see ADR-0001)', () => {
  const body = functionBody(preferenceServiceSource, /export async function saveOwnershipHorizonPreference\(/);
  assert.doesNotMatch(body, /household\.create\(/);
  assert.match(body, /HouseholdProfileNotEnabledError/);
});

test('createHvacScenario never calls a preference-save function — no scenario-to-profile leakage (FRD §13.3 / Phase 8B exit criterion)', () => {
  const body = functionBody(threadServiceSource, /export async function createHvacScenario\(/);
  assert.doesNotMatch(body, /saveOwnershipHorizonPreference|saveRepairReplaceApproachPreference/);
  assert.match(body, /getActiveHvacPreferences/, 'createHvacScenario should still read active preferences to establish its baseline');
});

test('the HVAC_PREFERENCE_FORGET confirm branch marks referencing threads stale after revoking, closing the loop with the Phase 8A staleness mechanism', () => {
  const branchStart = orchestratorSource.indexOf("execution.operationId === 'HVAC_PREFERENCE_FORGET'");
  const branchEnd = orchestratorSource.indexOf("} else if (execution.operationId === 'HOME_DEADLINE_MONITOR')", branchStart);
  const branch = orchestratorSource.slice(branchStart, branchEnd);
  assert.match(branch, /revokeHvacPreference/);
  assert.match(branch, /markThreadsStaleByIds/);
});

test('HVAC_DECISION_START/CONTINUE/SCENARIO declare every block type their own result-building code can actually emit', () => {
  // This is the regression test for a real bug: WHY_NOW, RECOMMENDATION_CHANGE,
  // and PREFERENCE_REFERENCE were added to these operations' result builders
  // in Phase 8B, but askOperationRegistry.ts's allowedBlockTypes were not
  // updated to match. createAskExecution throws "Ask adapter returned
  // undeclared block type" the first time an operation actually emits a
  // block outside its declared set (see askOrchestrator.service.ts's
  // disallowedBlock checks) -- this would only have surfaced at runtime,
  // since no existing test cross-references emitted blocks against the
  // registry. Asserted directly against the registry here rather than by
  // scanning source, since the two files must simply agree.
  const registrySource = readFileSync(resolve(__dirname, '../../src/services/ask/askOperationRegistry.ts'), 'utf8');
  const expectations = {
    HVAC_DECISION_START: ['DECISION_PROGRESS', 'WHY_NOW', 'RECOMMENDATION_CHANGE', 'PREFERENCE_REFERENCE'],
    HVAC_DECISION_CONTINUE: ['DECISION_PROGRESS', 'WHY_NOW', 'RECOMMENDATION_CHANGE', 'PREFERENCE_REFERENCE'],
    HVAC_DECISION_SCENARIO: ['SCENARIO_COMPARISON', 'PREFERENCE_REFERENCE'],
  };
  for (const [operationId, requiredBlockTypes] of Object.entries(expectations)) {
    const lineMatch = registrySource.match(new RegExp(`${operationId}: definition\\([^\\n]*\\)`));
    assert.ok(lineMatch, `expected to find a definition(...) line for ${operationId}`);
    for (const blockType of requiredBlockTypes) {
      assert.match(lineMatch[0], new RegExp(`'${blockType}'`), `${operationId} must declare '${blockType}' in allowedBlockTypes`);
    }
  }
});

test('the HVAC_PREFERENCE_SAVE confirm branch always writes through decisionPreferenceService, never a raw prisma.decisionPreferenceValue.create', () => {
  const branchStart = orchestratorSource.indexOf("execution.operationId === 'HVAC_PREFERENCE_SAVE'");
  const branchEnd = orchestratorSource.indexOf("} else if (execution.operationId === 'HVAC_PREFERENCE_FORGET'", branchStart);
  const branch = orchestratorSource.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /prisma\.decisionPreferenceValue\.(create|update)/);
  assert.match(branch, /saveOwnershipHorizonPreference|saveRepairReplaceApproachPreference/);
});
