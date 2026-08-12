const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Governance/source-shape tests (no test database -- see
// docs/product/decision-platform/README.md), mirroring
// workItemChangeEmitterGovernance-style checks: the two Phase 9A emitters
// must never fail the caller's actual write, and the scenario isolation /
// household-scoped no-op rules from the approved plan must hold structurally.

const emitterSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionPlatformChangeEmitter.ts'), 'utf8');
const threadServiceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionThreadService.ts'), 'utf8');
const preferenceServiceSource = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/decisionPreferenceService.ts'), 'utf8');
const registrySource = readFileSync(resolve(__dirname, '../../src/services/ask/askOperationRegistry.ts'), 'utf8');
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

// A naive "next { after the first )" body-start search breaks on functions
// whose return type is an inline object literal (e.g.
// `Promise<{ preferenceValueId: string }>`), since that type's own `{` is
// found first. This codebase always writes the real body-opening brace
// immediately followed by a newline, while an inline return-type brace is
// followed by a space -- use that to find the true body start.
function functionBody(text, functionName) {
  const start = text.indexOf(`export async function ${functionName}(`);
  assert.ok(start >= 0, `expected to find export async function ${functionName}(`);
  const match = /\{\r?\n/.exec(text.slice(start));
  assert.ok(match, `could not find body start for ${functionName}`);
  const bodyStart = start + match.index;
  let depth = 0;
  for (let i = bodyStart; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading body of ${functionName}`);
}

// Balanced-paren scan for `prisma.$transaction(...)`'s true closing paren,
// since the naive `lastIndexOf('});')` can instead match a later, unrelated
// call's closing (e.g. the emitter call itself also ends in `});`).
function transactionEndIndex(body) {
  const callStart = body.indexOf('prisma.$transaction(');
  assert.ok(callStart >= 0, 'expected a prisma.$transaction( call');
  const openParen = callStart + 'prisma.$transaction'.length;
  let depth = 0;
  for (let i = openParen; i < body.length; i += 1) {
    if (body[i] === '(') depth += 1;
    if (body[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced parens reading prisma.$transaction(...) call');
}

test('both emitters wrap emitPropertyChange in try/catch and log rather than rethrow (best-effort, never fails the caller)', () => {
  for (const functionName of ['emitDecisionRecommendationChange', 'emitDecisionPreferenceChange']) {
    const body = functionBody(emitterSource, functionName);
    assert.match(body, /try\s*\{/, `${functionName} has no try block`);
    assert.match(body, /catch\s*\(err\)\s*\{/, `${functionName} has no catch block`);
    const catchStart = body.indexOf('catch (err)');
    const catchBlock = body.slice(catchStart);
    assert.match(catchBlock, /logger\.error/, `${functionName}'s catch block does not log`);
    assert.doesNotMatch(catchBlock, /throw/, `${functionName}'s catch block rethrows -- this must be best-effort`);
  }
});

test('emitDecisionPreferenceChange no-ops when propertyId is null (household-wide preferences, documented deferral)', () => {
  const body = functionBody(emitterSource, 'emitDecisionPreferenceChange');
  assert.match(body, /if\s*\(!input\.propertyId\)\s*return;/);
});

test('createHvacScenario never calls emitDecisionRecommendationChange -- FRD §13.3 scenario isolation', () => {
  const start = threadServiceSource.indexOf('export async function createHvacScenario(');
  assert.ok(start >= 0, 'expected to find createHvacScenario');
  const nextExport = threadServiceSource.indexOf('\nexport async function', start + 1);
  const body = threadServiceSource.slice(start, nextExport > start ? nextExport : threadServiceSource.length);
  assert.doesNotMatch(body, /emitDecisionRecommendationChange/, 'a scenario snapshot must never enter the shared change ledger');
});

test('createHvacDecisionThread and recomputeStaleThread both call emitDecisionRecommendationChange after their transaction commits, not inside it', () => {
  for (const functionName of ['createHvacDecisionThread', 'recomputeStaleThread']) {
    const body = functionBody(threadServiceSource, functionName);
    const transactionEnd = transactionEndIndex(body);
    const emitCallIndex = body.indexOf('emitDecisionRecommendationChange');
    assert.ok(emitCallIndex > transactionEnd, `${functionName} should call the emitter after its $transaction block commits, not inside it`);
  }
});

test('all three preference write functions call emitDecisionPreferenceChange', () => {
  for (const functionName of ['saveOwnershipHorizonPreference', 'saveRepairReplaceApproachPreference', 'revokeHvacPreference']) {
    const body = functionBody(preferenceServiceSource, functionName);
    assert.match(body, /emitDecisionPreferenceChange/, `${functionName} does not call emitDecisionPreferenceChange`);
  }
});

// Regression test for the exact Phase 8B bug decisionPreferenceServiceGovernance.test.js
// documents: a result builder emitting a block type never added to
// allowedBlockTypes throws "Ask adapter returned undeclared block type" only
// at runtime. HOME_CHANGE_SUMMARY's result builder can emit CHANGE_SUMMARY
// or EMPTY_STATE -- both must be declared.
test('HOME_CHANGE_SUMMARY declares every block type homeChangeSummaryResult can actually emit', () => {
  const lineMatch = registrySource.match(/HOME_CHANGE_SUMMARY: definition\([^\n]*\)/);
  assert.ok(lineMatch, 'expected to find a definition(...) line for HOME_CHANGE_SUMMARY');
  for (const blockType of ['CHANGE_SUMMARY', 'EMPTY_STATE']) {
    assert.match(lineMatch[0], new RegExp(`'${blockType}'`), `HOME_CHANGE_SUMMARY's allowedBlockTypes is missing '${blockType}'`);
  }
});

test('homeChangeSummaryResult is wired into the operation dispatch switch', () => {
  assert.match(orchestratorSource, /case 'HOME_CHANGE_SUMMARY': return homeChangeSummaryResult\(/);
});
