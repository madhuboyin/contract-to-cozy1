const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Insurance policies in Ask (FRD v1.475): the policy list on the coverage answer, and add / edit / delete behind a review and a confirmation. Prisma and the
// canonical writers are replaced with recording fakes BEFORE any handler runs; the fake prisma throws on a model or method a test did not declare.
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { insurancePoliciesResult, insurancePolicyCommandResult } = require('../../src/services/ask/handlers/insurancePolicyCommands.handler.ts');
const { parseInsurancePolicyAnswer, insurancePolicyChanges, maskedPolicyNumber, insurancePolicyKindFromMessage } = require('../../src/services/ask/support/insurancePolicyCommand.ts');
const homeManagement = require('../../src/services/home-management.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { create: homeManagement.createInsurancePolicy, update: homeManagement.updateInsurancePolicy, remove: homeManagement.deleteInsurancePolicy, access: propertyAccess.resolvePropertyAccess };
let calls; let models; let role;
const at = new Date('2026-09-01T00:00:00.000Z');
const policy = (extra = {}) => ({ id: 'pol-1', carrierName: 'State Farm', policyNumber: 'SF-123456', coverageType: 'Homeowner', premiumAmount: '1800.50', startDate: new Date('2026-01-01T00:00:00.000Z'), expiryDate: new Date('2027-01-01T00:00:00.000Z'), updatedAt: at, ...extra });
let rows; let ownsHome;

test.beforeEach(() => {
  calls = {}; role = 'CONTRIBUTOR'; rows = [policy()]; ownsHome = true;
  models = {
    homeownerProfile: { findFirst: async () => ({ id: 'hp-1' }) },
    insurancePolicy: { findMany: async () => rows, findFirst: async ({ where }) => rows.find((row) => row.id === where.id) ?? null },
    property: { findFirst: async () => (ownsHome ? { id: 'p1' } : null) },
    askExecution: { findMany: async () => [] },
  };
  prismaModule.prisma = new Proxy({}, { get(_target, model) { if (model === 'then') return undefined; if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`); return models[model]; } });
  homeManagement.createInsurancePolicy = async (...args) => { calls.create = args; return { id: 'pol-new' }; };
  homeManagement.updateInsurancePolicy = async (...args) => { calls.update = args; return {}; };
  homeManagement.deleteInsurancePolicy = async (...args) => { calls.remove = args; return {}; };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  homeManagement.createInsurancePolicy = originals.create; homeManagement.updateInsurancePolicy = originals.update; homeManagement.deleteInsurancePolicy = originals.remove; propertyAccess.resolvePropertyAccess = originals.access;
});

const launch = (kind, entityId) => insurancePolicyCommandResult('u1', 'p1', { kind, entityId });
const invoke = (parameters) => confirmCapabilityInvoke('COVERAGE_COMMAND', {
  userId: 'u1', execution: { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'COVERAGE_COMMAND', createdAt: at }, parameters, access: { role }, command: getAskDomainCommandByOperation('COVERAGE_COMMAND'),
});
const form = { carrierName: ' Allstate ', policyNumber: 'AL-998877', coverageType: '', premiumAmount: '2100', startDate: '2027-02-01', expiryDate: '2028-02-01' };

test('form rules: premium above zero, real dates, expiry after start, default coverage type, cents rounding', () => {
  const ok = parseInsurancePolicyAnswer(form);
  assert.equal(ok.success, true);
  assert.deepEqual(ok.data, { carrierName: 'Allstate', policyNumber: 'AL-998877', coverageType: 'Homeowner', premiumAmount: 2100, startDate: '2027-02-01', expiryDate: '2028-02-01' });
  assert.equal(parseInsurancePolicyAnswer({ ...form, premiumAmount: 0 }).success, false);
  assert.equal(parseInsurancePolicyAnswer({ ...form, startDate: '2027-02-30' }).success, false);
  assert.equal(parseInsurancePolicyAnswer({ ...form, expiryDate: '2027-02-01' }).reason, 'DATE_ORDER');
  assert.equal(parseInsurancePolicyAnswer({ ...form, startDate: { precision: 'EXACT_DATE', value: '2027-02-01' } }).success, true);
  assert.equal(maskedPolicyNumber('SF-123456'), 'ending 3456');
  assert.equal(maskedPolicyNumber('AB'), '••••');
  assert.equal(insurancePolicyKindFromMessage('Delete this insurance policy.'), 'DELETE');
  assert.equal(insurancePolicyKindFromMessage('Show my insurance policies'), null);
  assert.deepEqual(insurancePolicyChanges(ok.data, { ...ok.data, premiumAmount: 2200, policyNumber: 'ZZ-111122' }).map((change) => [change.field, change.before, change.after]), [['policyNumber', 'ending 8877', 'ending 1122'], ['premiumAmount', '$2,100.00', '$2,200.00']]);
});

test('the list shows only the caller\'s policies with a masked number, Add on the answer and Edit / Delete on each row for a writer; a viewer gets no actions', async () => {
  const result = await insurancePoliciesResult('u1', 'p1');
  assert.equal(result.status, 'ANSWERED');
  const list = result.blocks.find((block) => block.type === 'GROUPED_LIST');
  const item = list.sections[0].items[0];
  assert.match(item.description, /ending 3456/);
  assert.doesNotMatch(JSON.stringify(result), /SF-123456/);
  assert.deepEqual(item.actions.map((action) => action.id), ['insurance-policy-edit', 'insurance-policy-delete']);
  assert.equal(result.blocks[0].actions[0].id, 'insurance-policy-add');
  role = 'VIEWER';
  const viewer = await insurancePoliciesResult('u1', 'p1');
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.equal(viewer.blocks.find((block) => block.type === 'GROUPED_LIST').sections[0].items[0].actions, undefined);
  rows = [];
  const none = await insurancePoliciesResult('u1', 'p1');
  assert.equal(none.reasonCode, 'INSURANCE_POLICIES_NONE');
});

test('add: a form first, then a review that writes nothing, then the canonical create under the caller\'s profile on confirm', async () => {
  const first = await launch('ADD');
  assert.equal(first.status, 'NEEDS_CONTEXT');
  assert.equal(first.captureRequests[0].inputSchema.fields.length, 6);
  const review = await insurancePolicyCommandResult('u1', 'p1', { kind: 'ADD' }, form);
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(calls.create, undefined);
  assert.ok(!JSON.stringify(review.confirmation).includes('AL-998877'), 'the review shows the masked number');
  const done = await invoke(review.parameters);
  assert.equal(done.result.reasonCode, 'INSURANCE_POLICY_ADDED');
  const [profileId, dto, confirmedBy] = calls.create;
  assert.equal(profileId, 'hp-1'); assert.equal(confirmedBy, 'u1');
  assert.equal(dto.propertyId, 'p1'); assert.equal(dto.carrierName, 'Allstate'); assert.equal(dto.premiumAmount, 2100);
  assert.ok(dto.startDate instanceof Date && dto.expiryDate instanceof Date);
  const bad = await insurancePolicyCommandResult('u1', 'p1', { kind: 'ADD' }, { ...form, expiryDate: '2026-01-01' });
  assert.equal(bad.reasonCode, 'INSURANCE_POLICY_DATE_ORDER');
});

test('add: a profile that does not own the home record is told so and nothing is offered; a viewer is blocked', async () => {
  ownsHome = false;
  assert.equal((await launch('ADD')).reasonCode, 'INSURANCE_POLICY_NOT_HOME_OWNER');
  ownsHome = true; role = 'VIEWER';
  assert.equal((await launch('ADD')).status, 'BLOCKED');
  await assert.rejects(() => invoke({ insurancePolicy: { kind: 'ADD', input: form } }), (error) => error.code === 'ASK_PERMISSION_REQUIRED');
});

test('edit: the review lists only what changes; confirm sends only those fields; an unchanged form or a stale policy changes nothing', async () => {
  const first = await launch('EDIT', 'pol-1');
  assert.equal(first.status, 'NEEDS_CONTEXT');
  assert.equal(first.captureRequests[0].currentAnswer.carrierName, 'State Farm');
  const answer = { carrierName: 'State Farm', policyNumber: 'SF-123456', coverageType: 'Homeowner', premiumAmount: 1900, startDate: '2026-01-01', expiryDate: '2027-06-30' };
  const review = await insurancePolicyCommandResult('u1', 'p1', { kind: 'EDIT', entityId: 'pol-1' }, answer);
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(Object.keys(review.parameters.insurancePolicy.patch).sort(), ['expiryDate', 'premiumAmount']);
  const done = await invoke(review.parameters);
  assert.equal(done.result.reasonCode, 'INSURANCE_POLICY_UPDATED');
  assert.equal(calls.update[0], 'pol-1'); assert.equal(calls.update[1], 'hp-1');
  assert.equal(calls.update[2].premiumAmount, 1900); assert.ok(calls.update[2].expiryDate instanceof Date); assert.equal('carrierName' in calls.update[2], false);
  const same = await insurancePolicyCommandResult('u1', 'p1', { kind: 'EDIT', entityId: 'pol-1' }, { carrierName: 'State Farm', policyNumber: 'SF-123456', coverageType: 'Homeowner', premiumAmount: 1800.5, startDate: '2026-01-01', expiryDate: '2027-01-01' });
  assert.equal(same.reasonCode, 'INSURANCE_POLICY_NO_CHANGE');
  calls.update = undefined;
  rows = [policy({ updatedAt: new Date('2026-09-09T00:00:00.000Z') })];
  await assert.rejects(() => invoke(review.parameters), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.update, undefined);
});

test('delete: review first, then the canonical delete scoped to the caller\'s profile; a policy that is gone or not theirs is refused', async () => {
  const review = await launch('DELETE', 'pol-1');
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(review.blocks[0].tone, 'CAUTION');
  assert.equal(calls.remove, undefined);
  const done = await invoke(review.parameters);
  assert.equal(done.result.reasonCode, 'INSURANCE_POLICY_DELETED');
  assert.deepEqual(calls.remove, ['pol-1', 'hp-1']);
  rows = [];
  assert.equal((await launch('DELETE', 'pol-1')).reasonCode, 'INSURANCE_POLICY_NOT_AVAILABLE');
  await assert.rejects(() => invoke(review.parameters), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
});

test('the coverage.command capability routes the declared messages only from a launched action, never from a typed message or a refresh', async () => {
  const typed = await capabilityInvoke('COVERAGE_COMMAND', { userId: 'u1', propertyId: 'p1', message: 'Delete this insurance policy.' });
  assert.equal(typed.status, 'NOT_APPLICABLE');
  const refresh = await capabilityInvoke('COVERAGE_COMMAND', { userId: 'u1', propertyId: 'p1', message: 'Delete this insurance policy.', launchContext: { surface: 'ASK_REFRESH', operationId: 'COVERAGE_COMMAND', entityId: 'pol-1' } });
  assert.equal(refresh.status, 'NOT_APPLICABLE');
  const launched = await capabilityInvoke('COVERAGE_COMMAND', { userId: 'u1', propertyId: 'p1', message: 'Delete this insurance policy.', launchContext: { surface: 'ASK_WORKSPACE', operationId: 'COVERAGE_COMMAND', entityType: 'INSURANCE_POLICY', entityId: 'pol-1' } });
  assert.equal(launched.status, 'NEEDS_CONFIRMATION');
});
