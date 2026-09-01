const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  HomeDigitalTwinBuilderService,
} = require('../../src/services/homeDigitalTwinBuilder.service.ts');

const builder = new HomeDigitalTwinBuilderService();

function baseProperty(overrides = {}) {
  return {
    yearBuilt: null,
    propertySize: 1500,
    hvacInstallYear: null,
    waterHeaterInstallYear: null,
    roofReplacementYear: null,
    electricalPanelAge: null,
    heatingType: null,
    coolingType: null,
    waterHeaterType: null,
    roofType: null,
    foundationType: null,
    sidingType: null,
    primaryHeatingFuel: null,
    hasSumpPumpBackup: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function inventoryItem(overrides = {}) {
  return {
    id: 'inv-1',
    name: 'HVAC Unit',
    category: 'HVAC',
    condition: 'GOOD',
    installedOn: null,
    purchasedOn: null,
    replacementCostCents: null,
    brand: null,
    model: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function specFor(specs, identityKey) {
  return specs.find((s) => s.identityKey === identityKey);
}

// HDT-001 regression: an installYear inferred from yearBuilt must never
// render as KNOWN, and its projected fact must be INFERRED, not REPORTED.
test('HVAC install year inferred from yearBuilt is ESTIMATED/INFERRED, not KNOWN/REPORTED', () => {
  const property = baseProperty({ yearBuilt: 2000 });
  const specs = builder.deriveSpecs(property, [], null, 'property-1');
  const hvac = specFor(specs, 'HVAC:PRIMARY');

  assert.ok(hvac, 'expected a PRIMARY HVAC component when no inventory exists');
  assert.equal(hvac.status, 'ESTIMATED');
  assert.equal(hvac.installYear, 2005); // yearBuilt + 5 offset
  const installFact = hvac.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(installFact.factState, 'INFERRED');
  assert.equal(installFact.sourceType, 'SYSTEM_DERIVED');
});

test('legacy property install year remains an estimate until purchase date is recorded', () => {
  const property = baseProperty({ yearBuilt: 2000, hvacInstallYear: 2018 });
  const specs = builder.deriveSpecs(property, [], null, 'property-1');
  const hvac = specFor(specs, 'HVAC:PRIMARY');

  assert.equal(hvac.status, 'ESTIMATED');
  assert.equal(hvac.installYear, 2018);
  const installFact = hvac.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(installFact.factState, 'INFERRED');
  assert.equal(installFact.sourceType, 'SYSTEM_DERIVED');
});

test('with no signal at all, install year fact is DEFAULT, not silently INFERRED', () => {
  const property = baseProperty();
  const specs = builder.deriveSpecs(property, [], null, 'property-1');
  const hvac = specFor(specs, 'HVAC:PRIMARY');

  assert.equal(hvac.status, 'ESTIMATED');
  assert.equal(hvac.installYear, null);
  const installFact = hvac.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(installFact.factState, 'DEFAULT');
});

test('age and service-life depletion never produce a failure probability', () => {
  const property = baseProperty({
    yearBuilt: 1980,
    hvacInstallYear: 2000,
    waterHeaterInstallYear: 2005,
    roofReplacementYear: 1995,
    electricalPanelAge: 45,
  });
  const specs = builder.deriveSpecs(property, [], { riskScore: 95, details: {}, lastCalculatedAt: new Date() }, 'property-1');

  assert.ok(specs.length > 0);
  for (const spec of specs) {
    assert.equal(
      spec.failureRiskScore,
      null,
      `${spec.identityKey} must not translate age or aggregate property risk into failure probability`,
    );
  }
});

// HDT-009: multiple real systems of the same type must become distinct
// components with stable per-item identity, not collapse into one.
test('multiple HVAC inventory items become distinct components with stable identityKeys', () => {
  const property = baseProperty({ yearBuilt: 2000, hvacInstallYear: 2018 });
  const items = [
    inventoryItem({ id: 'hvac-a', name: 'Upstairs Unit', purchasedOn: new Date('2015-01-01') }),
    inventoryItem({ id: 'hvac-b', name: 'Downstairs Unit', purchasedOn: new Date('2020-01-01') }),
  ];
  const specs = builder.deriveSpecs(property, items, null, 'property-1');
  const hvacSpecs = specs.filter((s) => s.componentType === 'HVAC');

  assert.equal(hvacSpecs.length, 2, 'expected one component per HVAC inventory item');
  const keys = hvacSpecs.map((s) => s.identityKey).sort();
  assert.deepEqual(keys, ['HVAC:hvac-a', 'HVAC:hvac-b']);
  // With multiple systems present, property.hvacInstallYear cannot be
  // attributed to a specific one — each must use its own inventory date.
  for (const spec of hvacSpecs) {
    const installFact = spec.facts.find((f) => f.fieldName === 'installYear');
    assert.equal(installFact.sourceType, 'INVENTORY');
  }
});

test('a single HVAC inventory item still allows the profile install year to apply', () => {
  const property = baseProperty({ hvacInstallYear: 2018 });
  const items = [inventoryItem({ id: 'hvac-a' })];
  const specs = builder.deriveSpecs(property, items, null, 'property-1');
  const hvacSpecs = specs.filter((s) => s.componentType === 'HVAC');

  assert.equal(hvacSpecs.length, 1);
  assert.equal(hvacSpecs[0].identityKey, 'HVAC:hvac-a');
  assert.equal(hvacSpecs[0].installYear, 2018);
});

test('roof and electrical use PRIMARY identity when no canonical item exists', () => {
  const property = baseProperty({ roofReplacementYear: 2010, electricalPanelAge: 5 });
  const specs = builder.deriveSpecs(property, [], null, 'property-1');

  assert.ok(specFor(specs, 'ROOF:PRIMARY'));
  assert.ok(specFor(specs, 'ELECTRICAL:PRIMARY'));
});

test('multiple roofs and electrical panels preserve stable inventory identities', () => {
  const property = baseProperty({ roofReplacementYear: 2010, electricalPanelAge: 5 });
  const items = [
    inventoryItem({ id: 'roof-a', name: 'Main roof shingles', category: 'ROOF_EXTERIOR' }),
    inventoryItem({ id: 'roof-b', name: 'Garage roof membrane', category: 'ROOF_EXTERIOR' }),
    inventoryItem({ id: 'panel-a', name: 'Main panel', category: 'ELECTRICAL' }),
    inventoryItem({ id: 'panel-b', name: 'Garage subpanel', category: 'ELECTRICAL' }),
  ];
  const specs = builder.deriveSpecs(property, items, null, 'property-1');

  assert.deepEqual(
    specs.filter((s) => s.componentType === 'ROOF').map((s) => s.identityKey).sort(),
    ['ROOF:roof-a', 'ROOF:roof-b'],
  );
  assert.deepEqual(
    specs.filter((s) => s.componentType === 'ELECTRICAL').map((s) => s.identityKey).sort(),
    ['ELECTRICAL:panel-a', 'ELECTRICAL:panel-b'],
  );
});

test('every modeled output has versioned field-level lineage', () => {
  const specs = builder.deriveSpecs(baseProperty({ yearBuilt: 2000 }), [], null, 'property-1');
  const expected = [
    'estimatedAgeYears',
    'usefulLifeYears',
    'conditionScore',
    'replacementCostEstimate',
    'annualOperatingCostEstimate',
    'annualMaintenanceCostEstimate',
    'confidenceScore',
  ];
  for (const spec of specs) {
    for (const fieldName of expected) {
      const fact = spec.facts.find((candidate) => candidate.fieldName === fieldName);
      assert.ok(fact, `${spec.identityKey} is missing lineage for ${fieldName}`);
      assert.equal(fact.modelVersion, 'home-projection-v2');
      assert.equal(typeof fact.derivationMethod, 'string');
    }
  }
});

test('purchase date is canonical and legacy property install year does not create a conflict', () => {
  const property = baseProperty({ hvacInstallYear: 2010 });
  const items = [inventoryItem({ id: 'hvac-a', purchasedOn: new Date('2019-01-01') })];
  const specs = builder.deriveSpecs(property, items, null, 'property-1');
  const hvac = specFor(specs, 'HVAC:hvac-a');

  assert.equal(hvac.status, 'KNOWN');
  const installFact = hvac.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(installFact.factState, 'REPORTED');
  assert.equal(installFact.sourceField, 'purchasedOn');
});

test('replacement cost fact reflects real inventory cost as REPORTED, category default as DEFAULT', () => {
  const property = baseProperty();
  const withCost = builder.deriveSpecs(
    property,
    [inventoryItem({ id: 'hvac-a', replacementCostCents: 1000000 })],
    null,
    'property-1',
  );
  const hvacWithCost = specFor(withCost, 'HVAC:hvac-a');
  const costFact = hvacWithCost.facts.find((f) => f.fieldName === 'replacementCostEstimate');
  assert.equal(costFact.factState, 'REPORTED');
  assert.equal(hvacWithCost.replacementCostEstimate, 10000);

  const withoutCost = builder.deriveSpecs(property, [], null, 'property-1');
  const hvacNoCost = specFor(withoutCost, 'HVAC:PRIMARY');
  const defaultCostFact = hvacNoCost.facts.find((f) => f.fieldName === 'replacementCostEstimate');
  assert.equal(defaultCostFact.factState, 'DEFAULT');
});

// Slice 2: every fact must link to an existing owning surface, never a
// fabricated one.
test('correction destinations point at real existing surfaces', () => {
  const property = baseProperty({ yearBuilt: 2000, electricalPanelAge: 5 });
  const items = [inventoryItem({ id: 'hvac-a', purchasedOn: new Date('2015-01-01') })];
  const specs = builder.deriveSpecs(property, items, null, 'property-77');

  const hvac = specFor(specs, 'HVAC:hvac-a');
  const hvacInstallFact = hvac.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(hvacInstallFact.correctionDestination, '/dashboard/properties/property-77/inventory/items/hvac-a');

  const electrical = specFor(specs, 'ELECTRICAL:PRIMARY');
  const electricalInstallFact = electrical.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(
    electricalInstallFact.correctionDestination,
    '/dashboard/properties/property-77/inventory?action=add-item&category=ELECTRICAL&from=home-digital-twin',
  );

  const roof = specFor(specs, 'ROOF:PRIMARY');
  const roofInstallFact = roof.facts.find((f) => f.fieldName === 'installYear');
  assert.equal(roofInstallFact.correctionDestination, '/dashboard/properties/property-77/edit#structure');

  const roofCostFact = roof.facts.find((f) => f.fieldName === 'replacementCostEstimate');
  assert.equal(
    roofCostFact.correctionDestination,
    '/dashboard/properties/property-77/inventory?action=add-item&category=ROOF_EXTERIOR&from=home-digital-twin',
  );

  const waterHeater = specFor(specs, 'WATER_HEATER:PRIMARY');
  const waterHeaterCostFact = waterHeater.facts.find((f) => f.fieldName === 'replacementCostEstimate');
  assert.equal(
    waterHeaterCostFact.correctionDestination,
    '/dashboard/properties/property-77/inventory?action=add-item&category=PLUMBING&from=home-digital-twin',
  );
});

test('projection fact changes append immutable before/after revision history', async () => {
  const revisions = [];
  const existing = {
    valueNumeric: 2000,
    valueText: null,
    unit: null,
    factState: 'INFERRED',
    sourceType: 'SYSTEM_DERIVED',
    sourceRecordType: 'Property',
    sourceRecordId: null,
    sourceField: 'yearBuilt',
    observedAt: null,
    derivationMethod: 'year_built_direct',
    modelVersion: 'home-projection-v2',
    sourceVerified: null,
    confidenceScore: 0.3,
    conflictGroupId: null,
    correctionDestination: '/dashboard/properties/property-1/edit#structure',
  };
  const tx = {
    homeTwinProjectedFact: {
      findUnique: async () => existing,
      upsert: async () => ({ id: 'fact-1' }),
    },
    homeTwinProjectedFactRevision: {
      create: async (args) => {
        revisions.push(args.data);
        return { id: 'revision-1' };
      },
    },
  };

  await builder.upsertFacts(tx, 'twin-1', 'component-1', [{
    fieldName: 'installYear',
    valueNumeric: 2018,
    factState: 'REPORTED',
    sourceType: 'PROPERTY_PROFILE',
    sourceRecordType: 'Property',
    sourceField: 'hvacInstallYear',
    derivationMethod: 'direct',
    confidenceScore: 0.7,
    correctionDestination: '/dashboard/properties/property-1/edit#structure',
  }]);

  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].previousFactState, 'INFERRED');
  assert.equal(revisions[0].nextFactState, 'REPORTED');
  assert.equal(revisions[0].previousSnapshot.valueNumeric, 2000);
  assert.equal(revisions[0].nextSnapshot.valueNumeric, 2018);
});
