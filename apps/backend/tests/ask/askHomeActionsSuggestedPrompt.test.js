const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { matchesHomeActionsAnswerContract } = require('../../src/services/ask/askHomeActionsIntent.ts');
const {
  attachAskAuthoritativeSourceEvidence,
  completedAskAuthoritativeSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');

const QUESTION = 'Which home actions should I plan for next?';

function homeActionsResult(status = 'ANSWERED', populated = true) {
  const blocks = [{
    type: 'SUMMARY', id: 'home-actions-summary',
    title: populated ? '2 governed Home Actions are ready to review' : 'No active Home Action is currently surfaced',
    body: populated ? 'These are the final grounded actions from Unified Home.' : 'The governed feed found no eligible active action.',
    tone: 'DEFAULT', actions: [],
  }];
  if (populated) blocks.push({
    type: 'GROUPED_LIST', id: 'home-actions-list', title: 'Prioritized actions',
    description: 'Priority and order come from the canonical Home Action feed.',
    sections: [{ id: 'plan', title: 'Plan', count: 1, items: [{
      id: 'action-1', title: 'Plan for the water heater', description: 'The recorded system is aging.',
      meta: ['plan'], status: 'OPEN', href: '/dashboard',
    }] }], actions: [],
  });
  return { status, blocks, suggestions: ['What should I plan?'] };
}

test('first-party Home Actions planning prompt routes directly', () => {
  const routing = resolveAskRoutingCascade(QUESTION);
  assert.equal(routing.operation.operationId, 'HOME_ACTIONS');
  assert.equal(routing.requiresClarification, false);
});

test('populated and empty canonical Home Actions pass initial and clarified trust', () => {
  for (const status of ['ANSWERED', 'READY_WITH_LIMITATIONS']) {
    for (const populated of [true, false]) {
      const result = homeActionsResult(status, populated);
      assert.equal(matchesHomeActionsAnswerContract(result), true);
      for (const operationConfirmedByUser of [false, true]) {
        const validation = validateAskAnswerTrustPipeline({
          question: QUESTION,
          operationId: 'HOME_ACTIONS', propertyId: 'property-1', semanticEnabled: true,
          recoveryAttempted: operationConfirmedByUser,
          operationConfirmedByUser,
          result: attachAskAuthoritativeSourceEvidence(
            result,
            [completedAskAuthoritativeSourceEvidence('HOME_ACTIONS')],
          ),
        });
        assert.equal(validation.semantic.outcome, 'PASS');
        assert.equal(validation.result.status, status);
      }
    }
  }
});

test('focused canonical Home Action guidance passes the same contract', () => {
  const result = {
    status: 'ANSWERED', suggestions: [],
    blocks: [{
      type: 'SUMMARY', id: 'focused-home-action-summary', title: 'Plan for the water heater',
      body: 'The selected action needs planning.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'focused-home-action-guidance', title: 'What to do next',
      description: 'Guidance for the Home Action you selected.', sections: [], actions: [],
    }, {
      type: 'EVIDENCE', id: 'focused-home-action-evidence', title: 'Evidence for this guidance', items: [],
    }],
  };
  assert.equal(matchesHomeActionsAnswerContract(result), true);
});

test('Home Actions contract rejects unrelated operation blocks', () => {
  assert.equal(matchesHomeActionsAnswerContract({
    status: 'ANSWERED', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'property-summary', title: 'Home record', body: 'Summary.', tone: 'DEFAULT', actions: [] }],
  }), false);
});
