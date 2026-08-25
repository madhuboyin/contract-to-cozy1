const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  mapRadarSourceHealth,
  mapServicePriceBenchmarkSourceHealth,
  isSourceHealthDegraded,
  summarizeSourceHealth,
  UNIFIED_SOURCE_HEALTH_STATUSES,
} = require('../../src/services/intelligence/sourceHealthProjection.service.ts');

test('mapRadarSourceHealth normalizes lowercase Radar statuses and a missing health row to UNKNOWN', () => {
  const healthy = mapRadarSourceHealth({
    key: 'noaa-alerts',
    name: 'NOAA Alerts',
    health: { status: 'healthy', lastSuccessAt: new Date('2026-08-20T00:00:00Z'), lastAttemptAt: new Date('2026-08-24T00:00:00Z'), consecutiveFailures: 0, message: null },
  });
  assert.equal(healthy.domain, 'HOME_EVENT_RADAR');
  assert.equal(healthy.status, 'HEALTHY');
  assert.equal(healthy.lastSuccessAt, '2026-08-20T00:00:00.000Z');

  const failed = mapRadarSourceHealth({ key: 'x', name: 'X', health: { status: 'failed', lastSuccessAt: null, lastAttemptAt: null, consecutiveFailures: 4, message: 'timeout' } });
  assert.equal(failed.status, 'UNHEALTHY');
  assert.equal(failed.message, 'timeout');

  const noHealthRow = mapRadarSourceHealth({ key: 'never-polled', name: 'Never Polled', health: null });
  assert.equal(noHealthRow.status, 'UNKNOWN');
  assert.equal(noHealthRow.consecutiveFailures, 0);
});

test('mapServicePriceBenchmarkSourceHealth normalizes uppercase statuses and never surfaces raw detailsJson as a message', () => {
  const unhealthy = mapServicePriceBenchmarkSourceHealth({
    sourceKey: 'hcp-index',
    name: 'HomeAdvisor Cost Index',
    health: { status: 'UNHEALTHY', lastHealthyAt: null, checkedAt: new Date('2026-08-24T00:00:00Z'), consecutiveFailures: 2 },
  });
  assert.equal(unhealthy.domain, 'SERVICE_PRICE_BENCHMARK');
  assert.equal(unhealthy.status, 'UNHEALTHY');
  assert.equal(unhealthy.message, null);
});

test('isSourceHealthDegraded flags every non-current status but not HEALTHY or UNKNOWN', () => {
  assert.equal(isSourceHealthDegraded('HEALTHY'), false);
  assert.equal(isSourceHealthDegraded('UNKNOWN'), false);
  for (const status of ['DEGRADED', 'UNHEALTHY', 'STALE', 'DISABLED']) {
    assert.equal(isSourceHealthDegraded(status), true, status);
  }
});

test('summarizeSourceHealth counts and lists only degraded sources', () => {
  const entries = [
    { domain: 'HOME_EVENT_RADAR', sourceKey: 'a', name: 'A', status: 'HEALTHY' },
    { domain: 'HOME_EVENT_RADAR', sourceKey: 'b', name: 'B', status: 'STALE' },
    { domain: 'SERVICE_PRICE_BENCHMARK', sourceKey: 'c', name: 'C', status: 'UNHEALTHY' },
    { domain: 'SERVICE_PRICE_BENCHMARK', sourceKey: 'd', name: 'D', status: 'UNKNOWN' },
  ];
  const summary = summarizeSourceHealth(entries);
  assert.equal(summary.total, 4);
  assert.equal(summary.healthyCount, 2);
  assert.equal(summary.degradedCount, 2);
  assert.deepEqual(new Set(summary.degradedSources.map((s) => s.sourceKey)), new Set(['b', 'c']));
});

test('UNIFIED_SOURCE_HEALTH_STATUSES is a closed, deduplicated set', () => {
  assert.equal(new Set(UNIFIED_SOURCE_HEALTH_STATUSES).size, UNIFIED_SOURCE_HEALTH_STATUSES.length);
  assert.deepEqual([...UNIFIED_SOURCE_HEALTH_STATUSES].sort(), ['DEGRADED', 'DISABLED', 'HEALTHY', 'STALE', 'UNHEALTHY', 'UNKNOWN']);
});
