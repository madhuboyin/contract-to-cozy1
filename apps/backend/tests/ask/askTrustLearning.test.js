const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getAskTrustLearningReport } = require('../../src/services/adminAnalytics/askTrustLearningService.ts');

const from = new Date('2026-08-01T00:00:00.000Z');
const to = new Date('2026-08-31T23:59:59.999Z');

function event(executionId, eventType, metadataJson, operationId, intentConfidence = 0.9) {
  return {
    executionId,
    eventType,
    metadataJson,
    createdAt: new Date('2026-08-15T12:00:00.000Z'),
    execution: { operationId, intentConfidence, status: 'COMPLETED' },
  };
}

test('TA7 aggregates bounded trust outcomes without reading or returning raw messages', async () => {
  const events = [
    event('exec-1', 'CAPABILITY_RESOLVED', {
      operationId: 'PROPERTY_SUMMARY', routingConfidenceBand: 'HIGH', routingStage: 'SEMANTIC',
      classifierMode: 'ENABLED', operationSemanticIndexVersion: 'index-v2', operationSemanticVersion: 'contract-v3',
    }, 'PROPERTY_SUMMARY'),
    event('exec-1', 'ANSWER_TRUST_VALIDATED', {
      checks: { questionCoverage: 'FAIL' }, repaired: true,
      semantic: { outcome: 'FAIL' }, reasonCodes: ['DIRECT_ANSWER_SEMANTIC_MISMATCH', 'UNSUPPORTED_ABSENCE_CLAIM'],
    }, 'PROPERTY_SUMMARY'),
    event('exec-1', 'CORRECTION_REQUESTED', { kind: 'INTENT' }, 'PROPERTY_SUMMARY'),
    event('exec-2', 'CAPABILITY_RESOLVED', {
      operationId: 'MAINTENANCE_STATUS', routingConfidenceBand: 'LOW', routingStage: 'CLARIFICATION',
      classifierMode: 'DISABLED', operationSemanticIndexVersion: 'index-v2', operationSemanticVersion: 'contract-v3',
    }, 'MAINTENANCE_STATUS', 0.4),
    event('exec-2', 'CLARIFICATION_SUBMITTED', { selectedCandidateRank: 1 }, 'MAINTENANCE_STATUS', 0.4),
    event('exec-2', 'ANSWER_TRUST_VALIDATED', {
      checks: { questionCoverage: 'PASS' }, repaired: false,
      semantic: { outcome: 'PASS' }, reasonCodes: ['SELECTED_OPERATION_TOP_MATCH'],
    }, 'MAINTENANCE_STATUS', 0.4),
  ];

  const report = await getAskTrustLearningReport(from, to, { events });

  assert.deepEqual(report.privacy, {
    rawMessagesRead: false,
    rawMessagesReturned: false,
    boundedMetadataOnly: true,
  });
  assert.equal(report.metrics.routedExecutions, 2);
  assert.equal(report.metrics.validatedResponses, 2);
  assert.equal(report.metrics.incorrectHighConfidenceRate, 1);
  assert.equal(report.metrics.directAnswerRelevanceRate, 0.5);
  assert.equal(report.metrics.unsupportedAbsenceClaims, 1);
  assert.equal(report.metrics.clarificationResolutionRate, 1);
  assert.equal(report.metrics.modelDisabledSuccessfulResolutionRate, 1);
  assert.ok(report.alerts.some((alert) => alert.code === 'UNSUPPORTED_ABSENCE_CLAIMS'));
  assert.ok(report.correctionClusters.some((cluster) => cluster.kind === 'INTENT' && cluster.count === 1));
  assert.ok(report.operations.every((operation) => operation.language === 'en'));
  assert.ok(report.versionLineage.every((version) => version.language === 'en'));
  assert.ok(report.reviewedFixtureCandidates.some((fixture) => fixture.reasonCode === 'UNSUPPORTED_ABSENCE_CLAIM'));
  assert.ok(report.reviewedFixtureCandidates.every((fixture) => /^[a-f0-9]{16}$/.test(fixture.fixtureKey)));
  assert.equal(report.controls.automaticThresholdMutation, false);
  assert.equal(JSON.stringify(report).includes('raw homeowner question'), false);
});

test('TA7 operation threshold recommendations remain advisory and require evidence', async () => {
  const events = Array.from({ length: 20 }, (_, index) => event(
    `route-${index}`,
    'CAPABILITY_RESOLVED',
    {
      operationId: 'PROPERTY_SUMMARY', routingConfidenceBand: 'HIGH', routingStage: 'SEMANTIC',
      classifierMode: 'ENABLED', operationSemanticIndexVersion: 'index-v2', operationSemanticVersion: 'contract-v3',
    },
    'PROPERTY_SUMMARY',
  ));
  events.push(event('route-0', 'CORRECTION_REQUESTED', { kind: 'ENTITY' }, 'PROPERTY_SUMMARY'));

  const report = await getAskTrustLearningReport(from, to, { events });
  const operation = report.operations.find((item) => item.operationId === 'PROPERTY_SUMMARY');

  assert.equal(operation.thresholdRecommendation, 'RAISE_OR_CLARIFY_MORE');
  assert.equal(report.controls.recommendationsAreAdvisory, true);
  assert.equal(report.controls.rawTextFixturePromotion, false);
});
