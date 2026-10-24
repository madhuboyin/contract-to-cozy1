const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Superseding the retired Home Savings funding step (continuation FRD section 32): atomic, in the same position, never completed, never merely skipped.
// The prisma models are an in-memory fake that enforces the real unique constraints and rolls a transaction back when anything in it throws.

const { prisma } = require('../../src/lib/prisma.ts');
const { guidanceStepResolverService } = require('../../src/services/guidanceEngine/guidanceStepResolver.service.ts');
const { getTemplateByJourneyTypeKey, HIDDEN_STEP_REASON_CODES } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');
const { mapGuidanceJourney } = require('../../src/services/guidanceEngine/guidanceMapper.ts');

const TYPE = 'financial_exposure_resolution';
const template = getTemplateByJourneyTypeKey(TYPE);
let state; let saved; let failCreate; let counter;

const clone = (value) => JSON.parse(JSON.stringify(value));
function legacySteps(oldStatus = 'PENDING') {
  // The journey as the 1.2.0 template built it: the Home Savings step in position 4, completed steps before it.
  return template.steps.map((step) => {
    const old = step.stepKey === 'fund_capital_expense';
    const completedBefore = step.stepOrder < 4;
    return { id: `s-${old ? 'old' : step.stepKey}`, journeyId: 'j1', stepOrder: step.stepOrder, stepKey: old ? 'evaluate_savings_funding' : step.stepKey, label: old ? 'Find savings to offset costs' : step.label,
      toolKey: old ? 'home-savings' : step.toolKey ?? null, status: old ? oldStatus : completedBefore ? 'COMPLETED' : 'PENDING', isRequired: step.isRequired, skippedReasonCode: null, skippedReason: null, updatedAt: new Date() };
  });
}
function violates(rows, row, ignoreId) {
  return rows.some((other) => other.id !== ignoreId && other.journeyId === row.journeyId && (other.stepOrder === row.stepOrder || other.stepKey === row.stepKey));
}
function models(store) {
  const match = (where = {}) => (row) => Object.entries(where).every(([key, value]) => (key === 'journey' ? true : key === 'id' ? row.id === value : row[key] === value));
  return {
    guidanceSignal: {}, guidanceStepEvidence: {},
    guidanceJourney: {
      findFirst: async ({ where }) => (store.journeys.find(match({ id: where.id })) ?? null),
      update: async ({ where, data }) => { const row = store.journeys.find((j) => j.id === where.id); for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] ?? 0) + v.increment : v; return row; },
    },
    guidanceJourneyStep: {
      findMany: async ({ where }) => store.steps.filter((row) => row.journeyId === where.journeyId).sort((a, b) => a.stepOrder - b.stepOrder).map(clone),
      findFirst: async ({ where }) => store.steps.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const row = store.steps.find((s) => s.id === where.id);
        const next = { ...row, ...data };
        if (violates(store.steps, next, row.id)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        Object.assign(row, data); return row;
      },
      create: async ({ data }) => {
        if (failCreate) throw new Error('create failed');
        if (violates(store.steps, data)) throw Object.assign(new Error('Unique constraint failed (journeyId, stepOrder)'), { code: 'P2002' });
        const row = { id: `s-${data.stepKey}-${++counter}`, skippedReasonCode: null, skippedReason: null, ...data }; store.steps.push(row); return row;
      },
    },
    guidanceJourneyEvent: { create: async ({ data }) => { store.events.push(data); return data; } },
  };
}

test.beforeEach(() => {
  counter = 0; failCreate = false;
  state = { journeys: [{ id: 'j1', propertyId: 'p1', journeyTypeKey: TYPE, status: 'ACTIVE', currentStepKey: 'evaluate_savings_funding', currentStepOrder: 4, version: 3 }], steps: legacySteps(), events: [] };
  saved = { models: ['guidanceSignal', 'guidanceJourney', 'guidanceJourneyStep', 'guidanceJourneyEvent', 'guidanceStepEvidence'].map((name) => [name, prisma[name]]), tx: prisma.$transaction };
  Object.assign(prisma, models(state));
  prisma.$transaction = async (fn) => {
    const snapshot = clone({ journeys: state.journeys, steps: state.steps, events: state.events });
    try { return await fn(models(state)); } catch (error) { state.journeys = snapshot.journeys; state.steps = snapshot.steps; state.events = snapshot.events; Object.assign(prisma, models(state)); throw error; }
  };
});
test.afterEach(() => { for (const [name, model] of saved.models) prisma[name] = model; prisma.$transaction = saved.tx; });

const supersede = () => guidanceStepResolverService.supersedeRetiredTemplateSteps({ propertyId: 'p1', journeyId: 'j1' });
const byKey = (key) => state.steps.find((step) => step.stepKey === key);

test('an open retired step is superseded, not completed: parked with a machine-readable reason, and the replacement takes its position', async () => {
  assert.equal(await supersede(), true);
  const old = byKey('evaluate_savings_funding');
  assert.deepEqual({ status: old.status, code: old.skippedReasonCode, order: old.stepOrder }, { status: 'SKIPPED', code: 'TEMPLATE_SUPERSEDED', order: 1004 });
  assert.match(old.skippedReason, /^replacedBy=capital-timeline:fund_capital_expense;template=financial_exposure_resolution@1\.3\.0$/);
  assert.notEqual(old.status, 'COMPLETED');
  const created = byKey('fund_capital_expense');
  assert.deepEqual({ order: created.stepOrder, status: created.status, tool: created.toolKey, required: created.isRequired }, { order: 4, status: 'PENDING', tool: 'capital-timeline', required: true });
  assert.ok(created.governanceJson && created.safetyTier, 'the replacement carries the template\'s governance');
  assert.equal(state.journeys[0].currentStepKey, 'fund_capital_expense', 'the current step follows the replacement');
  assert.deepEqual([state.journeys[0].currentStepOrder, state.journeys[0].version], [4, 4]);
  assert.deepEqual({ type: state.events[0].eventType, code: state.events[0].reasonCode, to: state.events[0].toStepStatus, replacement: state.events[0].payloadJson.replacementStepKey }, { type: 'STEP_SKIPPED', code: 'TEMPLATE_SUPERSEDED', to: 'SKIPPED', replacement: 'fund_capital_expense' });
});

test('completed prior steps and later steps are untouched, and a second run changes nothing', async () => {
  const before = clone(state.steps.filter((step) => step.stepKey !== 'evaluate_savings_funding'));
  await supersede();
  for (const row of before) assert.deepEqual({ ...state.steps.find((step) => step.id === row.id), updatedAt: undefined }, { ...row, updatedAt: undefined }, row.stepKey);
  const snapshot = clone(state);
  assert.equal(await supersede(), false);
  assert.deepEqual(clone(state), snapshot);
});

test('it is atomic: if the replacement cannot be inserted nothing changes, and the old step stays exactly as it was (never merely skipped)', async () => {
  const before = clone(state);
  failCreate = true;
  await assert.rejects(() => supersede(), /create failed/);
  assert.deepEqual(clone(state), before);
  assert.equal(byKey('evaluate_savings_funding').status, 'PENDING');
  assert.equal(byKey('fund_capital_expense'), undefined);
});

test('a retired step already completed or skipped stays as it is and the journey gets no replacement', async () => {
  for (const status of ['COMPLETED', 'SKIPPED']) {
    state.steps = legacySteps(status);
    assert.equal(await supersede(), false, status);
    assert.equal(byKey('fund_capital_expense'), undefined, status);
    assert.equal(byKey('evaluate_savings_funding').status, status);
    // The template sync must not try to insert the replacement either (its order is taken, and the journey already finished that job).
    await guidanceStepResolverService.ensureTemplateSteps({ propertyId: 'p1', journeyId: 'j1', templateSteps: template.steps, templateGovernance: template.governance });
    assert.equal(byKey('fund_capital_expense'), undefined, `${status}: no replacement from the template sync`);
  }
});

test('a template sync on a legacy open journey supersedes first, so the replacement is inserted without a unique-order collision, once', async () => {
  await guidanceStepResolverService.ensureTemplateSteps({ propertyId: 'p1', journeyId: 'j1', templateSteps: template.steps, templateGovernance: template.governance });
  assert.equal(state.steps.filter((step) => step.stepKey === 'fund_capital_expense').length, 1);
  assert.equal(byKey('evaluate_savings_funding').skippedReasonCode, 'TEMPLATE_SUPERSEDED');
  assert.deepEqual(state.steps.filter((step) => step.stepOrder < 1000).map((step) => step.stepOrder).sort(), template.steps.map((step) => step.stepOrder).sort());
  await guidanceStepResolverService.ensureTemplateSteps({ propertyId: 'p1', journeyId: 'j1', templateSteps: template.steps, templateGovernance: template.governance });
  assert.equal(state.steps.filter((step) => step.stepKey === 'fund_capital_expense').length, 1, 'a second sync adds nothing');
});

test('a journey of another type, or one that is not open, is never touched; the superseded row is hidden from the journey the homeowner sees', async () => {
  state.journeys[0].journeyTypeKey = 'asset_lifecycle_resolution';
  assert.equal(await supersede(), false);
  state.journeys[0].journeyTypeKey = TYPE; state.journeys[0].status = 'DISMISSED';
  assert.equal(await supersede(), false);
  assert.equal(byKey('evaluate_savings_funding').status, 'PENDING');
  state.journeys[0].status = 'ACTIVE';
  await supersede();
  assert.ok(HIDDEN_STEP_REASON_CODES.includes('TEMPLATE_SUPERSEDED'));
  const mapped = mapGuidanceJourney({ ...state.journeys[0], primarySignal: null, steps: state.steps.map((step) => ({ ...step, governanceJson: null, producedDataJson: null })) });
  assert.equal(mapped.steps.some((step) => step.stepKey === 'evaluate_savings_funding'), false, 'hidden');
  assert.equal(mapped.steps.some((step) => step.stepKey === 'fund_capital_expense'), true);
});
