const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  redactVaultDataForSharedAccess,
  VAULT_EMERGENCY_SHARE_POLICY,
} = require('../../src/services/vault.service.ts');
const { requireHouseholdRole } = require('../../src/middleware/propertyAuth.middleware.ts');
const {
  evaluateHomeBuyerSegment,
  evaluateNeighborhoodLocation,
} = require('../../src/services/planningContext/applicabilityPolicy.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

// ─── Vault shared-access redaction (behavioral) ─────────────────────────────

const VAULT_FIXTURE = {
  overview: {
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    name: 'Home',
    yearBuilt: 1990,
    propertySize: 2000,
    healthScore: 88,
  },
  gamification: { currentStreak: 2, longestStreak: 5, bonusMultiplier: 1.1, unlockedBadges: [] },
  verifiedAssets: [
    {
      id: 'a1',
      name: 'Furnace',
      category: 'HVAC',
      manufacturer: 'Carrier',
      modelNumber: 'M-1000',
      serialNumber: 'SN-SECRET',
      installedOn: null,
      purchasedOn: null,
      condition: 'GOOD',
      expectedExpiryDate: null,
    },
  ],
  serviceTimeline: [
    {
      id: 'b1',
      category: 'HVAC',
      description: 'Annual service',
      completedAt: null,
      finalPrice: '450.00',
      providerBusinessName: 'Fix It Pro',
    },
  ],
};

test('vault emergency-share projection follows its explicit allowlist contract', () => {
  const redacted = redactVaultDataForSharedAccess(VAULT_FIXTURE);
  assert.equal(VAULT_EMERGENCY_SHARE_POLICY.projection, 'VAULT_EMERGENCY_SHARE_V1');
  assert.equal(redacted.verifiedAssets[0].modelNumber, null);
  assert.equal(redacted.verifiedAssets[0].serialNumber, null);
  assert.equal(redacted.serviceTimeline[0].finalPrice, null);
  // Operational emergency-access facts are deliberately retained.
  assert.equal(redacted.overview.address, '123 Main St');
  assert.equal(redacted.verifiedAssets[0].name, 'Furnace');
  assert.equal(redacted.serviceTimeline[0].providerBusinessName, 'Fix It Pro');
  // Original object is not mutated.
  assert.equal(VAULT_FIXTURE.verifiedAssets[0].serialNumber, 'SN-SECRET');
});

test('both unauthenticated vault entry points route through redaction', () => {
  const service = read('../../src/services/vault.service.ts');
  const passwordPath = service.slice(service.indexOf('export async function getVaultData'));
  const tokenPath = service.slice(service.indexOf('export async function getVaultDataWithShareToken'));
  assert.ok(/redactVaultDataForSharedAccess\(await loadVaultData/.test(passwordPath));
  assert.ok(/redactVaultDataForSharedAccess\(await loadVaultData/.test(tokenPath));
});

// ─── Role floors (behavioral middleware + route wiring) ─────────────────────

function invokeRoleFloor(minimumRole, householdRole) {
  const middleware = requireHouseholdRole(minimumRole);
  let statusCode = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };
  middleware({ householdRole }, res, () => { nextCalled = true; });
  return { statusCode, nextCalled };
}

test('household role floor blocks viewers and missing roles, passes qualified roles', () => {
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'VIEWER'), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', undefined), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'CONTRIBUTOR'), { statusCode: null, nextCalled: true });
  assert.deepEqual(invokeRoleFloor('CONTRIBUTOR', 'OWNER'), { statusCode: null, nextCalled: true });
  assert.deepEqual(invokeRoleFloor('OWNER', 'CONTRIBUTOR'), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invokeRoleFloor('OWNER', 'OWNER'), { statusCode: null, nextCalled: true });
});

test('twin, will, and vault mutation routes enforce role floors', () => {
  const twin = read('../../src/routes/homeDigitalTwin.routes.ts');
  for (const route of [
    "'/properties/:propertyId/home-digital-twin/init',",
    "'/properties/:propertyId/home-digital-twin/refresh',",
    "'/properties/:propertyId/home-digital-twin/scenarios/:scenarioId/compute',",
  ]) {
    const start = twin.indexOf(route);
    assert.ok(start >= 0, `route registration not found: ${route}`);
    const section = twin.slice(start);
    assert.ok(
      section.slice(0, 200).includes("requireHouseholdRole('CONTRIBUTOR')"),
      `${route} must require CONTRIBUTOR`,
    );
  }
  // Scenario reads stay available to viewers.
  const listGet = twin.slice(twin.indexOf("router.get(\n  '/properties/:propertyId/home-digital-twin/scenarios',"));
  assert.ok(!listGet.slice(0, 150).includes('requireHouseholdRole'));

  const will = read('../../src/routes/homeDigitalWill.routes.ts');
  const willCreate = will.slice(will.indexOf("router.post(\n  '/properties/:propertyId/home-digital-will',"));
  assert.ok(willCreate.slice(0, 220).includes("requireHouseholdRole('CONTRIBUTOR')"));

  const vault = read('../../src/routes/vault.routes.ts');
  for (const route of ["'/setup/:propertyId'", "'/share-link/:propertyId'"]) {
    const section = vault.slice(vault.indexOf(route));
    assert.ok(section.slice(0, 200).includes("requireHouseholdRole('OWNER')"), `${route} must require OWNER`);
  }
});

test('timeline, radar recompute, and report generation routes enforce role floors', () => {
  const timeline = read('../../src/routes/homeEvents.routes.ts');
  for (const route of [
    "router.post(\n  '/properties/:propertyId/home-events',",
    "router.patch(\n  '/properties/:propertyId/home-events/:eventId',",
    "router.post(\n  '/properties/:propertyId/home-events/:eventId/documents',",
  ]) {
    const mutation = timeline.slice(timeline.indexOf(route));
    assert.ok(mutation.slice(0, 240).includes("requireHouseholdRole('CONTRIBUTOR')"));
  }

  const radar = read('../../src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts');
  const recompute = radar.slice(radar.indexOf("'/properties/:propertyId/neighborhood-radar/recompute',"));
  assert.ok(recompute.slice(0, 220).includes("requireHouseholdRole('OWNER')"));

  const reports = read('../../src/routes/homeReportExport.routes.ts');
  const create = reports.slice(reports.indexOf("'/properties/:propertyId/reports/exports',"));
  assert.ok(create.slice(0, 220).includes("requireHouseholdRole('CONTRIBUTOR')"));
  const controller = read('../../src/controllers/homeReportExport.controller.ts');
  assert.ok(controller.includes('canMutateReport'));
  assert.ok(controller.includes('ROLE_RANK.CONTRIBUTOR'));
});

// ─── Policy wiring ──────────────────────────────────────────────────────────

test('moving plan generation evaluates the authoritative movingPlanning decision', () => {
  const service = read('../../src/services/movingConcierge.service.ts');
  const generate = service.slice(service.indexOf('async generateMovingPlan'));
  assert.ok(generate.slice(0, 2000).includes("getPlanningContextEnvelope(propertyId, userId, 'MOVING_PLAN')"));
  assert.ok(generate.slice(0, 2000).includes("NOT_APPLICABLE"));
});

test('seller readiness report carries the saleReadiness decision', () => {
  const builder = read('../../src/sellerPrep/reports/sellerReadiness.builder.ts');
  assert.ok(builder.includes('decisions.saleReadiness'));
  assert.ok(builder.includes('saleReadiness: {'));
});

test('share-artifact preparation evaluates the sharedReportProjection decision', () => {
  const service = read('../../src/services/homeReportExport.service.ts');
  const prepare = service.slice(service.indexOf('export async function prepareShareArtifacts'));
  assert.ok(prepare.includes("'SHARED_REPORT'"));
  assert.ok(prepare.includes('NOT_APPLICABLE'));
});

test('local updates controller loads canonical facts and applies the targeting decision', () => {
  const controller = read('../../src/localUpdates/localUpdates.controller.ts');
  assert.ok(controller.includes('prisma.property.findUnique'), 'must load real property facts');
  assert.ok(controller.includes("select: { city: true, state: true, zipCode: true, dwellingType: true }"));
  assert.ok(controller.includes("getPlanningContextEnvelope(propertyId, user.userId, \"LOCAL_UPDATES\")"));
  assert.ok(controller.includes('NOT_APPLICABLE'));
});

test('remaining planning surfaces reuse their authoritative policies', () => {
  assert.equal(evaluateHomeBuyerSegment('HOME_BUYER').status, 'APPLICABLE');
  assert.equal(evaluateHomeBuyerSegment('EXISTING_OWNER').status, 'NOT_APPLICABLE');
  assert.equal(evaluateNeighborhoodLocation('78701', true).status, 'APPLICABLE');
  assert.equal(evaluateNeighborhoodLocation(null, false).status, 'UNKNOWN');

  const buyer = read('../../src/services/HomeBuyerTask.service.ts');
  assert.ok(buyer.includes('evaluateHomeBuyerSegment'));

  const timeline = read('../../src/controllers/homeEvents.controller.ts');
  assert.ok(timeline.includes("'TIMELINE'"));

  const community = read('../../src/community/community.controller.ts');
  assert.ok(community.includes("'COMMUNITY_EVENTS'"));

  const pulse = read('../../src/services/dailyHomePulse.service.ts');
  assert.ok(pulse.includes("getPlanningContextEnvelope(propertyId, userId, 'LOCAL_UPDATES')"));

  const worker = read('../../../workers/src/jobs/neighborhoodChangeNotification.job.ts');
  assert.ok(worker.includes("'NEIGHBORHOOD_RADAR'"));
  assert.ok(worker.includes("planning.decision.status !== 'APPLICABLE'"));
});

// ─── Stale shared output reconciliation ─────────────────────────────────────

test('share-token downloads stop serving when generation context is stale or missing', () => {
  const controller = read('../../src/controllers/homeReportExport.controller.ts');
  const download = controller.slice(controller.indexOf('downloadHomeReportByShareToken'));
  assert.ok(download.includes('checkReportWorkerContext(exp.propertyId)'));
  assert.ok(/!exp\.contextVersion \|\| currentContext\.contextVersion !== exp\.contextVersion/.test(download));
  assert.ok(download.includes('410'));
});

// ─── Neighborhood impact ownership ──────────────────────────────────────────

test('neighborhood links are unique per property-event and impacts are link-owned', () => {
  const schema = read('../../prisma/schema.prisma');
  const linkModel = schema.slice(schema.indexOf('model PropertyNeighborhoodEvent {'), schema.indexOf('model', schema.indexOf('model PropertyNeighborhoodEvent {') + 10));
  assert.ok(linkModel.includes('@@unique([propertyId, eventId])'));

  for (const model of ['model NeighborhoodImpact {', 'model DemographicImpact {']) {
    const start = schema.indexOf(model);
    const section = schema.slice(start, schema.indexOf('model ', start + 10));
    assert.ok(section.includes('propertyNeighborhoodEventId String\n'), `${model} link ownership must be required`);
    assert.ok(section.includes('onDelete: Cascade'), `${model} must cascade with its link`);
  }
});

test('property relocation reconciles old-area radar links and property updates trigger recompute', () => {
  const matcher = read('../../src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts');
  const propertyRecompute = matcher.slice(matcher.indexOf('async recomputePropertyNeighborhoodRadar'));
  assert.ok(propertyRecompute.includes('propertyMatches: { some: { propertyId } }'));

  const propertyController = read('../../src/controllers/property.controller.ts');
  const update = propertyController.slice(propertyController.indexOf('export const updateProperty'));
  assert.ok(update.includes('recomputePropertyNeighborhoodRadar(id)'));
  assert.ok(update.includes("'address', 'city', 'state', 'zipCode', 'latitude', 'longitude'"));
});

test('neighborhood matching upserts links, scopes impact replacement, and removes stale links', () => {
  const service = read('../../src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts');
  assert.ok(service.includes('propertyId_eventId'), 'must upsert via the unique link key');
  assert.ok(service.includes('propertyNeighborhoodEventId: link.id'), 'impact writes must carry link ownership');
  assert.ok(
    !/neighborhoodImpact\.deleteMany\(\{ where: \{ eventId \} \}\)/.test(service),
    'must never delete impacts across all properties of an event',
  );
  assert.ok(service.includes('notIn: eligibleIds'), 'must remove links no longer geographically relevant');
});

test('radar queries read link-owned impacts', () => {
  const query = read('../../src/neighborhoodIntelligence/neighborhoodRadarQueryService.ts');
  assert.ok(query.includes('function linkImpacts'));
  assert.ok(query.includes('linkImpacts(link)'));
  assert.ok(!/const impacts = link\.event\.impacts as ImpactSnippet\[\]/.test(query));
});

// ─── Twin context exposure ──────────────────────────────────────────────────

test('twin read API attaches the projection staleness envelope end to end', () => {
  const controller = read('../../src/controllers/homeDigitalTwin.controller.ts');
  assert.ok(controller.includes("'DIGITAL_TWIN'"));
  assert.ok(controller.includes('contextVersion'));

  const dto = read('../../../frontend/src/types/index.ts');
  const twinDto = dto.slice(dto.indexOf('export interface HomeDigitalTwinDTO'));
  assert.ok(twinDto.slice(0, 900).includes('contextVersion: string | null'));

  const client = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/HomeDigitalTwinClient.tsx');
  assert.ok(client.includes('PropertyContextNotice'));
});
