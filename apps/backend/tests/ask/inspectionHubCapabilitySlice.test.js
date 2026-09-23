const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.43: inspection-hub capability-card slice. Same fake-prisma harness as the other
// capability-card slice tests; the fake prisma throws on any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const {
  INSPECTION_FINDING_ACTIONS, inspectionFindingItemActions, inspectionHubHref, editInspectionFindingResolveConfirmation,
} = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { ResolveFindingSchema } = require('../../src/validators/inspectionHub.validators.ts');
const hubService = require('../../src/services/inspectionHub.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { resolveFinding: hubService.resolveFinding, acceptFindingAsWork: hubService.acceptFindingAsWork, dismissFinding: hubService.dismissFinding, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
let accessRole;
let finding;
let calls;

function install() {
  accessRole = 'CONTRIBUTOR';
  finding = { id: 'finding-1', reportId: 'report-1', propertyId: 'p1', homeSystem: 'ROOF', inspectorDescription: 'Missing shingles on the north slope', severity: 'MAJOR', status: 'OPEN', workDisposition: 'PENDING_REVIEW', updatedAt: UPDATED_AT, report: { inspectionDate: new Date('2026-09-01'), inspectorName: 'Pat' } };
  calls = { resolve: [], accept: [], dismiss: [] };
  const models = {
    askExecution: { findMany: async () => [] },
    inspectionFinding: {
      findMany: async () => [finding],
      findFirst: async ({ where }) => (where.id === finding.id ? finding : null),
    },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  hubService.resolveFinding = async (...args) => { calls.resolve.push(args); return {}; };
  hubService.acceptFindingAsWork = async (...args) => { calls.accept.push(args); return {}; };
  hubService.dismissFinding = async (...args) => { calls.dismiss.push(args); return {}; };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  Object.assign(hubService, { resolveFinding: originals.resolveFinding, acceptFindingAsWork: originals.acceptFindingAsWork, dismissFinding: originals.dismissFinding });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const version = () => createHash('sha256').update(`${finding.id}:${finding.status}:${finding.workDisposition}:${UPDATED_AT.toISOString()}`).digest('hex');
const propose = (message) => capabilityInvoke('INSPECTION_FINDING_UPDATE', {
  userId: 'u1', propertyId: 'p1', message,
  launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INSPECTION_FINDING', entityId: 'finding-1', operationId: 'INSPECTION_FINDING_UPDATE', sourceExecutionId: 'exec-list' },
});
const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'INSPECTION_FINDING_UPDATE', createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (parameters) => confirmCapabilityInvoke('INSPECTION_FINDING_UPDATE', { userId: 'u1', execution: execution(), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('INSPECTION_FINDING_UPDATE') });
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test('every declared finding action\'s canned message proposes exactly its own action for the launched finding', async () => {
  for (const action of INSPECTION_FINDING_ACTIONS) {
    const result = await propose(action.message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', action.id);
    assert.equal(result.parameters.inspectionFindingId, 'finding-1');
    assert.equal(result.parameters.inspectionFindingAction, action.action, action.id);
  }
});

test('Resolve asks the traditional dialog\'s three questions, defaulting to contractor work; other actions have no fields', async () => {
  const resolve = await propose('Mark this inspection finding resolved.');
  assert.deepEqual(resolve.confirmation.editableFields.map((field) => [field.key, field.type, field.value]), [['method', 'SELECT', 'CONTRACTOR_WORK'], ['notes', 'TEXTAREA', ''], ['costCents', 'MONEY', '']]);
  assert.deepEqual(resolve.confirmation.editableFields[0].options.map((option) => option.value), ['CONTRACTOR_WORK', 'DIY', 'SELLER_REPAIR', 'CREDITED_AT_CLOSING', 'DISMISSED']);
  assert.deepEqual(resolve.parameters.inspectionResolution, { method: 'CONTRACTOR_WORK', notes: null, costCents: null });
  assert.deepEqual((await propose('Dismiss this inspection finding.')).confirmation.editableFields, []);
});

test('confirming a resolve writes a resolution method the traditional route itself accepts (the old HOMEOWNER_CONFIRMED was not one)', async () => {
  await confirm({ inspectionFindingId: 'finding-1', inspectionReportId: 'report-1', inspectionFindingAction: 'RESOLVE', inspectionFindingContextVersion: version(), inspectionResolution: { method: 'DIY', notes: 'Replaced 6 shingles', costCents: 12000 } });
  assert.equal(calls.resolve.length, 1);
  const [findingId, propertyId, body] = calls.resolve[0];
  assert.equal(findingId, 'finding-1');
  assert.equal(propertyId, 'p1');
  assert.deepEqual(body, { resolutionMethod: 'DIY', resolutionNotes: 'Replaced 6 shingles', resolutionCostCents: 12000 });
  assert.equal(ResolveFindingSchema.safeParse(body).success, true);
  // A proposal made before this fix carries no resolution and gets the traditional default, still a valid method.
  await confirm({ inspectionFindingId: 'finding-1', inspectionReportId: 'report-1', inspectionFindingAction: 'RESOLVE', inspectionFindingContextVersion: version() });
  assert.equal(ResolveFindingSchema.safeParse(calls.resolve[1][2]).success, true);
  assert.equal(calls.resolve[1][2].resolutionMethod, 'CONTRACTOR_WORK');
});

test('resolve edits reject unknown fields, unlisted methods and malformed amounts before touching anything', async () => {
  const parameters = { inspectionFindingId: 'finding-1', inspectionFindingAction: 'RESOLVE', inspectionResolution: { method: 'CONTRACTOR_WORK', notes: null, costCents: null }, confirmationVersion: 1 };
  const edit = (edits, params = parameters) => codeOf(editInspectionFindingResolveConfirmation(execution(), params, { confirmationVersion: 1, edits }, 'u1'));
  assert.equal(await edit({ severity: 'SAFETY' }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ method: 'HOMEOWNER_CONFIRMED' }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ costCents: '12,000' }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ notes: 'x'.repeat(1001) }), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await edit({ method: 'DIY' }, { ...parameters, inspectionFindingAction: 'DISMISS' }), 'ASK_EDIT_NOT_SUPPORTED');
});

test('finding rows carry identity, their report, a working report link and every action for contributors; viewers get read-only rows', async () => {
  const list = async () => (await capabilityInvoke('INSPECTION_FINDINGS', { userId: 'u1', propertyId: 'p1', message: 'Show my open inspection findings' })).blocks.find((block) => block.id === 'inspection-findings');
  const contributor = await list();
  const [row] = contributor.sections[0].items;
  assert.equal(row.entityType, 'INSPECTION_FINDING');
  assert.equal(row.parentId, 'report-1');
  assert.equal(row.href, '/dashboard/properties/p1/inspection-hub/report-1?findingId=finding-1');
  assert.deepEqual(row.actions.map((action) => action.id), ['finding-accept', 'finding-dismiss', 'finding-resolve']);
  assert.equal(contributor.actions[0].href, '/dashboard/properties/p1/inspection-hub/open-items');
  assert.ok(!JSON.stringify(contributor).includes('/inspection"') && !JSON.stringify(contributor).includes('/inspection?'), 'no link to the nonexistent /inspection route');
  accessRole = 'VIEWER';
  assert.deepEqual((await list()).sections[0].items[0].actions, []);
  assert.equal(inspectionHubHref('p1'), '/dashboard/properties/p1/inspection-hub/open-items');
});

test('the finding actions and the hub link survive the answer-trust whitelist', () => {
  for (const action of [...inspectionFindingItemActions('OWNER'), { id: 'open-inspection', label: 'Open Inspection Hub', href: '/dashboard/properties/p1/inspection-hub/open-items', style: 'SECONDARY' }]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'INSPECTION_FINDINGS', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

test('the inspection-hub capability card now launches inline into open findings', () => {
  assert.equal(capabilityCardLaunch('inspection-hub').inlineLaunch.operationId, 'INSPECTION_FINDINGS');
});
