const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// PROPERTY_PURCHASE_DATE_SET and HOME_JOURNEY_SET (docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md v1.247): the two property settings that used to
// need a desktop page. The real registered handlers run; prisma, the access check and the two canonical writers are replaced by recording fakes,
// and the fake prisma throws on any model a test did not declare.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { purchaseDateResult, homeJourneyResult, purchaseDateContextVersion } = require('../../src/services/ask/handlers/homeSettingsWrites.handler.ts');
const { PurchaseDateAnswerSchema, PurchaseDateInputSchema, HomeJourneyInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { HOME_JOURNEY_SET_MESSAGE, PURCHASE_DATE_SET_MESSAGE } = require('../../src/services/ask/support/homeSettingsConstants.ts');
const { audienceApplicabilityResult } = require('../../src/services/ask/support/answerGuards.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const financing = require('../../src/services/financing.service.ts');
const entryContext = require('../../src/services/entryContext.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { resolveAccess: propertyAccess.resolvePropertyAccess, upsertProfile: financing.upsertProfile, updateJourney: entryContext.updateJourneyOwnershipState };
let calls;
let accessRole;
let recordedPurchase;
let recordedJourneyState;

test.beforeEach(() => {
  calls = { profile: [], journey: [] };
  accessRole = 'CONTRIBUTOR';
  recordedPurchase = null;
  recordedJourneyState = null;
  const models = {
    propertyFinancingProfile: { findUnique: async () => (recordedPurchase ? { purchaseDate: new Date(`${recordedPurchase}T12:00:00.000Z`) } : null) },
    propertyOnboarding: { findUnique: async () => (recordedJourneyState ? { ownershipState: recordedJourneyState } : null) },
    askExecution: { findMany: async () => [] },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, { get(_t, method) { if (!models[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); return models[model][method]; } });
    },
  });
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  financing.upsertProfile = async (...args) => { calls.profile.push(args); return {}; };
  entryContext.updateJourneyOwnershipState = async (...args) => { calls.journey.push(args); return {}; };
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  financing.upsertProfile = originals.upsertProfile;
  entryContext.updateJourneyOwnershipState = originals.updateJourney;
});

const envelope = (operationId, message, launchContext) => ({ userId: 'u1', propertyId: 'p1', message, launchContext });
const declared = (operationId) => ({ surface: 'ASK_WORKSPACE', operationId, sourceExecutionId: 'source-1' });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date('2026-10-10T00:00:00.000Z') });
const confirm = (operationId, parameters) => confirmCapabilityInvoke(operationId, {
  userId: 'u1', execution: execution(operationId), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation(operationId),
});

// ───────────────────────────── purchase date ─────────────────────────────
test('purchase date: the declared action opens a form for one exact date and writes nothing', async () => {
  const result = await capabilityInvoke('PROPERTY_PURCHASE_DATE_SET', envelope('PROPERTY_PURCHASE_DATE_SET', PURCHASE_DATE_SET_MESSAGE, declared('PROPERTY_PURCHASE_DATE_SET')));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'PURCHASE_DATE_INPUT_REQUIRED');
  assert.equal(result.parameters.sourceExecutionId, 'source-1', 'the maintenance answer that asked for it is the source, so it refreshes afterwards');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'PROPERTY_PURCHASE_DATE_INPUTS');
  assert.equal(request.expectedContextVersion, result.contextVersion);
  assert.deepEqual(request.inputSchema.fields.map((field) => [field.key, field.required, field.inputSchema.type, field.inputSchema.allowedPrecisions, field.inputSchema.allowFuture]),
    [['purchaseDate', true, 'APPROXIMATE_DATE', ['EXACT_DATE'], false]]);
  assert.equal(calls.profile.length, 0);
});

test('purchase date: a refresh, a bare message, a wrong message or a viewer never starts a form', async () => {
  for (const [message, launchContext] of [
    [PURCHASE_DATE_SET_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'PROPERTY_PURCHASE_DATE_SET' }],
    [PURCHASE_DATE_SET_MESSAGE, undefined],
    ['record my purchase date', declared('PROPERTY_PURCHASE_DATE_SET')],
    [PURCHASE_DATE_SET_MESSAGE, declared('MAINTENANCE_STATUS')],
  ]) {
    const result = await capabilityInvoke('PROPERTY_PURCHASE_DATE_SET', envelope('PROPERTY_PURCHASE_DATE_SET', message, launchContext));
    assert.equal(result.reasonCode, 'ASK_PURCHASE_DATE_NOT_DIRECTLY_ROUTABLE', JSON.stringify(launchContext));
    assert.equal(result.captureRequests, undefined);
  }
  accessRole = 'VIEWER';
  const blocked = await capabilityInvoke('PROPERTY_PURCHASE_DATE_SET', envelope('PROPERTY_PURCHASE_DATE_SET', PURCHASE_DATE_SET_MESSAGE, declared('PROPERTY_PURCHASE_DATE_SET')));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.captureRequests, undefined);
});

test('purchase date: only a real exact date on or before today is accepted, in the form answer and in the stored input', () => {
  const answer = (value, precision = 'EXACT_DATE') => PurchaseDateAnswerSchema.safeParse({ purchaseDate: { precision, value } });
  assert.deepEqual(answer('2019-06-14').data, { purchaseDate: '2019-06-14' });
  for (const bad of ['2999-01-01', '2019-02-30', '2019-6-14', '1700-01-01', 'yesterday', '']) assert.equal(answer(bad).success, false, bad);
  assert.equal(answer('2019-06-14', 'MONTH').success, false, 'only an exact day');
  assert.equal(PurchaseDateInputSchema.safeParse({ purchaseDate: '2019-06-14', extra: 1 }).success, false, 'strict');
});

test('purchase date: a valid entry becomes a review card bound to the recorded date, and a changed date makes an old form out of date', async () => {
  const before = await purchaseDateContextVersion('p1');
  const card = await purchaseDateResult('u1', 'p1', { purchaseDate: '2019-06-14' }, 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(card.parameters.purchaseDateSet, { purchaseDate: '2019-06-14' });
  assert.equal(card.parameters.sourceExecutionId, 'source-1');
  assert.equal(card.confirmation.confirmLabel, 'Save purchase date');
  assert.deepEqual(card.confirmation.fields.map((field) => field.label), ['Purchase date']);
  assert.equal(card.captureRequests[0].currentAnswer.purchaseDate.value, '2019-06-14', 'the entry is kept so it can be changed');
  recordedPurchase = '2018-01-02';
  assert.notEqual(await purchaseDateContextVersion('p1'), before);
  const changed = await purchaseDateResult('u1', 'p1', { purchaseDate: '2019-06-14' }, null);
  assert.deepEqual(changed.confirmation.fields.map((field) => field.label), ['Currently recorded', 'Purchase date']);
});

test('purchase date: confirming writes only the purchase date through the financing service and reports a receipt', async () => {
  const { result, artifactType, artifactId } = await confirm('PROPERTY_PURCHASE_DATE_SET', { purchaseDateSet: { purchaseDate: '2019-06-14' }, sourceExecutionId: 'source-1', confirmationVersion: 1 });
  assert.equal(calls.profile.length, 1);
  assert.deepEqual(calls.profile[0], ['p1', { purchaseDate: '2019-06-14T12:00:00.000Z' }], 'no other profile field is sent');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.reasonCode, 'PURCHASE_DATE_RECORDED');
  assert.deepEqual(result.blocks[0].actions, [], 'the receipt keeps the homeowner in Ask');
  assert.equal(artifactType, 'PROPERTY_FINANCING_PROFILE');
  assert.equal(artifactId, 'p1');
  await assert.rejects(confirm('PROPERTY_PURCHASE_DATE_SET', { purchaseDateSet: { purchaseDate: 'not-a-date' } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.profile.length, 1, 'an invalid stored input writes nothing');
});

// ───────────────────────────── home journey ─────────────────────────────
test('home journey: the form offers exactly the onboarding page\'s five choices, never UNKNOWN', async () => {
  const result = await capabilityInvoke('HOME_JOURNEY_SET', envelope('HOME_JOURNEY_SET', HOME_JOURNEY_SET_MESSAGE, declared('HOME_JOURNEY_SET')));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'HOME_JOURNEY_INPUTS');
  assert.deepEqual(request.inputSchema.fields[0].inputSchema.options.map((option) => option.value), ['SHOPPING', 'UNDER_CONTRACT', 'RECENT_OWNER', 'ESTABLISHED_OWNER', 'PREPARING_TRANSFER']);
  assert.equal(HomeJourneyInputSchema.safeParse({ ownershipState: 'UNKNOWN' }).success, false);
  assert.equal(HomeJourneyInputSchema.safeParse({ ownershipState: 'RECENT_OWNER' }).success, true);
  assert.equal(calls.journey.length, 0);
});

test('home journey: refresh, bare message and viewer never start a form; a choice becomes a review card', async () => {
  for (const [message, launchContext] of [[HOME_JOURNEY_SET_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'HOME_JOURNEY_SET' }], [HOME_JOURNEY_SET_MESSAGE, undefined], ['change my journey', declared('HOME_JOURNEY_SET')]]) {
    const result = await capabilityInvoke('HOME_JOURNEY_SET', envelope('HOME_JOURNEY_SET', message, launchContext));
    assert.equal(result.reasonCode, 'ASK_HOME_JOURNEY_NOT_DIRECTLY_ROUTABLE');
  }
  const card = await homeJourneyResult('u1', 'p1', { ownershipState: 'RECENT_OWNER' }, 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.confirmation.fields.at(-1).value, 'Recently became owner');
  accessRole = 'VIEWER';
  assert.equal((await homeJourneyResult('u1', 'p1', { ownershipState: 'RECENT_OWNER' }, null)).status, 'BLOCKED');
});

test('home journey: confirming calls the onboarding service the page uses, with only the chosen state', async () => {
  const { result, artifactType } = await confirm('HOME_JOURNEY_SET', { homeJourneySet: { ownershipState: 'ESTABLISHED_OWNER' }, sourceExecutionId: 'source-1', confirmationVersion: 1 });
  assert.deepEqual(calls.journey, [['p1', 'u1', { ownershipState: 'ESTABLISHED_OWNER' }]]);
  assert.equal(result.reasonCode, 'HOME_JOURNEY_RECORDED');
  assert.deepEqual(result.blocks[0].actions, []);
  assert.equal(artifactType, 'PROPERTY_ONBOARDING');
  await assert.rejects(confirm('HOME_JOURNEY_SET', { homeJourneySet: { ownershipState: 'UNKNOWN' } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.journey.length, 1);
});

// ───────────────────────────── entry points ─────────────────────────────
test('the audience "Confirm home journey" step starts the Ask command, carries no desktop link, and survives the answer checker', () => {
  const raw = audienceApplicabilityResult({ outcome: 'CONTEXT_REQUIRED', reasonCode: 'ASK_AUDIENCE_CONTEXT_REQUIRED', operatingMode: 'UNKNOWN' }, 'p1', 'OWNER');
  const [action] = raw.blocks[0].actions;
  assert.deepEqual({ id: action.id, interactionType: action.interactionType, message: action.message, operationId: action.operationId, href: action.href },
    { id: 'review-home-journey', interactionType: 'START_WORKFLOW', message: HOME_JOURNEY_SET_MESSAGE, operationId: 'HOME_JOURNEY_SET', href: undefined });
  const checked = validateAskAnswerTrust({ question: 'What maintenance is due?', operationId: 'MAINTENANCE_STATUS', propertyId: 'p1', result: attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')]) });
  assert.deepEqual(checked.result.blocks[0].actions.map((candidate) => candidate.id), ['review-home-journey'], 'an in-Ask action is not a link out of Ask');
  const viewer = audienceApplicabilityResult({ outcome: 'CONTEXT_REQUIRED', reasonCode: 'ASK_AUDIENCE_CONTEXT_REQUIRED', operatingMode: 'UNKNOWN' }, 'p1', 'VIEWER');
  assert.deepEqual(viewer.blocks[0].actions, [], 'a viewer is never offered a write');
});
