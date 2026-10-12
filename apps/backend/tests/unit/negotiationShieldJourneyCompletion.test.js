const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// D6 (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, finding F7): the guided-journey completion after a Negotiation Shield analysis is one
// shared function, called by the analyze controller and by Ask, so both surfaces keep identical side effects. These tests need no database,
// browser or native module: collaborators are replaced and `sharp` (the OCR image library, not installed on every machine) is stubbed.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const completion = require('../../src/services/negotiationShieldJourneyCompletion.ts');
const { logger } = require('../../src/lib/logger.ts');

const caseOf = (scenarioType) => ({ id: 'case-1', scenarioType, status: 'ANALYZED' });
const detailOf = (scenarioType = 'CONTRACTOR_QUOTE_REVIEW') => ({
  case: caseOf(scenarioType),
  latestAnalysis: { summary: 'Itemize the labor.', confidence: 0.6, negotiationLeverage: [{ key: 'a' }], recommendedActions: [{ key: 'b' }], pricingAssessment: { status: 'NEEDS_COMPARISON' } },
  latestDraft: { draftType: 'EMAIL' },
});

function spyOnJourney({ fail = false } = {}) {
  const original = guidanceJourneyService.recordToolCompletion;
  const calls = [];
  guidanceJourneyService.recordToolCompletion = async (input) => { calls.push(input); if (fail) throw new Error('journey store unavailable'); return { ok: true }; };
  return { calls, restore: () => { guidanceJourneyService.recordToolCompletion = original; } };
}

test('the scenario decides the signal when the caller names none', () => {
  const expected = {
    CONTRACTOR_QUOTE_REVIEW: ['lifecycle_end_or_past_life', 'ASSET_LIFECYCLE'],
    CONTRACTOR_URGENCY_PRESSURE: ['lifecycle_end_or_past_life', 'ASSET_LIFECYCLE'],
    INSURANCE_PREMIUM_INCREASE: ['coverage_gap', 'INSURANCE'],
    INSURANCE_CLAIM_SETTLEMENT: ['financial_exposure', 'FINANCIAL'],
    BUYER_INSPECTION_NEGOTIATION: ['inspection_followup_needed', 'MAINTENANCE'],
  };
  for (const [scenario, [family, domain]] of Object.entries(expected)) {
    assert.deepEqual(completion.negotiationShieldCompletionSignal(scenario), { signalIntentFamily: family, issueDomain: domain }, scenario);
  }
});

test('the completion carries the case identity, the default step and the proof payload', async () => {
  const spy = spyOnJourney();
  try {
    await completion.recordNegotiationShieldAnalysisCompletion({ propertyId: 'prop-1', actorUserId: 'user-1', detail: detailOf('INSURANCE_PREMIUM_INCREASE') });
    assert.equal(spy.calls.length, 1);
    const [call] = spy.calls;
    assert.deepEqual({ ...call, producedData: undefined }, {
      propertyId: 'prop-1', actorUserId: 'user-1', journeyId: null, signalIntentFamily: 'coverage_gap', issueDomain: 'INSURANCE',
      sourceToolKey: 'negotiation-shield', sourceEntityType: 'NEGOTIATION_SHIELD_CASE', sourceEntityId: 'case-1',
      stepKey: 'prepare_negotiation', status: 'COMPLETED', producedData: undefined,
    });
    assert.deepEqual(call.producedData, {
      proofType: 'negotiation_analysis', proofId: 'case-1', scenarioType: 'INSURANCE_PREMIUM_INCREASE', caseStatus: 'ANALYZED',
      summary: 'Itemize the labor.', confidence: 0.6, negotiationLeverage: [{ key: 'a' }], recommendedActions: [{ key: 'b' }],
      pricingAssessment: { status: 'NEEDS_COMPARISON' }, draftType: 'EMAIL',
    });
  } finally { spy.restore(); }
});

test('a launching journey, step and signal override the defaults', async () => {
  const spy = spyOnJourney();
  try {
    await completion.recordNegotiationShieldAnalysisCompletion({
      propertyId: 'prop-1', actorUserId: 'user-1', detail: detailOf(), journeyId: 'journey-9', stepKey: 'compare_options', signalIntentFamily: 'financial_exposure',
    });
    const [call] = spy.calls;
    assert.equal(call.journeyId, 'journey-9');
    assert.equal(call.stepKey, 'compare_options');
    assert.equal(call.signalIntentFamily, 'financial_exposure');
    assert.equal(call.issueDomain, 'ASSET_LIFECYCLE', 'the domain still comes from the scenario');
  } finally { spy.restore(); }
});

test('an analysis with no draft or analysis row still reports, with nulls', async () => {
  const spy = spyOnJourney();
  try {
    await completion.recordNegotiationShieldAnalysisCompletion({ propertyId: 'p', actorUserId: 'u', detail: { case: caseOf('CONTRACTOR_QUOTE_REVIEW'), latestAnalysis: null, latestDraft: null } });
    assert.deepEqual(spy.calls[0].producedData, {
      proofType: 'negotiation_analysis', proofId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', caseStatus: 'ANALYZED', summary: null, confidence: null,
      negotiationLeverage: null, recommendedActions: null, pricingAssessment: null, draftType: null,
    });
  } finally { spy.restore(); }
});

test('a journey that cannot be updated is logged and never fails the saved analysis', async () => {
  const spy = spyOnJourney({ fail: true });
  const originalWarn = logger.warn;
  const warnings = [];
  logger.warn = (...args) => { warnings.push(args); };
  try {
    await assert.doesNotReject(() => completion.recordNegotiationShieldAnalysisCompletion({ propertyId: 'p', actorUserId: 'u', detail: detailOf() }));
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][1]), /negotiation shield hook failed/);
  } finally { spy.restore(); logger.warn = originalWarn; }
});

// ---- the analyze controller delegates to the shared function ------------------------------------------------------------------------

const projectCompliance = require('../../src/services/projectCompliance/context.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const controller = require('../../src/controllers/negotiationShield.controller.ts');

function harness({ analyze, hookFails = false } = {}) {
  const saved = {
    analyzeCase: NegotiationShieldService.prototype.analyzeCase,
    assert: projectCompliance.assertProjectComplianceApplicable,
    envelope: projectCompliance.getProjectComplianceEnvelope,
    record: completion.recordNegotiationShieldAnalysisCompletion,
  };
  const seen = { analyze: [], completion: [], assert: [], envelope: [] };
  NegotiationShieldService.prototype.analyzeCase = async function (...args) { seen.analyze.push(args); if (analyze) return analyze(); return detailOf(); };
  projectCompliance.assertProjectComplianceApplicable = async (...args) => { seen.assert.push(args); return { contextVersion: 'ctx-7' }; };
  projectCompliance.getProjectComplianceEnvelope = async (...args) => { seen.envelope.push(args); return { envelope: true }; };
  completion.recordNegotiationShieldAnalysisCompletion = async (input) => { seen.completion.push(input); if (hookFails) throw new Error('should not matter'); };
  return { seen, restore() {
    NegotiationShieldService.prototype.analyzeCase = saved.analyzeCase;
    projectCompliance.assertProjectComplianceApplicable = saved.assert;
    projectCompliance.getProjectComplianceEnvelope = saved.envelope;
    completion.recordNegotiationShieldAnalysisCompletion = saved.record;
  } };
}
function exchange(query = {}) {
  const out = { status: null, body: null, error: null };
  const req = { params: { propertyId: 'prop-1', caseId: 'case-1' }, query, user: { userId: 'user-1' }, body: {} };
  const res = { status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  return { req, res, out, next: (error) => { out.error = error; } };
}

test('the analyze controller runs the gate, the analysis, the shared completion with the launching journey, then answers 201', async () => {
  const h = harness();
  try {
    const ex = exchange({ guidanceJourneyId: 'journey-9', guidanceStepKey: 'compare_options', guidanceSignalIntentFamily: 'COVERAGE_GAP' });
    await controller.analyzeNegotiationShieldCase(ex.req, ex.res, ex.next);
    assert.equal(ex.out.error, null);
    assert.equal(ex.out.status, 201);
    assert.deepEqual(h.seen.analyze, [['prop-1', 'case-1', 'ctx-7']]);
    assert.equal(h.seen.completion.length, 1, 'the shared completion runs exactly once');
    const [input] = h.seen.completion;
    assert.equal(input.propertyId, 'prop-1');
    assert.equal(input.actorUserId, 'user-1');
    assert.equal(input.detail.case.id, 'case-1');
    assert.equal(input.journeyId, 'journey-9');
    assert.equal(input.stepKey, 'compare_options');
    assert.equal(input.signalIntentFamily, 'coverage_gap', 'the caller-named family is lower-cased');
    assert.equal(ex.out.body.data.propertyContext.envelope, true);
    assert.equal(ex.out.body.data.case.id, 'case-1');
  } finally { h.restore(); }
});

test('without journey query parameters the controller passes none, leaving the scenario defaults to the shared function', async () => {
  const h = harness();
  try {
    const ex = exchange({});
    await controller.analyzeNegotiationShieldCase(ex.req, ex.res, ex.next);
    const [input] = h.seen.completion;
    assert.equal(input.journeyId, null);
    assert.equal(input.stepKey, null);
    assert.equal(input.signalIntentFamily, null);
  } finally { h.restore(); }
});

test('an analysis that fails reports no completion and passes the error on', async () => {
  const h = harness({ analyze: () => { throw new Error('engine failed'); } });
  try {
    const ex = exchange({});
    await controller.analyzeNegotiationShieldCase(ex.req, ex.res, ex.next);
    assert.match(String(ex.out.error?.message), /engine failed/);
    assert.equal(h.seen.completion.length, 0);
    assert.equal(ex.out.status, null);
  } finally { h.restore(); }
});
