const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  computeSignalInteractionInsights,
  evaluateSignalFreshness,
} = require('../../src/services/signal.service.ts');

test('evaluateSignalFreshness marks expired signals as stale', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const freshness = evaluateSignalFreshness(
    {
      capturedAt: '2026-03-01T00:00:00.000Z',
      validUntil: '2026-03-27T00:00:00.000Z',
    },
    now,
  );

  assert.equal(freshness.state, 'STALE');
  assert.equal(freshness.isStale, true);
});

test('evaluateSignalFreshness marks near-expiry signals as decaying', () => {
  const now = new Date('2026-03-28T12:00:00.000Z');
  const freshness = evaluateSignalFreshness(
    {
      capturedAt: '2026-03-20T00:00:00.000Z',
      validUntil: '2026-03-30T00:00:00.000Z',
    },
    now,
  );

  assert.equal(freshness.state, 'DECAYING');
  assert.equal(freshness.isStale, false);
});

test('computeSignalInteractionInsights detects coverage-event pressure interaction', () => {
  const interactions = computeSignalInteractionInsights({
    signals: {
      COVERAGE_GAP: {
        id: 'sig-coverage',
        propertyId: 'property-1',
        roomId: null,
        homeItemId: null,
        signalKey: 'COVERAGE_GAP',
        valueNumber: 3,
        valueText: 'GAP_PRESENT',
        valueJson: { coverageGapCount: 3 },
        unit: 'count',
        confidence: 0.8,
        sourceModel: 'CoverageAnalysisService',
        sourceId: 'coverage-1',
        capturedAt: '2026-03-28T00:00:00.000Z',
        validUntil: '2026-04-20T00:00:00.000Z',
        version: 1,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
      RISK_SPIKE: {
        id: 'sig-risk',
        propertyId: 'property-1',
        roomId: null,
        homeItemId: null,
        signalKey: 'RISK_SPIKE',
        valueNumber: 0.74,
        valueText: 'ELEVATED_SPIKE',
        valueJson: { riskScore: 0.74 },
        unit: 'ratio',
        confidence: 0.77,
        sourceModel: 'HomeEventRadarService',
        sourceId: 'radar-1',
        capturedAt: '2026-03-28T00:00:00.000Z',
        validUntil: '2026-04-05T00:00:00.000Z',
        version: 1,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    },
  });

  assert.ok(interactions.length > 0);
  assert.equal(interactions[0].code, 'COVERAGE_EVENT_PRESSURE');
  assert.ok(interactions[0].strength > 0.35);
});

test('computeSignalInteractionInsights detects maintenance-buffer urgency when buffer is tight', () => {
  const interactions = computeSignalInteractionInsights({
    signals: {
      MAINT_ADHERENCE: {
        id: 'sig-maint',
        propertyId: 'property-1',
        roomId: null,
        homeItemId: null,
        signalKey: 'MAINT_ADHERENCE',
        valueNumber: 0.42,
        valueText: 'LOW',
        valueJson: { adherenceScore: 0.42, adherencePercent: 42 },
        unit: 'ratio',
        confidence: 0.72,
        sourceModel: 'MaintenanceOrchestrationService',
        sourceId: 'maint-1',
        capturedAt: '2026-03-28T00:00:00.000Z',
        validUntil: '2026-04-01T00:00:00.000Z',
        version: 1,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    },
    cashBufferAmount: 1200,
  });

  const match = interactions.find((entry) => entry.code === 'MAINTENANCE_BUFFER_URGENCY');
  assert.ok(match, 'Expected MAINTENANCE_BUFFER_URGENCY interaction');
  assert.ok(match.strength > 0.6);
});
