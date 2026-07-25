const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  evaluateDiyEligibility,
} = require('../../src/services/diy/eligibilityPolicy.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  diyDecisionCompletionEvent,
  diyProjectCompletionEvent,
} = require('../../src/services/analytics/diyLifecycle.ts');

function eligible(overrides = {}) {
  return {
    title: 'Patch a small drywall hole',
    summary: 'Reviewed routine cosmetic repair',
    category: 'GENERAL',
    safetyLevel: 'LOW',
    permitRequirement: 'NOT_REQUIRED',
    verdict: 'DIY_RECOMMENDED',
    ...overrides,
  };
}

test('CAP-803 DIY owns discovery, safety, Home Record, and completion contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('diy');
  assert.ok(capability);
  assert.equal(capability.version, 2);
  assert.ok(capability.presentation.intentAliases.includes('can I do this repair myself'));
  assert.equal(capability.recommendation.triggerFamilies[0], 'LOW_RISK_DIY_ELIGIBLE');
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);
  assert.equal(capability.lifecycle.completionKind, 'DECISION_RECORDED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'diy_decision_recorded_or_project_created',
  );
  assert.deepEqual(capability.productFramework.livingHomeRecordWrites, [
    'diy-decision',
    'diy-project',
    'home-event',
    'maintenance-completion',
  ]);
});

test('CAP-803 catalog search retrieves DIY from homeowner phrasing', () => {
  const availability = createCapabilityAvailabilityAdapter({
    registry: canonicalCapabilityRegistry,
    failureMode: 'LAUNCH_FAIL_CLOSED',
    loadPolicy: () => ({
      enabled: true,
      enforceReleaseGates: false,
      disabledToolIds: [],
      rollouts: {},
    }),
  });
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    userId: 'user-1',
    propertyId: 'property-1',
  });
  const query = 'can i do this repair myself';
  const matches = catalog.capabilities.filter((capability) =>
    [
      capability.label,
      capability.shortDescription,
      ...capability.intentAliases,
    ].join(' ').toLowerCase().includes(query),
  );
  assert.deepEqual(matches.map((capability) => capability.id), ['diy']);
});

test('CAP-803 eligibility fails closed for unknown, regulated, and non-low-risk work', () => {
  assert.equal(evaluateDiyEligibility(eligible()).eligible, true);
  assert.deepEqual(
    evaluateDiyEligibility(eligible({ safetyLevel: null })).reasonCodes,
    ['SAFETY_CONTEXT_UNKNOWN'],
  );
  assert.deepEqual(
    evaluateDiyEligibility(eligible({ permitRequirement: 'UNKNOWN' })).reasonCodes,
    ['PERMIT_CONTEXT_UNKNOWN'],
  );
  assert.deepEqual(
    evaluateDiyEligibility(eligible({ safetyLevel: 'MODERATE' })).reasonCodes,
    ['NOT_LOW_RISK'],
  );
  assert.deepEqual(
    evaluateDiyEligibility(eligible({ verdict: 'HIRE_RECOMMENDED' })).reasonCodes,
    ['PROFESSIONAL_RECOMMENDED'],
  );
});

test('CAP-803 excludes hazardous work even when upstream labels it low risk', () => {
  const scenarios = [
    ['Replace the main electrical panel', 'EXCLUDED_ELECTRICAL_WORK'],
    ['Move a gas line', 'EXCLUDED_GAS_WORK'],
    ['Remove a load-bearing wall', 'EXCLUDED_STRUCTURAL_WORK'],
    ['Repair an active leak', 'EXCLUDED_ACTIVE_WATER_WORK'],
    ['Remove asbestos insulation', 'EXCLUDED_HAZARDOUS_MATERIAL_WORK'],
  ];
  for (const [title, reason] of scenarios) {
    assert.ok(evaluateDiyEligibility(eligible({ title })).reasonCodes.includes(reason));
  }
});

test('CAP-803 decisions and eligible projects emit canonical completion', () => {
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [
      diyDecisionCompletionEvent({
        propertyId: '22222222-2222-4222-8222-222222222222',
        verdict: 'DIY_RECOMMENDED',
        score: 82,
        category: 'GENERAL',
      }),
      diyProjectCompletionEvent({
        projectId: 'project-1',
        category: 'GENERAL',
        decisionVerdict: 'DIY_RECOMMENDED',
      }),
    ],
  });
  assert.deepEqual(events.map((event) => event.eventName), [
    'TOOL_COMPLETED',
    'TOOL_COMPLETED',
  ]);
  assert.ok(events.every((event) =>
    event.metadataJson.completionKind === 'DECISION_RECORDED'));
  assert.equal(events[1].metadataJson.reviewedLowRisk, true);
});
