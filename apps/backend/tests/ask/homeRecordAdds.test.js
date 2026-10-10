const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// MATERIAL_SPEC_ADD and HOME_PLANT_ADD (FRD v1.251): a material and an indoor plant added inside Ask, with the answers that start them. The real
// registered handlers run; prisma, the access check, both writers and the controller's side effects are replaced by recording fakes.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { materialSpecAddResult, homePlantAddResult, materialSpecContextVersion } = require('../../src/services/ask/handlers/homeRecordAdds.handler.ts');
const { materialSpecsFromView } = require('../../src/services/ask/handlers/materialSpecs.handler.ts');
const { plantCareOutlookFromView } = require('../../src/services/ask/handlers/plantAdvisor.handler.ts');
const { MaterialSpecAddInputSchema, HomePlantAddInputSchema } = require('../../src/services/ask/support/commandInputs.ts');
const { MATERIAL_SPEC_ADD_MESSAGE, HOME_PLANT_ADD_MESSAGE } = require('../../src/services/ask/support/homeRecordAddConstants.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const { PlantCarePlannerService } = require('../../src/services/plantCarePlanner.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/analytics/index.ts');
const toolLifecycle = require('../../src/services/analytics/toolLifecycle.ts');
const materialLifecycle = require('../../src/services/analytics/materialSpecLifecycle.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  resolveAccess: propertyAccess.resolvePropertyAccess, createSpec: MaterialSpecService.prototype.createSpec, createPlant: PlantCarePlannerService.prototype.createPlant,
  assertCompliance: compliance.assertProjectComplianceApplicable, track: analytics.analyticsEmitter.track, record: toolLifecycle.recordToolLifecycleEvents, completion: materialLifecycle.materialSpecCompletionEvent,
};
let calls; let accessRole; let roomList; let existingSpec; let existingPlant;

test.beforeEach(() => {
  calls = { createSpec: [], createPlant: [], compliance: [], track: [], lifecycle: [] };
  accessRole = 'CONTRIBUTOR';
  roomList = [{ id: 'room-kitchen', name: 'Kitchen' }, { id: 'room-den', name: 'Den' }];
  existingSpec = null; existingPlant = null;
  const models = {
    inventoryRoom: { findMany: async () => roomList, findFirst: async ({ where }) => roomList.find((room) => room.id === where.id) ?? null },
    materialSpec: { findFirst: async () => existingSpec },
    homePlant: { findFirst: async () => existingPlant },
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
  MaterialSpecService.prototype.createSpec = async function (...args) { calls.createSpec.push(args); return { spec: { id: 'spec-1', category: args[1].category }, possibleDuplicates: [] }; };
  PlantCarePlannerService.prototype.createPlant = async function (...args) { calls.createPlant.push(args); return { id: 'plant-1', name: args[2].name }; };
  compliance.assertProjectComplianceApplicable = async (...args) => { calls.compliance.push(args); };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  toolLifecycle.recordToolLifecycleEvents = async (args) => { calls.lifecycle.push(args); };
  materialLifecycle.materialSpecCompletionEvent = (spec, kind) => ({ spec: spec.id, kind });
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  MaterialSpecService.prototype.createSpec = originals.createSpec;
  PlantCarePlannerService.prototype.createPlant = originals.createPlant;
  compliance.assertProjectComplianceApplicable = originals.assertCompliance;
  analytics.analyticsEmitter.track = originals.track;
  toolLifecycle.recordToolLifecycleEvents = originals.record;
  materialLifecycle.materialSpecCompletionEvent = originals.completion;
});

const envelope = (message, launchContext) => ({ userId: 'u1', propertyId: 'p1', message, launchContext });
const declared = (operationId) => ({ surface: 'ASK_WORKSPACE', operationId, sourceExecutionId: 'source-1' });
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: new Date('2026-10-10T00:00:00.000Z') });
const confirm = (operationId, parameters) => confirmCapabilityInvoke(operationId, { userId: 'u1', execution: execution(operationId), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation(operationId) });
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ───────────────────────────── material spec ─────────────────────────────
test('material: the declared action opens a form with the type, a required name and the home\'s rooms, and writes nothing', async () => {
  const result = await capabilityInvoke('MATERIAL_SPEC_ADD', envelope(MATERIAL_SPEC_ADD_MESSAGE, declared('MATERIAL_SPEC_ADD')));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.parameters.sourceExecutionId, 'source-1');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'MATERIAL_SPEC_INPUTS');
  assert.equal(request.expectedContextVersion, result.contextVersion);
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  assert.deepEqual(Object.keys(byKey), ['category', 'label', 'roomId', 'manufacturer', 'productName', 'colorCode', 'finish', 'supplier', 'notes']);
  assert.deepEqual([byKey.category.required, byKey.label.required, byKey.roomId.required, byKey.finish.required], [true, true, false, false]);
  assert.deepEqual(byKey.roomId.inputSchema.options.map((option) => option.label), ['Whole home', 'Kitchen', 'Den']);
  assert.equal(byKey.category.inputSchema.options.length, 15);
  assert.equal(calls.createSpec.length, 0);
});

test('material: a refresh, a bare message, a wrong message or a viewer never starts a form', async () => {
  for (const [message, launchContext] of [[MATERIAL_SPEC_ADD_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'MATERIAL_SPEC_ADD' }], [MATERIAL_SPEC_ADD_MESSAGE, undefined], ['add a material', declared('MATERIAL_SPEC_ADD')]]) {
    const result = await capabilityInvoke('MATERIAL_SPEC_ADD', envelope(message, launchContext));
    assert.equal(result.reasonCode, 'ASK_MATERIAL_SPEC_NOT_DIRECTLY_ROUTABLE');
    assert.equal(result.captureRequests, undefined);
  }
  accessRole = 'VIEWER';
  assert.equal((await capabilityInvoke('MATERIAL_SPEC_ADD', envelope(MATERIAL_SPEC_ADD_MESSAGE, declared('MATERIAL_SPEC_ADD')))).status, 'BLOCKED');
});

test('material: empty optional text and the whole-home choice are stored as nothing; a type and a name are required', () => {
  const parsed = MaterialSpecAddInputSchema.parse({ category: 'PAINT', label: ' Kitchen wall ', roomId: '__WHOLE_HOME__', manufacturer: '', colorCode: 'SW 7036', finish: undefined });
  assert.deepEqual(parsed, { category: 'PAINT', label: 'Kitchen wall', roomId: null, manufacturer: null, productName: null, colorCode: 'SW 7036', finish: null, supplier: null, notes: null });
  assert.equal(MaterialSpecAddInputSchema.safeParse({ category: 'NOT_A_TYPE', label: 'x' }).success, false);
  assert.equal(MaterialSpecAddInputSchema.safeParse({ category: 'PAINT', label: '   ' }).success, false);
  assert.equal(MaterialSpecAddInputSchema.safeParse({ category: 'PAINT', label: 'x', surprise: 1 }).success, false);
  assert.deepEqual(MaterialSpecAddInputSchema.parse(parsed), parsed, 'the stored input parses to itself');
});

test('material: a valid entry becomes a review card showing what was entered, and a missing room asks again without confirming', async () => {
  const input = MaterialSpecAddInputSchema.parse({ category: 'PAINT', label: 'Kitchen wall paint', roomId: 'room-kitchen', manufacturer: 'Sherwin-Williams', colorCode: 'SW 7036' });
  const card = await materialSpecAddResult('u1', 'p1', input, 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(card.confirmation.fields.map((field) => [field.label, field.value]), [['Name', 'Kitchen wall paint'], ['Type', 'Paint'], ['Where', 'Kitchen'], ['Brand', 'Sherwin-Williams'], ['Colour code', 'SW 7036']]);
  assert.equal(card.captureRequests[0].currentAnswer.roomId, 'room-kitchen');
  const gone = await materialSpecAddResult('u1', 'p1', { ...input, roomId: 'room-removed' }, null);
  assert.equal(gone.status, 'NEEDS_CONTEXT');
  assert.equal(gone.reasonCode, 'MATERIAL_SPEC_ROOM_UNAVAILABLE');
  assert.equal(gone.confirmation, undefined);
  roomList = [{ id: 'room-den', name: 'Den' }];
  assert.notEqual(await materialSpecContextVersion('p1'), card.contextVersion, 'a changed room list makes an old form out of date');
});

test('material: confirming runs the controller\'s checks, writes through the service with the right scope, and records its analytics', async () => {
  const input = MaterialSpecAddInputSchema.parse({ category: 'PAINT', label: 'Kitchen wall paint', roomId: 'room-kitchen', finish: 'Satin' });
  const { result, artifactType } = await confirm('MATERIAL_SPEC_ADD', { materialSpecAdd: input, sourceExecutionId: 'source-1', confirmationVersion: 1 });
  await flush();
  assert.deepEqual(calls.compliance[0].slice(0, 3), ['p1', 'u1', 'MATERIAL_SPECS']);
  assert.equal(calls.createSpec.length, 1);
  const [propertyId, payload, actor] = calls.createSpec[0];
  assert.deepEqual([propertyId, actor], ['p1', 'u1']);
  assert.deepEqual({ scopeLevel: payload.scopeLevel, category: payload.category, label: payload.label, roomId: payload.roomId, finish: payload.finish }, { scopeLevel: 'ROOM', category: 'PAINT', label: 'Kitchen wall paint', roomId: 'room-kitchen', finish: 'Satin' });
  assert.equal(calls.track[0].metadataJson.actionType, 'create_spec');
  assert.equal(calls.lifecycle.length, 1);
  assert.equal(result.reasonCode, 'MATERIAL_SPEC_RECORDED');
  assert.equal(artifactType, 'MATERIAL_SPEC');
  assert.deepEqual(result.blocks[0].actions.map((action) => action.operationId), ['MATERIAL_SPECS_LIST'], 'the receipt follows up in Ask');
  await confirm('MATERIAL_SPEC_ADD', { materialSpecAdd: MaterialSpecAddInputSchema.parse({ category: 'TILE', label: 'Hall tile' }), confirmationVersion: 1 });
  assert.equal(calls.createSpec[1][1].scopeLevel, 'PROPERTY', 'no room means the whole home');
});

test('material: a retry that finds its own earlier write records nothing twice, and an invalid stored input writes nothing', async () => {
  existingSpec = { id: 'spec-earlier', label: 'Kitchen wall paint' };
  const { result } = await confirm('MATERIAL_SPEC_ADD', { materialSpecAdd: MaterialSpecAddInputSchema.parse({ category: 'PAINT', label: 'Kitchen wall paint' }), confirmationVersion: 1 });
  assert.equal(calls.createSpec.length, 0);
  assert.equal(result.blocks[0].title, 'Material already recorded');
  await assert.rejects(confirm('MATERIAL_SPEC_ADD', { materialSpecAdd: { category: 'NOPE', label: '' } }), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
});

// ───────────────────────────── plant ─────────────────────────────
test('plant: the declared action opens a form for a plant and a room, indoor only, and writes nothing', async () => {
  const result = await capabilityInvoke('HOME_PLANT_ADD', envelope(HOME_PLANT_ADD_MESSAGE, declared('HOME_PLANT_ADD')));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'HOME_PLANT_INPUTS');
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  assert.deepEqual([byKey.name.required, byKey.roomId.required, byKey.nickname.required], [true, true, false]);
  assert.deepEqual(byKey.roomId.inputSchema.options.map((option) => option.label), ['Kitchen', 'Den']);
  assert.equal(calls.createPlant.length, 0);
  accessRole = 'VIEWER';
  assert.equal((await capabilityInvoke('HOME_PLANT_ADD', envelope(HOME_PLANT_ADD_MESSAGE, declared('HOME_PLANT_ADD')))).status, 'BLOCKED');
  accessRole = 'CONTRIBUTOR';
  const bare = await capabilityInvoke('HOME_PLANT_ADD', envelope(HOME_PLANT_ADD_MESSAGE, { surface: 'ASK_REFRESH', operationId: 'HOME_PLANT_ADD' }));
  assert.equal(bare.reasonCode, 'ASK_HOME_PLANT_NOT_DIRECTLY_ROUTABLE');
});

test('plant: a home with no room is sent to the add-a-room command instead of a form that cannot be filled in', async () => {
  roomList = [];
  const result = await capabilityInvoke('HOME_PLANT_ADD', envelope(HOME_PLANT_ADD_MESSAGE, declared('HOME_PLANT_ADD')));
  assert.equal(result.reasonCode, 'HOME_PLANT_NEEDS_A_ROOM');
  assert.equal(result.captureRequests, undefined);
  const [action] = result.blocks[0].actions;
  assert.deepEqual({ id: action.id, operationId: action.operationId, interactionType: action.interactionType, href: action.href }, { id: 'add-room-for-plant', operationId: 'ROOM_CREATE', interactionType: 'START_WORKFLOW', href: undefined });
  const checked = validateAskAnswerTrust({ question: 'Add a plant', operationId: 'HOME_PLANT_ADD', propertyId: 'p1', result: attachAskAuthoritativeSourceEvidence({ ...result, parameters: { audiencePresentation: { householdRole: 'OWNER' } } }, [completedAskAuthoritativeSourceEvidence('HOME_PLANT_ADD')]) });
  assert.deepEqual(checked.result.blocks[0].actions.map((candidate) => candidate.id), ['add-room-for-plant']);
});

test('plant: a valid entry becomes a review card; confirming adds an INDOOR plant in that room through the planner and not twice', async () => {
  const input = HomePlantAddInputSchema.parse({ name: 'Monstera', roomId: 'room-den', nickname: 'Monty' });
  const card = await homePlantAddResult('u1', 'p1', input, 'source-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.equal(card.confirmation.title, 'Add "Monstera" to Den?');
  assert.deepEqual((await homePlantAddResult('u1', 'p1', { ...input, roomId: 'room-removed' }, null)).reasonCode, 'HOME_PLANT_ROOM_UNAVAILABLE');
  const { result } = await confirm('HOME_PLANT_ADD', { homePlantAdd: input, confirmationVersion: 1 });
  assert.deepEqual(calls.createPlant[0], ['p1', 'u1', { name: 'Monstera', nickname: 'Monty', locationType: 'INDOOR', roomId: 'room-den', notes: null }]);
  assert.equal(result.reasonCode, 'HOME_PLANT_ADDED');
  assert.deepEqual(result.blocks[0].actions.map((action) => action.operationId), ['PLANT_CARE_OUTLOOK']);
  existingPlant = { id: 'plant-earlier' };
  await confirm('HOME_PLANT_ADD', { homePlantAdd: input, confirmationVersion: 1 });
  assert.equal(calls.createPlant.length, 1, 'a retry that finds its own earlier write adds nothing');
  roomList = [{ id: 'room-kitchen', name: 'Kitchen' }];
  await assert.rejects(confirm('HOME_PLANT_ADD', { homePlantAdd: input }), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});

// ───────────────────────────── the answers that start them ─────────────────────────────
const view = (specs) => ({ specs, hasMore: false });

test('the Material Specs answer offers Add a material to a contributor or owner, in the empty state and with materials, and never a link', () => {
  for (const specs of [[], [{ id: 's1', label: 'Wall paint', category: 'PAINT', scopeLevel: 'PROPERTY', isActive: true, lifecycleStatus: 'ACTIVE', supplierDiscontinued: false }]]) {
    const result = materialSpecsFromView(view(specs), 'p1', true);
    const action = result.blocks[0].actions[0];
    assert.deepEqual({ id: action.id, interactionType: action.interactionType, message: action.message, operationId: action.operationId, href: action.href },
      { id: 'add-material-spec', interactionType: 'START_WORKFLOW', message: MATERIAL_SPEC_ADD_MESSAGE, operationId: 'MATERIAL_SPEC_ADD', href: undefined });
    assert.deepEqual(materialSpecsFromView(view(specs), 'p1', false).blocks[0].actions, [], 'a viewer reads only');
    for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
    assert.doesNotMatch(JSON.stringify(result.blocks), /\/dashboard\/|"href"/);
  }
});

test('the plant care answer offers Add a plant, its copy no longer says to open a page, and its rows carry no link', () => {
  const empty = { plants: [], zones: [], careRecommendations: [], gardenRecommendations: [], sourceStatus: { weather: 'OK', airQuality: 'OK', drought: 'OK', hardiness: 'OK' }, hardinessZone: null, applicability: { outdoor: { status: 'NOT_APPLICABLE', reasonCodes: ['NO_PRIVATE_OUTDOOR_SPACE'] } } };
  const owner = plantCareOutlookFromView(empty, 'p1', true);
  assert.deepEqual(owner.blocks[0].actions.map((action) => [action.id, action.operationId, action.href]), [['add-home-plant', 'HOME_PLANT_ADD', undefined]]);
  assert.doesNotMatch(owner.blocks[0].body, /open it|Plant Advisor/i);
  assert.deepEqual(plantCareOutlookFromView(empty, 'p1', false).blocks[0].actions, []);
  const withPlants = plantCareOutlookFromView({ ...empty, plants: [{ id: 'pl1' }], careRecommendations: [{ id: 'r1', plantName: 'Monstera', title: 'Water', guidance: 'Water it.', placementWarning: null, locationName: 'Den', triggers: [], priority: 'NOW', adjustedCheckCadenceDays: null }] }, 'p1', true);
  assert.doesNotMatch(JSON.stringify(withPlants.blocks), /\/dashboard\/|"href"/);
  assert.equal(withPlants.blocks[0].actions[0].id, 'add-home-plant');
});
