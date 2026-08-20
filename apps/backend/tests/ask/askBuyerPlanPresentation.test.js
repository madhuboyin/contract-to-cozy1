const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { buildBuyerPlanHomeActionsResult } = require('../../src/services/ask/askBuyerPlanPresentation.ts');
const { lifecyclePromptsFor } = require('../../src/services/ask/askLifecyclePromptPolicy.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { matchesHomeActionsAnswerContract } = require('../../src/services/ask/askHomeActionsIntent.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');

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
      nextAction: task(), nextActionGuidance: null, blockers: [], milestones: [], readinessLanes: [],
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

test('"focus on" closing phrasing routes to BUYER_PLAN_STATUS instead of falling through to a clarification prompt', () => {
  assert.equal(
    resolveAskRoutingCascade('What should I focus on this week for my closing?').operation.operationId,
    'BUYER_PLAN_STATUS',
  );
});

test('"is anything putting my closing at risk" phrasing routes to BUYER_DEADLINES instead of falling through to a clarification prompt', () => {
  for (const question of [
    'Is anything putting my closing date at risk?',
    'Is anything putting my closing at risk?',
    'Is my closing date at risk?',
  ]) {
    assert.equal(resolveAskRoutingCascade(question).operation.operationId, 'BUYER_DEADLINES', question);
  }
  assert.equal(resolveAskRoutingCascade('What could delay or block my closing?').operation.operationId, 'BUYER_DEADLINES');
});

test('every BUYER_* operation\'s own canonical example questions route to that operation, not a clarification fallback', () => {
  const positives = {
    BUYER_PLAN_STATUS: ['What should I do next for this purchase?', 'What is the status of my home purchase?', 'How close am I to closing?', 'Give me my closing plan status'],
    BUYER_DEADLINES: ['What is due before closing?', 'What is my next deadline before closing?', 'What could delay or block my closing?', 'Show upcoming deadlines for this purchase', 'Is anything putting my closing date at risk?'],
    BUYER_DOCUMENT_READINESS: ['Which transaction documents are missing before closing?', 'Which closing documents am I still missing?', 'Show document readiness for this closing'],
    BUYER_INSPECTION_REVIEW: ['Which inspection findings still need a decision?', 'Review my inspection findings before closing', 'What inspection findings are still undecided?'],
    BUYER_TASK_COMPLETE: ['Check off the locksmith closing checklist item', 'Complete this closing checklist item', 'I finished the rekey checklist item'],
    BUYER_TASK_CREATE: ['Add final walkthrough photos to my buyer plan', 'Create a buyer plan task for the survey pickup', 'Add a closing plan task for the movers deposit'],
    BUYER_TASK_UPDATE: ['Reschedule the survey closing plan task', 'Assign the utilities buyer plan task to Alex', 'Move the walkthrough buyer plan task to next week'],
    BUYER_MOVE_STATUS: ['What should I do before I move in?', 'Show my move-in readiness for this purchase', 'How is moving progress tracking for this closing?'],
    BUYER_FINANCING_READINESS: ['What financing item could delay my closing?', 'What is my lender appraisal status?', 'Is underwriting on track for this closing?'],
    BUYER_TITLE_ESCROW_READINESS: ['What is still open with title or escrow?', 'Show my survey and HOA readiness for closing', 'What title issues could block my closing?'],
    BUYER_WALKTHROUGH_READINESS: ['Build my final walkthrough checklist', 'Help me prepare for the final walkthrough', 'Is my final walkthrough readiness confirmed?'],
    BUYER_DISCLOSURE_FUNDS_READINESS: ['What changed in my Closing Disclosure?', 'Is my closing disclosure ready for review?', 'Are my closing funds ready?'],
    BUYER_CLOSING_DAY_READINESS: ['What do I need for closing day?', 'Is my closing day checklist ready?', 'What should I prepare for closing day?'],
    BUYER_CONTRACT_TIMELINE: ['Which contract dates still need my confirmation?', 'Show my confirmed contract timeline', 'What contingency deadlines are recorded in my contract?'],
    BUYER_NEGOTIATION_READINESS: ['What should I discuss with my agent about the inspection?', 'Show my negotiation readiness for this closing', 'What is the seller response status on my requests?'],
    BUYER_COST_READINESS: ['What could cost me money in the first 90 days?', 'What are the near-term costs for this purchase?', 'What will this purchase cost me before closing?'],
    BUYER_FINDING_DISPOSITION: ['Move the roof finding into my post-close plan', 'Classify the electrical finding as a negotiation item', 'Mark the paint finding as a verified fact'],
    BUYER_LIFECYCLE_UPDATE: ['Cancel this purchase', 'We closed today', 'Change my target closing date to next month'],
  };
  for (const [operationId, questions] of Object.entries(positives)) {
    for (const question of questions) {
      assert.equal(resolveAskOperation(question).operationId, operationId, `"${question}" should route to ${operationId}`);
    }
  }
});

test('BUYER_* classifier fixes do not hijack any operation\'s own registered negative examples', () => {
  const negatives = {
    BUYER_PLAN_STATUS: ['What maintenance is pending?', 'What is due before closing?'],
    BUYER_DEADLINES: ['What should I do next for this purchase?', 'Which transaction documents are missing?'],
    BUYER_DOCUMENT_READINESS: ['What is my next deadline before closing?', 'Show my recorded home inventory'],
    BUYER_INSPECTION_REVIEW: ['What should I do next for this purchase?', 'Should I repair or replace my furnace?'],
    BUYER_TASK_COMPLETE: ['Create a new maintenance task', 'What should I do next for this purchase?'],
    BUYER_TASK_CREATE: ['Mark the locksmith closing checklist item complete', 'What is due before closing?'],
    BUYER_TASK_UPDATE: ['Add a new closing checklist item', 'Mark the survey task complete'],
    BUYER_MOVE_STATUS: ['What is due before closing?', 'Which inspection findings still need a decision?'],
    BUYER_FINANCING_READINESS: ['What should I do next for this purchase?', 'Which transaction documents are missing?'],
    BUYER_TITLE_ESCROW_READINESS: ['What financing item could delay my closing?', 'What is due before closing?'],
    BUYER_WALKTHROUGH_READINESS: ['What is still open with title or escrow?', 'Which inspection findings still need a decision?'],
    BUYER_DISCLOSURE_FUNDS_READINESS: ['Build my final walkthrough checklist', 'What is due before closing?'],
    BUYER_CLOSING_DAY_READINESS: ['What changed in my Closing Disclosure?', 'What should I do next for this purchase?'],
    BUYER_CONTRACT_TIMELINE: ['What do I need for closing day?', 'What should I do next for this purchase?'],
    BUYER_NEGOTIATION_READINESS: ['Which contract dates still need my confirmation?', 'What is due before closing?'],
    BUYER_FINDING_DISPOSITION: ['What should I discuss with my agent about the inspection?', 'What could cost me money in the first 90 days?'],
    BUYER_COST_READINESS: ['Cancel this purchase', 'Move the roof finding into my post-close plan'],
    BUYER_LIFECYCLE_UPDATE: ['What could cost me money in the first 90 days?', 'What should I do next for this purchase?'],
  };
  for (const [forbiddenOperationId, questions] of Object.entries(negatives)) {
    for (const question of questions) {
      assert.notEqual(resolveAskOperation(question).operationId, forbiddenOperationId, `"${question}" should not route to ${forbiddenOperationId}`);
    }
  }
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
