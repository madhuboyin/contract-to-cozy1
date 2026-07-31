const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  aroundYourHomeInteractionSchema,
} = require('../../src/propertyIntelligence/propertyIntelligence.contracts.ts');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) =>
  fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('Around Your Home uses reviewed common-source families and excludes the legacy event model', () => {
  const service = readBackend('src/propertyIntelligence/aroundYourHome.service.ts');
  assert.match(service, /IntelligenceSourceFamily\.PLANNING/);
  assert.match(service, /IntelligenceSourceFamily\.INFRASTRUCTURE/);
  assert.match(service, /IntelligenceSourceFamily\.LAND_USE/);
  assert.match(service, /IntelligenceSourceFamily\.FLOOD_MAP/);
  assert.match(service, /IntelligenceSourceFamily\.SCHOOL/);
  assert.match(service, /getPropertyIntelligenceCoverage/);
  assert.match(service, /getPropertyIntelligenceObservations/);
  assert.match(service, /visibleSourceKeys/);
  assert.match(service, /entry\.geography != null/);
  assert.doesNotMatch(service, /neighborhoodEvent\.findMany|NeighborhoodImpactEngine|impactScore|compositeRank/);
});

test('durable interaction state is user-scoped and revision-aware', () => {
  const schema = readBackend('prisma/schema.prisma');
  assert.match(schema, /enum PropertyLocalObservationDisposition \{[\s\S]*DEFAULT[\s\S]*FOLLOWING[\s\S]*DISMISSED[\s\S]*NOT_RELEVANT/);
  assert.match(schema, /model PropertyLocalObservationState \{/);
  assert.match(schema, /lastSeenRevision\s+Int\?/);
  assert.match(schema, /@@unique\(\[propertyMatchId, userId\]\)/);
  assert.equal(aroundYourHomeInteractionSchema.safeParse({ action: 'FOLLOW' }).success, true);
  assert.equal(aroundYourHomeInteractionSchema.safeParse({ action: 'DISMISS' }).success, true);
  assert.equal(aroundYourHomeInteractionSchema.safeParse({ action: 'NOT_RELEVANT' }).success, true);
  assert.equal(aroundYourHomeInteractionSchema.safeParse({ action: 'MARK_SEEN' }).success, true);
  assert.equal(aroundYourHomeInteractionSchema.safeParse({ action: 'PREDICT_VALUE' }).success, false);
  const ingestion = readBackend('src/propertyIntelligence/propertyIntelligence.service.ts');
  assert.match(ingestion, /previousObservationId/);
  assert.match(ingestion, /propertyLocalObservationState\.createMany/);
  assert.match(ingestion, /lastSeenRevision: state\.lastSeenRevision/);
});

test('all source lifecycle states are preserved and homeowner hierarchy favors followed revisions', () => {
  const service = readBackend('src/propertyIntelligence/aroundYourHome.service.ts');
  const contracts = readBackend('src/propertyIntelligence/propertyIntelligence.contracts.ts');
  for (const state of ['PROPOSED', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'STALE']) {
    assert.match(contracts, new RegExp(`'${state}'`));
  }
  assert.match(service, /hasMaterialUpdate \? 0 : 1/);
  assert.match(service, /if \(!input\.seenAt\) return 2/);
  assert.match(service, /COMPLETED \? 4 : 5/);
});

test('map precision is fail-closed and never fabricates point distance', () => {
  const service = readBackend('src/propertyIntelligence/aroundYourHome.service.ts');
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx',
  );
  assert.match(service, /const hasExactPoint/);
  assert.match(service, /distanceMiles: hasExactPoint \? match\.distanceMiles : null/);
  assert.match(service, /Only source-provided coordinates are plotted/);
  assert.match(client, /area-level geography/);
  assert.match(client, /No exact point distance is available/);
  assert.doesNotMatch(client, /default.*distance|city.*proxy/i);
});

test('homeowner UI separates source facts from relevance and forbids generic impact prediction', () => {
  const client = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx',
  );
  assert.match(client, /Around Your Home/);
  assert.match(client, /Source fact and geography/);
  assert.match(client, /Possible relevance/);
  assert.match(client, /does not predict property value, demand/);
  assert.match(client, /\/> Follow/);
  assert.match(client, /\/> Not relevant/);
  assert.match(client, /\/> Dismiss/);
  assert.match(client, /\/> List/);
  assert.match(client, /\/> Map/);
  assert.doesNotMatch(client, /Positive impact expected|Negative impact expected|rental demand|neighborhood sentiment/i);
});

test('API exposes governed read, interaction, and admin quality while retiring legacy writes', () => {
  const propertyRoutes = readBackend('src/propertyIntelligence/propertyIntelligence.routes.ts');
  const legacyRoutes = readBackend('src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts');
  assert.match(propertyRoutes, /properties\/:propertyId\/around-your-home'/);
  assert.match(propertyRoutes, /around-your-home\/:propertyMatchId\/interaction/);
  assert.match(propertyRoutes, /admin\/around-your-home\/quality/);
  assert.match(propertyRoutes, /requireCapability\('INTEGRATION_MANAGE'\)/);
  assert.match(legacyRoutes, /LEGACY_NEIGHBORHOOD_RECOMPUTE_RETIRED/);
  assert.match(legacyRoutes, /LEGACY_NEIGHBORHOOD_INGEST_RETIRED/);
  assert.match(legacyRoutes, /LEGACY_NEIGHBORHOOD_EVENT_RECOMPUTE_RETIRED/);
});

test('admin quality makes activation criteria and synthetic-source prohibition explicit', () => {
  const service = readBackend('src/propertyIntelligence/aroundYourHome.service.ts');
  const dashboard = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/admin/radar-sources/page.tsx',
  );
  assert.match(service, /source approval, explicit environment enablement, coverage QA review/);
  assert.match(service, /syntheticCoverageAllowed: false/);
  assert.match(service, /getIntelligenceSourceHealth/);
  assert.match(dashboard, /Around Your Home source quality/);
  assert.match(dashboard, /admin\/around-your-home\/quality/);
  assert.match(dashboard, /Synthetic coverage prohibited/);
  assert.match(dashboard, /recordsRejected/);
});
