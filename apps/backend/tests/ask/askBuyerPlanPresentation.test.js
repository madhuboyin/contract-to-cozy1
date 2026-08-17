const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { buildBuyerPlanHomeActionsResult } = require('../../src/services/ask/askBuyerPlanPresentation.ts');
const { lifecyclePromptsFor } = require('../../src/services/ask/askLifecyclePromptPolicy.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { matchesHomeActionsAnswerContract } = require('../../src/services/ask/askHomeActionsIntent.ts');

function task(overrides = {}) {
  return {
    id: 'task-next', actionKey: 'closing.next', title: 'Review the Closing Disclosure',
    description: 'Compare the current revision with the selected Loan Estimate.',
    status: 'PENDING', phase: 'CLOSING_PREP', priority: 'NOW',
    checklistSection: 'CLOSING_DISCLOSURE_FUNDS', dueAt: '2026-08-20T00:00:00.000Z',
    assignedToUserId: null, ...overrides,
  };
}

function context(overrides = {}) {
  return {
    propertyId: 'property/1', presentationMode: 'BUYER_CLOSING', contextVersion: 'buyer-v1',
    overview: {
      property: { id: 'property/1', address: '1 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
      journey: { status: 'ACTIVE', stage: 'CLOSING_PREP', targetCloseDate: '2026-08-25T00:00:00.000Z', moveInDate: null, progress: { completed: 8, total: 10, percent: 80 } },
      nextAction: task(), blockers: [], milestones: [], readinessLanes: [],
      evidence: { inspectionState: 'CONFIRMED', inspectionReportCount: 1, openMaterialFindingCount: 0, documentCount: 3, verifiedDocumentCount: 2, documentsNeedingReviewCount: 1 },
      people: { contactCount: 2, assignedTaskCount: 1 },
      routes: { plan: '/dashboard/properties/property%2F1/buyer-plan', documents: '/dashboard/properties/property%2F1/documents', inspection: '/dashboard/properties/property%2F1/inspection-hub', ask: '/dashboard/ask?propertyId=property%2F1' },
    },
    ...overrides,
  };
}

test('the buying lifecycle features the buyer closing copilot operations, not generic HOME_ACTIONS', () => {
  const prompts = lifecyclePromptsFor('UNDER_CONTRACT');
  const featured = prompts.find((prompt) => prompt.operationId === 'BUYER_PLAN_STATUS');
  assert.equal(featured.question, 'What should I do next for this purchase?');
  assert.equal(featured.categoryId, 'PLAN_MONITOR');
  assert.equal(resolveAskRoutingCascade(featured.question).operation.operationId, 'BUYER_PLAN_STATUS');
  assert.equal(prompts.some((prompt) => prompt.operationId === 'HOME_ACTIONS'), false);
});

test('buyer Home Actions reads the canonical next task and links its exact plan section', () => {
  const result = buildBuyerPlanHomeActionsResult(context());
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.contextVersion, 'buyer-v1');
  assert.match(result.blocks[0].title, /Review the Closing Disclosure/);
  assert.equal(
    result.blocks[0].actions[0].href,
    '/dashboard/properties/property%2F1/buyer-plan?taskId=task-next&section=CLOSING_DISCLOSURE_FUNDS',
  );
  assert.equal(result.blocks[1].sections[0].items[0].id, 'task-next');
  assert.match(result.blocks[1].description, /canonical Buyer Plan/);
  assert.equal(matchesHomeActionsAnswerContract(result), true);
});

test('candidate purchases do not fall through to homeowner recommendations', () => {
  const result = buildBuyerPlanHomeActionsResult(context({ presentationMode: 'CANDIDATE', overview: null }));
  assert.equal(result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(result.reasonCode, 'BUYER_PLAN_NOT_ACTIVE');
  assert.match(result.blocks[0].body, /not substitute homeowner recommendations/);
  assert.equal(matchesHomeActionsAnswerContract(result), true);
});

test('owned, recent-owner, and new-home presentations preserve the existing Home Actions path', () => {
  assert.equal(buildBuyerPlanHomeActionsResult(context({ presentationMode: 'HOMEOWNER', overview: null })), null);
  assert.equal(buildBuyerPlanHomeActionsResult(context({ presentationMode: 'RECENT_OWNER', overview: null })), null);
  assert.equal(buildBuyerPlanHomeActionsResult(context({ presentationMode: 'NEW_HOME', overview: null })), null);
});
