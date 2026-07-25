const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildCapabilityRecommendationContext,
  canonicalCapabilityRegistry,
  inspectionDocumentCapabilitySource,
  inspectionJourneyTrigger,
  matchCapabilityCandidates,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  hasTrackableInspectionFindings,
  inspectionFindingsCompletionEvent,
} = require('../../src/services/analytics/inspectionHubLifecycle.ts');

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

test('CAP-806 Inspection Hub owns discovery, record, and completion contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('inspection-hub');
  assert.equal(capability.version, 2);
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);
  assert.deepEqual(capability.recommendation.recommendationDefinitionCodes, [
    'INSPECTION_DOCUMENT_AVAILABLE',
  ]);
  assert.equal(capability.lifecycle.completionKind, 'ARTIFACT_CREATED');
  assert.equal(capability.lifecycle.completionSignal, 'inspection_findings_extracted');
  assert.deepEqual(capability.lifecycle.outputEntityTypes, ['ISSUE']);
});

test('CAP-806 accepts only inspection documents and reviewed inspection journeys', () => {
  const updatedAt = new Date(NOW);
  assert.equal(inspectionDocumentCapabilitySource({
    id: 'invoice-1',
    type: 'INVOICE',
    updatedAt,
  }), null);
  const source = inspectionDocumentCapabilitySource({
    id: 'inspection-1',
    type: 'INSPECTION_REPORT',
    updatedAt,
  });
  assert.equal(source.sourceEntityType, 'DOCUMENT');
  assert.equal(source.sourceEntityId, 'inspection-1');
  assert.equal(
    inspectionJourneyTrigger('pre_purchase_inspection_journey'),
    'INSPECTION_DOCUMENT_AVAILABLE',
  );
  assert.equal(inspectionJourneyTrigger('insurance_renewal_journey'), null);
});

test('CAP-806 document source produces Inspection Hub candidate with document lineage', () => {
  const source = inspectionDocumentCapabilitySource({
    id: 'inspection-1',
    type: 'INSPECTION_REPORT',
    updatedAt: new Date(NOW),
  });
  const context = buildCapabilityRecommendationContext({
    propertyId: 'property-1',
    propertyContext: propertyContext(),
    actions: [],
    personalizationRecommendations: [source],
    availableCapabilityIds: ['inspection-hub'],
    surface: 'HOME',
    generatedAt: NOW,
  });
  const result = matchCapabilityCandidates({
    registry: canonicalCapabilityRegistry,
    context,
  });
  const candidate = result.candidates.find(
    (item) => item.capabilityId === 'inspection-hub',
  );
  assert.equal(candidate.source.entityType, 'DOCUMENT');
  assert.equal(candidate.source.entityId, 'inspection-1');
  assert.equal(candidate.primaryMatch.kind, 'RECOMMENDATION_DEFINITION');
});

test('CAP-806 completes only when extraction creates durable findings', () => {
  assert.equal(hasTrackableInspectionFindings(0), false);
  assert.equal(hasTrackableInspectionFindings(3), true);
  const [event] = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [inspectionFindingsCompletionEvent({
      reportId: 'report-1',
      findingCount: 3,
      sourceEntityType: 'DOCUMENT',
      sourceEntityId: 'document-1',
      sourceJourneyId: 'journey-1',
    })],
  });
  assert.equal(event.eventName, 'TOOL_COMPLETED');
  assert.equal(event.metadataJson.completionKind, 'ARTIFACT_CREATED');
  assert.equal(event.metadataJson.findingCount, 3);
  assert.equal(event.metadataJson.outputEntityType, 'ISSUE');
  assert.equal(event.metadataJson.sourceEntityId, 'document-1');
});
