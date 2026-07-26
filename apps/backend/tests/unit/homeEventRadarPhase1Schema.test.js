const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
const schema = read('apps/backend/prisma/schema.prisma');

test('Radar persistence includes source, health, run, revision, feedback, and preference authorities', () => {
  for (const model of [
    'RadarSourceDefinition',
    'RadarSourceHealth',
    'RadarSourceCoverage',
    'RadarSourceRun',
    'RadarEventRevision',
    'PropertyRadarCoverage',
    'PropertyRadarFeedback',
    'PropertyRadarNotificationPreference',
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }

  assert.match(schema, /model RadarEvent \{[\s\S]*sourceDefinitionId String\?[\s\S]*providerEventId\s+String\?/);
  assert.match(schema, /@@unique\(\[sourceDefinitionId, providerEventId\]\)/);
  assert.match(schema, /@@unique\(\[radarEventId, revisionIdentity\]\)/);
  assert.match(
    schema,
    /model PropertyRadarNotificationPreference \{[\s\S]*enabledCategories\s+RadarSourceFamily\[\][\s\S]*channels\s+RadarNotificationChannel\[\][\s\S]*minimumSeverity\s+RadarNotificationMinimumSeverity[\s\S]*minimumImpact\s+RadarNotificationMinimumImpact[\s\S]*deliveryMode\s+RadarNotificationDeliveryMode[\s\S]*quietHoursStartMinutes\s+Int\?[\s\S]*quietHoursEndMinutes\s+Int\?[\s\S]*timezone\s+String/,
  );
  assert.match(schema, /@@unique\(\[propertyId, userId\]\)/);
  assert.doesNotMatch(schema, /model RadarSourceConfig \{/);
});

test('Radar source runs distinguish successful-empty, failed, partial, and skipped outcomes', () => {
  assert.match(
    schema,
    /enum RadarSourceRunStatus \{[\s\S]*success[\s\S]*successful_empty[\s\S]*partial[\s\S]*failed[\s\S]*skipped[\s\S]*\}/,
  );
  assert.match(schema, /model RadarSourceRun \{[\s\S]*observationsReceived[\s\S]*observationsRejected/);
  assert.match(schema, /model RadarSourceHealth \{[\s\S]*consecutiveFailures[\s\S]*dataFreshThrough/);
});

test('canonical property geography is normalized, versioned, and spatially indexed', () => {
  assert.match(schema, /model Property \{[\s\S]*normalizedZipCode\s+String\?/);
  assert.match(schema, /model Property \{[\s\S]*countyFips\s+String\?/);
  assert.match(schema, /model Property \{[\s\S]*geocodingStatus\s+PropertyGeocodingStatus/);
  assert.match(schema, /model Property \{[\s\S]*geographyVersion\s+Int\s+@default\(1\)/);
  assert.match(schema, /locationPoint\s+Unsupported\("geography\(Point, 4326\)"\)\?/);
  assert.match(schema, /@@index\(\[locationPoint\], type: Gist\)/);
  assert.match(schema, /geometry\s+Unsupported\("geography\(Geometry, 4326\)"\)\?/);
  assert.match(schema, /@@index\(\[geometry\], type: Gist\)/);
});

test('Incident has a unique nullable bridge to its canonical property match', () => {
  assert.match(schema, /model Incident \{[\s\S]*propertyRadarMatchId\s+String\?\s+@unique/);
  assert.match(
    schema,
    /propertyRadarMatch\s+PropertyRadarMatch\?\s+@relation\(fields: \[propertyRadarMatchId\], references: \[id\], onDelete: SetNull\)/,
  );
  assert.match(schema, /model PropertyRadarMatch \{[\s\S]*incident\s+Incident\?/);
});

test('property edits invalidate disposable geography while preserving matches for reconciliation', () => {
  const propertyService = read('apps/backend/src/services/property.service.ts');
  const propertyGeo = read('apps/workers/src/lib/propertyGeo.ts');

  assert.match(propertyService, /hasPropertyLocationIdentityChanged/);
  assert.match(propertyService, /propertyRadarCoverage\.deleteMany\(\{ where: \{ propertyId \} \}\)/);
  assert.doesNotMatch(
    propertyService,
    /propertyRadarMatch\.deleteMany\(\{ where: \{ propertyId \} \}\)/,
  );
  assert.match(propertyService, /requestRadarPropertyReconciliation/);
  assert.match(propertyService, /SET "locationPoint" = NULL/);

  assert.match(propertyGeo, /geocodingStatus: 'VERIFIED'/);
  assert.match(propertyGeo, /ST_SetSRID\(ST_MakePoint/);
  assert.match(propertyGeo, /requestRadarPropertyReconciliation/);
  assert.doesNotMatch(
    propertyGeo,
    /propertyRadarMatch\.deleteMany\(\{ where: \{ propertyId \} \}\)/,
  );
  assert.match(propertyGeo, /geocodingStatus: 'FAILED'/);
});
