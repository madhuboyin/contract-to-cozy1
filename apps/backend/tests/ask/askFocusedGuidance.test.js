const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildFocusedHomeActionGuidance,
  focusedHomeActionCategory,
  focusedHomeActionQuestion,
  focusedOperationForLaunchContext,
} = require('../../src/services/ask/askFocusedGuidance.ts');

function weatherAction() {
  return {
    id: 'incident:heat-1',
    source: { kind: 'INCIDENT' },
    priority: 'PLAN',
    state: 'OPEN',
    signal: 'An official multi-day heat alert is active.',
    whyItMatters: 'Extended heat can increase household health and cooling-system risk.',
    recommendedAction: 'Review the alert and prepare the home before the hottest period.',
    expectedOutcome: 'The household has a clear heat-safety and cooling plan.',
    presentation: {
      variant: 'ENVIRONMENT_PREPARATION',
      headline: 'Multi-day heat risk ahead preparation',
      summary: 'Several high-heat days are expected for this property.',
      keyFacts: [
        { label: 'Forecast window', value: 'Through Friday' },
        { label: 'Preparation', value: 'Check cooling and hydration plans' },
      ],
      factGroups: [{
        label: 'Preparation checklist',
        facts: [
          { key: 'step-1', label: 'Step 1', value: 'Inspect the HVAC filter.', kind: 'RECORDED', source: 'Forecast and home record', observedAt: '2026-08-14T12:00:00.000Z' },
          { key: 'step-2', label: 'Step 2', value: 'Clear the outdoor condenser.', kind: 'RECORDED', source: 'Forecast and home record', observedAt: '2026-08-14T12:00:00.000Z' },
        ],
      }],
    },
    timing: { dueAt: '2026-08-16T12:00:00.000Z', rationale: 'Prepare before the alert begins.' },
    evidence: [{ id: 'weather-1', label: 'Official heat alert', source: 'Weather service', observedAt: '2026-08-14T12:00:00.000Z' }],
    confidence: { label: 'HIGH' },
    recommendationResponse: { status: 'AVAILABLE', reasonCode: 'RECOMMENDATION_AVAILABLE', safeNextAction: 'Review official guidance.' },
    governance: {
      safetyTier: 'LOW_CONSEQUENCE',
      emergencyEscalation: null,
      conservativeFallback: 'Follow official heat guidance if conditions worsen.',
      professionalBoundary: null,
    },
    primaryCta: { label: 'Open preparation checklist', href: '/weather/heat-1' },
    ranking: { explanation: 'Higher household relevance.' },
  };
}

test('contextual Ask prompts resolve exact subjects and produce focused Home Action guidance', () => {
  const action = weatherAction();
  assert.equal(focusedHomeActionQuestion(action), 'How should I prepare for the multi-day heat risk at this home?');
  assert.deepEqual(focusedHomeActionCategory(action), { categoryId: 'PROTECT', categoryLabel: 'Protect' });
  assert.equal(focusedOperationForLaunchContext({ entityType: 'HOME_ACTION', entityId: action.id, actionId: action.id }), 'HOME_ACTIONS');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'DECISION_THREAD', entityId: 'decision-1' }), 'HVAC_DECISION_CONTINUE');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'INVENTORY_ITEM', entityId: 'item-1' }), 'REPLACEMENT_GUIDANCE');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'HOME_ACTION' }), null);

  const result = buildFocusedHomeActionGuidance(action, 'context-v1');
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'HOME_ACTION_FOCUSED_GUIDANCE');
  assert.deepEqual(result.parameters, { focusedHomeActionId: action.id });
  assert.equal(result.blocks.some((block) => block.type === 'PRIORITY_LIST'), false);
  assert.equal(result.blocks.find((block) => block.type === 'SUMMARY').title, 'Multi-day heat risk ahead');
  assert.deepEqual(result.blocks.find((block) => block.type === 'SUMMARY').actions, []);
  const focused = result.blocks.find((block) => block.id === 'focused-home-action-guidance');
  assert.equal(focused.title, 'Prepare this home');
  assert.match(focused.description, /preparation plan for this home/i);
  assert.deepEqual(focused.sections[0].items.map((item) => item.title), [
    'Inspect the HVAC filter.',
    'Clear the outdoor condenser.',
  ]);
  assert.deepEqual(focused.actions.map((candidate) => candidate.label), ['Open preparation checklist']);
  assert.equal(result.blocks.some((block) => JSON.stringify(block).includes('View in Home Actions')), false);
  assert.equal(result.blocks.find((block) => block.type === 'EVIDENCE').items.length, 1);
});

test('focused Ask preserves neutral pre-snapshot HVAC guidance without manufacturing a verdict', () => {
  const action = {
    ...weatherAction(),
    id: 'repair-replace:analysis-1',
    source: { kind: 'GUIDANCE' },
    signal: 'Repair vs Replace: Furnace',
    whyItMatters: 'This HVAC system is ready for a repair-or-replace review, but no current Decision Platform recommendation is available yet.',
    recommendedAction: 'Review the available facts and start or resume the tracked HVAC decision.',
    expectedOutcome: 'A documented repair-or-replace decision for this item.',
    presentation: null,
    evidence: [{
      id: 'analysis-1',
      label: 'Supporting HVAC lifecycle analysis: Furnace',
      source: 'Lifespan Engine (supporting evidence only)',
      observedAt: '2026-08-14T12:00:00.000Z',
    }],
    confidence: { label: 'LOW' },
    recommendationResponse: {
      status: 'NEEDS_INPUT',
      reasonCode: 'CURRENT_HVAC_RECOMMENDATION_MISSING',
      safeNextAction: 'Start or resume the tracked HVAC decision.',
    },
    primaryCta: { label: 'Review Decision', href: '/dashboard/properties/property-1/inventory/items/item-1/replace-repair' },
  };

  const result = buildFocusedHomeActionGuidance(action, 'context-v1');
  const rendered = JSON.stringify(result.blocks);
  assert.match(rendered, /no current Decision Platform recommendation/i);
  assert.match(rendered, /start or resume the tracked HVAC decision/i);
  assert.doesNotMatch(rendered, /favors (?:repair|replacement)|replace immediately|verdict:/i);
});
