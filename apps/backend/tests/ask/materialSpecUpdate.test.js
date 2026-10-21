const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// MATERIAL_SPEC_UPDATE + the category-aware editor (FRD v1.390): the real handlers run; prisma, access and the writer are recording fakes.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { materialSpecUpdateResult } = require('../../src/services/ask/handlers/homeRecordAdds.handler.ts');
const { materialSpecsFromView } = require('../../src/services/ask/handlers/materialSpecs.handler.ts');
const editor = require('../../src/services/ask/support/materialSpecEditor.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const toolLifecycle = require('../../src/services/analytics/toolLifecycle.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');

const realPrisma = prismaModule.prisma;
const originals = { resolveAccess: propertyAccess.resolvePropertyAccess, updateSpec: MaterialSpecService.prototype.updateSpec, record: toolLifecycle.recordToolLifecycleEvents };
const UPDATED_AT = new Date('2026-10-01T00:00:00.000Z');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const VERSION = sha(`spec-1:${UPDATED_AT.toISOString()}`);
const row = (overrides = {}) => ({
  id: 'spec-1', label: 'Master Bed Wall paint', category: 'PAINT', scopeLevel: 'ROOM', roomId: 'room-master', surface: 'WALLS', manufacturer: 'bahn', productName: null, sku: null,
  colorCode: '00200', finish: 'matte', dimensions: null, material: null, lotBatch: null, supplier: 'home depot', purchaseDate: null, quantityPurchased: null, notes: null,
  lifecycleStatus: 'PROPOSED', updatedAt: UPDATED_AT, ...overrides,
});
const original = { category: 'PAINT', label: 'Master Bed Wall paint', roomId: 'room-master', manufacturer: 'bahn', productName: '', sku: '', colorCode: '00200', finish: 'matte', surface: 'WALLS', lotBatch: '', supplier: 'home depot', purchaseDate: '', quantityPurchased: '', notes: '' };
let calls; let accessRole; let current; let rooms;

test.beforeEach(() => {
  calls = { updateSpec: [] };
  accessRole = 'CONTRIBUTOR';
  current = row();
  rooms = [{ id: 'room-master', name: 'Master' }, { id: 'room-kitchen', name: 'Kitchen' }];
  const models = {
    inventoryRoom: { findMany: async () => rooms },
    materialSpec: { findMany: async () => [current], findFirst: async ({ where }) => (where.id === current.id ? current : null) },
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
  MaterialSpecService.prototype.updateSpec = async function (...args) { calls.updateSpec.push(args); return { id: args[1] }; };
  toolLifecycle.recordToolLifecycleEvents = async () => undefined;
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  MaterialSpecService.prototype.updateSpec = originals.updateSpec;
  toolLifecycle.recordToolLifecycleEvents = originals.record;
});

const propose = () => capabilityInvoke('MATERIAL_SPEC_UPDATE', { userId: 'u1', propertyId: 'p1', message: 'Edit this material.', launchContext: { surface: 'ASK_WORKSPACE', entityType: 'MATERIAL_SPEC', entityId: 'spec-1', operationId: 'MATERIAL_SPEC_UPDATE' } });
const submit = (answer) => materialSpecUpdateResult('u1', 'p1', 'Edit this material.', undefined, { specId: 'spec-1', answer });
const confirm = (changes, version = VERSION) => confirmCapabilityInvoke('MATERIAL_SPEC_UPDATE', {
  userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'MATERIAL_SPEC_UPDATE', createdAt: new Date() },
  parameters: { materialSpecUpdate: { specId: 'spec-1', changes }, materialSpecUpdateContextVersion: version, confirmationVersion: 1 }, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('MATERIAL_SPEC_UPDATE'),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code; } };

test('the list: compact rows with a View details target, friendly status key, the Add action in the collection header, Edit only for contributors', () => {
  const view = { hasMore: false, specs: [{ ...row(), room: { name: 'Master' }, isActive: true, supplierDiscontinued: false }] };
  const result = materialSpecsFromView(view, 'p1', true);
  const list = result.blocks.find((block) => block.id === 'material-specs-items');
  const item = list.sections[0].items[0];
  assert.deepEqual([item.entityType, item.status, item.actions.map((a) => [a.id, a.operationId, a.message])], ['MATERIAL_SPEC', 'PROPOSED', [['edit-material', 'MATERIAL_SPEC_UPDATE', 'Edit this material.']]]);
  assert.deepEqual(list.actions.map((a) => a.operationId), ['MATERIAL_SPEC_ADD']);
  assert.deepEqual(result.blocks[0].actions, [], 'the Add action moved out of the summary into the collection header');
  assert.equal(result.blocks[0].title, '1 saved material');
  assert.equal(result.blocks[0].body, 'Paint used in this home.');
  const viewer = materialSpecsFromView(view, 'p1', false);
  assert.equal(viewer.blocks.find((block) => block.id === 'material-specs-items').sections[0].items[0].actions, undefined);
  assert.deepEqual(viewer.blocks.find((block) => block.id === 'material-specs-items').actions, []);
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
});

test('lifecycle wording is friendly and never merged with verification', () => {
  assert.deepEqual(['PROPOSED', 'APPROVED', 'INSTALLED', 'AS_BUILT', 'SUBSTITUTED'].map(editor.materialLifecycleLabel), ['Planned', 'Approved', 'Installed', 'Verified installed', 'Replaced']);
  assert.equal(editor.MATERIAL_LIFECYCLE_NOTES.PROPOSED, 'Not yet confirmed as installed.');
});

test('edit: opens with the category\'s own fields prefilled; the type is disabled with a reason; nothing is written', async () => {
  const result = await propose();
  assert.equal(result.status, 'NEEDS_CONTEXT');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'MATERIAL_SPEC_UPDATE_INPUTS');
  assert.equal(request.expectedContextVersion, VERSION);
  assert.deepEqual(request.editor.original, original);
  const category = request.editor.fields.find((field) => field.key === 'category');
  assert.match(category.disabledReason, /The type is fixed/);
  assert.equal(request.editor.mode, undefined, 'edit mode');
  assert.equal(calls.updateSpec.length, 0);
});

test('edit: an installed material locks the identity fields the canonical service locks, each with a reason; the rest stay editable', async () => {
  current = row({ lifecycleStatus: 'INSTALLED' });
  const fields = (await propose()).captureRequests[0].editor.fields;
  const locked = fields.filter((field) => field.disabledReason).map((field) => field.key).sort();
  assert.deepEqual(locked, ['category', 'colorCode', 'dimensions', 'finish', 'lotBatch', 'manufacturer', 'productName', 'roomId', 'sku'].filter((key) => fields.some((field) => field.key === key)).sort());
  assert.match(fields.find((field) => field.key === 'manufacturer').disabledReason, /record a substitution/);
  for (const key of ['label', 'supplier', 'notes', 'purchaseDate']) assert.equal(fields.find((field) => field.key === key).disabledReason, undefined, key);
  const refused = await submit({ ...original, colorCode: '999' });
  assert.equal(refused.reasonCode, 'MATERIAL_SPEC_UPDATE_INVALID');
  assert.ok(refused.captureRequests[0].editor.errors.colorCode);
});

test('edit: the review lists only changed fields; a cleared field and a room change are changes; no change is not reviewed; a viewer is blocked', async () => {
  const result = await submit({ ...original, supplier: 'Sherwin-Williams', finish: '', roomId: '' });
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(result.confirmation.fields.map((field) => field.label), ['Material', 'Where', 'Finish', 'Supplier']);
  assert.equal(result.confirmation.fields[1].value, 'Master → Whole home');
  assert.equal(result.confirmation.fields[2].value, 'matte → Not recorded');
  assert.deepEqual(result.parameters.materialSpecUpdate.changes, { roomId: '', finish: '', supplier: 'Sherwin-Williams' });
  assert.equal((await submit(original)).reasonCode, 'MATERIAL_SPEC_UPDATE_NO_CHANGES');
  assert.equal((await submit({ ...original, category: 'TILE' })).reasonCode, 'MATERIAL_SPEC_UPDATE_INVALID', 'the type cannot be changed');
  assert.equal((await submit({ ...original, label: '' })).reasonCode, 'MATERIAL_SPEC_UPDATE_INVALID');
  accessRole = 'VIEWER';
  assert.equal((await propose()).status, 'BLOCKED');
  assert.equal(calls.updateSpec.length, 0);
});

test('edit confirm: ONE updateSpec call with a narrowed payload (nulls for cleared fields, scope follows the room), and conflicts and replays are handled', async () => {
  const { result, artifactId } = await confirm({ roomId: '', finish: '', supplier: 'Sherwin-Williams', purchaseDate: '2026-05-01' });
  assert.equal(calls.updateSpec.length, 1);
  const [propertyId, specId, payload] = calls.updateSpec[0];
  assert.deepEqual([propertyId, specId], ['p1', 'spec-1']);
  assert.deepEqual(payload, { roomId: null, scopeLevel: 'PROPERTY', finish: null, supplier: 'Sherwin-Williams', purchaseDate: '2026-05-01' });
  assert.equal(artifactId, 'spec-1');
  assert.equal(result.reasonCode, 'MATERIAL_SPEC_UPDATED');
  assert.equal(await codeOf(confirm({ supplier: 'x' }, 'stale')), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(confirm({ category: 'TILE' })), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await codeOf(confirm({ label: '' })), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.updateSpec.length, 1);
  const replay = await confirm({ supplier: 'home depot' }, 'version-from-before');
  assert.equal(replay.result.status, 'COMPLETED');
  assert.equal(calls.updateSpec.length, 1, 'already-saved values are not written again');
  current = row({ lifecycleStatus: 'AS_BUILT' });
  assert.equal(await codeOf(confirm({ manufacturer: 'other' })), 'ASK_INVALID_CONFIRMATION_EDIT');
});

test('field rules are server-owned: relevance per category, section pruning, payload and cleared values', () => {
  const keys = (category) => editor.materialEditorFields(category, [], { mode: 'add' }).map((field) => field.key);
  assert.ok(keys('PAINT').includes('lotBatch') && !keys('PAINT').includes('dimensions'));
  assert.ok(keys('TILE').includes('dimensions') && keys('TILE').includes('lotBatch'));
  assert.ok(!keys('INSULATION').includes('colorCode') && !keys('INSULATION').includes('finish'));
  assert.deepEqual(editor.materialEditorSections(editor.materialEditorFields(null, [], { mode: 'type' })).map((section) => section.title), ['Material']);
  assert.deepEqual(editor.materialEditorPayload(['roomId', 'notes', 'label'], { roomId: 'r1', notes: '', label: 'A' }), { roomId: 'r1', scopeLevel: 'ROOM', notes: null, label: 'A' });
});
