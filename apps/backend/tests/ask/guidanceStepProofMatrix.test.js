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
const POLICIES = ['ACKNOWLEDGEMENT', 'CANONICAL_MUTATION', 'VERIFIED_EVIDENCE', 'EXTERNAL_COMPLETION', 'DECISION'];
// Acknowledgement completes only a true review step, never a safety, financial, compliance, execution or repair step (owner decision 2026-10-24).
const ACKNOWLEDGEMENT_MAY_COMPLETE = new Set(['guidance-overview:review_signal']);
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
    assert.ok(POLICIES.includes(row.proofPolicy), `${key}: every step declares its proof policy`);
    if (row.askOperation !== null) assert.ok(ASK_OPERATION_DEFINITIONS[row.askOperation], `${key}: ${row.askOperation} is not a registered operation`);
    if (row.verdict === 'CONNECTED') assert.ok(row.askOperation && row.desktopReporter, `${key}: a connected step names its Ask operation and its reporter`);
    // Connectable means the proof is decided: anything still missing (an Ask command, a shared reporter) is said as what to build first.
    if (row.verdict === 'CONNECTABLE' && !(row.askOperation && row.desktopReporter)) assert.match(row.launchPrerequisites, /^Build/, `${key}: a connectable step with no Ask command or reporter yet says what to build first`);
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
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['coverage-intelligence:check_coverage'].verdict, 'CONNECTABLE', 'the proof is decided (a fresh scoped evaluation); the command and reporter are still to build');
});

test('acknowledgement is never the proof for a step that is not a true review step, and the owner\'s proof definitions are recorded', () => {
  for (const [key, row] of Object.entries(GUIDANCE_STEP_PROOF_MATRIX)) {
    if (row.proofPolicy === 'ACKNOWLEDGEMENT' && (row.verdict === 'CONNECTED' || row.verdict === 'CONNECTABLE')) assert.ok(ACKNOWLEDGEMENT_MAY_COMPLETE.has(key), `${key}: only a true review step may be completed by an acknowledgement`);
  }
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['guidance-overview:review_signal'].proofPolicy, 'ACKNOWLEDGEMENT');
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['guidance-overview:update_budget'].proofPolicy, 'CANONICAL_MUTATION', 'a budget step needs the real mutation');
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['maintenance:complete_compliance_task'].proofPolicy, 'VERIFIED_EVIDENCE');
  for (const step of ['check_coverage', 'check_recall_coverage', 'check_weather_coverage']) {
    const row = GUIDANCE_STEP_PROOF_MATRIX[`coverage-intelligence:${step}`];
    assert.match(row.canonicalProof, /fresh canonical coverage evaluation/, step);
    assert.match(row.risk, /not proof/, step);
  }
  assert.equal(GUIDANCE_STEP_PROOF_MATRIX['coverage-intelligence:compare_coverage_options'].proofPolicy, 'DECISION');
  for (const step of ['book_service', 'schedule_inspection']) assert.equal(GUIDANCE_STEP_PROOF_MATRIX[`booking:${step}`].proofPolicy, 'EXTERNAL_COMPLETION', step);
});
