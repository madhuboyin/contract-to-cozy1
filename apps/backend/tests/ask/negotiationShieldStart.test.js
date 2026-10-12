const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Negotiation Shield slice 2a (docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md): start a review inside Ask. No database, browser or
// native module: `sharp` is stubbed, the Prisma models are an in-memory fake, and collaborators with their own side effects are replaced.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const projectCompliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/analytics/index.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const { createNegotiationShieldCaseBodySchema } = require('../../src/validators/negotiationShield.validators.ts');
const start = require('../../src/services/ask/support/negotiationShieldStart.ts');
const { negotiationShieldStartResult, negotiationShieldStartIdempotencyKey } = require('../../src/services/ask/handlers/negotiationShieldStart.handler.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId;
const OP = 'NEGOTIATION_SHIELD_CASE_START';

// ───────────────────────────── routing ─────────────────────────────

test('a typed request to start a negotiation review reaches the start command, never the list or guidance', () => {
  for (const message of [
    'Start a negotiation review',
    'start a negotiation review for my roof quote',
    'create a new negotiation shield case',
    'Start a negotiation shield review for my insurance renewal',
    'begin a negotiation case',
    'new negotiation review',
  ]) assert.equal(route(message), OP, message);
});

test('reads and other phrasings keep their routes', () => {
  assert.equal(route('Show my negotiation shield cases'), 'NEGOTIATION_SHIELD_CASES');
  assert.equal(route('List the negotiation reviews I have prepared'), 'NEGOTIATION_SHIELD_CASES');
  assert.notEqual(route('Is this contractor price fair?'), OP);
  assert.notEqual(route('Compare my service quotes'), OP);
});

// ───────────────────────────── field specs and validation ─────────────────────────────

test('the four scenarios ask for exactly the fields the page builds, with bounded notes and no pasted-text field', () => {
  assert.deepEqual([...start.NEGOTIATION_START_SCENARIOS], ['CONTRACTOR_QUOTE_REVIEW', 'INSURANCE_PREMIUM_INCREASE', 'INSURANCE_CLAIM_SETTLEMENT', 'CONTRACTOR_URGENCY_PRESSURE']);
  const keys = (scenario) => start.NEGOTIATION_START_SCENARIO_SPECS[scenario].fields.map((field) => field.key);
  assert.deepEqual(keys('CONTRACTOR_QUOTE_REVIEW'), ['contractorName', 'quoteAmount', 'quoteDate', 'serviceCategory', 'urgencyClaimed', 'notes']);
  assert.deepEqual(keys('INSURANCE_PREMIUM_INCREASE'), ['insurerName', 'priorPremium', 'newPremium', 'renewalDate', 'reasonProvided', 'notes']);
  assert.deepEqual(keys('INSURANCE_CLAIM_SETTLEMENT'), ['insurerName', 'claimType', 'settlementAmount', 'estimateAmount', 'claimDate', 'reasonProvided', 'notes']);
  assert.deepEqual(keys('CONTRACTOR_URGENCY_PRESSURE'), ['contractorName', 'recommendedWork', 'quoteAmount', 'urgencyClaimed', 'sameDayPressure', 'repairOptionMentioned', 'notes']);
  for (const spec of Object.values(start.NEGOTIATION_START_SCENARIO_SPECS)) {
    assert.equal(spec.fields.some((field) => field.key === 'rawText'), false);
    const notes = spec.fields.find((field) => field.key === 'notes');
    assert.equal(notes.max, 1000);
  }
});

test('a submitted form becomes the structured input the rules engine reads, and only what was entered', () => {
  const quote = start.parseNegotiationStartAnswer('CONTRACTOR_QUOTE_REVIEW', {
    title: ' Roof quote ', contractorName: 'Acme Roofing', quoteAmount: '18500', quoteDate: { precision: 'EXACT_DATE', value: '2026-09-30' },
    serviceCategory: 'roof replacement', urgencyClaimed: 'yes', notes: '',
  });
  assert.equal(quote.success, true);
  assert.deepEqual(quote.data, {
    scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', inputType: 'CONTRACTOR_QUOTE',
    structuredData: { contractorName: 'Acme Roofing', quoteAmount: 18500, quoteDate: '2026-09-30', serviceCategory: 'roof replacement', urgencyClaimed: true },
  });
  const urgency = start.parseNegotiationStartAnswer('CONTRACTOR_URGENCY_PRESSURE', { title: 'Same-day push', sameDayPressure: 'no', urgencyClaimed: 'unknown', quoteAmount: 900 });
  assert.deepEqual(urgency.data.structuredData, { quoteAmount: 900, sameDayPressure: false }, '"Not sure" records nothing');
  assert.equal(urgency.data.inputType, 'CONTRACTOR_URGENCY');
});

test('a review needs a name and at least one detail; amounts and unknown fields are bounded', () => {
  assert.deepEqual(start.parseNegotiationStartAnswer('INSURANCE_PREMIUM_INCREASE', { title: 'Renewal' }), { success: false, reason: 'NO_DETAIL' });
  assert.deepEqual(start.parseNegotiationStartAnswer('INSURANCE_PREMIUM_INCREASE', { title: 'Renewal', notes: '   ' }), { success: false, reason: 'NO_DETAIL' });
  for (const bad of [
    { title: '', newPremium: 100 },
    { title: 'x', newPremium: -5 },
    { title: 'x', newPremium: 'abc' },
    { title: 'x', newPremium: 1_000_000_000 },
    { title: 'x', renewalDate: 'tomorrow' },
    { title: 'x', notes: 'n'.repeat(1001) },
    { title: 'x', rawText: 'a pasted quote' },
    { title: 'x', quoteAmount: 100 },
  ]) assert.equal(start.parseNegotiationStartAnswer('INSURANCE_PREMIUM_INCREASE', bad).success, false, JSON.stringify(bad).slice(0, 60));
});

test('a typed request names a scenario only when it clearly does', () => {
  assert.equal(start.inferNegotiationStartScenario('start a negotiation review for my roof quote'), 'CONTRACTOR_QUOTE_REVIEW');
  assert.equal(start.inferNegotiationStartScenario('start a negotiation review for my insurance renewal'), 'INSURANCE_PREMIUM_INCREASE');
  assert.equal(start.inferNegotiationStartScenario('start a negotiation review for the claim settlement'), 'INSURANCE_CLAIM_SETTLEMENT');
  assert.equal(start.inferNegotiationStartScenario('start a negotiation review, the contractor wants an answer today, same day'), 'CONTRACTOR_URGENCY_PRESSURE');
  assert.equal(start.inferNegotiationStartScenario('start a negotiation review'), null);
});

// ───────────────────────────── the command ─────────────────────────────

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const DECLARED = { operationId: OP, surface: 'ASK_PAGE' };

test('Start a review with no scenario asks which of the four, as rows that launch the chosen scenario', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const result = await invoke(start.NEGOTIATION_SHIELD_START_MESSAGE, DECLARED);
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_SCENARIO_REQUIRED');
    const items = result.blocks[0].sections[0].items;
    assert.deepEqual(items.map((item) => item.id), [...start.NEGOTIATION_START_SCENARIOS]);
    for (const item of items) {
      assert.equal(item.entityType, 'NEGOTIATION_SHIELD_SCENARIO');
      assert.equal(item.actions[0].operationId, OP);
      assert.equal(item.actions[0].message, start.NEGOTIATION_SHIELD_START_MESSAGE);
    }
  } finally { restore(); }
});

test('a chosen scenario opens its form with the scenario recorded for the capture, and the title pre-filled', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const result = await invoke(start.NEGOTIATION_SHIELD_START_MESSAGE, { ...DECLARED, entityType: 'NEGOTIATION_SHIELD_SCENARIO', entityId: 'INSURANCE_PREMIUM_INCREASE' });
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED');
    assert.deepEqual(result.parameters.negotiationStartLaunch, { scenarioType: 'INSURANCE_PREMIUM_INCREASE', sourceExecutionId: null });
    const [capture] = result.captureRequests;
    assert.equal(capture.captureKey, start.NEGOTIATION_SHIELD_START_CAPTURE_KEY);
    assert.deepEqual(capture.inputSchema.fields.map((field) => field.key), ['title', 'insurerName', 'priorPremium', 'newPremium', 'renewalDate', 'reasonProvided', 'notes']);
    assert.equal(capture.currentAnswer.title, 'Insurance premium increase');
    assert.equal(capture.inputSchema.fields.find((field) => field.key === 'renewalDate').inputSchema.allowFuture, true);
    assert.equal(capture.inputSchema.fields.find((field) => field.key === 'newPremium').inputSchema.type, 'NUMBER');
  } finally { restore(); }
});

test('a typed start that names its scenario goes straight to that form; one that does not asks which', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const named = await invoke('start a negotiation review for my roof quote', null);
    assert.equal(named.reasonCode, 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED');
    assert.equal(named.parameters.negotiationStartLaunch.scenarioType, 'CONTRACTOR_QUOTE_REVIEW');
    const unnamed = await invoke('Start a negotiation review', null);
    assert.equal(unnamed.reasonCode, 'NEGOTIATION_SHIELD_SCENARIO_REQUIRED');
  } finally { restore(); }
});

test('a submitted form is shown for review, with a confirmation that writes nothing yet and keeps the form editable', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const parsed = start.parseNegotiationStartAnswer('CONTRACTOR_QUOTE_REVIEW', { title: 'Roof quote', quoteAmount: 18500, contractorName: 'Acme Roofing', urgencyClaimed: 'yes' });
    const result = await negotiationShieldStartResult('user-1', 'prop-1', { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: 'src-1' }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(result.parameters.negotiationShieldStart, { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', structuredData: { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true } });
    assert.equal(result.parameters.sourceExecutionId, 'src-1');
    const fields = Object.fromEntries(result.confirmation.fields.map((field) => [field.label, field.value]));
    assert.equal(fields['Quoted amount ($)'], '$18,500');
    assert.equal(fields['Did they say it has to be done urgently?'], 'Yes');
    assert.equal(fields.Type, 'Contractor quote review');
    assert.match(result.confirmation.description, /not analyzed/);
    assert.equal(result.captureRequests[0].currentAnswer.urgencyClaimed, 'yes', 'the form keeps what was entered');
    assert.equal(result.captureRequests[0].currentAnswer.quoteAmount, 18500);
  } finally { restore(); }
});

test('a viewer is blocked before any choice or form', async () => {
  const restore = withRole('VIEWER');
  try {
    for (const launch of [DECLARED, { ...DECLARED, entityType: 'NEGOTIATION_SHIELD_SCENARIO', entityId: 'CONTRACTOR_QUOTE_REVIEW' }]) {
      const result = await invoke(start.NEGOTIATION_SHIELD_START_MESSAGE, launch, 'VIEWER');
      assert.notEqual(result.status, 'NEEDS_CONTEXT');
      assert.equal(result.captureRequests, undefined);
    }
    const blocked = await negotiationShieldStartResult('user-1', 'prop-1', { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: null });
    assert.equal(blocked.status, 'BLOCKED');
  } finally { restore(); }
});

test('a refresh, or any other message, never starts anything', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const refresh = await invoke(start.NEGOTIATION_SHIELD_START_MESSAGE, { ...DECLARED, surface: 'ASK_REFRESH' });
    assert.equal(refresh.reasonCode, 'ASK_NEGOTIATION_SHIELD_START_NOT_DIRECTLY_ROUTABLE');
    const other = await invoke('what is the weather', null);
    assert.equal(other.reasonCode, 'ASK_NEGOTIATION_SHIELD_START_NOT_DIRECTLY_ROUTABLE');
  } finally { restore(); }
});

test('the command is a registered, confirmation-gated contributor command', () => {
  const command = getAskDomainCommandByOperation(OP);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'negotiation-shield.start');
  assert.equal(command.supportsCancelBeforeExecution, true);
});

// ───────────────────────────── the confirmed write ─────────────────────────────

function installWriteStubs() {
  const saved = {
    createCase: NegotiationShieldService.prototype.createCase,
    gate: projectCompliance.assertProjectComplianceApplicable,
    reconcile: executeOperation.reconcileAskExecutionSideEffects,
  };
  const seen = { createCase: [], gate: [] };
  NegotiationShieldService.prototype.createCase = async function (...args) {
    seen.createCase.push(args);
    return { case: { id: 'case-new', scenarioType: args[2].scenarioType, title: args[2].title }, inputs: [], documents: [], latestAnalysis: null, latestDraft: null, buyerFindings: [] };
  };
  projectCompliance.assertProjectComplianceApplicable = async (...args) => { seen.gate.push(args); return { contextVersion: 'ctx' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { seen, restore() {
    NegotiationShieldService.prototype.createCase = saved.createCase;
    projectCompliance.assertProjectComplianceApplicable = saved.gate;
    executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
  } };
}
const confirmCtx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-77', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const CONFIRMED = { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', structuredData: { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true } } };

test('confirming runs the page\'s gate, then creates the case and its first input once, bound to the execution', async () => {
  const stubs = installWriteStubs();
  try {
    const outcome = await confirmCapabilityInvoke(OP, confirmCtx(CONFIRMED));
    assert.equal(stubs.seen.gate.length, 1);
    assert.deepEqual(stubs.seen.gate[0], ['prop-1', 'user-1', 'NEGOTIATION_SHIELD', {}, 'negotiationShield']);
    assert.equal(stubs.seen.createCase.length, 1);
    const [propertyId, userId, payload] = stubs.seen.createCase[0];
    assert.equal(propertyId, 'prop-1');
    assert.equal(userId, 'user-1');
    assert.deepEqual(payload, {
      scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', description: null, sourceType: 'MANUAL',
      idempotencyKey: 'ask:exec-77:negotiation-shield-start',
      initialInput: { inputType: 'CONTRACTOR_QUOTE', rawText: null, structuredData: { contractorName: 'Acme Roofing', quoteAmount: 18500, urgencyClaimed: true } },
    });
    assert.equal(payload.quoteDecisionWorkspaceId, undefined, 'no Quote Comparison link in 2a');
    assert.equal(negotiationShieldStartIdempotencyKey('exec-77'), payload.idempotencyKey);
    assert.equal(outcome.artifactType, 'NEGOTIATION_SHIELD_CASE');
    assert.equal(outcome.artifactId, 'case-new');
    assert.equal(outcome.result.status, 'COMPLETED');
    const receipt = outcome.result.blocks[0];
    assert.equal(receipt.title, 'Review started');
    assert.match(receipt.description, /not been analyzed yet/);
    assert.deepEqual(receipt.actions.map((a) => [a.id, a.operationId, a.entityType, a.entityId]), [
      ['negotiation-shield-review', 'NEGOTIATION_SHIELD_CASES', 'NEGOTIATION_SHIELD_CASE', 'case-new'],
      ['negotiation-shield-analyze', 'NEGOTIATION_SHIELD_CASE_ANALYZE', 'NEGOTIATION_SHIELD_CASE', 'case-new'],
    ]);
  } finally { stubs.restore(); }
});

test('a tampered or malformed stored input is refused before any write', async () => {
  const stubs = installWriteStubs();
  try {
    for (const parameters of [
      {},
      { negotiationShieldStart: { scenarioType: 'BUYER_INSPECTION_NEGOTIATION', title: 'x', structuredData: { notes: 'n' } } },
      { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: '', structuredData: { notes: 'n' } } },
      { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'x', structuredData: {} } },
      { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'x', structuredData: { quoteAmount: -1 } } },
      { negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'x', structuredData: { rawText: 'pasted' } } },
    ]) {
      await assert.rejects(() => confirmCapabilityInvoke(OP, confirmCtx(parameters)), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    }
    assert.equal(stubs.seen.createCase.length, 0);
  } finally { stubs.restore(); }
});

test('when the property-context gate refuses, nothing is created', async () => {
  const stubs = installWriteStubs();
  projectCompliance.assertProjectComplianceApplicable = async () => { throw Object.assign(new Error('Required property context is incomplete.'), { code: 'PROPERTY_CONTEXT_REQUIRED' }); };
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, confirmCtx(CONFIRMED)), (error) => error.code === 'PROPERTY_CONTEXT_REQUIRED');
    assert.equal(stubs.seen.createCase.length, 0);
  } finally { stubs.restore(); }
});

test('every block and action of the choice, the form step and the receipt survives the answer-trust validator', async () => {
  const restore = withRole('CONTRIBUTOR');
  const stubs = installWriteStubs();
  const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'negotiation-shield.start', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } };
  try {
    const choice = await invoke(start.NEGOTIATION_SHIELD_START_MESSAGE, DECLARED);
    const confirmed = await confirmCapabilityInvoke(OP, confirmCtx(CONFIRMED));
    for (const raw of [choice, confirmed.result]) {
      const result = { ...raw, parameters: evidence };
      const { result: validated } = validateAskAnswerTrust({ question: 'Start a negotiation review.', operationId: OP, result, propertyId: 'prop-1' });
      const actions = (blocks) => blocks.flatMap((b) => [...(b.actions ?? []), ...((b.sections ?? []).flatMap((sec) => sec.items.flatMap((i) => i.actions ?? [])))]).map((a) => a.id);
      assert.deepEqual(validated.blocks.map((b) => b.id), result.blocks.map((b) => b.id));
      assert.deepEqual(actions(validated.blocks), actions(result.blocks), 'no action was stripped');
      assert.ok(actions(result.blocks).length > 0);
    }
  } finally { stubs.restore(); restore(); }
});

// ───────────────────────────── idempotency in the canonical create ─────────────────────────────

function fakeStore() {
  const cases = [];
  const inputs = [];
  let n = 0;
  const matches = (record, where) => Object.entries(where).every(([key, value]) => record[key] === value);
  const withChildren = (record) => ({ ...record, inputs: inputs.filter((input) => input.caseId === record.id), documents: [], analyses: [], drafts: [], buyerFindingLinks: [] });
  const caseModel = {
    findFirst: async ({ where }) => { const found = cases.find((record) => matches(record, where)); return found ? withChildren(found) : null; },
    create: async ({ data }) => {
      if (data.idempotencyKey && cases.some((c) => c.propertyId === data.propertyId && c.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const record = { id: `case-${++n}`, perspective: 'HOMEOWNER', analysisVersion: null, latestAnalysisAt: null, quoteDecisionWorkspaceId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      cases.push(record);
      return { id: record.id };
    },
    update: async () => ({}),
  };
  const inputModel = { create: async ({ data }) => { inputs.push({ id: `input-${inputs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }); }, count: async () => 0 };
  return { cases, inputs, caseModel, inputModel };
}
function installStore(store) {
  const saved = { caseModel: prisma.negotiationShieldCase, inputModel: prisma.negotiationShieldInput, doc: prisma.negotiationShieldDocument, an: prisma.negotiationShieldAnalysis,
    dr: prisma.negotiationShieldDraft, bf: prisma.negotiationShieldBuyerFinding, tx: prisma.$transaction, track: analytics.analyticsEmitter.track };
  prisma.negotiationShieldCase = store.caseModel;
  prisma.negotiationShieldInput = store.inputModel;
  prisma.negotiationShieldDocument = {};
  prisma.negotiationShieldAnalysis = {};
  prisma.negotiationShieldDraft = {};
  prisma.negotiationShieldBuyerFinding = {};
  prisma.$transaction = async (fn) => fn({ negotiationShieldCase: store.caseModel, negotiationShieldInput: store.inputModel });
  const tracked = [];
  analytics.analyticsEmitter.track = (event) => { tracked.push(event); };
  return { tracked, restore() {
    prisma.negotiationShieldCase = saved.caseModel; prisma.negotiationShieldInput = saved.inputModel; prisma.negotiationShieldDocument = saved.doc;
    prisma.negotiationShieldAnalysis = saved.an; prisma.negotiationShieldDraft = saved.dr; prisma.negotiationShieldBuyerFinding = saved.bf;
    prisma.$transaction = saved.tx; analytics.analyticsEmitter.track = saved.track;
  } };
}
const createInput = (extra = {}) => ({
  scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Roof quote', sourceType: 'MANUAL',
  initialInput: { inputType: 'CONTRACTOR_QUOTE', rawText: null, structuredData: { quoteAmount: 18500 } }, ...extra,
});

test('a retry with the same execution key returns the original case and creates nothing more', async () => {
  const store = fakeStore();
  const env = installStore(store);
  try {
    const service = new NegotiationShieldService();
    const key = negotiationShieldStartIdempotencyKey('exec-1');
    const first = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: key }));
    const again = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: key }));
    assert.equal(again.case.id, first.case.id);
    assert.equal(store.cases.length, 1);
    assert.equal(store.inputs.length, 1, 'one input, written with the case');
    assert.equal(store.cases[0].idempotencyKey, key);
    assert.equal(env.tracked.length, 1, 'the launch is counted once');
  } finally { env.restore(); }
});

test('a separate execution is a deliberate second review, even with the same scenario and title', async () => {
  const store = fakeStore();
  const env = installStore(store);
  try {
    const service = new NegotiationShieldService();
    const a = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: negotiationShieldStartIdempotencyKey('exec-1') }));
    const b = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: negotiationShieldStartIdempotencyKey('exec-2') }));
    assert.notEqual(a.case.id, b.case.id);
    assert.equal(store.cases.length, 2);
  } finally { env.restore(); }
});

test('the key is scoped to the property', async () => {
  const store = fakeStore();
  const env = installStore(store);
  try {
    const service = new NegotiationShieldService();
    const key = negotiationShieldStartIdempotencyKey('exec-1');
    const a = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: key }));
    const b = await service.createCase('prop-2', 'user-1', createInput({ idempotencyKey: key }));
    assert.notEqual(a.case.id, b.case.id);
    assert.equal(store.cases.length, 2);
  } finally { env.restore(); }
});

test('two confirmations racing: the unique key admits one case and the other call returns it', async () => {
  const store = fakeStore();
  const env = installStore(store);
  try {
    const service = new NegotiationShieldService();
    const key = negotiationShieldStartIdempotencyKey('exec-race');
    // The loser's pre-check ran before the winner committed: simulate by hiding the existing case from the first lookup only.
    const winner = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: key }));
    const realFind = store.caseModel.findFirst;
    let hid = false;
    store.caseModel.findFirst = async (args) => { if (!hid && args.where.idempotencyKey) { hid = true; return null; } return realFind(args); };
    const loser = await service.createCase('prop-1', 'user-1', createInput({ idempotencyKey: key }));
    assert.equal(loser.case.id, winner.case.id);
    assert.equal(store.cases.length, 1);
  } finally { env.restore(); }
});

test('the page\'s own create is unchanged: no key is stored, and the HTTP body cannot supply one', async () => {
  const store = fakeStore();
  const env = installStore(store);
  try {
    const service = new NegotiationShieldService();
    await service.createCase('prop-1', 'user-1', createInput());
    await service.createCase('prop-1', 'user-1', createInput());
    assert.equal(store.cases.length, 2, 'two page creates make two cases');
    assert.equal('idempotencyKey' in store.cases[0], false);
    const parsed = createNegotiationShieldCaseBodySchema.parse({ scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'T', sourceType: 'MANUAL', idempotencyKey: 'injected' });
    assert.equal('idempotencyKey' in parsed, false, 'the validator drops it');
  } finally { env.restore(); }
});
