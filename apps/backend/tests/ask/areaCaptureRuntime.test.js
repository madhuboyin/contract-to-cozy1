const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// Runtime tests for the Property Summary per-area capture (PROPERTY_CONTEXT_AREA_CAPTURE). The real handlers, the real
// evaluator and the real completeness calculation run; only the database, the property-context snapshot, access and the
// canonical capture writer are replaced, so a wrong write fails loudly (the fake prisma throws on any undeclared call).

const prismaModule = require('../../src/lib/prisma.ts');
const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const captureModule = require('../../src/modules/propertyContext/application/captureFeatureContext.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { areaCaptureRowActions, areaCaptureSubmitResult } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');

const realPrisma = prismaModule.prisma;
const originals = { getPropertyContext: getPropertyContextModule.getPropertyContext, captureFeatureContext: captureModule.captureFeatureContext, resolveAccess: propertyAccess.resolvePropertyAccess };
let facts; let models; let accessRole; let captureCalls; let captureError;

function install() {
  facts = {}; models = {}; accessRole = 'CONTRIBUTOR'; captureCalls = []; captureError = null;
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, { get(_t, method) { if (!models[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); return models[model][method]; } });
    },
  });
  getPropertyContextModule.getPropertyContext = async (propertyId, _actor, request) => ({ propertyId, contextVersion: 'ctx-1', generatedAt: '2026-09-21T00:00:00.000Z', scopes: request.scopes, facts, warnings: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  captureModule.captureFeatureContext = async (propertyId, userId, input) => {
    captureCalls.push({ propertyId, userId, input });
    if (captureError) throw captureError;
    const updated = captureModule.normalizeAnswers(getCaptureDefinition(input.captureKey), input.answer, true).map(({ factKey }) => factKey);
    return { captureId: 'cap-1', contextVersion: 'ctx-2', updatedFactKeys: updated };
  };
  models.property = { findUnique: async () => ({ name: null, address: '1 Main St', city: 'Austin' }) };
  models.askExecution = { findMany: async () => [], findFirst: async () => null };
  models.propertyContextCaptureReceipt = { findUnique: async () => null };
}
function restore() {
  prismaModule.prisma = realPrisma;
  getPropertyContextModule.getPropertyContext = originals.getPropertyContext;
  captureModule.captureFeatureContext = originals.captureFeatureContext;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}
test.beforeEach(install);
test.afterEach(restore);

const MESSAGE = 'Fill in the missing home systems details.';
const declared = { surface: 'ASK_WORKSPACE', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', sourceExecutionId: 'summary-1', entityType: 'PROPERTY_CONTEXT_AREA', entityId: 'SYSTEMS' };
const envelope = (launchContext, message = MESSAGE) => ({ userId: 'u1', propertyId: 'p1', sessionId: 's1', executionId: 'area-exec', message, launchContext });
const start = (launchContext = declared) => capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope(launchContext));
// Real option values from the registered capture, so a "valid" answer here is valid to the real validator.
const hvacFields = Object.fromEntries(getCaptureDefinition('HVAC_SYSTEM_PROFILE').inputSchema.fields.map((field) => [field.key, field.inputSchema.options.map((option) => option.value)]));
const hvacAnswer = { heatingType: hvacFields.heatingType.find((value) => value !== 'UNKNOWN'), coolingType: hvacFields.coolingType.find((value) => value !== 'UNKNOWN'), hvacResponsibility: hvacFields.hvacResponsibility.find((value) => value !== 'UNKNOWN') };
const HVAC_FACTS = ['systems.heatingType', 'systems.coolingType', 'responsibility.hvac'];
const submit = (prompt, answer, over = {}) => areaCaptureSubmitResult('u1', 'p1', 'SYSTEMS', new Set(over.skip ?? []), 'summary-1', {
  requirementId: prompt.captureRequests[0].requirementId, captureKey: prompt.captureRequests[0].captureKey, answer,
  expectedContextVersion: prompt.contextVersion, sensitiveDataConfirmed: false, ...over.submitted,
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };
const EXEC_CREATED = new Date('2026-09-20T00:00:00.000Z');
async function reviewedCard(answer = hvacAnswer) {
  const prompt = await start();
  return submit(prompt, answer);
}
const confirm = (parameters) => confirmCapabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', {
  userId: 'u1', execution: { id: 'area-exec', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', createdAt: EXEC_CREATED },
  parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('PROPERTY_CONTEXT_AREA_CAPTURE'),
});

test('the declared row action opens the first question (structured profile first) with progress and a skip control, and writes nothing', async () => {
  const result = await start();
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'AREA_CAPTURE_INPUT_REQUIRED');
  assert.deepEqual(result.parameters, { areaScope: 'SYSTEMS', skipFactKeys: [], sourceExecutionId: 'summary-1' });
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'HVAC_SYSTEM_PROFILE');
  assert.equal(request.classification, 'WORKFLOW_INPUT', 'a form submit is a proposal, not a write');
  assert.equal(request.skippable, true);
  assert.equal(request.expectedContextVersion, result.contextVersion);
  assert.match(request.helpText, /Home systems, Maintenance responsibility/, 'a structured answer discloses every area it updates');
  assert.equal(result.blocks[0].id, 'area-capture-progress');
  assert.match(result.blocks[0].title, /Home systems: \d+ details? left to answer/);
  assert.equal(captureCalls.length, 0);
});

test('only the declared action starts it: bare messages, other operations, a mismatched row and an unknown area are not routable; a viewer is blocked', async () => {
  for (const [launchContext, message] of [
    [undefined, MESSAGE], [{ surface: 'ASK_WORKSPACE' }, MESSAGE], [{ ...declared, operationId: 'PROPERTY_SUMMARY' }, MESSAGE],
    [declared, 'fill in my missing details'], [declared, 'Fill in the missing financial details.'], [{ ...declared, entityId: 'STRUCTURE' }, MESSAGE],
  ]) {
    const result = await capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope(launchContext, message));
    assert.equal(result.reasonCode, 'ASK_AREA_CAPTURE_NOT_DIRECTLY_ROUTABLE', JSON.stringify([launchContext, message]).slice(0, 80));
    assert.equal(result.captureRequests, undefined);
  }
  accessRole = 'VIEWER';
  const blocked = await start();
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.captureRequests, undefined);
});

test('a refresh of an in-progress execution re-asks with ITS OWN stored skips and never resets them; without stored state it is not routable', async () => {
  models.askExecution.findFirst = async () => ({ parametersJson: { areaScope: 'SYSTEMS', skipFactKeys: HVAC_FACTS, sourceExecutionId: 'summary-1' } });
  const refreshed = await capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope({ surface: 'ASK_REFRESH', sourceExecutionId: 'area-exec' }));
  assert.equal(refreshed.status, 'NEEDS_CONTEXT');
  assert.notEqual(refreshed.captureRequests[0].captureKey, 'HVAC_SYSTEM_PROFILE', 'the skipped profile stays skipped');
  assert.deepEqual(refreshed.parameters.skipFactKeys, HVAC_FACTS);
  models.askExecution.findFirst = async () => null;
  const none = await capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope({ surface: 'ASK_REFRESH', sourceExecutionId: 'area-exec' }));
  assert.equal(none.reasonCode, 'ASK_AREA_CAPTURE_NOT_DIRECTLY_ROUTABLE');
});

test('a valid answer builds a review card naming the property, every fact and every area, and writes nothing', async () => {
  const card = await reviewedCard();
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.reasonCode, 'AREA_CAPTURE_CONFIRMATION_REQUIRED');
  assert.equal(card.confirmation.confirmLabel, 'Save details');
  const rows = Object.fromEntries(card.confirmation.fields.map((field) => [field.label, field.value]));
  assert.equal(rows.Property, '1 Main St, Austin');
  assert.equal(rows['Areas updated'], 'Home systems, Maintenance responsibility');
  assert.equal(card.confirmation.fields.length, 5, 'property, three answered facts, areas');
  assert.equal(card.parameters.areaCapture.scope, 'SYSTEMS');
  assert.equal(card.parameters.confirmationVersion, 1);
  assert.equal(card.captureRequests[0].currentAnswer.heatingType, hvacAnswer.heatingType, 'the form is kept so the answer can be changed');
  assert.equal(captureCalls.length, 0);
});

test('"Skip for now" and an all-"not sure" answer save nothing and only steer the next question; the client cannot supply the skip list', async () => {
  const prompt = await start();
  const skipped = await submit(prompt, { $skip: true });
  assert.equal(skipped.status, 'NEEDS_CONTEXT');
  assert.equal(skipped.blocks[0].title, 'Skipped for now');
  assert.deepEqual([...skipped.parameters.skipFactKeys].sort(), [...HVAC_FACTS].sort());
  assert.notEqual(skipped.captureRequests[0].captureKey, 'HVAC_SYSTEM_PROFILE');
  const notSure = await submit(prompt, { heatingType: 'UNKNOWN', coolingType: 'UNKNOWN', hvacResponsibility: 'UNKNOWN' });
  assert.equal(notSure.blocks[0].title, 'Marked not sure for this session');
  assert.equal(notSure.confirmation, undefined);
  assert.equal(captureCalls.length, 0, 'neither writes anything');
  // A skip marker mixed with other keys is an ordinary (invalid) answer, not a skip; extra "skipFactKeys" input is an unknown field.
  assert.equal(await codeOf(submit(prompt, { $skip: true, heatingType: hvacAnswer.heatingType })), 'ASK_CAPTURE_VALIDATION_ERROR');
  assert.equal(await codeOf(submit(prompt, { ...hvacAnswer, skipFactKeys: ['core.yearBuilt'] })), 'ASK_CAPTURE_VALIDATION_ERROR');
});

test('a stale version, a question that is no longer current, an invalid answer and a missing permission are all refused without writing', async () => {
  const prompt = await start();
  assert.equal(await codeOf(submit(prompt, hvacAnswer, { submitted: { expectedContextVersion: 'ctx-old' } })), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(submit(prompt, hvacAnswer, { submitted: { requirementId: 'someone-elses' } })), 'ASK_CAPTURE_NOT_ACTIVE');
  assert.equal(await codeOf(submit(prompt, hvacAnswer, { skip: HVAC_FACTS })), 'ASK_CAPTURE_NOT_ACTIVE', 'the question was skipped, so it is not the current one');
  assert.equal(await codeOf(submit(prompt, { ...hvacAnswer, heatingType: 'NOT_A_REAL_TYPE' })), 'ASK_CAPTURE_VALIDATION_ERROR');
  assert.equal(await codeOf(submit(prompt, {})), 'ASK_CAPTURE_VALIDATION_ERROR');
  accessRole = 'VIEWER';
  assert.equal(await codeOf(submit(prompt, hvacAnswer)), 'ASK_PERMISSION_REQUIRED');
  assert.equal(captureCalls.length, 0);
});

test('a security-sensitive form needs the sensitive-data confirmation before a review is offered', async () => {
  const prompt = await capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope({ ...declared, entityId: 'SAFETY' }, 'Fill in the missing safety details.'));
  assert.equal(prompt.captureRequests[0].sensitivity, 'SECURITY');
  const answer = { hasSmokeDetectors: true, hasCoDetectors: true, commonSafetyResponsibility: 'OWNER' };
  const args = (confirmed) => ['u1', 'p1', 'SAFETY', new Set(), null, { requirementId: prompt.captureRequests[0].requirementId, captureKey: prompt.captureRequests[0].captureKey, answer, expectedContextVersion: prompt.contextVersion, sensitiveDataConfirmed: confirmed }];
  assert.equal(await codeOf(areaCaptureSubmitResult(...args(false))), 'ASK_CAPTURE_CONFIRMATION_REQUIRED');
  assert.equal((await areaCaptureSubmitResult(...args(true))).status, 'NEEDS_CONFIRMATION');
});

test('confirming writes through captureFeatureContext for THIS question and scope with the server-held skip list and a per-execution idempotency key', async () => {
  const card = await reviewedCard();
  const { result, artifactType } = await confirm(card.parameters);
  assert.equal(captureCalls.length, 1);
  const { input } = captureCalls[0];
  assert.equal(input.featureKey, 'PROPERTY_RECORD_SUMMARY');
  assert.equal(input.operationKey, 'CAPTURE_AREA');
  assert.deepEqual(input.operationInput, { scope: 'SYSTEMS', skipFactKeys: [] });
  assert.equal(input.requirementId, card.parameters.areaCapture.requirementId);
  assert.equal(input.expectedContextVersion, 'ctx-1');
  assert.equal(input.idempotencyKey, `ask-area-${createHash('sha256').update(`area-exec:${card.parameters.areaCapture.requirementId}:1`).digest('hex').slice(0, 40)}`);
  assert.equal(result.reasonCode, 'AREA_CAPTURE_SAVED');
  assert.equal(result.blocks[0].title, 'Details saved');
  assert.match(result.blocks[0].details.find((detail) => detail.label === 'Areas updated').value, /Home systems, Maintenance responsibility/, 'the receipt names every area actually written');
  assert.equal(artifactType, 'PROPERTY_CONTEXT');
});

test('a retry after a lost response is reported as already saved', async () => {
  const card = await reviewedCard();
  models.propertyContextCaptureReceipt.findUnique = async () => ({ id: 'r1', result: { captureId: 'cap-1' } });
  const { result } = await confirm(card.parameters);
  assert.equal(result.blocks[0].title, 'Already saved');
  assert.match(result.blocks[0].description, /nothing was written again/);
});

test('confirm maps a stale record, a rejected answer and a missing permission to clear refusals, and rejects invalid stored input', async () => {
  const card = await reviewedCard();
  captureError = new captureModule.PropertyContextVersionConflictError({});
  assert.equal(await codeOf(confirm(card.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  captureError = new Error('Capture requirement is no longer active.');
  assert.equal(await codeOf(confirm(card.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  captureError = new captureModule.PropertyContextCaptureValidationError('bad');
  assert.equal(await codeOf(confirm(card.parameters)), 'ASK_INVALID_CONFIRMATION_EDIT');
  captureError = new Error('db down');
  assert.equal(await codeOf(confirm(card.parameters)), 'NO_CODE:db down');
  captureError = null;
  for (const bad of [{}, { ...card.parameters, areaCapture: { ...card.parameters.areaCapture, scope: 'FINANCIAL' } }, { ...card.parameters, areaCapture: { ...card.parameters.areaCapture, extra: 1 } }, { ...card.parameters, areaScope: undefined }]) {
    assert.equal(await codeOf(confirm(bad)), 'ASK_CONFIRMATION_NOT_ACTIVE');
  }
  accessRole = 'VIEWER';
  assert.equal(await codeOf(confirm(card.parameters)), 'ASK_PERMISSION_REQUIRED');
});

test('the end state never claims the area is done: it says no more questions THIS SESSION and reports what is still incomplete and what needs another surface', async () => {
  const everything = ['systems.heatingType', 'systems.coolingType', 'responsibility.hvac', 'systems.waterHeaterType', 'systems.hvacInstallYear', 'systems.waterHeaterInstallYear', 'systems.waterSource', 'systems.sewerSystem', 'systems.hasSolar', 'systems.hasFireplace'];
  models.askExecution.findFirst = async () => ({ parametersJson: { areaScope: 'SYSTEMS', skipFactKeys: everything, sourceExecutionId: null } });
  const terminal = await capabilityInvoke('PROPERTY_CONTEXT_AREA_CAPTURE', envelope({ surface: 'ASK_REFRESH', sourceExecutionId: 'area-exec' }));
  assert.equal(terminal.status, 'ANSWERED');
  assert.equal(terminal.reasonCode, 'AREA_CAPTURE_NO_MORE_QUESTIONS');
  const summary = terminal.blocks.find((block) => block.id === 'area-capture-progress');
  assert.equal(summary.title, 'No more questions in this session');
  assert.doesNotMatch(`${summary.title} ${summary.body}`, /all done|complete!|fully complete/i);
  assert.match(summary.body, /skipped or marked not sure/);
  assert.match(summary.body, /cannot be filled in here/);
  assert.match(summary.body, /Installed system types \(from your inventory\)/);
  assert.equal(summary.tone, 'CAUTION');
  assert.equal(summary.actions.some((action) => action.interactionType === 'START_WORKFLOW'), false, 'nothing left to continue with');
});

test('"Continue" from a receipt carries that workflow\'s skips; a start from anywhere else or for another scope begins with none', async () => {
  const stored = { areaScope: 'SYSTEMS', skipFactKeys: HVAC_FACTS, sourceExecutionId: null };
  let asked;
  models.askExecution.findFirst = async (args) => { asked = args.where; return { parametersJson: stored }; };
  const carried = await start({ ...declared, sourceExecutionId: 'receipt-exec' });
  assert.deepEqual(carried.parameters.skipFactKeys, HVAC_FACTS);
  assert.deepEqual(asked, { id: 'receipt-exec', userId: 'u1', propertyId: 'p1', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE' }, 'only this user\'s own area execution on this property can supply skips');
  models.askExecution.findFirst = async () => ({ parametersJson: { ...stored, areaScope: 'STRUCTURE' } });
  assert.deepEqual((await start({ ...declared, sourceExecutionId: 'receipt-exec' })).parameters.skipFactKeys, [], 'another scope\'s skips are not carried');
  models.askExecution.findFirst = async () => null;
  assert.deepEqual((await start({ ...declared, sourceExecutionId: 'summary-1' })).parameters.skipFactKeys, [], 'a fresh click from the row starts with no skips');
});

test('row actions: contributors get the area flow for an incomplete area, the rooms and inventory rows reuse the Add actions, viewers and complete or read-only areas get none', () => {
  const [area] = areaCaptureRowActions('STRUCTURE', true, 2);
  assert.deepEqual([area.operationId, area.message, area.interactionType], ['PROPERTY_CONTEXT_AREA_CAPTURE', 'Fill in the missing structure details.', 'MUTATE_RECORD']);
  assert.deepEqual(areaCaptureRowActions('ROOMS', true, 1).map((action) => [action.operationId, action.message]), [['ROOM_CREATE', 'Add a room to my home record.']]);
  assert.deepEqual(areaCaptureRowActions('INVENTORY', true, 1).map((action) => [action.operationId, action.message]), [['INVENTORY_ITEM_CREATE', 'Add an item to my home inventory.']]);
  assert.equal(areaCaptureRowActions('STRUCTURE', false, 2), undefined);
  assert.equal(areaCaptureRowActions('STRUCTURE', true, 0), undefined);
  for (const readOnly of ['FINANCIAL', 'RISK', 'COVERAGE', 'SALE_PREP']) assert.equal(areaCaptureRowActions(readOnly, true, 3), undefined, readOnly);
});
