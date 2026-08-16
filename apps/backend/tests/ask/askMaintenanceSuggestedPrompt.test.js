const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { matchesMaintenanceStatusAnswerContract } = require('../../src/services/ask/askMaintenanceIntent.ts');
const { suppressRepeatedAskSuggestions } = require('../../src/services/ask/askSuggestionPolicy.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTION = 'List pending maintenance tasks';
const DUE_THIS_MONTH_QUESTION = 'What maintenance tasks are due this month?';

function canonicalMaintenanceResult() {
  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY', id: 'maintenance-summary',
      title: '2 maintenance records match this request',
      body: 'Two open tasks are recorded in the selected scope.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance record',
      description: 'Showing pending work.',
      sections: [{ id: 'open', title: 'Pending and in progress', count: 2, items: [] }], actions: [],
    }, {
      type: 'BOUNDARY', id: 'maintenance-record-boundary', title: 'Based on recorded tasks',
      body: 'Unrecorded work is outside this result.', severity: 'INFO', suggestions: [],
    }],
    suggestions: ['Show overdue tasks only', 'What maintenance is due soon?', 'Create a maintenance task'],
  };
}

test('the exact first-party pending-maintenance suggestion routes directly', () => {
  const routing = resolveAskRoutingCascade(QUESTION);
  assert.equal(routing.operation.operationId, 'MAINTENANCE_STATUS');
  assert.equal(routing.requiresClarification, false);
});

test('the exact first-party due-this-month suggestion routes directly', () => {
  const routing = resolveAskRoutingCascade(DUE_THIS_MONTH_QUESTION);
  assert.equal(routing.operation.operationId, 'MAINTENANCE_STATUS');
  assert.equal(routing.requiresClarification, false);
});

test('canonical maintenance results pass typed relevance before and after explicit clarification', () => {
  const result = canonicalMaintenanceResult();
  assert.equal(matchesMaintenanceStatusAnswerContract(result), true);
  const relevance = validateAskSemanticAnswerRelevance({
    question: QUESTION, operationId: 'MAINTENANCE_STATUS', result,
  });
  assert.equal(relevance.outcome, 'PASS');
  assert.deepEqual(relevance.reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);

  const afterClarification = validateAskAnswerTrustPipeline({
    question: QUESTION,
    operationId: 'MAINTENANCE_STATUS',
    propertyId: 'property-1',
    semanticEnabled: true,
    recoveryAttempted: true,
    operationConfirmedByUser: true,
    result: attachAskAuthoritativeSourceEvidence(
      result,
      [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')],
    ),
  });
  assert.equal(afterClarification.semantic.outcome, 'PASS');
  assert.equal(afterClarification.result.status, 'ANSWERED');
  assert.notEqual(afterClarification.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
});

test('record-owned enum-like maintenance titles do not invalidate the answer', () => {
  const result = canonicalMaintenanceResult();
  result.blocks[1].sections[0].items.push({
    id: 'task-1',
    title: 'HVAC_FILTER_CHANGE',
    description: 'Replace the filter this month.',
    meta: ['HVAC_SYSTEM'],
    status: 'PENDING',
    href: '/dashboard/maintenance?propertyId=property-1&taskId=task-1',
  });
  const validation = validateAskAnswerTrustPipeline({
    question: DUE_THIS_MONTH_QUESTION,
    operationId: 'MAINTENANCE_STATUS',
    propertyId: 'property-1',
    semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(
      result,
      [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')],
    ),
  });
  assert.equal(validation.trust.outcome, 'PASS');
  assert.equal(validation.result.status, 'ANSWERED');
});

test('internal tokens in Ask-authored maintenance narrative remain blocked', () => {
  const result = canonicalMaintenanceResult();
  result.blocks[0].body = 'The MAINTENANCE_STATUS adapter returned two tasks.';
  const validation = validateAskAnswerTrustPipeline({
    question: DUE_THIS_MONTH_QUESTION,
    operationId: 'MAINTENANCE_STATUS',
    propertyId: 'property-1',
    semanticEnabled: false,
    result: attachAskAuthoritativeSourceEvidence(
      result,
      [completedAskAuthoritativeSourceEvidence('MAINTENANCE_STATUS')],
    ),
  });
  assert.equal(validation.trust.outcome, 'BLOCK');
  assert.equal(validation.result.reasonCode, 'ASK_ANSWER_TRUST_FAILED');
});

test('typed maintenance contract rejects unrelated result blocks', () => {
  assert.equal(matchesMaintenanceStatusAnswerContract({
    status: 'ANSWERED', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'inventory-summary', title: 'Inventory', body: 'Appliance details.', tone: 'DEFAULT', actions: [] }],
  }), false);
});

test('explicit operation selection does not override a clearly unrelated answer', () => {
  const relevance = validateAskSemanticAnswerRelevance({
    question: QUESTION,
    operationId: 'MAINTENANCE_STATUS',
    operationConfirmedByUser: true,
    result: {
      status: 'ANSWERED', suggestions: [],
      blocks: [{
        type: 'SUMMARY', id: 'inventory-summary', title: 'Appliance inventory details',
        body: 'The refrigerator model, serial number, and installation date are recorded.', tone: 'DEFAULT', actions: [],
      }],
    },
  });
  assert.notEqual(relevance.outcome, 'PASS');
});

test('follow-up suggestions remove current, recent, and duplicate prompts', () => {
  const filtered = suppressRepeatedAskSuggestions({
    status: 'ANSWERED', blocks: [],
    suggestions: [
      'Show incomplete inventory records',
      'Which systems are nearing end of life?',
      'List all appliances',
      'List all appliances',
    ],
  }, 'Show incomplete inventory records', ['List all appliances']);
  assert.deepEqual(filtered.suggestions, ['Which systems are nearing end of life?']);
});
