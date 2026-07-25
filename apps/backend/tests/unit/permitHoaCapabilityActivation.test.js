const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
  enrichProjectComplianceCapabilitySources,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  hoaApprovalRecordCompletionEvent,
  permitRecordCompletionEvent,
} = require('../../src/services/analytics/permitHoaLifecycle.ts');

function snapshot(hoaState, hoaValue) {
  return {
    propertyId: 'property-1',
    contextVersion: 'context-v1',
    generatedAt: '2026-07-24T12:00:00.000Z',
    scopes: ['CORE', 'COMPLIANCE'],
    facts: {
      'compliance.hoaAssociation': {
        key: 'compliance.hoaAssociation',
        value: hoaValue,
        state: hoaState,
        source: 'SYSTEM_DERIVED',
        verified: true,
        confidence: 1,
        observedAt: '2026-07-24T12:00:00.000Z',
        validUntil: null,
      },
    },
    warnings: [],
  };
}

function project(kind) {
  return {
    id: `project-${kind}`,
    kind,
    status: 'PLANNING',
    milestoneKind: null,
    signalIntentFamilies: ['ACTIVE_PROJECT_MOMENT'],
    sourceEntityType: 'PROJECT',
    sourceEntityId: `project-${kind}`,
    observedAt: '2026-07-24T12:00:00.000Z',
  };
}

test('CAP-805 Permit and HOA manifests own explicit activation and safe outputs', () => {
  const permits = canonicalCapabilityRegistry.getById('permits');
  const hoa = canonicalCapabilityRegistry.getById('hoa-compliance');
  assert.equal(permits.version, 2);
  assert.equal(hoa.version, 2);
  assert.equal(permits.recommendation.requiresExplicitTrigger, true);
  assert.equal(hoa.recommendation.requiresExplicitTrigger, true);
  assert.ok(permits.recommendation.readinessRequirements.some(
    (requirement) => requirement.kind === 'JURISDICTION',
  ));
  assert.match(permits.lifecycle.expectedOutput, /without representing legal compliance/i);
  assert.match(hoa.lifecycle.expectedOutput, /without representing legal compliance/i);
  assert.equal(permits.lifecycle.completionSignal, 'permit_record_created');
  assert.equal(hoa.lifecycle.completionSignal, 'hoa_approval_record_created');
});

test('CAP-805 evaluates permit and HOA project triggers independently', () => {
  const unknownHoa = enrichProjectComplianceCapabilitySources(
    snapshot('UNKNOWN', null),
    [project('ROOF_REPLACEMENT')],
  )[0];
  assert.ok(unknownHoa.signalIntentFamilies.includes('PERMIT_RELEVANT_PROJECT'));
  assert.ok(!unknownHoa.signalIntentFamilies.includes('HOA_PROJECT_APPROVAL_REQUIRED'));

  const knownHoa = enrichProjectComplianceCapabilitySources(
    snapshot('KNOWN', { id: 'hoa-1' }),
    [project('ROOF_REPLACEMENT')],
  )[0];
  assert.ok(knownHoa.signalIntentFamilies.includes('PERMIT_RELEVANT_PROJECT'));
  assert.ok(knownHoa.signalIntentFamilies.includes('HOA_PROJECT_APPROVAL_REQUIRED'));

  const interiorPaint = enrichProjectComplianceCapabilitySources(
    snapshot('KNOWN', { id: 'hoa-1' }),
    [project('PAINTING_INTERIOR')],
  )[0];
  assert.deepEqual(interiorPaint.signalIntentFamilies, ['ACTIVE_PROJECT_MOMENT']);
});

test('CAP-805 tracked records emit canonical completion with launch lineage', () => {
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [
      permitRecordCompletionEvent({
        recordId: 'permit-1',
        sourceActionId: 'action-1',
        sourceEntityType: 'PROJECT',
        sourceEntityId: 'project-1',
      }),
      hoaApprovalRecordCompletionEvent({
        recordId: 'approval-1',
        sourceJourneyId: 'journey-1',
        sourceEntityType: 'PROJECT',
        sourceEntityId: 'project-1',
      }),
    ],
  });
  assert.ok(events.every((event) => event.eventName === 'TOOL_COMPLETED'));
  assert.ok(events.every((event) => event.metadataJson.completionKind === 'PLAN_CREATED'));
  assert.equal(events[0].metadataJson.sourceActionId, 'action-1');
  assert.equal(events[1].metadataJson.journeyId, 'journey-1');
});
