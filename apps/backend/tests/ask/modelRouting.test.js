// Phase 2 (reliability FRD): the model-path code, exercised offline with a scripted provider. No external call exists.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { routingSuccessProbability, expectedHonor, endToEndHonorRate, AVAILABILITY_SCENARIOS } = require('../../src/services/ask/modelRouting/availabilityModel.ts');
const { validateRequestPlan, facetId } = require('../../src/services/ask/modelRouting/requestPlan.ts');
const { guardedPlan, ScriptedProvider, GeminiUnderstandingProvider, MODEL_CALL_BUDGET } = require('../../src/services/ask/modelRouting/understandingProvider.ts');
const { planRuntimeUnderstanding } = require('../../src/services/ask/modelRouting/runtimeUnderstanding.ts');
const { geminiService } = require('../../src/services/gemini.service.ts');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const MSG = 'How old is my water heater, is it under warranty, what would a replacement cost, and should I repair or replace it?';
const f = (span, target, extra = {}) => ({ span, target, entity: 'water heater', dependsOn: [], confidence: 0.9, ...extra });
const op = (operationId) => ({ kind: 'OPERATION', operationId });

test('availability: single-call p*qt, two-stage p*qd*qt^S, no-model 1, scenarios in the documented order', () => {
  const b = AVAILABILITY_SCENARIOS.baseline;
  close(routingSuccessProbability({ kind: 'SINGLE_CALL' }, b), 0.999 * 0.995);
  close(routingSuccessProbability({ kind: 'TWO_STAGE', targetCalls: 3 }, b), 0.999 * 0.997 * 0.995 ** 3);
  close(routingSuccessProbability({ kind: 'NO_MODEL' }, b), 1);
  close(routingSuccessProbability({ kind: 'TWO_STAGE', targetCalls: 3 }, AVAILABILITY_SCENARIOS.optimistic), 1);
  const two = { kind: 'TWO_STAGE', targetCalls: 2 };
  const order = ['optimistic', 'baseline', 'degradedProvider', 'correlatedOutage'].map((k) => routingSuccessProbability(two, AVAILABILITY_SCENARIOS[k]));
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i] <= order[i - 1] + 1e-12, `${i}: ${order}`);
  const degraded = AVAILABILITY_SCENARIOS.degradedProvider;
  close(routingSuccessProbability({ kind: 'SINGLE_CALL' }, degraded), 0.999 * (0.98 * 0.995 + 0.02 * 0.9));
});
test('availability: a provider failure is never counted as honored (hFail defaults to 0), and bad probabilities are rejected', () => {
  const b = AVAILABILITY_SCENARIOS.baseline;
  close(expectedHonor({ kind: 'SINGLE_CALL' }, b, 0.95), 0.999 * 0.995 * 0.95);
  close(expectedHonor({ kind: 'SINGLE_CALL' }, b, 0.95, 0.5), 0.999 * 0.995 * 0.95 + (1 - 0.999 * 0.995) * 0.5);
  assert.throws(() => routingSuccessProbability({ kind: 'SINGLE_CALL' }, { p: 1.2, qd: 1, qt: 1 }), RangeError);
  close(endToEndHonorRate([{ path: { kind: 'NO_MODEL' }, h: 1 }, { path: { kind: 'SINGLE_CALL' }, h: 1 }], { p: 1, qd: 1, qt: 0.5 }), 0.75);
});
test('plan validation: the headline prompt keeps four composable facets, the persisting decision runs as its pure variant', () => {
  const v = validateRequestPlan({ facets: [
    f('How old is my water heater', op('INVENTORY_LOOKUP')), f('is it under warranty', op('WARRANTY_LOOKUP'), { dependsOn: [0] }),
    f('what would a replacement cost', op('ITEM_REPLACEMENT_COST')), f('should I repair or replace it', op('REPLACEMENT_GUIDANCE')),
  ] }, { message: MSG });
  assert.deepEqual(v.accepted.map((x) => x.target.operationId), ['INVENTORY_LOOKUP', 'WARRANTY_LOOKUP', 'ITEM_REPLACEMENT_COST', 'ITEM_REPAIR_REPLACE_VERDICT']);
  assert.deepEqual(v.dropped, []);
  assert.deepEqual(v.accepted[1].dependsOn, [v.accepted[0].id]);
});
test('plan validation: invented targets, writes, spans not in the message, duplicates and bad dependencies are dropped AND reported', () => {
  const v = validateRequestPlan({ facets: [
    f('How old is my water heater', op('NOT_AN_OPERATION')),
    f('is it under warranty', op('WARRANTY_UPDATE')),
    f('something the user never said', op('INVENTORY_LOOKUP')),
    f('How old is my water heater', op('INVENTORY_LOOKUP')),
    f('How old is my water heater', op('INVENTORY_LOOKUP')),
    f('what would a replacement cost', op('ITEM_REPLACEMENT_COST'), { dependsOn: [9] }),
    f('what would a replacement cost', op('ITEM_REPLACEMENT_COST'), { dependsOn: [0] }),
    f('is it under warranty', { kind: 'DATA_POINT', dataPointId: 'warranty.expiryDate' }),
    f('is it under warranty', { kind: 'DATA_POINT', dataPointId: 'item.sourceHash' }),
  ] }, { message: MSG });
  const reasons = Object.fromEntries(v.dropped.map((d) => [d.index, d.reason]));
  assert.equal(reasons[0], 'UNKNOWN_TARGET'); assert.equal(reasons[1], 'WRITE_NOT_COMPOSABLE'); assert.equal(reasons[2], 'SPAN_NOT_IN_MESSAGE'); assert.equal(reasons[4], 'DUPLICATE');
  assert.equal(reasons[5], 'BAD_DEPENDENCY'); assert.equal(reasons[8], 'UNKNOWN_TARGET');
  assert.ok(v.accepted.some((x) => x.target.dataPointId === 'warranty.expiryDate'));
});
test('plan validation: the facet limit never truncates silently, and an ineligible operation is dropped', () => {
  const many = { facets: ['INVENTORY_LOOKUP', 'WARRANTY_LOOKUP', 'ITEM_REPLACEMENT_COST', 'RECALL_REVIEW', 'HOME_TIMELINE_EVENTS', 'MAINTENANCE_BUDGET_FORECAST', 'HOME_UPGRADE_SCENARIOS'].map((id) => f('water heater', op(id), { entity: id })) };
  const v = validateRequestPlan(many, { message: 'water heater', maxFacets: 6 });
  assert.equal(v.accepted.length, 6); assert.equal(v.overflow, 1); assert.equal(v.dropped[0].reason, 'OVER_LIMIT');
  const ineligible = validateRequestPlan({ facets: [f('water heater', op('WARRANTY_LOOKUP'))] }, { message: 'water heater', eligibleOperationIds: new Set(['INVENTORY_LOOKUP']) });
  assert.equal(ineligible.dropped[0].reason, 'NOT_ELIGIBLE');
  assert.equal(validateRequestPlan({ facets: 'nonsense' }, { message: 'x' }).accepted.length, 0);
});
test('facet identity is stable and independent of order', () => {
  assert.equal(facetId('OP:WARRANTY_LOOKUP', 'Water  Heater'), facetId('OP:WARRANTY_LOOKUP', 'water heater'));
  assert.notEqual(facetId('OP:WARRANTY_LOOKUP', 'roof'), facetId('OP:WARRANTY_LOOKUP', 'water heater'));
});

const ctx = { eligibleOperationIds: undefined };
test('guard: refused unless provider terms are recorded; the provider is never called', async () => {
  const p = new ScriptedProvider(() => ({ facets: [] }));
  const r = await guardedPlan({ message: MSG, provider: p, providerTermsRecorded: false, planContext: ctx });
  assert.deepEqual(r, { kind: 'REFUSED', reason: 'PROVIDER_TERMS_NOT_RECORDED' }); assert.equal(p.received.length, 0);
});
test('guard: only the minimised text is sent; an identifier-only or unclassifiable prompt is not sent at all', async () => {
  const p = new ScriptedProvider(() => ({ facets: [f('claim', op('INVENTORY_LOOKUP'))] }));
  const r = await guardedPlan({ message: 'what is the status of my claim with State Farm, email jane@example.com', knownNames: [{ name: 'State Farm', role: 'INSURER' }], provider: p, providerTermsRecorded: true, planContext: ctx });
  assert.equal(r.kind, 'PLANNED');
  assert.ok(!/jane@example\.com|State Farm/.test(p.received[0]), p.received[0]); assert.match(p.received[0], /\[INSURER\]/);
  const q = new ScriptedProvider(() => ({ facets: [] }));
  const refused = await guardedPlan({ message: 'check Hendersen 44120987 please', provider: q, providerTermsRecorded: true, planContext: ctx });
  assert.equal(refused.kind, 'REFUSED'); assert.equal(q.received.length, 0);
});
test('guard: a timeout, an error and a malformed plan are UNAVAILABLE outcomes, never a guess', async () => {
  const slow = new ScriptedProvider(() => new Promise(() => {}));
  const t0 = Date.now();
  const timeout = await guardedPlan({ message: 'how old is my roof', provider: slow, providerTermsRecorded: true, planContext: ctx });
  assert.equal(timeout.reason, 'TIMEOUT'); assert.ok(Date.now() - t0 < MODEL_CALL_BUDGET.perCallTimeoutMs + 800);
  const boom = await guardedPlan({ message: 'how old is my roof', provider: new ScriptedProvider(() => { throw new Error('x'); }), providerTermsRecorded: true, planContext: ctx });
  assert.equal(boom.reason, 'PROVIDER_ERROR');
  const bad = await guardedPlan({ message: 'how old is my roof', provider: new ScriptedProvider(() => ({ nope: 1 })), providerTermsRecorded: true, planContext: ctx });
  assert.equal(bad.reason, 'SCHEMA_FAILURE');
});

test('real Gemini adapter sends only reviewed catalogue metadata and normalizes provider facets into the validated plan schema', async (t) => {
  const original = geminiService.planAskUnderstanding;
  let captured;
  geminiService.planAskUnderstanding = async (input) => {
    captured = input;
    return { facets: [{ span: 'how old is my water heater', kind: 'OPERATION', operationId: 'INVENTORY_LOOKUP', entity: 'water heater', dependsOn: [], confidence: 0.91 }] };
  };
  t.after(() => { geminiService.planAskUnderstanding = original; });
  const provider = new GeminiUnderstandingProvider();
  const raw = await provider.plan({ text: 'how old is my water heater', signal: new AbortController().signal });
  assert.equal(captured.text, 'how old is my water heater');
  assert.ok(captured.operations.some((entry) => entry.id === 'INVENTORY_LOOKUP'));
  assert.ok(captured.dataPoints.some((entry) => entry.id === 'item.installedOn'));
  assert.deepEqual(raw.facets[0].target, { kind: 'OPERATION', operationId: 'INVENTORY_LOOKUP' });
});

test('runtime bridge cannot call a provider without every policy gate and a certified calibration stratum', async () => {
  const provider = new ScriptedProvider(() => { throw new Error('must not be called'); });
  const common = { message: MSG, eligibleOperationIds: new Set(['INVENTORY_LOOKUP']), provider };
  assert.equal((await planRuntimeUnderstanding({ ...common, controls: { enabled: false, providerTermsRecorded: false, homeownerTextApproved: false } })).reason, 'FEATURE_OFF');
  assert.equal((await planRuntimeUnderstanding({ ...common, controls: { enabled: true, providerTermsRecorded: false, homeownerTextApproved: true } })).reason, 'PROVIDER_TERMS_NOT_RECORDED');
  assert.equal((await planRuntimeUnderstanding({ ...common, controls: { enabled: true, providerTermsRecorded: true, homeownerTextApproved: false } })).reason, 'HOMEOWNER_TEXT_NOT_APPROVED');
  assert.equal((await planRuntimeUnderstanding({ ...common, controls: { enabled: true, providerTermsRecorded: true, homeownerTextApproved: true } })).reason, 'STRATUM_NOT_CERTIFIED');
  assert.equal(provider.received.length, 0);
});
