const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-020, FRD v1.94): the renovation case's blocking readiness items as a
// progress ring. The real RENOVATION_PERMIT_READINESS handler runs with stubbed case, readiness and permit reads.

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const renovationCase = require('../../src/services/renovationCase.service.ts');
const renovationReadiness = require('../../src/services/renovationReadiness.service.ts');
const { PermitTrackerService } = require('../../src/services/permitTracker.service.ts');
const { renovationReadinessProgress } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, list: renovationCase.listRenovationCases, readiness: renovationReadiness.getReadiness, permits: PermitTrackerService.prototype.getPermitSummary };
let items;
test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
  renovationCase.listRenovationCases = async () => [{ id: 'case-1', name: 'Kitchen remodel', updatedAt: new Date('2026-09-20T12:00:00Z') }];
  renovationReadiness.getReadiness = async () => ({ summary: { state: 'NOT_READY', disclaimer: 'This readiness assessment organizes project records and does not establish legal compliance.' }, items, project: null });
  PermitTrackerService.prototype.getPermitSummary = async () => ({ totalPermits: 2, activePermits: 1, finaledPermits: 1, openFlags: 0 });
});
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
  renovationCase.listRenovationCases = originals.list;
  renovationReadiness.getReadiness = originals.readiness;
  PermitTrackerService.prototype.getPermitSummary = originals.permits;
});

const item = (id, overrides = {}) => ({ id, title: `Item ${id}`, status: 'OPEN', isBlocking: true, overrideAcknowledgedAt: null, reason: 'Needed before work starts', exactNextAction: 'Upload the permit', evidenceRequired: null, sourceType: 'PERMIT', ...overrides });
const CASE = '/dashboard/properties/p1/renovations/case-1/readiness';

test('the ring counts blocking items only: satisfied or acknowledged is settled, the basis says so, and the tiles split blocking, acknowledged and other open', () => {
  const ring = renovationReadinessProgress([
    item('a', { status: 'SATISFIED' }), item('b', { overrideAcknowledgedAt: new Date('2026-09-01T00:00:00Z') }), item('c'), item('d'),
    item('e', { isBlocking: false }), item('f', { isBlocking: false, status: 'SATISFIED' }),
  ], CASE);
  assert.equal(ring.percent, 50);
  assert.equal(ring.basis, '2 of 4 blocking items satisfied or acknowledged');
  assert.deepEqual(ring.metrics.map((entry) => [entry.label, entry.value, entry.tone]), [['Blocking', '2', 'CAUTION'], ['Acknowledged', '1', 'DEFAULT'], ['Other open', '1', 'DEFAULT']]);
  AskPresentationBlockSchema.parse(ring);
});

test('next steps are the open blocking items, at most three, with their reason and next action, linking to the case, with no actions', () => {
  const ring = renovationReadinessProgress(['a', 'b', 'c', 'd'].map((id) => item(id)), CASE);
  assert.deepEqual(ring.nextSteps.map((step) => step.id), ['a', 'b', 'c']);
  assert.equal(ring.nextSteps[0].description, 'Needed before work starts · Upload the permit');
  assert.ok(ring.nextSteps.every((step) => step.href === CASE && (step.actions ?? []).length === 0));
  assert.equal(ring.percent, 0);
});

test('no blocking items means no ring; everything settled is 100 percent with no steps', () => {
  assert.equal(renovationReadinessProgress([item('a', { isBlocking: false })], CASE), null);
  assert.equal(renovationReadinessProgress([], CASE), null);
  const done = renovationReadinessProgress([item('a', { status: 'SATISFIED' })], CASE);
  assert.equal(done.percent, 100);
  assert.deepEqual(done.nextSteps, []);
});

test('the real handler puts the ring ahead of the checklist, and the answer checker keeps the answer', async () => {
  items = [item('a', { status: 'SATISFIED' }), item('b', { title: 'HOA_APPROVAL' }), item('c', { isBlocking: false })];
  const question = 'Is my kitchen remodel ready to start?';
  const result = await capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'u1', propertyId: 'p1', message: question });
  assert.deepEqual(result.blocks.map((block) => block.id).slice(0, 3), ['renovation-readiness-summary', 'renovation-readiness-progress', 'renovation-readiness-items']);
  assert.equal(result.blocks[1].percent, 50);
  const checked = validateAskAnswerTrustPipeline({
    question, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('RENOVATION_PERMIT_READINESS')]),
  });
  assert.equal(checked.semantic.outcome, 'PASS', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'PROGRESS'));
});

test('PROGRESS is allowed for the operation in the registry and the renovation skill', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.RENOVATION_PERMIT_READINESS.allowedBlockTypes.includes('PROGRESS'));
  assert.ok(getSkillForOperation('RENOVATION_PERMIT_READINESS').allowedResultBlocks.includes('PROGRESS'));
});
