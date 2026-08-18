const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BUYER_INSPECTION_MODULE_VERSION,
  composeBuyerInspectionModules,
} = require('../../src/services/buyerInspectionModuleComposition.service.ts');
const { PROPERTY_FACT_CATALOG } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');

function fact(key, value, state = value === null ? 'UNKNOWN' : 'KNOWN') {
  return {
    key,
    value,
    state,
    source: value === null ? null : 'USER_REPORTED',
    verified: false,
    confidence: null,
    observedAt: value === null ? null : '2026-08-17T12:00:00.000Z',
    validUntil: null,
    correctionPath: `/dashboard/properties/property-1/edit#${key}`,
  };
}

function context(overrides = {}) {
  const values = {
    'core.dwellingType': 'CONDO_UNIT',
    'core.ownershipForm': 'CONDOMINIUM',
    'responsibility.roof': 'ASSOCIATION',
    'responsibility.buildingExterior': 'ASSOCIATION',
    'responsibility.sharedSystems': 'SHARED',
    'structure.foundationType': 'BASEMENT',
    'exterior.hasPoolOrSpa': true,
    'exterior.hasDrainageIssues': true,
    'core.yearBuilt': 1975,
    'structure.roofType': 'SHINGLE',
    'structure.electricalPanelAgeYears': 25,
    'systems.heatingType': 'FURNACE',
    'systems.coolingType': 'CENTRAL_AC',
    'systems.waterHeaterType': 'TANK',
    'systems.installedItemTypes': ['FURNACE', 'CHIMNEY'],
    'location.inHistoricDistrict': false,
    'location.inHurricaneZone': true,
    'location.inFloodZone': true,
    'location.inWildfireZone': false,
    ...overrides,
  };
  return {
    propertyId: 'property-1',
    contextVersion: 'context-v1',
    generatedAt: '2026-08-17T12:00:00.000Z',
    scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS'],
    warnings: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fact(key, value)])),
  };
}

test('property-aware inspection modules produce explainable scope without diagnosing defects', () => {
  const result = composeBuyerInspectionModules(context());
  const modules = new Map(result.modules.map((module) => [module.moduleKey, module]));

  assert.equal(result.version, BUYER_INSPECTION_MODULE_VERSION);
  assert.equal(result.modules.length, 7);
  assert.deepEqual(modules.get('buyer.inspection.foundation-spaces').specialistScopes, ['STRUCTURAL', 'RADON']);
  assert.deepEqual(modules.get('buyer.inspection.pool-spa').specialistScopes, ['POOL_SPA']);
  assert.ok(modules.get('buyer.inspection.confirmed-systems').specialistScopes.includes('CHIMNEY'));
  assert.ok(modules.get('buyer.inspection.exposure-context').questions.some((question) => question.includes('flood-zone')));
  assert.ok(modules.get('buyer.inspection.home-age').questions.some((question) => question.includes('older electrical')));
  assert.ok(result.modules.every((module) => module.usedFactKeys.length > 0));
  assert.ok(result.modules.every((module) => !/defect exists/i.test(module.description)));
});

test('unknown or conflicted facts never become accepted inspection recommendations', () => {
  const unknown = context({
    'structure.foundationType': null,
    'exterior.hasPoolOrSpa': null,
    'exterior.hasDrainageIssues': null,
  });
  unknown.facts['location.inFloodZone'] = fact('location.inFloodZone', true, 'CONFLICTED');
  const result = composeBuyerInspectionModules(unknown);

  assert.equal(result.modules.find((module) => module.moduleKey === 'buyer.inspection.foundation-spaces').status, 'UNKNOWN');
  assert.equal(result.modules.find((module) => module.moduleKey === 'buyer.inspection.pool-spa').status, 'UNKNOWN');
  const exposure = result.modules.find((module) => module.moduleKey === 'buyer.inspection.exposure-context');
  assert.equal(exposure.status, 'UNKNOWN');
  assert.deepEqual(exposure.reasonCodes, ['PROPERTY_CONTEXT_CONFLICT']);
  assert.ok(exposure.correctionPaths.length > 0);
});

test('existing self-reported exposure fields are available through canonical Property Context', () => {
  const keys = new Map(PROPERTY_FACT_CATALOG.map((definition) => [definition.key, definition]));
  for (const key of ['location.inHistoricDistrict', 'location.inHurricaneZone', 'location.inFloodZone', 'location.inWildfireZone']) {
    assert.equal(keys.get(key).scope, 'LOCATION');
    assert.equal(keys.get(key).writable, true);
  }
});

test('Buyer Plan presents applicable modules automatically as a printable buyer checklist', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');
  const guide = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/BuyerInspectionGuide.tsx'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/buyerAcquisition.service.ts'), 'utf8');

  assert.match(service, /composeBuyerInspectionModules\(propertyContext\)/);
  assert.match(page, /BuyerInspectionGuide/);
  assert.doesNotMatch(page, /Add module to plan/);
  assert.match(guide, /Print checklist/);
  assert.match(guide, /STANDARD_CHECKLIST/);
  assert.match(guide, /window\.print\(\)/);
  assert.match(page, /module\.status === 'APPLICABLE'/);
  assert.match(page, /module\.status === 'UNKNOWN'/);
});
