const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'x';
require('ts-node/register');

// A Desktop tool action launched from a journey step reports only to that exact, revalidated step (continuation FRD section 49).
const { prisma } = require('../../src/lib/prisma.ts');
const { reportToExactStep } = require('../../src/services/guidanceEngine/exactStepReporting.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const recallsService = require('../../src/services/recalls.service.ts');
const recallsController = require('../../src/controllers/recalls.controller.ts');
const { priceFinalizationSubjectMatches } = require('../../src/controllers/priceFinalization.controller.ts');

let step; let reports; let saved; let rec;
const stepRow = (over = {}) => ({ id: 's1', stepKey: 'safety_alert', toolKey: 'recalls', status: 'PENDING', journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-1', primarySignal: null }, ...over });
test.beforeEach(() => {
  step = stepRow(); reports = [];
  saved = ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyEvent', 'guidanceStepEvidence', 'guidanceJourneyStep'].map((n) => [n, prisma[n]]);
  rec = guidanceJourneyService.recordToolCompletion;
  prisma.guidanceSignal = {}; prisma.guidanceJourney = {}; prisma.guidanceJourneyEvent = {}; prisma.guidanceStepEvidence = {};
  prisma.guidanceJourneyStep = { findFirst: async ({ where }) => (step && where.journey?.propertyId === 'p1' || !where.journey ? step : null) };
  guidanceJourneyService.recordToolCompletion = async (p) => { reports.push(p); return {}; };
});
test.afterEach(() => { for (const [n, m] of saved) prisma[n] = m; guidanceJourneyService.recordToolCompletion = rec; });

const scope = { toolKey: 'recalls', stepKeys: ['safety_alert'] };

test('no step id: nothing is reported here (the caller keeps its out-of-journey path)', async () => {
  const out = await reportToExactStep('p1', null, scope, async () => true);
  assert.deepEqual(out, { supplied: false, reported: null, refusal: null });
});

test('a stale, closed, wrong-tool or wrong-home step reports nothing and never falls back', async () => {
  let called = 0;
  const run = (propertyId = 'p1') => reportToExactStep(propertyId, 's1', scope, async () => { called += 1; return true; });
  step = null; assert.equal((await run()).refusal, 'NOT_FOUND');
  step = stepRow({ status: 'COMPLETED' }); assert.equal((await run()).refusal, 'STEP_DONE');
  step = stepRow({ toolKey: 'booking' }); assert.equal((await run()).refusal, 'WRONG_TOOL');
  step = stepRow({ stepKey: 'recall_resolution' }); assert.equal((await run()).refusal, 'WRONG_STEP');
  step = stepRow(); assert.equal((await run('other-home')).refusal, 'NOT_FOUND');
  assert.equal(called, 0);
});

test('a subject check can refuse a step about another item; a failed report is false, not thrown', async () => {
  const wrongItem = await reportToExactStep('p1', 's1', scope, async () => true, (b) => (b.inventoryItemId === 'item-2' ? null : 'WRONG_SUBJECT'));
  assert.equal(wrongItem.refusal, 'WRONG_SUBJECT');
  const failed = await reportToExactStep('p1', 's1', scope, async () => { throw new Error('down'); });
  assert.deepEqual([failed.supplied, failed.reported], [true, false]);
});

test('an item-scoped price-finalization step binds only to a record for that exact item', () => {
  assert.equal(priceFinalizationSubjectMatches('item-1', 'item-1'), true);
  assert.equal(priceFinalizationSubjectMatches('item-1', 'item-2'), false);
  assert.equal(priceFinalizationSubjectMatches('item-1', null), false);
  assert.equal(priceFinalizationSubjectMatches(null, 'item-2'), true, 'a property-scoped journey may use an item record in that home');
});

test('Desktop recall action: a supplied step reports only for the match\'s own item, the match is saved either way, and no step id keeps the family path', async () => {
  const row = { id: 'm1', propertyId: 'p1', inventoryItemId: 'item-1', recallId: 'r1' };
  const saves = [];
  const savedConfirm = recallsService.confirmRecallMatch;
  recallsService.confirmRecallMatch = async () => { saves.push('saved'); return row; };
  const responses = [];
  const res = () => ({ json(value) { responses.push(value); return this; }, status() { return this; } });
  try {
    await recallsController.confirmMatch({ params: { propertyId: 'p1', matchId: 'm1' }, query: { guidanceStepId: 's1' }, body: {}, user: { userId: 'u1' } }, res());
    assert.equal(reports.length, 1);
    assert.equal(reports[0].journeyId, 'j1');
    assert.equal(responses.at(-1).guidanceReport.reported, true, 'the UI receives the actual reporting outcome');
    reports.length = 0;
    step = stepRow({ journey: { id: 'j1', status: 'ACTIVE', inventoryItemId: 'item-9', primarySignal: null } });
    await recallsController.confirmMatch({ params: { propertyId: 'p1', matchId: 'm1' }, query: { guidanceStepId: 's1' }, body: {}, user: { userId: 'u1' } }, res());
    assert.equal(reports.length, 0, 'a journey about another item is not advanced');
    assert.equal(saves.length, 2, 'the domain write is saved either way');
    assert.equal(responses.at(-1).guidanceReport.refusal, 'WRONG_SUBJECT', 'a saved recall action does not masquerade as journey proof');
    await recallsController.confirmMatch({ params: { propertyId: 'p1', matchId: 'm1' }, query: {}, body: {}, user: { userId: 'u1' } }, res());
    assert.equal(reports.length, 1, 'outside a journey the family path still reports');
    assert.equal(reports[0].journeyId, undefined);
  } finally { recallsService.confirmRecallMatch = savedConfirm; }
});

test('the generic completion endpoints refuse every step that has a connected typed path (no lasting dual path)', async () => {
  const controller = require('../../src/controllers/guidance.controller.ts');
  const run = async (handler, req) => { let err = null; await handler(req, { json() {}, status() { return this; } }, (e) => { err = e; }); return err; };
  const base = { user: { userId: 'u1' }, params: { propertyId: 'p1', stepId: 's1' } };
  for (const [toolKey, stepKey] of [['do-nothing-simulator', 'compare_action_options'], ['recalls', 'safety_alert'], ['recalls', 'recall_resolution'], ['negotiation-shield', 'prepare_negotiation'], ['price-finalization', 'finalize_price'], ['coverage-intelligence', 'compare_coverage_options'], ['service-price-radar', 'validate_price']]) {
    step = stepRow({ toolKey, stepKey });
    assert.equal((await run(controller.completeGuidanceStep, { ...base, body: {} }))?.code, 'GUIDANCE_TYPED_PATH_REQUIRED', `${toolKey}:${stepKey} (complete)`);
    assert.equal((await run(controller.recordGuidanceToolCompletion, { ...base, body: { stepKey, sourceToolKey: toolKey, status: 'COMPLETED' } }))?.code, 'GUIDANCE_TYPED_PATH_REQUIRED', `${toolKey}:${stepKey} (tool completion)`);
  }
});
