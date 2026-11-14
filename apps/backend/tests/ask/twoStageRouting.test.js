// FR-UND-13 / D6a: per-stage timeouts, more domains than S_max is partial handling (not an outage), the two-stage merge keeps what every searched domain found, the model's self-assessment is not ignored, a facet the model
// is not sure of is not run, and the property's known names are protected while a message is decomposed.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { geminiService } = require('../../src/services/gemini.service.ts');
const { GeminiUnderstandingProvider, guardedPlan, ScriptedProvider, MODEL_CALL_BUDGET, MODEL_FACET_MIN_CONFIDENCE, provisionalCandidateConfidence } = require('../../src/services/ask/modelRouting/understandingProvider.ts');
const calibration = require('../../src/services/ask/modelRouting/calibration.ts');
const { planRuntimeUnderstanding } = require('../../src/services/ask/modelRouting/runtimeUnderstanding.ts');
const { DATA_POINT_DEFINITIONS } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const points = (domain) => DATA_POINT_DEFINITIONS.filter((p) => p.domain === domain);
const DOMAINS = ['appliances-inventory', 'warranties', 'insurance', 'maintenance'];
const allPoints = new Set(DATA_POINT_DEFINITIONS.map((p) => p.id)); const allOps = new Set(Object.keys(ASK_OPERATION_DEFINITIONS));
function stub(t, { stageOne, target }) {
  const real = { one: geminiService.selectAskUnderstandingDomains, two: geminiService.planAskUnderstanding }; const calls = { one: 0, two: [] };
  geminiService.selectAskUnderstandingDomains = async (input) => { calls.one += 1; return stageOne(input); };
  geminiService.planAskUnderstanding = async (input) => { const domain = DATA_POINT_DEFINITIONS.find((p) => p.id === input.dataPoints[0]?.id)?.domain ?? 'operation'; calls.two.push(domain); return target(input, domain); };
  t.after(() => { geminiService.selectAskUnderstandingDomains = real.one; geminiService.planAskUnderstanding = real.two; });
  return calls;
}
const matchOf = (domain, selfAssessment = 'HIGH') => (input) => ({ disposition: 'MATCH', candidates: [{ kind: 'DATA_POINT', dataPointId: input.dataPoints[0].id, parameters: {}, requiredSlots: [], evidence: { jobMatch: 'DIRECT', itemNamed: false } }], slots: {}, selfAssessment, requestPlan: null });
const run = (message = 'when does my warranty expire and what is my premium and when is my next task due') => guardedPlan({ message, provider: new GeminiUnderstandingProvider(), providerTermsRecorded: true, planContext: { eligibleOperationIds: allOps, eligibleDataPointIds: allPoints } });

test('the budget is the decided one: stage one 1.5 s, each target call 2.5 s, 4 s in all, S_max 3', () => {
  assert.equal(MODEL_CALL_BUDGET.stageOneTimeoutMs, 1500); assert.equal(MODEL_CALL_BUDGET.targetCallTimeoutMs, 2500); assert.equal(MODEL_CALL_BUDGET.totalBudgetMs, 4000); assert.equal(MODEL_CALL_BUDGET.maxTargetCalls, 3);
  assert.equal(new GeminiUnderstandingProvider().timeoutBudgetMs, 4000); assert.equal(new ScriptedProvider(() => ({})).timeoutBudgetMs, undefined, 'a one-call provider keeps the one-call guard');
});
test('more domains than S_max: the first three are searched in rank order, the rest are counted, and the turn is not an outage', async (t) => {
  const calls = stub(t, { stageOne: () => ({ disposition: 'MATCH', domains: DOMAINS.map((domainId) => ({ domainId })) }), target: (input, domain) => matchOf(domain)(input) });
  const provider = new GeminiUnderstandingProvider();
  const outcome = await guardedPlan({ message: 'warranty premium task and my item serial number', provider, providerTermsRecorded: true, planContext: { eligibleOperationIds: allOps, eligibleDataPointIds: allPoints } });
  assert.equal(outcome.kind, 'PLANNED'); assert.equal(calls.one, 1); assert.equal(calls.two.length, 3, 'three target calls, never four');
  assert.equal(outcome.domainOverflow, 1); assert.equal(provider.lastDomainOverflow, 1); assert.equal(provider.lastCallCount, 4, 'one domain call and three target calls, the D6a ceiling');
});
test('the merge keeps one facet from every searched domain that matched without a plan, each with a confidence from the model\'s own self-assessment', async (t) => {
  const level = { 'appliances-inventory': 'HIGH', warranties: 'MEDIUM', insurance: 'LOW' };
  stub(t, { stageOne: () => ({ disposition: 'MATCH', domains: Object.keys(level).map((domainId) => ({ domainId })) }), target: (input, domain) => matchOf(domain, level[domain])(input) });
  const outcome = await guardedPlan({ message: 'serial number of my fridge and my warranty expiry and my deductible', provider: new GeminiUnderstandingProvider(), providerTermsRecorded: true, planContext: { eligibleOperationIds: allOps, eligibleDataPointIds: allPoints } });
  assert.equal(outcome.kind, 'PLANNED'); const facets = outcome.validation.accepted;
  assert.equal(facets.length, 3, 'nothing a searched domain found is dropped because another domain also answered');
  assert.deepEqual(facets.map((f) => f.confidence).sort(), [0.3, 0.5, 0.7]);
  assert.equal(provisionalCandidateConfidence('HIGH'), 0.7); assert.equal(provisionalCandidateConfidence(undefined), 0.3);
});
test('a stage-one call is bounded by the stage-one timeout and reported as STAGE1; a target call may take longer than that and is bounded by the target timeout and reported as STAGE2', async (t) => {
  stub(t, { stageOne: () => new Promise(() => {}), target: () => ({}) });
  const t0 = Date.now(); const one = await run(); const stageOneMs = Date.now() - t0;
  assert.deepEqual([one.kind, one.reason, one.stage], ['UNAVAILABLE', 'TIMEOUT', 'STAGE1']); assert.ok(stageOneMs >= 1400 && stageOneMs < 2400, `${stageOneMs}ms`);
});
test('a target call slower than a one-call timeout but inside the target budget is allowed; one beyond it is a STAGE2 timeout', async (t) => {
  const slow = (ms) => (input, domain) => new Promise((resolve) => setTimeout(() => resolve(matchOf(domain)(input)), ms));
  const okCalls = stub(t, { stageOne: () => ({ disposition: 'MATCH', domains: [{ domainId: 'warranties' }] }), target: slow(1800) });
  const ok = await run('when does my warranty expire'); assert.equal(ok.kind, 'PLANNED'); assert.equal(okCalls.two.length, 1);
  geminiService.planAskUnderstanding = () => new Promise(() => {});
  const t0 = Date.now(); const late = await run('when does my warranty expire'); const ms = Date.now() - t0;
  assert.deepEqual([late.kind, late.reason, late.stage], ['UNAVAILABLE', 'TIMEOUT', 'STAGE2']); assert.ok(ms >= 2400 && ms < 3400, `${ms}ms`);
});
test('the runtime bridge does not run a facet the model is not sure of, nor a facet that depends on one, and reports them as parts that could not be matched', async (t) => {
  const real = calibration.isUnderstandingStratumCertified; calibration.isUnderstandingStratumCertified = () => true; t.after(() => { calibration.isUnderstandingStratumCertified = real; });
  const message = 'how old is my roof and when does my warranty expire and what is my budget forecast';
  const facet = (span, operationId, confidence, dependsOn = []) => ({ span, target: { kind: 'OPERATION', operationId }, entity: null, dependsOn, confidence });
  const provider = new ScriptedProvider(() => ({ facets: [facet('how old is my roof', 'INVENTORY_LOOKUP', 0.9), facet('when does my warranty expire', 'WARRANTY_LOOKUP', MODEL_FACET_MIN_CONFIDENCE - 0.1), facet('what is my budget forecast', 'MAINTENANCE_BUDGET_FORECAST', 0.9, [1])] }));
  const outcome = await planRuntimeUnderstanding({ message, eligibleOperationIds: new Set(['INVENTORY_LOOKUP', 'WARRANTY_LOOKUP', 'MAINTENANCE_BUDGET_FORECAST']), eligibleDataPointIds: new Set(), controls: { enabled: true, providerTermsRecorded: true, homeownerTextApproved: true }, provider });
  assert.equal(outcome.kind, 'PLAN'); assert.deepEqual(outcome.clauses.map((c) => c.operationId), ['INVENTORY_LOOKUP']);
  assert.deepEqual(outcome.deferred.map((d) => [d.clause, d.reason]).sort(), [['what is my budget forecast', 'LOW_CONFIDENCE'], ['when does my warranty expire', 'LOW_CONFIDENCE']]);
});
test('decomposition protects the property known names while each part is routed', async () => {
  const cascade = require('../../src/services/ask/askRoutingCascade.ts'); const { decomposeForComposition } = require('../../src/services/ask/composition/decompose.ts');
  const real = cascade.resolveAskRoutingCascade; const seen = [];
  cascade.resolveAskRoutingCascade = (message, options) => { seen.push(options?.knownNames ?? null); return real(message, options); };
  try {
    const knownNames = [{ name: 'Hendersen Plumbing', role: 'CONTRACTOR' }];
    decomposeForComposition('how old is my roof, what would a new one cost, and what about the water heater situation', { knownNames });
    assert.ok(seen.length >= 2); assert.ok(seen.every((names) => names === knownNames), 'every routing call of the decomposition carries the names');
    seen.length = 0; decomposeForComposition('how old is my roof and what would a new one cost', {}); assert.ok(seen.every((names) => names === null || names === undefined));
  } finally { cascade.resolveAskRoutingCascade = real; }
});
