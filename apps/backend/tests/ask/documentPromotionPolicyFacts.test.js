const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 2 of the declarations-page flow: after a policy is read, its details wait for confirmation. The review says so and offers the list; the list's
// policy-fact rows carry Confirm / Reject (the confirmation card still follows), for a contributor or owner only; the answer checker keeps them.

const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/documents.handler.ts');
const { coverageReviewFromView } = require('../../src/services/ask/handlers/coverageReview.handler.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence, isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const original = prismaModule.prisma;
test.afterEach(() => { prismaModule.prisma = original; });
const fact = { id: 'fact-1', factKey: 'ALL_PERIL_DEDUCTIBLE', amountValue: { toString: () => '2500' }, textValue: null, booleanValue: null, updatedAt: new Date('2026-11-01T00:00:00Z'), homeownerProfileId: 'hp-1',
  policyTerm: { insurancePolicy: { id: 'pol-1', carrierName: 'State Farm', homeownerProfileId: 'hp-1' } } };
const install = () => {
  prismaModule.prisma = {
    materialExtractionReview: { findMany: async () => [], count: async () => 0 },
    inspectionReport: { findMany: async () => [], count: async () => 0 },
    insurancePolicyFact: { findMany: async () => [fact], count: async () => 1 },
  };
};
const invoke = (role) => capabilityInvoke('DOCUMENT_PROMOTION_REVIEW', { userId: 'u1', propertyId: 'p1', message: 'Show document facts waiting for review' }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const rowOf = (result) => result.blocks.find((block) => block.id === 'document-promotions').sections[0].items[0];

test('a pending policy fact row carries Confirm and Reject for a contributor or owner, and none for a viewer; the allowlist keeps them', async () => {
  install();
  const owner = await invoke('OWNER');
  assert.deepEqual(rowOf(owner).actions.map((action) => [action.id, action.operationId, action.message.startsWith('Confirm ') || action.message.startsWith('Reject ')]), [
    ['document-promotion-confirm', 'DOCUMENT_PROMOTION_CONFIRM', true], ['document-promotion-reject', 'DOCUMENT_PROMOTION_CONFIRM', true],
  ]);
  assert.equal(rowOf(owner).entityType, 'INSURANCE_POLICY_FACT');
  for (const block of owner.blocks) AskPresentationBlockSchema.parse(block);
  assert.equal(rowOf(await invoke('VIEWER')).actions, undefined);
  const checked = validateAskAnswerTrustPipeline({
    question: 'Show document facts waiting for review', operationId: 'DOCUMENT_PROMOTION_REVIEW', propertyId: 'p1', householdRole: 'OWNER',
    result: attachAskAuthoritativeSourceEvidence(owner, [completedAskAuthoritativeSourceEvidence('DOCUMENT_PROMOTION_REVIEW')]),
  });
  // The full pipeline is not used here: it judges the answer's first block, which is not what this test is about. The action allowlist is the unit that strips buttons.
  for (const action of rowOf(owner).actions) {
    assert.equal(isAskActionApplicable({ action, operationId: 'DOCUMENT_PROMOTION_REVIEW', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
});

test('the coverage review says how many policy details wait, offers to go through them first, and does not ask for the upload again', () => {
  const read = { isCurrent: true, review: { overallState: 'NEEDS_EVIDENCE', scopeStatus: 'UNSUPPORTED', generatedAt: new Date('2026-10-26T00:00:00Z'), policyTerm: null, questions: [] } };
  const summary = (result) => result.blocks.find((block) => block.id === 'coverage-review-summary');
  const waiting = coverageReviewFromView(read, true, 'p1', true, 3);
  assert.match(summary(waiting).body, /3 details read from your policy are waiting for you to confirm/);
  assert.deepEqual(summary(waiting).actions.map((action) => [action.id, action.operationId, action.style]), [
    ['coverage-review-pending-facts', 'DOCUMENT_PROMOTION_REVIEW', 'PRIMARY'], ['coverage-generate-review', 'COVERAGE_COMMAND', 'SECONDARY'],
  ]);
  for (const block of waiting.blocks) AskPresentationBlockSchema.parse(block);
  assert.match(summary(coverageReviewFromView(read, true, 'p1', true, 1)).body, /1 detail read from your policy is waiting/);
  assert.deepEqual(summary(coverageReviewFromView(read, true, 'p1', true, 0)).actions.map((action) => action.id), ['coverage-policy-upload', 'coverage-generate-review']);
  assert.deepEqual(summary(coverageReviewFromView(read, false, 'p1', false, 3)).actions, [], 'a viewer is offered nothing');
  const checked = validateAskAnswerTrustPipeline({
    question: 'What questions should I ask my insurer?', operationId: 'COVERAGE_REVIEW_STATUS', propertyId: 'p1', householdRole: 'OWNER',
    result: attachAskAuthoritativeSourceEvidence(waiting, [completedAskAuthoritativeSourceEvidence('COVERAGE_REVIEW_STATUS')]),
  });
  assert.equal(summary(checked.result).actions[0].id, 'coverage-review-pending-facts', JSON.stringify(checked.trust.reasonCodes));
});
