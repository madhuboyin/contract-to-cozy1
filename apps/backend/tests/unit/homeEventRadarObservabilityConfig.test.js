const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Home Event Radar alert rules cover source, pipeline, and read failures', () => {
  const rules = readRepoFile(
    'infrastructure/kubernetes/monitoring/prometheus/home-event-radar-alert-rules.yaml',
  );

  for (const alertName of [
    'RadarSourceRepeatedFailures',
    'RadarSourceFreshnessBreach',
    'RadarDurableIngestDeadLetters',
    'RadarDurableMatchDeadLetters',
    'RadarIngestWithoutPropertyEvaluation',
    'RadarFeedErrorRatioHigh',
    'RadarFeedP95LatencyHigh',
  ]) {
    assert.match(rules, new RegExp(`alert: ${alertName}`));
  }
});

test('Home Event Radar dashboard uses only bounded operational metric labels', () => {
  const dashboard = readRepoFile(
    'infrastructure/kubernetes/monitoring/grafana/home-event-radar-dashboard-configmap.yaml',
  );

  for (const metricName of [
    'radar_source_runs_total',
    'radar_source_last_success_timestamp_seconds',
    'radar_ingest_observations_total',
    'radar_match_properties_total',
    'radar_ingest_dead_letter_total',
    'radar_match_dead_letter_total',
    'radar_feed_requests_total',
    'radar_feed_duration_seconds_bucket',
    'radar_source_fetch_duration_seconds_bucket',
  ]) {
    assert.match(dashboard, new RegExp(metricName));
  }

  assert.doesNotMatch(dashboard, /property_id|user_id|match_id|provider_event_id/);
});
