const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildCapabilityRecommendationContext,
  canonicalCapabilityRegistry,
  matchCapabilityCandidates,
  projectTrackerSignalFamilies,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  hasTrackableProjectMilestone,
  projectMilestonePlanCompletionEvent,
  projectProgressCompletionEvent,
} = require('../../src/services/analytics/projectTrackerLifecycle.ts');

const NOW = '2026-07-24T12:00:00.000Z';

function propertyContext() {
  return {
    propertyId: 'property-1',
    contextVersion: 'context-v1',
    generatedAt: NOW,
    scopes: ['CORE'],
    facts: {},
    warnings: [],
  };
}

function candidates(signalIntentFamilies) {
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [],
    projects: [{
      id: 'project-1',
      kind: 'ROOF_REPLACEMENT',
      status: 'PLANNING',
      milestoneKind: null,
      signalIntentFamilies,
      sourceEntityType: 'PROJECT',
      sourceEntityId: 'project-1',
      observedAt: NOW,
    }],
    availableCapabilityIds: ['project-tracker'],
    surface: 'HOME',
    generatedAt: NOW,
  });
  return matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
  }).candidates;
}

test('CAP-807 Project Tracker owns execution record and completion contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('project-tracker');
  assert.equal(capability.version, 2);
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);
  // Home Operations Slice 10: OUTCOME_VERIFIED, not ACTION_COMPLETED on
  // creation — matches confirmCompletion's real verified-completion
  // machinery (Home Operations Slice 6) instead of "created with a
  // milestone or progress."
  assert.equal(capability.lifecycle.completionKind, 'OUTCOME_VERIFIED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'project_verified_outcome_recorded',
  );
  assert.deepEqual(capability.lifecycle.outputEntityTypes, ['PROJECT']);
});

test('CAP-807 Status Board and Guidance Overview report condition/decision, not a competing plan (Home Operations Slice 10)', () => {
  const statusBoard = canonicalCapabilityRegistry.getById('status-board');
  assert.equal(statusBoard.lifecycle.completionKind, 'OUTPUT_VIEWED');
  assert.doesNotMatch(statusBoard.presentation.shortDescription, /priorit/i);

  const guidanceOverview = canonicalCapabilityRegistry.getById('guidance-overview');
  assert.equal(guidanceOverview.lifecycle.completionKind, 'DECISION_RECORDED');
  assert.doesNotMatch(guidanceOverview.presentation.shortDescription, /active (property )?signals/i);
});

test('CAP-807 explicit project records activate while generic context does not', () => {
  assert.equal(
    candidates([]).some((candidate) => candidate.capabilityId === 'project-tracker'),
    false,
  );
  const signals = projectTrackerSignalFamilies({ milestoneKind: null });
  assert.ok(signals.includes('PROJECT_EXECUTION_STARTED'));
  const candidate = candidates(signals).find(
    (item) => item.capabilityId === 'project-tracker',
  );
  assert.equal(candidate.source.entityType, 'PROJECT');
  assert.equal(candidate.source.entityId, 'project-1');
  assert.equal(candidate.primaryMatch.kind, 'SIGNAL_INTENT_FAMILY');
});

test('CAP-807 plan and verified progress emit canonical project completion', () => {
  assert.equal(hasTrackableProjectMilestone(null), false);
  assert.equal(hasTrackableProjectMilestone({ id: 'milestone-1' }), true);
  const events = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [
      projectMilestonePlanCompletionEvent({
        projectId: 'project-1',
        milestoneId: 'milestone-1',
        operation: 'project_created_with_milestone',
        sourceActionId: 'action-1',
      }),
      projectProgressCompletionEvent({
        projectId: 'project-1',
        milestoneId: 'milestone-1',
        requiresPhotoEvidence: true,
        sourceJourneyId: 'journey-1',
      }),
    ],
  });
  assert.ok(events.every((event) => event.eventName === 'TOOL_COMPLETED'));
  assert.ok(events.every(
    (event) => event.metadataJson.completionKind === 'ACTION_COMPLETED',
  ));
  assert.equal(events[0].metadataJson.operation, 'project_created_with_milestone');
  assert.equal(events[1].metadataJson.operation, 'milestone_progress_verified');
  assert.equal(events[1].metadataJson.requiresPhotoEvidence, true);
});
