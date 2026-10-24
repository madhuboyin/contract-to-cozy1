const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The guided-journey step proof matrix (continuation FRD section 24): every registered journey step has a verdict, the matrix agrees with what Ask can actually
// complete, and a step cannot be connected (or a template step added) without the matrix being updated deliberately.

const { GUIDANCE_STEP_PROOF_MATRIX } = require('../../src/services/ask/askGuidanceStepProofMatrix.ts');
const { ASK_GUIDANCE_IN_ASK_STEPS, askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { listGuidanceTemplates, DEFAULT_TEMPLATE } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');

const VERDICTS = ['CONNECTED', 'CONNECTABLE', 'NEEDS_PRODUCT_DECISION', 'WRONG_TOOL', 'UNSUPPORTED'];
const BINDINGS = ['EXACT_STEP', 'FAMILY_FALLBACK', 'NONE'];
const templates = [...listGuidanceTemplates(), DEFAULT_TEMPLATE];
const registered = templates.flatMap((template) => (template.steps ?? []).map((step) => ({ journey: template.journeyTypeKey, key: `${step.toolKey}:${step.stepKey}` })));

test('every registered journey step has a verdict, and no row describes a step that no template has', () => {
  assert.ok(registered.length >= 100);
  const missing = registered.filter((step) => !GUIDANCE_STEP_PROOF_MATRIX[step.key]).map((step) => `${step.journey}/${step.key}`);
  assert.deepEqual(missing, [], 'classify new template steps in askGuidanceStepProofMatrix.ts');
  const known = new Set(registered.map((step) => step.key));
  assert.deepEqual(Object.keys(GUIDANCE_STEP_PROOF_MATRIX).filter((key) => !known.has(key)), [], 'a row for a step that no template has');
});

test('every row is complete and uses only the declared vocabulary', () => {
  for (const [key, row] of Object.entries(GUIDANCE_STEP_PROOF_MATRIX)) {
    for (const field of ['homeownerJob', 'canonicalProof', 'launchPrerequisites', 'risk']) assert.ok(typeof row[field] === 'string' && row[field].trim().length > 10, `${key}.${field}`);
    assert.ok(VERDICTS.includes(row.verdict), `${key}: verdict`);
    assert.ok(BINDINGS.includes(row.binding), `${key}: binding`);
    if (row.askOperation !== null) assert.ok(ASK_OPERATION_DEFINITIONS[row.askOperation], `${key}: ${row.askOperation} is not a registered operation`);
    if (row.verdict === 'CONNECTED' || row.verdict === 'CONNECTABLE') assert.ok(row.askOperation && row.desktopReporter, `${key}: a connected or connectable step names its Ask operation and its reporter`);
    if (row.verdict === 'CONNECTED') assert.notEqual(row.binding, 'NONE', `${key}: a connected step is bound`);
  }
});

test('CONNECTED means exactly what Ask can complete: the rows and the IN_ASK table agree in both directions', () => {
  const connected = Object.entries(GUIDANCE_STEP_PROOF_MATRIX).filter(([, row]) => row.verdict === 'CONNECTED').map(([key]) => key).sort();
  assert.deepEqual(connected, Object.keys(ASK_GUIDANCE_IN_ASK_STEPS).sort());
  for (const key of connected) {
    const [tool, step] = key.split(':');
    assert.equal(askGuidanceStepMode(tool, step).mode, 'IN_ASK', key);
    assert.equal(GUIDANCE_STEP_PROOF_MATRIX[key].askOperation, ASK_GUIDANCE_IN_ASK_STEPS[key].operationId, `${key}: the matrix names the operation the step really starts`);
  }
});

test('the matrix records the owner decisions: Home Savings is not advanced by a save or dismiss, estimate steps the price radar cannot produce are the wrong tool', () => {
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['home-savings:evaluate_savings_funding'].verdict, 'WRONG_TOOL');
  assert.match(GUIDANCE_STEP_PROOF_MATRIX['home-savings:evaluate_savings_funding'].risk, /save or dismiss does not complete it/);
  for (const step of ['estimate_uninsured_cost', 'estimate_repair_cost', 'estimate_improvement_cost']) assert.equal(GUIDANCE_STEP_PROOF_MATRIX[`service-price-radar:${step}`].verdict, 'WRONG_TOOL', step);
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['coverage-intelligence:check_coverage'].verdict, 'NEEDS_PRODUCT_DECISION', 'a decision does not prove a coverage check');
});
