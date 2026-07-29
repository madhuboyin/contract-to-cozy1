// apps/backend/tests/fixtures/savingsBenefitsGoldenFixtures.js
//
// Golden fixtures for the Hidden Savings and Benefits capability audit
// (§18.2 — HSB-035). Each fixture is a minimal, realistic (program, rules,
// property) triple representing one of the 17 named scenarios the audit
// calls out. Consumed by tests/unit/savingsBenefitsGoldenFixtures.test.js.
//
// This is deliberately data, not test code — the same fixture objects
// should be reusable from future API/integration tests without
// re-deriving the scenario each time.

const BASE_PROPERTY_ATTRS = {
  state: 'NJ',
  city: 'Trenton',
  zipCode: '08608',
  county: 'Mercer',
  country: 'USA',
  propertyType: 'SINGLE_FAMILY',
  isPrimaryResidence: true,
  yearBuilt: 1998,
  squareFootage: 2100,
  assessedValue: 340000,
  hvacType: 'HEAT_PUMP',
  waterHeaterType: 'STANDARD',
  roofType: 'ASPHALT_SHINGLE',
  roofMaterial: 'ASPHALT_SHINGLE',
  roofAge: 8,
  heatPumpInstalled: true,
  heatPumpWaterHeaterInstalled: false,
  sumpPumpInstalled: true,
  hasSecuritySystem: true,
  hasSolarInstalled: null,
  hasEvCharger: null,
  hasLeakSensors: null,
  sprinklerSystem: null,
  fireAlarm: true,
  hasIrrigation: false,
  hasSumpPumpBackup: true,
  impactWindows: null,
  shutters: null,
  roofStraps: null,
  insulationUpgrade: null,
  windowUpgrade: null,
  utilityProvider: 'PSEG',
  gasProvider: 'PSEG',
  primaryHeatingFuel: 'ELECTRIC',
  inHistoricDistrict: false,
  historicRegistryStatus: null,
  inHurricaneZone: false,
  inFloodZone: false,
  inWildfireZone: false,
};

function attrs(overrides) {
  return { ...BASE_PROPERTY_ATTRS, ...overrides };
}

function program(overrides) {
  return {
    id: 'program-1',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    ...overrides,
  };
}

function rule(overrides) {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 8)}`,
    attribute: 'state',
    operator: 'EQUALS',
    value: 'NJ',
    sortOrder: 0,
    kind: 'MANDATORY',
    groupKey: null,
    ...overrides,
  };
}

const now = new Date('2026-06-01T00:00:00Z');
const FRESH_VERIFIED_AT = new Date('2026-05-01T00:00:00Z'); // 1 month old — fresh
const STALE_VERIFIED_AT = new Date('2022-01-01T00:00:00Z'); // 4+ years old — stale

module.exports = {
  now,
  attrs,
  program,
  rule,

  // 1. Nationwide program — no rules, region COUNTRY only.
  nationwideProgram: {
    property: attrs({}),
    program: program({ id: 'nationwide-1', rules: [] }),
    context: { category: 'TAX_EXEMPTION', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 2. State property-tax benefit — mandatory state=NJ.
  statePropertyTaxBenefit: {
    property: attrs({ state: 'NJ' }),
    program: program({
      id: 'state-tax-1',
      rules: [rule({ attribute: 'state', operator: 'EQUALS', value: 'NJ', kind: 'MANDATORY' })],
    }),
    context: { category: 'TAX_EXEMPTION', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 3. County program — mandatory county=Mercer.
  countyProgram: {
    property: attrs({ county: 'Mercer' }),
    program: program({
      id: 'county-1',
      rules: [rule({ attribute: 'county', operator: 'EQUALS', value: 'Mercer', kind: 'MANDATORY' })],
    }),
    context: { category: 'LOCAL_GRANT', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 4. Utility territory rebate — mandatory utilityProvider=PSEG (HSB-010 fix).
  utilityTerritoryRebate: {
    property: attrs({ utilityProvider: 'PSEG' }),
    program: program({
      id: 'utility-1',
      rules: [rule({ attribute: 'utilityProvider', operator: 'EQUALS', value: 'PSEG', kind: 'MANDATORY' })],
    }),
    context: { category: 'UTILITY_INCENTIVE', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 5. Income-sensitive program — mandatory sensitive attribute "income".
  // With no overlay (broad scan), this must resolve as unresolved-mandatory
  // (LOW confidence candidate), never matched outright — the whole point of
  // the sensitive-fact wall (HSB / DoD #9).
  incomeSensitiveProgram: {
    property: attrs({}),
    program: program({
      id: 'income-1',
      rules: [rule({ attribute: 'income', operator: 'LESS_THAN_OR_EQUAL', value: '75000', kind: 'MANDATORY' })],
    }),
    context: { category: 'REBATE', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 6. Equipment certification requirement — mandatory heatPumpInstalled=true.
  equipmentCertificationRequirement: {
    property: attrs({ heatPumpInstalled: true }),
    program: program({
      id: 'equipment-1',
      rules: [rule({ attribute: 'heatPumpInstalled', operator: 'BOOLEAN_IS', value: 'true', kind: 'MANDATORY' })],
    }),
    context: { category: 'ENERGY_CREDIT', lastVerifiedAt: FRESH_VERIFIED_AT },
  },

  // 7 & 8. Mutually exclusive vs. stackable — two matches sharing (or not
  // sharing) an exclusionGroupKey. Shape matches computeMutualExclusions'
  // MatchWithProgram input (id + program.exclusionGroupKey).
  mutuallyExclusiveMatches: [
    { id: 'match-a', program: { exclusionGroupKey: 'state-energy-pool-2026' } },
    { id: 'match-b', program: { exclusionGroupKey: 'state-energy-pool-2026' } },
    { id: 'match-c', program: { exclusionGroupKey: null } },
  ],
  stackableMatches: [
    { id: 'match-x', program: { exclusionGroupKey: null } },
    { id: 'match-y', program: { exclusionGroupKey: 'unrelated-pool' } },
  ],

  // 9. Expired program — expiresAt in the past relative to `now`.
  expiredProgram: {
    isActive: true,
    reviewStatus: 'PUBLISHED',
    expiresAt: new Date('2025-01-01T00:00:00Z'),
  },
  activeProgram: {
    isActive: true,
    reviewStatus: 'PUBLISHED',
    expiresAt: null,
  },

  // 10. Stale source — lastVerifiedAt null and >24mo old.
  staleSourceNullVerification: { lastVerifiedAt: null },
  staleSourceOldVerification: { lastVerifiedAt: STALE_VERIFIED_AT },
  freshSource: { lastVerifiedAt: FRESH_VERIFIED_AT },

  // 11. Funding closed.
  fundingClosedProgram: { fundingStatus: 'CLOSED', applicationWindowOpensAt: null, applicationWindowClosesAt: null },
  fundingOpenProgram: { fundingStatus: 'OPEN', applicationWindowOpensAt: null, applicationWindowClosesAt: null },

  // 12. No source coverage — property region pairs that match zero
  // registered programs' regionType/regionValue (simulated as an empty
  // candidate program list for the derived region pairs).
  noCoverageProperty: attrs({ state: 'WY', county: 'Teton', utilityProvider: 'Lower Valley Energy' }),

  // 16. Completed switch with two observed bills — recurring-cost RECEIVED
  // outcome input shape.
  completedSwitchOutcomeInput: {
    stage: 'RECEIVED',
    observedMonthlyValue: 42.5,
    observedAnnualValue: 510,
    evidenceNote: 'Compared two full billing cycles after switching providers: $87/mo -> $44.50/mo.',
  },

  // 17. Denied application.
  deniedOutcomeInput: {
    stage: 'DENIED',
    denialReason: 'Program administrator determined the property does not meet the occupancy requirement.',
  },
};
