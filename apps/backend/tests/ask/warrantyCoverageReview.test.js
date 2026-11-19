const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// Actionable Result Enrichment FRD §5.2: the review step chooses the surface; exact duplicates are terminal and non-confirming.
const { prisma } = require('../../src/lib/prisma');
const { reviewWarrantyCoverageForEdit } = require('../../src/services/ask/execution/warrantyCoverageReview');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry');
const { editCaptureWarrantyCandidate, warrantyAddCaptureRequest, USER_ADD_ORIGIN } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture');

const d = (text) => new Date(`${text}T00:00:00.000Z`);
const existingRow = (overrides = {}) => ({
  id: 'w1', providerName: 'Acme Home Care', policyNumber: 'AB-123', category: 'APPLIANCE', scopeKind: 'ITEM_SPECIFIC', coverageDetails: null,
  startDate: d('2025-01-01'), expiryDate: d('2026-01-01'), updatedAt: new Date('2025-02-01T10:00:00.000Z'), propertyId: 'p1', inventoryItem: { name: 'Samsung Refrigerator' }, documents: [], ...overrides,
});

function withPrisma(rows, run) {
  const original = prisma.warranty;
  prisma.warranty = {
    findMany: async () => rows,
    findFirst: async ({ where }) => rows.find((row) => row.id === where.id) ?? null,
    count: async () => 1,
  };
  return Promise.resolve(run()).finally(() => { prisma.warranty = original; });
}

const answer = { providerName: 'Acme Home Care', category: 'APPLIANCE', policyNumber: 'AB-123', coverageDetails: null, cost: null, startDate: { precision: 'EXACT_DATE', value: '2025-01-01' }, expiryDate: { precision: 'EXACT_DATE', value: '2026-01-01' } };
const edited = (overrides = {}, answerOverrides = {}) => editCaptureWarrantyCandidate(
  { captureOrigin: USER_ADD_ORIGIN, sourceExecutionId: 's1', inventoryItemId: 'i1', inventoryItemName: 'Samsung Refrigerator', ...overrides }, 'Record a warranty in my home record.', 'ctx-1', { ...answer, ...answerOverrides }, new Date('2026-01-01T00:00:00.000Z'),
);
const exec = { id: 'exec-1', propertyId: 'p1' };

test('no match: the normal review is unchanged and carries no override', async () => {
  const result = await withPrisma([], () => reviewWarrantyCoverageForEdit({ execution: exec, userId: 'u1', edited: edited() }));
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.confirmation.confirmLabel, 'Save warranty');
  assert.equal(result.parameters.overrideFingerprint, undefined);
  assert.ok(result.confirmation.fields.some((field) => field.label === 'Appliance' && field.value === 'Samsung Refrigerator'), 'the appliance is shown as a fixed field');
});

test('exact duplicate: a terminal ANSWERED result with the existing warranty inline and nothing to confirm', async () => {
  const result = await withPrisma([existingRow()], () => reviewWarrantyCoverageForEdit({ execution: exec, userId: 'u1', edited: edited() }));
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'WARRANTY_ALREADY_RECORDED');
  assert.equal(result.confirmation, null);
  assert.deepEqual(result.captureRequests, []);
  assert.equal(result.blocks[0].id, 'warranty-already-recorded');
  const list = result.blocks.find((block) => block.type === 'GROUPED_LIST');
  assert.equal(list.id, 'warranty-results');
  assert.equal(list.sections.flatMap((section) => section.items).length, 1);
  assert.deepEqual(list.actions, [], 'no server-side action is emitted on a terminal result');
  assert.ok(ASK_OPERATION_DEFINITIONS.CAPTURE_WARRANTY_CONFIRM.allowedBlockTypes.includes('GROUPED_LIST'));
});

test('equivalent coverage: the confirmation is relabelled Record anyway and bound to a fingerprint', async () => {
  const rows = [existingRow()];
  const result = await withPrisma(rows, () => reviewWarrantyCoverageForEdit({ execution: exec, userId: 'u1', edited: edited({}, { expiryDate: { precision: 'EXACT_DATE', value: '2026-03-01' } }) }));
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.confirmation.confirmLabel, 'Record anyway');
  assert.match(result.parameters.overrideFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(result.confirmation.fields.some((field) => field.label === 'Already recorded'));
});

test('a different execution or user gets a different fingerprint for the same coverage', async () => {
  const rows = [existingRow({ providerName: 'Other Co' })];
  const run = (execution, userId) => withPrisma(rows, () => reviewWarrantyCoverageForEdit({ execution, userId, edited: edited() })).then((result) => result.parameters.overrideFingerprint);
  const a = await run(exec, 'u1');
  assert.notEqual(a, await run({ id: 'exec-2', propertyId: 'p1' }, 'u1'));
  assert.notEqual(a, await run(exec, 'u2'));
});

test('a property-wide extracted candidate with a scope the writer rejects is left for the confirmation, as before', async () => {
  // (A user-started property-level add can no longer reach this: the server rejects a non-plan category up front.)
  const propertyWide = editCaptureWarrantyCandidate({ sourceExecutionId: 's1' }, 'm', 'ctx-1', { ...answer, category: 'APPLIANCE' }, new Date('2026-01-01T00:00:00.000Z'));
  const result = await withPrisma([], () => reviewWarrantyCoverageForEdit({ execution: exec, userId: 'u1', edited: propertyWide }));
  assert.equal(result, propertyWide);
});

test('the item-targeted form names the appliance and offers no whole-home plan coverage type', () => {
  const request = warrantyAddCaptureRequest('ctx', { itemId: 'item-1', itemName: 'Samsung Refrigerator' });
  assert.match(request.question, /Samsung Refrigerator/);
  const category = request.inputSchema.fields.find((field) => field.key === 'category');
  assert.ok(!category.inputSchema.options.some((option) => option.value === 'HOME_WARRANTY_PLAN'));
});

test('property-level Record home warranty plan offers only the whole-home plan, prefilled, and the server rejects any other category', () => {
  const { warrantyAddScope, warrantyCategoryAllowedForScope } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture');
  const plain = warrantyAddCaptureRequest('ctx');
  assert.equal(plain.title, 'Record home warranty plan');
  const options = plain.inputSchema.fields.find((field) => field.key === 'category').inputSchema.options;
  assert.deepEqual(options.map((option) => option.value), ['HOME_WARRANTY_PLAN']);
  assert.equal(plain.currentAnswer.category, 'HOME_WARRANTY_PLAN');
  const stored = { captureOrigin: USER_ADD_ORIGIN };
  assert.equal(warrantyAddScope(stored), 'HOME_PLAN');
  const answer = (category) => ({ providerName: 'Acme', category, startDate: '2026-01-01', expiryDate: '2027-01-01' });
  assert.equal(editCaptureWarrantyCandidate(stored, 'm', 'ctx', answer('APPLIANCE'), new Date('2026-06-01')), null, 'a hand-built non-plan category is rejected');
  const ok = editCaptureWarrantyCandidate(stored, 'm', 'ctx', answer('HOME_WARRANTY_PLAN'), new Date('2026-06-01'));
  assert.equal(ok.status, 'NEEDS_CONFIRMATION');
  // The post-review edit form stays constrained.
  assert.deepEqual(ok.captureRequests[0].inputSchema.fields.find((field) => field.key === 'category').inputSchema.options.map((o) => o.value), ['HOME_WARRANTY_PLAN']);
  // Item scope is the mirror image; an extracted candidate (no USER_ADD origin) is unconstrained.
  const itemStored = { captureOrigin: USER_ADD_ORIGIN, inventoryItemId: 'item-1' };
  assert.equal(warrantyAddScope(itemStored), 'ITEM');
  assert.equal(editCaptureWarrantyCandidate(itemStored, 'm', 'ctx', answer('HOME_WARRANTY_PLAN'), new Date('2026-06-01')), null);
  assert.equal(warrantyCategoryAllowedForScope(warrantyAddScope({}), 'APPLIANCE'), true);
});
