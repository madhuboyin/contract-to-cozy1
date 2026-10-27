const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Service Price Radar parity (FRD v1.445): the "Need help responding?" hand-off to Negotiation Shield, and the item prefill from a guided-journey step. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const engine = require('../../src/services/guidanceEngine/guidanceStepBinding.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { servicePriceCheckDetailFromView } = require('../../src/services/ask/handlers/servicePriceRadar.handler.ts');
const { servicePriceCheckResult } = require('../../src/services/ask/handlers/homeToolRuns.handler.ts');

const detail = (verdict) => ({
  id: 'c1', propertyId: 'p1', createdAt: '2026-09-20T12:00:00.000Z', status: 'COMPLETED', serviceCategory: 'WINDOWS_DOORS', serviceSubcategory: null, serviceLabelRaw: null,
  quoteAmount: 1450, quoteCurrency: 'USD', quoteVendorName: 'Flow Pros', quoteSource: 'MANUAL', expectedLow: 900, expectedHigh: 1200, expectedMedian: 1050,
  verdict, confidenceScore: 0.7, explanationShort: 'x', pricingFactorsJson: {}, explanationJson: {}, linkedEntities: [],
});

test('the saved check offers "Need help responding?" unless the price is simply fair, and the action survives the answer-trust validator', () => {
  const ids = (verdict) => servicePriceCheckDetailFromView(detail(verdict)).blocks.find((b) => b.id === 'service-price-radar-detail').actions.map((a) => a.id);
  assert.deepEqual(ids('FAIR'), ['check-service-quote']);
  for (const verdict of ['HIGH', 'VERY_HIGH', 'UNDERPRICED', 'INSUFFICIENT_DATA']) assert.deepEqual(ids(verdict), ['service-price-check-negotiate', 'check-service-quote'], verdict);
  const result = servicePriceCheckDetailFromView(detail('HIGH'));
  const action = result.blocks[0].actions[0];
  assert.deepEqual([action.interactionType, action.operationId, action.entityType, action.entityId, action.message], ['START_WORKFLOW', 'NEGOTIATION_SHIELD_CASE_START', 'SERVICE_PRICE_CHECK', 'c1', 'Start a contractor quote review.']);
  const withEvidence = { ...result, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [completedAskAuthoritativeSourceEvidence('SERVICE_PRICE_CHECKS')] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show the details of this quote check.', operationId: 'SERVICE_PRICE_CHECKS', result: withEvidence, propertyId: 'p1' });
  assert.ok(validated.blocks.find((b) => b.id === 'service-price-radar-detail').actions.some((a) => a.id === 'service-price-check-negotiate'), 'the action is allowlisted');
});

function install(role, check) {
  const saved = { a: propertyAccess.resolvePropertyAccess, p: prisma };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  const finds = [];
  const fake = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'serviceRadarCheck') return { findFirst: async (q) => { finds.push(q); return q.where.propertyId === 'p1' && q.where.id === 'c1' ? check : null; } };
    throw new Error(`Unexpected prisma.${String(model)}`);
  } });
  require('../../src/lib/prisma.ts').prisma = fake;
  return { finds, restore() { propertyAccess.resolvePropertyAccess = saved.a; require('../../src/lib/prisma.ts').prisma = saved.p; } };
}
const launch = (entityId = 'c1') => ({ operationId: 'NEGOTIATION_SHIELD_CASE_START', surface: 'ASK_PAGE', entityType: 'SERVICE_PRICE_CHECK', entityId });
const negotiate = (launchContext) => capabilityInvoke('NEGOTIATION_SHIELD_CASE_START', { userId: 'u1', propertyId: 'p1', message: 'Start a contractor quote review.', launchContext });

test('the contractor-quote form opens with the vendor, amount and service from the saved check, read in this home, and nothing is saved', async () => {
  const w = install('CONTRIBUTOR', { quoteVendorName: 'Flow Pros', quoteAmount: { toString: () => '1450' }, serviceCategory: 'WINDOWS_DOORS' });
  try {
    const out = await negotiate(launch());
    assert.equal(out.status, 'NEEDS_CONTEXT');
    assert.deepEqual(out.captureRequests[0].currentAnswer, { title: 'Contractor quote review', contractorName: 'Flow Pros', quoteAmount: 1450, serviceCategory: 'Windows & Doors' });
    assert.deepEqual(w.finds[0].where, { id: 'c1', propertyId: 'p1' }, 'scoped to this home');
    assert.equal(out.parameters.negotiationStartLaunch.scenarioType, 'CONTRACTOR_QUOTE_REVIEW');
  } finally { w.restore(); }
  const gone = install('CONTRIBUTOR', null);
  try {
    const out = await negotiate(launch('missing'));
    assert.equal(out.status, 'NEEDS_CONTEXT');
    assert.deepEqual(out.captureRequests[0].currentAnswer, { title: 'Contractor quote review' }, 'a missing check prefills nothing');
  } finally { gone.restore(); }
  const viewer = install('VIEWER', { quoteVendorName: 'x', quoteAmount: 1, serviceCategory: 'HVAC' });
  try { assert.equal((await negotiate(launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { viewer.restore(); }
});

function installJourney({ binding, items = [], pinned = null }) {
  const saved = { a: propertyAccess.resolvePropertyAccess, p: prisma, b: engine.resolveGuidanceStepBinding };
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  engine.resolveGuidanceStepBinding = async () => binding;
  const itemQueries = [];
  require('../../src/lib/prisma.ts').prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'property') return { findFirst: async () => ({ id: 'p1' }) };
    if (model === 'inventoryItem') return { findMany: async () => items, findFirst: async (q) => { itemQueries.push(q); return q.where.propertyId === 'p1' ? pinned : null; } };
    if (model === 'inventoryRoom' || model === 'propertyRecord' || model === 'incident') return { findMany: async () => [] };
    throw new Error(`Unexpected prisma.${String(model)}`);
  } });
  return { itemQueries, restore() { propertyAccess.resolvePropertyAccess = saved.a; require('../../src/lib/prisma.ts').prisma = saved.p; engine.resolveGuidanceStepBinding = saved.b; } };
}
const ok = (inventoryItemId) => ({ ok: true, binding: { stepId: 's1', stepKey: 'validate_price', journeyId: 'j1', signalIntentFamily: null, inventoryItemId, signalSource: { toolKey: null, entityType: null, entityId: null } } });

test('a quote check started from a journey step about an item opens linked to that item, even when it is not among the recent ones; a stale step prefills nothing', async () => {
  let w = installJourney({ binding: ok('old-item'), items: [{ id: 'recent', name: 'Dishwasher' }], pinned: { id: 'old-item', name: 'Water heater' } });
  try {
    const out = await servicePriceCheckResult('u1', 'p1', undefined, null, 's1');
    const field = out.captureRequests[0].inputSchema.fields.find((f) => f.key === 'linkedEntity');
    assert.deepEqual(field.inputSchema.options.slice(1, 3).map((o) => o.value), ['SYSTEM:old-item', 'SYSTEM:recent'], 'the journey item is offered first');
    assert.equal(out.captureRequests[0].currentAnswer.linkedEntity, 'SYSTEM:old-item');
    assert.deepEqual(w.itemQueries[0].where, { id: 'old-item', propertyId: 'p1' }, 'the item must be this home\'s');
  } finally { w.restore(); }
  w = installJourney({ binding: { ok: false, reason: 'STEP_DONE' }, items: [{ id: 'recent', name: 'Dishwasher' }] });
  try {
    const out = await servicePriceCheckResult('u1', 'p1', undefined, null, 's1');
    assert.equal(out.captureRequests[0].currentAnswer.linkedEntity, '__NO_LINK__');
  } finally { w.restore(); }
  w = installJourney({ binding: ok('someone-elses'), items: [], pinned: null });
  try {
    const out = await servicePriceCheckResult('u1', 'p1', undefined, null, 's1');
    assert.equal(out.captureRequests[0].inputSchema.fields.some((f) => f.key === 'linkedEntity'), false, 'an item outside this home is never offered');
  } finally { w.restore(); }
  w = installJourney({ binding: ok('old-item'), items: [], pinned: { id: 'old-item', name: 'Water heater' } });
  try {
    const out = await servicePriceCheckResult('u1', 'p1', undefined, null, null);
    assert.equal(w.itemQueries.length, 0, 'no step, no lookup');
    assert.equal(out.captureRequests[0].currentAnswer.linkedEntity, undefined);
  } finally { w.restore(); }
});
