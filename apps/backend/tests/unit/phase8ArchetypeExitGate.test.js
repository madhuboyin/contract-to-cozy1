const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateMaintenanceTemplateApplicability } = require('../../src/services/maintenance/applicabilityPolicy.ts');
const { evaluateProtectionContext } = require('../../src/services/protection/applicabilityPolicy.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { evaluatePlanningContext } = require('../../src/services/planningContext/applicabilityPolicy.ts');
const { evaluateAggregationContext } = require('../../src/services/aggregationContext/applicabilityPolicy.ts');
const { evaluateSeasonalTemplateApplicability } = require('../../src/services/seasonal/applicabilityPolicy.ts');
const { buildSeasonalPropertyContext } = require('../../../workers/src/jobs/seasonalChecklistGeneration.job.ts');
const { buildHabitPropertyContext } = require('../../../workers/src/jobs/habitGeneration.job.ts');
const { buildGuidanceOverviewHref } = require('../../../frontend/src/lib/navigation/guidanceOverviewHref.ts');

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

function workerProperty(archetype) {
  return {
    id: archetype.id,
    dwellingType: archetype.dwellingType,
    yearBuilt: archetype.yearBuilt,
    state: 'TX',
    roofType: 'ASPHALT_SHINGLE',
    heatingType: 'FURNACE',
    coolingType: 'CENTRAL_AC',
    waterHeaterType: 'TANK',
    hasSmokeDetectors: true,
    hasCoDetectors: true,
    hasSumpPumpBackup: false,
    hasFireExtinguisher: true,
    hasSecuritySystem: false,
    climateSetting: { climateRegion: 'HOT_HUMID' },
    exteriorProfile: {
      hasPrivateOutdoorSpace: archetype.privateOutdoor,
      outdoorSpaceTypes: archetype.privateOutdoor
        ? [archetype.id === 'condo-balcony-unit-hvac' ? 'BALCONY' : 'PRIVATE_YARD']
        : [],
      hasLawn: archetype.hasLawn,
      hasTreesOrShrubs: archetype.hasLawn,
      hasDriveway: archetype.dwellingType !== 'CONDO_UNIT',
      hasPoolOrSpa: false,
      hasIrrigation: archetype.hasLawn,
      hasOutdoorFaucets: archetype.privateOutdoor,
      hasDrainageIssues: archetype.drainage,
    },
    responsibilities: [
      { scope: 'ROOF', party: archetype.roofResponsibility },
      { scope: 'BUILDING_EXTERIOR', party: archetype.roofResponsibility },
      { scope: 'LANDSCAPING', party: archetype.landscapingResponsibility },
      { scope: 'PLUMBING', party: archetype.systemResponsibility },
      { scope: 'HVAC', party: archetype.systemResponsibility },
    ],
    inventoryItems: archetype.hasAppliance
      ? [{ id: `${archetype.id}-item`, category: 'APPLIANCE', name: 'Dishwasher', tags: [] }]
      : [],
    maintenanceTasks: [],
  };
}

test('all ten archetypes execute the worker context and shared applicability path', () => {
  const lawnTemplate = {
    taskKey: 'SPRING_LAWN_CARE',
    priority: 'RECOMMENDED',
    requiredAssetCheck: 'has_lawn',
    requiredAssetType: null,
  };

  for (const archetype of ARCHETYPES) {
    const property = workerProperty(archetype);
    const seasonalContext = buildSeasonalPropertyContext(property, NOW);
    const habitContext = buildHabitPropertyContext(property, NOW);
    const seasonalDecision = evaluateSeasonalTemplateApplicability(seasonalContext, lawnTemplate, NOW);

    assert.equal(seasonalContext.propertyId, archetype.id);
    assert.equal(seasonalContext.facts['exterior.hasLawn'].value, archetype.hasLawn);
    assert.equal(seasonalDecision.status, archetype.lawn, `${archetype.id}: worker lawn`);
    assert.equal(habitContext.facts['core.dwellingType'].value, archetype.dwellingType);
    assert.equal(habitContext.facts['exterior.hasDrainageIssues'].value, archetype.drainage);
    assert.match(habitContext.contextVersion, /^[a-f0-9]{64}$/);
  }
});

test('all ten archetypes execute canonical UI navigation without legacy item aliases', () => {
  for (const archetype of ARCHETYPES) {
    const inventoryItemId = archetype.hasAppliance ? `${archetype.id}-item` : null;
    const href = buildGuidanceOverviewHref({
      propertyId: archetype.id,
      scopeCategory: inventoryItemId ? 'ITEM' : 'SERVICE',
      inventoryItemId,
      assetName: inventoryItemId ? 'Dishwasher' : null,
    });

    assert.match(href, new RegExp(`/dashboard/properties/${archetype.id}/tools/guidance-overview`));
    assert.doesNotMatch(href, /homeAsset|HOME_ASSET/);
    if (inventoryItemId) {
      assert.match(href, new RegExp(`inventoryItemId=${inventoryItemId}`));
      assert.match(href, new RegExp(`itemId=${inventoryItemId}`));
    }
  }
});
