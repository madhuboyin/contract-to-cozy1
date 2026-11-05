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

function homeActionsResult(status = 'ANSWERED', populated = true, producerUnavailable = false) {
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
  if (producerUnavailable) blocks.push({
    type: 'BOUNDARY', id: 'home-actions-producer-unavailable',
    title: 'Some Home Action sources were unavailable',
    body: 'Weather coverage was unavailable when this feed was generated. The planning actions still reflect every other source.',
    severity: 'INFO', suggestions: ['Ask again to retry'],
  });
  return { status, blocks, suggestions: ['What should I plan?'] };
}

function productionShapedPriorityList() {
  return {
    type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now',
    propertyId: 'property-1', rankingPolicyVersion: 'priority-list-policy-v2',
    generatedAt: '2026-11-05T02:52:18.000Z', sourceFreshnessAt: '2026-11-05T02:45:00.000Z', truncated: false,
    items: [{
      homeActionId: 'weather-1', title: 'Heavy rain expected Friday, Nov 6',
      rawPriority: 'PLAN', consumerPriority: 'WATCH', comparativeReasonCodes: [],
      whyThisAppeared: 'Forecast conditions may affect this home.', confidenceLabel: 'HIGH', deadlineAt: '2026-11-06T12:00:00.000Z',
      dependencyRefs: [], cta: null, inlineLaunch: null,
      presentation: {
        kind: 'WEATHER', variant: 'ENVIRONMENT_PREPARATION', eyebrow: 'Environment action recommended',
        summary: 'Heavy rainfall may overwhelm gutters and exterior drainage.',
        whyItMatters: 'Water may enter around the lowest level or foundation.',
        recommendedAction: 'Clear gutters and exterior drains before the rain begins.',
        expectedOutcome: 'Exterior drainage is ready for the forecast rainfall.', detailLabel: 'View preparation steps',
        timing: { windowStart: '2026-11-05T12:00:00.000Z', windowEnd: '2026-11-06T12:00:00.000Z', rationale: 'Prepare before rainfall begins.' },
        keyFacts: [{ label: 'Provider signal', value: 'OPERATIONAL_WORK_DUE' }],
        source: { label: 'OPEN_METEO', observedAt: '2026-11-05T02:45:00.000Z', freshness: 'CURRENT' },
        controls: [],
      },
      watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
    }],
  };
}

test('first-party Home Actions planning prompt routes directly', () => {
  const routing = resolveAskRoutingCascade(QUESTION);
  assert.equal(routing.operation.operationId, 'HOME_ACTIONS');
  assert.equal(routing.requiresClarification, false);
});

test('the Plan ahead landing copy also routes when typed without launch context', () => {
  const routing = resolveAskRoutingCascade('Show me what I should plan ahead for');
  assert.equal(routing.operation.operationId, 'HOME_ACTIONS');
  assert.equal(routing.requiresClarification, false);
});

test('the focused-action follow-up routes back to the Home Actions feed without clarification', () => {
  const routing = resolveAskRoutingCascade('What else needs my attention?');
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

test('the Plan ahead answer preserves actions and its partial-source disclosure when one producer is unavailable', () => {
  const question = 'Show me what I should plan ahead for';
  const result = homeActionsResult('READY_WITH_LIMITATIONS', true, true);
  assert.equal(matchesHomeActionsAnswerContract(result), true);

  const validation = validateAskAnswerTrustPipeline({
    question,
    operationId: 'HOME_ACTIONS', propertyId: 'property-1', semanticEnabled: true,
    recoveryAttempted: false,
    operationConfirmedByUser: false,
    result: attachAskAuthoritativeSourceEvidence(
      result,
      [completedAskAuthoritativeSourceEvidence('HOME_ACTIONS')],
    ),
  });

  assert.equal(validation.semantic.outcome, 'PASS');
  assert.equal(validation.result.status, 'READY_WITH_LIMITATIONS');
  assert.equal(validation.result.reasonCode, undefined);
  assert.equal(validation.result.blocks.some((block) => block.id === 'home-actions-list'), true);
  assert.equal(validation.result.blocks.some((block) => block.id === 'home-actions-producer-unavailable'), true);
  assert.equal(validation.result.blocks.some((block) => block.id === 'answer-trust-failed'), false);
});

test('canonical Priority List source identifiers do not leak into Ask-authored internal-token validation', () => {
  const result = homeActionsResult('ANSWERED', true, false);
  result.blocks.splice(1, 0, productionShapedPriorityList());

  const validation = validateAskAnswerTrustPipeline({
    question: 'Show me what I should plan ahead for',
    operationId: 'HOME_ACTIONS', propertyId: 'property-1', semanticEnabled: true,
    recoveryAttempted: false, operationConfirmedByUser: false,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('HOME_ACTIONS')]),
  });

  assert.equal(validation.result.status, 'ANSWERED');
  assert.notEqual(validation.trust.outcome, 'BLOCK');
  assert.equal(validation.trust.checks.operationCongruence, 'PASS');
  assert.equal(validation.trust.reasonCodes.includes('INTERNAL_PRESENTATION_TOKEN'), false);
  assert.equal(validation.result.blocks.some((block) => block.id === 'home-actions-priority-list'), true);
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
