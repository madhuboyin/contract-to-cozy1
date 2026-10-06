const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD Appendix C.9: the hiring guide, home-basics guides and renovation readiness checklist emit the plan layout's grouped-list shape (numbered
// cards, urgent group tone, facts that open under the card). The frontend renders it by block id (PLAN_LAYOUT_BLOCK_IDS).

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const renovationCase = require('../../src/services/renovationCase.service.ts');
const renovationReadiness = require('../../src/services/renovationReadiness.service.ts');
const { PermitTrackerService } = require('../../src/services/permitTracker.service.ts');
require('../../src/services/ask/askOrchestrator.service.ts'); // registers the capability handlers
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { buildHiringGuideResult } = require('../../src/services/ask/support/hiringGuide.ts');
const { buildHomeBasicsResult } = require('../../src/services/ask/support/homeBasicsGuide.ts');

const list = (result, id) => result.blocks.find((block) => block.id === id);
const allItems = (block) => block.sections.flatMap((section) => section.items);

test('static guides number their cards in order and carry no urgent tone', () => {
  for (const [result, id] of [[buildHiringGuideResult(), 'hiring-guide-items'], [buildHomeBasicsResult('SAFETY_BASICS'), 'home-basics-items'], [buildHomeBasicsResult('MONTHLY_ROUTINE'), 'home-basics-items']]) {
    const block = list(result, id);
    AskPresentationBlockSchema.parse(block);
    assert.deepEqual(allItems(block).map((item) => item.countLabel), allItems(block).map((_, index) => String(index + 1)));
    assert.ok(allItems(block).every((item) => item.tone === undefined || item.tone === 'DEFAULT'));
  }
});

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, list: renovationCase.listRenovationCases, readiness: renovationReadiness.getReadiness, permits: PermitTrackerService.prototype.getPermitSummary };
let items;
test.beforeEach(() => {
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
  renovationCase.listRenovationCases = async () => [{ id: 'case-1', name: 'Kitchen remodel', updatedAt: new Date('2026-09-20T12:00:00Z') }];
  renovationReadiness.getReadiness = async () => ({ summary: { state: 'NOT_READY', disclaimer: 'x' }, items, project: null });
  PermitTrackerService.prototype.getPermitSummary = async () => ({ totalPermits: 0, activePermits: 0, finaledPermits: 0, openFlags: 0 });
});
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  propertyAccess.resolvePropertyAccess = originals.access;
  renovationCase.listRenovationCases = originals.list;
  renovationReadiness.getReadiness = originals.readiness;
  PermitTrackerService.prototype.getPermitSummary = originals.permits;
});

const item = (id, overrides = {}) => ({ id, title: `Item ${id}`, status: 'OPEN', isBlocking: true, overrideAcknowledgedAt: null, reason: 'Needed before work starts', exactNextAction: 'Upload the permit', evidenceRequired: 'The approved permit', sourceType: 'PERMIT', ...overrides });

test('renovation readiness: blocking items are the urgent group, numbering runs across groups, and the next step and evidence open under the card', async () => {
  items = [item('a'), item('b', { overrideAcknowledgedAt: new Date('2026-09-01T00:00:00Z') }), item('c', { isBlocking: false, exactNextAction: null, evidenceRequired: null }), item('d', { status: 'SATISFIED' })];
  const result = await capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'u1', propertyId: 'p1', message: 'Is my kitchen remodel ready to start?' });
  const block = list(result, 'renovation-readiness-items');
  AskPresentationBlockSchema.parse(block);
  assert.deepEqual(block.sections.map((section) => [section.id, section.count]), [['blocking', 2], ['other-open', 1]]);
  assert.deepEqual(allItems(block).map((entry) => entry.countLabel), ['1', '2', '3']);
  const [first, second, other] = allItems(block);
  assert.equal(first.tone, 'CAUTION');
  assert.deepEqual(first.meta, ['Blocks starting']);
  assert.equal(first.detail, 'Next step: Upload the permit\nEvidence needed: The approved permit');
  assert.deepEqual(second.meta, ['Blocks starting', 'Acknowledged']);
  assert.equal(other.tone, 'DEFAULT');
  assert.deepEqual(other.meta, ['Open']);
  assert.equal(other.detail, undefined, 'no facts recorded, so nothing opens');
});

// Conversational presentation R3: only the non-blocking group collapses; blocking items always show; the delivery cap is a separate matter.
test('renovation readiness: "Other open items" declares an initial visible count of five and "Blocking" declares none', async () => {
  items = [item('b1'), item('b2'), ...Array.from({ length: 8 }, (_, index) => item(`o${index + 1}`, { isBlocking: false }))];
  const block = list(await capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'u1', propertyId: 'p1', message: 'Is my kitchen remodel ready to start?' }), 'renovation-readiness-items');
  AskPresentationBlockSchema.parse(block);
  const [blocking, other] = block.sections;
  assert.equal(blocking.initialVisibleCount, undefined);
  assert.equal(other.initialVisibleCount, 5);
  assert.deepEqual([blocking.items.length, other.items.length], [2, 8]);
});

test('renovation readiness: the disclosure field does not touch the 20-item delivery cap, so a group larger than that still reports its real count', async () => {
  items = Array.from({ length: 30 }, (_, index) => item(`o${index + 1}`, { isBlocking: false }));
  const block = list(await capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'u1', propertyId: 'p1', message: 'Is my kitchen remodel ready to start?' }), 'renovation-readiness-items');
  const [other] = block.sections;
  assert.equal(other.count, 30);
  assert.equal(other.items.length, 20, 'at most 20 are delivered; "Show more" can only reveal these (the truncation is a separate, open issue)');
  assert.equal(other.initialVisibleCount, 5);
});

test('monthly routine: five equally relevant checks stay fully visible (no disclosure boundary)', () => {
  const [section] = list(buildHomeBasicsResult('MONTHLY_ROUTINE'), 'home-basics-items').sections;
  assert.equal(section.items.length, 5);
  assert.equal(section.initialVisibleCount, undefined);
});
