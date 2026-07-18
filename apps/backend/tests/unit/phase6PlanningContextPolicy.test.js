const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluatePlanningContext } = require('../../src/services/planningContext/applicabilityPolicy.ts');
const { PLANNING_FEATURE_SCOPES } = require('../../src/services/planningContext/context.ts');
const { reconcilePlanningOutput } = require('../../src/services/planningContext/reconciliation.ts');

const NOW = new Date('2026-07-17T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'phase-6-test',
    generatedAt: NOW.toISOString(),
    scopes: ['CORE', 'LOCATION'],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('planning feature scopes never request optional household context', () => {
  for (const [feature, scopes] of Object.entries(PLANNING_FEATURE_SCOPES)) {
    assert.ok(!scopes.includes('OPTIONAL_HOUSEHOLD'), feature);
    assert.ok(scopes.length > 0, feature);
  }
});

test('seller prep requires property use and location; records sale intent', () => {
  const unknown = evaluatePlanningContext(snapshot({}));
  assert.equal(unknown.sellerPrepPlanning.status, 'UNKNOWN');
  assert.ok(unknown.sellerPrepPlanning.missingFactKeys.includes('core.propertyUse'));

  const forSale = evaluatePlanningContext(snapshot({
    'core.propertyUse': 'FOR_SALE',
    'location.state': 'TX',
  }));
  assert.equal(forSale.sellerPrepPlanning.status, 'APPLICABLE');
  assert.ok(forSale.sellerPrepPlanning.reasonCodes.includes('SALE_INTENT_RECORDED'));

  const primary = evaluatePlanningContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
    'location.state': 'TX',
  }));
  assert.equal(primary.sellerPrepPlanning.status, 'APPLICABLE');
  assert.ok(!primary.sellerPrepPlanning.reasonCodes.includes('SALE_INTENT_RECORDED'));
});

test('sale readiness requires open work and coverage context sources', () => {
  const ready = evaluatePlanningContext(snapshot({
    'inspection.openFindings': [],
    'compliance.activePermits': [],
    'compliance.openUnpermittedFlags': [],
    'projects.activeProjects': [],
    'coverage.insurancePolicies': [],
  }));
  assert.equal(ready.saleReadiness.status, 'APPLICABLE');

  const missing = evaluatePlanningContext(snapshot({
    'inspection.openFindings': [],
  }));
  assert.equal(missing.saleReadiness.status, 'UNKNOWN');
});

test('purchase workflow follows orthogonal entry context without physical inference', () => {
  const buyer = evaluatePlanningContext(snapshot({
    'product.entryPath': 'EXISTING_HOME_PURCHASE',
    'product.ownershipState': 'UNDER_CONTRACT',
  }));
  assert.equal(buyer.homeBuyerWorkflow.status, 'APPLICABLE');

  const owner = evaluatePlanningContext(snapshot({
    'product.entryPath': 'EXISTING_OWNER_TRIGGER',
    'product.ownershipState': 'ESTABLISHED_OWNER',
  }));
  assert.equal(owner.homeBuyerWorkflow.status, 'NOT_APPLICABLE');
  assert.ok(owner.homeBuyerWorkflow.reasonCodes.includes('PURCHASE_CONTEXT_NOT_ACTIVE'));

  const unknown = evaluatePlanningContext(snapshot({}));
  assert.equal(unknown.homeBuyerWorkflow.status, 'UNKNOWN');
});

test('moving planning requires use, occupancy, and location context', () => {
  const complete = evaluatePlanningContext(snapshot({
    'core.propertyUse': 'PRIMARY_RESIDENCE',
    'core.occupancyStatus': 'OWNER_OCCUPIED',
    'location.state': 'TX',
    'location.zipCode': '78701',
  }));
  assert.equal(complete.movingPlanning.status, 'APPLICABLE');

  const incomplete = evaluatePlanningContext(snapshot({ 'core.propertyUse': 'PRIMARY_RESIDENCE' }));
  assert.equal(incomplete.movingPlanning.status, 'UNKNOWN');
});

test('neighborhood relevance requires location and reports geocoding precision', () => {
  const geocoded = evaluatePlanningContext(snapshot({
    'location.zipCode': '78701',
    'location.geocoded': true,
  }));
  assert.equal(geocoded.neighborhoodRelevance.status, 'APPLICABLE');
  assert.ok(geocoded.neighborhoodRelevance.reasonCodes.includes('PRECISE_GEOCODING_AVAILABLE'));

  const zipOnly = evaluatePlanningContext(snapshot({ 'location.zipCode': '78701' }));
  assert.equal(zipOnly.neighborhoodRelevance.status, 'APPLICABLE');
  assert.ok(!zipOnly.neighborhoodRelevance.reasonCodes.includes('PRECISE_GEOCODING_AVAILABLE'));

  const noLocation = evaluatePlanningContext(snapshot({}));
  assert.equal(noLocation.neighborhoodRelevance.status, 'UNKNOWN');
});

test('local updates treat unknown dwelling as broad match, never as a typed match', () => {
  const knownDwelling = evaluatePlanningContext(snapshot({
    'location.city': 'Austin',
    'location.state': 'TX',
    'core.dwellingType': 'CONDO_UNIT',
  }));
  assert.ok(knownDwelling.localUpdatesTargeting.reasonCodes.includes('DWELLING_ELIGIBILITY_AVAILABLE'));

  const unknownDwelling = evaluatePlanningContext(snapshot({
    'location.city': 'Austin',
    'location.state': 'TX',
  }));
  assert.equal(unknownDwelling.localUpdatesTargeting.status, 'APPLICABLE');
  assert.ok(unknownDwelling.localUpdatesTargeting.reasonCodes.includes('DWELLING_ELIGIBILITY_UNKNOWN_BROAD_MATCH'));
});

test('digital twin decision always declares itself a projection', () => {
  const twin = evaluatePlanningContext(snapshot({
    'inventory.items': [],
    'systems.installedItemTypes': [],
  }));
  assert.equal(twin.digitalTwinProjection.status, 'APPLICABLE');
  assert.ok(twin.digitalTwinProjection.reasonCodes.includes('TWIN_IS_PROJECTION_NOT_SOURCE_OF_TRUTH'));
});

test('shared report projection decision always enforces redaction', () => {
  const shared = evaluatePlanningContext(snapshot({
    'location.city': 'Austin',
    'location.state': 'TX',
  }));
  assert.equal(shared.sharedReportProjection.status, 'APPLICABLE');
  assert.ok(shared.sharedReportProjection.reasonCodes.includes('REDACTED_PROJECTION_ENFORCED'));

  const missing = evaluatePlanningContext(snapshot({}));
  assert.equal(missing.sharedReportProjection.status, 'UNKNOWN');
});

test('planning reconciliation flags stale and unversioned outputs for review', () => {
  const applicable = { status: 'APPLICABLE', reasonCodes: [], usedFactKeys: [], missingFactKeys: [], conflictedFactKeys: [], validUntil: null };

  assert.equal(reconcilePlanningOutput('v2', 'v2', applicable).status, 'CURRENT');
  assert.equal(reconcilePlanningOutput('v2', 'v1', applicable).status, 'REVIEW_REQUIRED');
  assert.ok(reconcilePlanningOutput('v2', null, applicable).reasonCodes.includes('PLANNING_OUTPUT_CONTEXT_VERSION_MISSING'));

  const notApplicable = { ...applicable, status: 'NOT_APPLICABLE' };
  assert.ok(reconcilePlanningOutput('v2', 'v2', notApplicable).reasonCodes.includes('PLANNING_OUTPUT_NO_LONGER_APPLICABLE'));
});

test('representative condo, rental, and vacant archetypes remain explicit and location-aware', () => {
  for (const propertyUse of ['RENTAL', 'VACANT', 'PRIMARY_RESIDENCE']) {
    const decisions = evaluatePlanningContext(snapshot({
      'core.propertyUse': propertyUse,
      'core.occupancyStatus': propertyUse === 'VACANT' ? 'VACANT' : 'OCCUPIED',
      'core.dwellingType': propertyUse === 'PRIMARY_RESIDENCE' ? 'CONDO_UNIT' : 'DETACHED_SINGLE_FAMILY',
      'location.city': 'Austin',
      'location.state': 'TX',
      'location.zipCode': '78701',
      'location.geocoded': true,
    }));
    assert.equal(decisions.sellerPrepPlanning.status, 'APPLICABLE', propertyUse);
    assert.equal(decisions.movingPlanning.status, 'APPLICABLE', propertyUse);
    assert.equal(decisions.neighborhoodRelevance.status, 'APPLICABLE', propertyUse);
    assert.equal(decisions.localUpdatesTargeting.status, 'APPLICABLE', propertyUse);
  }
});

test('conflicted and stale Phase 6 facts remain unknown rather than becoming false defaults', () => {
  const conflictedUse = createPropertyFact('core.propertyUse', 'RENTAL', undefined, NOW);
  conflictedUse.state = 'CONFLICTED';
  const staleZip = createPropertyFact('location.zipCode', '78701', undefined, NOW);
  staleZip.state = 'STALE';

  const context = snapshot({
    'location.state': 'TX',
    'location.city': 'Austin',
  });
  context.facts['core.propertyUse'] = conflictedUse;
  context.facts['location.zipCode'] = staleZip;

  const decisions = evaluatePlanningContext(context);
  assert.equal(decisions.sellerPrepPlanning.status, 'UNKNOWN');
  assert.ok(decisions.sellerPrepPlanning.conflictedFactKeys.includes('core.propertyUse'));
  assert.equal(decisions.neighborhoodRelevance.status, 'UNKNOWN');
  assert.ok(decisions.neighborhoodRelevance.missingFactKeys.includes('location.zipCode'));
});
