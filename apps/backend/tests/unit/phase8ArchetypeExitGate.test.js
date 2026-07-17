const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateMaintenanceTemplateApplicability } = require('../../src/services/maintenance/applicabilityPolicy.ts');
const { evaluateProtectionContext } = require('../../src/services/protection/applicabilityPolicy.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { evaluatePlanningContext } = require('../../src/services/planningContext/applicabilityPolicy.ts');
const { evaluateAggregationContext } = require('../../src/services/aggregationContext/applicabilityPolicy.ts');

const NOW = new Date('2026-07-17T12:00:00.000Z');
const ACTIVE_POLICY = [{ startDate: '2026-01-01T00:00:00.000Z', expiryDate: '2027-01-01T00:00:00.000Z' }];

function snapshot(archetype) {
  const values = {
    'core.activationStatus': 'ACTIVATED',
    'core.dwellingType': archetype.dwellingType,
    'core.propertyUse': archetype.propertyUse,
    'core.occupancyStatus': archetype.occupancyStatus,
    'core.propertySizeSqFt': 1800,
    'core.yearBuilt': archetype.yearBuilt,
    'location.city': 'Austin',
    'location.state': 'TX',
    'location.zipCode': '78701',
    'location.geocoded': true,
    'exterior.hasPrivateOutdoorSpace': archetype.privateOutdoor,
    'exterior.hasLawn': archetype.hasLawn,
    'exterior.hasTreesOrShrubs': archetype.hasLawn,
    'exterior.hasDrainageIssues': archetype.drainage,
    'responsibility.roof': archetype.roofResponsibility,
    'responsibility.buildingExterior': archetype.roofResponsibility,
    'responsibility.landscaping': archetype.landscapingResponsibility,
    'responsibility.plumbing': archetype.systemResponsibility,
    'responsibility.hvac': archetype.systemResponsibility,
    'responsibility.commonSafety': archetype.roofResponsibility,
    'systems.heatingType': 'FURNACE',
    'systems.coolingType': 'CENTRAL_AC',
    'systems.installedItemTypes': ['HVAC', ...(archetype.hasAppliance ? ['DISHWASHER'] : [])],
    'maintenance.tasks': [],
    'inventory.items': archetype.hasAppliance ? [{ id: 'item-1', category: 'APPLIANCE', condition: 'FAIR' }] : [],
    'inspection.openFindings': archetype.inspectionFindings ? [{ id: 'finding-1' }] : [],
    'coverage.insurancePolicies': archetype.hasWarranty ? ACTIVE_POLICY : [],
    'coverage.warranties': archetype.hasWarranty ? [{ id: 'warranty-1' }] : [],
    'coverage.activeClaims': [],
    'risk.report': { id: 'risk-1' },
    'risk.activeIncidents': archetype.activeIncident ? [{ id: 'incident-1' }] : [],
    'recalls.unresolvedMatches': [],
    'events.activeRadarMatches': [],
    'events.recentHomeEvents': [],
    'guidance.activeSignals': [],
    'financial.financingProfile': { purchasePriceCents: 40000000, purchaseDate: '2022-01-01' },
    'financial.currentMortgage': {
      currentMortgageBalanceCents: 30000000,
      mortgageBalanceAsOfDate: '2026-07-01',
      interestRateBps: 650,
      remainingTermMonths: 300,
    },
    'financial.latestEquity': { asOfDate: '2026-07-01', equityCents: 10000000 },
    'financial.upcomingCapitalExposure': [],
    'financial.ownershipExpenseSummary': [],
    'financial.activeScenarios': [],
    'compliance.activePermits': [],
    'compliance.openUnpermittedFlags': [],
    'projects.activeProjects': [],
    'product.homeownerSegment': archetype.homeBuyer ? 'HOME_BUYER' : 'EXISTING_OWNER',
  };
  const facts = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    createPropertyFact(key, value, undefined, NOW),
  ]));
  return {
    propertyId: archetype.id,
    contextVersion: `phase8-${archetype.id}`,
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts,
    warnings: [],
  };
}

const ARCHETYPES = [
  { id: 'detached-owner-aging', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 1980, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
  { id: 'condo-association-exterior', dwellingType: 'CONDO_UNIT', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 2005, privateOutdoor: false, hasLawn: false, drainage: false, roofResponsibility: 'ASSOCIATION', landscapingResponsibility: 'ASSOCIATION', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'NOT_APPLICABLE', roof: 'NOT_APPLICABLE' },
  { id: 'condo-balcony-unit-hvac', dwellingType: 'CONDO_UNIT', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 2012, privateOutdoor: true, hasLawn: false, drainage: false, roofResponsibility: 'ASSOCIATION', landscapingResponsibility: 'ASSOCIATION', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'NOT_APPLICABLE', roof: 'NOT_APPLICABLE' },
  { id: 'townhouse-owner-yard', dwellingType: 'TOWNHOUSE', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 1998, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
  { id: 'townhouse-association-managed', dwellingType: 'TOWNHOUSE', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 2001, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'ASSOCIATION', landscapingResponsibility: 'ASSOCIATION', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'NOT_APPLICABLE', roof: 'NOT_APPLICABLE' },
  { id: 'landlord-managed-rental', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'LONG_TERM_RENTAL', occupancyStatus: 'TENANT_OCCUPIED', yearBuilt: 1990, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'LANDLORD', landscapingResponsibility: 'LANDLORD', systemResponsibility: 'LANDLORD', hasAppliance: false, hasWarranty: false, inspectionFindings: false, activeIncident: false, homeBuyer: false, lawn: 'NOT_APPLICABLE', roof: 'NOT_APPLICABLE' },
  { id: 'vacant-renovation', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'UNDER_RENOVATION', occupancyStatus: 'VACANT', yearBuilt: 1975, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: false, hasWarranty: false, inspectionFindings: true, activeIncident: false, homeBuyer: false, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
  { id: 'newer-no-overdue', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 2023, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: true, inspectionFindings: false, activeIncident: false, homeBuyer: true, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
  { id: 'older-findings-warranty', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 1955, privateOutdoor: true, hasLawn: true, drainage: false, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: true, inspectionFindings: true, activeIncident: false, homeBuyer: false, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
  { id: 'storm-drainage-exposed', dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED', yearBuilt: 1988, privateOutdoor: true, hasLawn: true, drainage: true, roofResponsibility: 'OWNER', landscapingResponsibility: 'OWNER', systemResponsibility: 'OWNER', hasAppliance: true, hasWarranty: true, inspectionFindings: false, activeIncident: true, homeBuyer: false, lawn: 'APPLICABLE', roof: 'APPLICABLE' },
];

test('all ten UI-creatable archetypes preserve canonical cross-feature decisions', () => {
  const lawnTemplate = { id: 'lawn-care', title: 'Lawn care', serviceCategory: 'LANDSCAPING', defaultFrequency: 'MONTHLY' };
  for (const archetype of ARCHETYPES) {
    const context = snapshot(archetype);
    const maintenance = evaluateMaintenanceTemplateApplicability(context, lawnTemplate, NOW);
    const protection = evaluateProtectionContext(context);
    const financial = evaluateFinancialContext(context);
    const planning = evaluatePlanningContext(context);
    const aggregation = evaluateAggregationContext(context);

    assert.equal(maintenance.status, archetype.lawn, `${archetype.id}: lawn`);
    assert.equal(protection.roofActions.status, archetype.roof, `${archetype.id}: roof`);
    assert.equal(protection.riskAssessment.status, 'APPLICABLE', `${archetype.id}: risk baseline`);
    assert.equal(protection.inspectionEvidence.status, 'APPLICABLE', `${archetype.id}: inspection projection`);
    assert.equal(protection.incidentNotifications.status, archetype.activeIncident ? 'APPLICABLE' : 'NOT_APPLICABLE');
    assert.equal(financial.canonicalFinancingSource.status, 'APPLICABLE');
    assert.equal(financial.repairReplace.status, 'APPLICABLE');
    assert.equal(evaluateFinancialContext(context, { inventoryItemId: 'missing-item' }).repairReplace.status, 'NOT_APPLICABLE');
    assert.equal(planning.sellerPrepPlanning.status, 'APPLICABLE');
    assert.equal(planning.homeBuyerWorkflow.status, archetype.homeBuyer ? 'APPLICABLE' : 'NOT_APPLICABLE');
    assert.ok(Object.values(aggregation).every((decision) => decision.status === 'APPLICABLE'));
  }
});

test('archetype matrix contains all FRD variants and both applicability outcomes', () => {
  assert.equal(ARCHETYPES.length, 10);
  assert.ok(ARCHETYPES.some((item) => item.dwellingType === 'CONDO_UNIT' && !item.privateOutdoor));
  assert.ok(ARCHETYPES.some((item) => item.dwellingType === 'CONDO_UNIT' && item.privateOutdoor));
  assert.ok(ARCHETYPES.some((item) => item.propertyUse === 'LONG_TERM_RENTAL'));
  assert.ok(ARCHETYPES.some((item) => item.propertyUse === 'UNDER_RENOVATION' && item.occupancyStatus === 'VACANT'));
  assert.ok(ARCHETYPES.some((item) => item.drainage && item.activeIncident));
  assert.deepEqual(new Set(ARCHETYPES.map((item) => item.lawn)), new Set(['APPLICABLE', 'NOT_APPLICABLE']));
  assert.deepEqual(new Set(ARCHETYPES.map((item) => item.roof)), new Set(['APPLICABLE', 'NOT_APPLICABLE']));
});
