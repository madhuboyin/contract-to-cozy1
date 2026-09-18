const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// P05 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
// governance/source-shape test, not a DB integration test -- confirmClaimFile
// and confirmClaimTransition are not exported (registered by name via
// registerConfirmCapabilityHandler) and compose a live Prisma lookup, same
// STATIC-verification boundary applied throughout this audit series. Mirrors
// the technique already used in decisionPreferenceServiceGovernance.test.js.

const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

function functionBody(source, functionSignaturePattern) {
  const match = source.match(functionSignaturePattern);
  assert.ok(match, `expected to find a function matching ${functionSignaturePattern}`);
  const start = match.index;
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

test('confirmClaimFile calls the shared reconciliation mechanism and returns refreshedExecutions -- previously called neither', () => {
  const body = functionBody(orchestratorSource, /async function confirmClaimFile\(/);
  assert.match(body, /reconcileAskExecutionSideEffects/);
  assert.match(body, /refreshedExecutions:/);
});

test('confirmClaimTransition calls the shared reconciliation mechanism and returns refreshedExecutions -- previously called neither', () => {
  const body = functionBody(orchestratorSource, /async function confirmClaimTransition\(/);
  assert.match(body, /reconcileAskExecutionSideEffects/);
  assert.match(body, /refreshedExecutions:/);
});

test('CLAIM_FILE and CLAIM_TRANSITION declare LIMITATION in allowedBlockTypes, matching the LIMITATION block their reconciliation-failure branch can now emit', () => {
  const registrySource = readFileSync(resolve(__dirname, '../../src/services/ask/askOperationRegistry.ts'), 'utf8');
  for (const operationId of ['CLAIM_FILE', 'CLAIM_TRANSITION']) {
    const lineMatch = registrySource.match(new RegExp(`${operationId}: definition\\([^\\n]*\\)`));
    assert.ok(lineMatch, `expected to find a definition(...) line for ${operationId}`);
    assert.match(lineMatch[0], /'LIMITATION'/, `${operationId} must declare 'LIMITATION' in allowedBlockTypes`);
  }
});

test('the incident-claim Skill manifest and evaluation both declare LIMITATION, matching the operation registry', () => {
  const manifestSource = readFileSync(resolve(__dirname, '../../src/services/skills/incident-claim/skill.manifest.ts'), 'utf8');
  const evaluationSource = readFileSync(resolve(__dirname, '../../src/services/skills/incident-claim/skill.evaluation.ts'), 'utf8');
  assert.match(manifestSource, /allowedResultBlocks:\s*\[[^\]]*'LIMITATION'/);
  assert.match(evaluationSource, /expectedBlockTypes:\s*\[[^\]]*'LIMITATION'/);
});
