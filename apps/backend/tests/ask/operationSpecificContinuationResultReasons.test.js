require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { GATEABLE_RESULT_REASONS, validateResultReasonGates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationResultReasons.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');

test('every recipe result-reason gate names a reason registered for its own source operation', () => {
  assert.deepEqual(validateResultReasonGates(), []);
});

test('the registry only names registered operations and has no duplicate or empty reason lists', () => {
  for (const [operationId, reasons] of Object.entries(GATEABLE_RESULT_REASONS)) {
    assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} is not a registered operation`);
    assert.ok(reasons.length > 0, `${operationId} lists no reasons`);
    assert.equal(new Set(reasons).size, reasons.length, `${operationId} lists a duplicate reason`);
  }
});

test('a gate on an unregistered reason is reported (negative check of the validator)', () => {
  const recipes = OPERATION_SPECIFIC_CONTINUATION_RECIPES.HVAC_DECISION_START;
  const gated = recipes.find((entry) => entry.omitWhenResultReason);
  assert.ok(gated, 'expected the existing HVAC_DECISION_START gate');
  const original = gated.omitWhenResultReason;
  try {
    Object.defineProperty(gated, 'omitWhenResultReason', { value: ['NOT_A_REAL_REASON'], configurable: true, writable: true });
    assert.equal(validateResultReasonGates().length, 1);
  } finally {
    Object.defineProperty(gated, 'omitWhenResultReason', { value: original, configurable: true, writable: true });
  }
});

// SOURCE-LEVEL emission checks: these read handler source text for reason-code literals. They do not execute the handlers, so they
// prove a registered reason is spelled in the emitting file, not that a given runtime path produces it.
test('source check: every reason registered for HVAC_DECISION_START is spelled in the start handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/hvacDecision.handler.ts'), 'utf8');
  const start = source.slice(source.indexOf('export async function hvacDecisionStartResult'), source.indexOf('async function hvacDecisionContinueResult'));
  const emitted = new Set([...start.matchAll(/reasonCode: '([A-Z_]+)'/g)].map((match) => match[1]));
  emitted.add('HVAC_DECISION_THREAD_AMBIGUOUS'); // spelled in hvacDecisionThreadAmbiguousResult, which the start handler returns
  for (const reason of GATEABLE_RESULT_REASONS.HVAC_DECISION_START) assert.ok(emitted.has(reason), `${reason} is not spelled in hvacDecisionStartResult`);
});

test('source check: every reason registered for INSPECTION_FINDING_UPDATE is spelled in the confirm handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/workflowConfirm.handler.ts'), 'utf8');
  const confirm = source.slice(source.indexOf('async function confirmInspectionFindingUpdate'), source.indexOf('async function confirmRecallMatchUpdate'));
  for (const reason of GATEABLE_RESULT_REASONS.INSPECTION_FINDING_UPDATE) assert.ok(confirm.includes(`'${reason}'`), `${reason} is not spelled in confirmInspectionFindingUpdate`);
});
