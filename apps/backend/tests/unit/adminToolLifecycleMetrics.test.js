const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildToolLifecycleFunnelResponse,
} = require('../../src/services/adminAnalytics/metricsService.ts');

test('admin tool lifecycle metrics expose unique-home conversion and abandonment', () => {
  const response = buildToolLifecycleFunnelResponse(
    {
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-20T23:59:59.999Z'),
    },
    [{
      toolId: 'coverage-options',
      eligibleHomes: 12n,
      discoveredHomes: 10n,
      clickedHomes: 8n,
      startedHomes: 6n,
      outputHomes: 5n,
      completedHomes: 3n,
      abandonedHomes: 2n,
      notRelevantHomes: 1n,
      dismissedHomes: 2n,
    }],
    [
      { stage: 'TOOL_ELIGIBLE', uniqueHomes: 12n, totalEvents: 16n },
      { stage: 'TOOL_DISCOVERED', uniqueHomes: 10n, totalEvents: 13n },
      { stage: 'TOOL_CLICKED', uniqueHomes: 8n, totalEvents: 8n },
      { stage: 'TOOL_STARTED', uniqueHomes: 6n, totalEvents: 6n },
      { stage: 'TOOL_OUTPUT_GENERATED', uniqueHomes: 5n, totalEvents: 5n },
      { stage: 'TOOL_COMPLETED', uniqueHomes: 3n, totalEvents: 4n },
      { stage: 'TOOL_ABANDONED', uniqueHomes: 2n, totalEvents: 2n },
      { stage: 'TOOL_NOT_RELEVANT', uniqueHomes: 1n, totalEvents: 1n },
      { stage: 'TOOL_DISMISSED', uniqueHomes: 2n, totalEvents: 2n },
    ],
    [
      { dimension: 'READINESS', value: 'READY', uniqueHomes: 9n, totalEvents: 12n },
      { dimension: 'READINESS', value: 'NEEDS_CONTEXT', uniqueHomes: 3n, totalEvents: 4n },
      { dimension: 'REASON', value: 'COVERAGE_GAP', uniqueHomes: 8n, totalEvents: 10n },
      { dimension: 'SOURCE', value: 'CONTEXTUAL', uniqueHomes: 10n, totalEvents: 14n },
      { dimension: 'SOURCE', value: 'CATALOG_ONLY', uniqueHomes: 2n, totalEvents: 2n },
    ],
    {
      observedScopes: 10n,
      repeatedScopes: 3n,
      totalImpressions: 13n,
    },
  );

  assert.equal(response.metricVersion, 'capability-funnel-v2');
  assert.equal(response.summary.actualViewCoverage, 10 / 12);
  assert.equal(response.summary.clickThroughRate, 0.8);
  assert.equal(response.summary.repetitionRate, 0.3);
  assert.equal(response.tools[0].actualViewCoverage, 10 / 12);
  assert.equal(response.tools[0].clickThroughRate, 0.8);
  assert.equal(response.tools[0].startRate, 0.75);
  assert.equal(response.tools[0].completionRate, 0.5);
  assert.equal(response.tools[0].abandonedHomes, 2);
  assert.deepEqual(response.readinessDistribution, [
    { readiness: 'READY', uniqueHomes: 9, totalEvents: 12, share: 0.75 },
    { readiness: 'NEEDS_CONTEXT', uniqueHomes: 3, totalEvents: 4, share: 0.25 },
  ]);
  assert.deepEqual(response.sourceDistribution, [
    { source: 'CONTEXTUAL', uniqueHomes: 10, totalEvents: 14, share: 0.875 },
    { source: 'CATALOG_ONLY', uniqueHomes: 2, totalEvents: 2, share: 0.125 },
  ]);
  assert.equal(response.topReasonCodes[0].reasonCode, 'COVERAGE_GAP');
});
