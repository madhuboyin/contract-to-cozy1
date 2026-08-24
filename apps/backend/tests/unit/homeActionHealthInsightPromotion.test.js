const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-23T12:00:00.000Z');

// Fully "scored" property (no missing-data insights of its own) so each test
// can isolate exactly the insight it's checking for.
function baseProperty(overrides = {}) {
  return {
    id: 'property-1',
    yearBuilt: 2015,
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    roofType: 'SHINGLE',
    heatingType: 'HVAC',
    coolingType: 'CENTRAL_AC',
    waterHeaterType: 'TANK',
    occupantsCount: 2,
    propertySize: 2000,
    hvacInstallYear: 2024,
    waterHeaterInstallYear: 2024,
    roofReplacementYear: 2024,
    hasSmokeDetectors: true,
    hasCoDetectors: true,
    hasSecuritySystem: true,
    hasFireExtinguisher: true,
    hasDrainageIssues: false,
    hasIrrigation: false,
    bonusMultiplier: 1,
    // A recorded, recently-installed appliance so the aggregate "Appliances"
    // factor scores 'Complete' by default — tests that care about the
    // appliance branches override this explicitly.
    inventoryItems: [{ id: 'dishwasher-1', name: 'Dishwasher', category: 'APPLIANCE', installedOn: new Date('2024-01-01') }],
    warranties: [],
    ...overrides,
  };
}

function stubSources({ property, documentCount = 0, bookings = [] } = {}) {
  return {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
    property: { findUnique: async () => property ?? null },
    document: { count: async () => documentCount },
    booking: { findMany: async () => bookings },
  };
}

test('an appliance missing its installation year produces a SYSTEM Home Action', async () => {
  const property = baseProperty({
    inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: null }],
  });
  const db = stubSources({ property });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.id, 'health-insight:property-1:appliances');
  assert.equal(action.signal, 'Add installation year for Refrigerator');
  assert.equal(action.priority, 'PLAN');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/edit?focus=appliances');
});

test('no recorded appliances produces an "add major appliances" Home Action', async () => {
  const property = baseProperty({ inventoryItems: [] });
  const db = stubSources({ property });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].signal, 'Add major appliances');
});

test('an old HVAC install year produces an unmatched, factor-page-linked Home Action', async () => {
  // 'HVAC'/'HVAC Age' is deliberately excluded from item-name matching
  // (same exclusion list as resolutionCenter.service.ts's
  // extractHealthInsightAssetName) to avoid mismatching against a generic
  // named item, so this falls back to the factor detail page, not a
  // guidance-overview item deep link.
  const property = baseProperty({ hvacInstallYear: 2000 }); // 26 years old as of NOW -> 'Needs Inspection'
  const db = stubSources({ property });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [hvacAction] = actions;
  assert.equal(hvacAction.signal, 'HVAC Age');
  assert.equal(hvacAction.source.kind, 'SYSTEM');
  assert.equal(hvacAction.primaryCta.href, '/dashboard/properties/property-1/focus/health/hvac-age');
});

test('a named factor tied to a specific appliance links to the matched inventory item', async () => {
  const property = baseProperty({
    inventoryItems: [
      { id: 'fridge-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: new Date('2005-01-01') },
    ],
  });
  const db = stubSources({ property });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  const applianceAgingAction = actions.find((a) => a.signal === 'Refrigerator aging');
  assert.ok(applianceAgingAction, `expected a "Refrigerator aging" action among: ${actions.map((a) => a.signal).join(', ')}`);
  assert.ok(applianceAgingAction.primaryCta.href.includes('itemId=fridge-1'));
});

test('a well-scored property with no missing data produces no health-insight actions', async () => {
  const property = baseProperty({ hvacInstallYear: 2024 }); // 2 years old -> 'Good', filtered out
  const db = stubSources({ property });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});

test('a missing property record produces no actions', async () => {
  const db = stubSources({ property: null });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});

// Finding: sourceVersion was previously hardcoded null, stamping every
// evaluation as a fresh change regardless of whether the contributing
// property/inventory/document/booking facts actually moved (HI-ATT-007
// stable-version requirement).
test('sourceVersion is deterministic across two evaluations of identical inputs', async () => {
  const property = baseProperty({
    inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: null }],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const db = stubSources({ property, documentCount: 3 });
  const first = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', db, { evaluatedAt: new Date('2026-08-24T00:00:00.000Z'), includePersonalization: false });

  assert.equal(first.actions.length, 1);
  assert.equal(second.actions.length, 1);
  assert.ok(first.actions[0].source.version, 'sourceVersion must not be null');
  assert.equal(first.actions[0].source.version, second.actions[0].source.version, 'identical contributing facts must produce the identical version, even at a later evaluation time');
});

test('sourceVersion changes when a contributing fact (documentCount) changes', async () => {
  const property = baseProperty({
    inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: null }],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const before = await getPromotedHomeActions('property-1', stubSources({ property, documentCount: 3 }), { evaluatedAt: NOW, includePersonalization: false });
  const after = await getPromotedHomeActions('property-1', stubSources({ property, documentCount: 4 }), { evaluatedAt: NOW, includePersonalization: false });

  assert.notEqual(before.actions[0].source.version, after.actions[0].source.version);
});

// Finding (Phase 1 follow-up review): the first version of this hash
// omitted warranty expiry state, booking insightFactor (vs. just booking
// id), and inventory item name/assetType — each a real
// calculateHealthScore/insight-generation input that can change the
// resulting actions while leaving an id-and-category-only hash unchanged.
test('sourceVersion changes when a warranty\'s expiryDate changes, even when hasActiveHomeWarranty (still expired either way) doesn\'t flip', async () => {
  // Both dates are expired relative to NOW, so hasActiveHomeWarranty is
  // false in both cases and the produced "aging" action is identical in
  // content — this isolates the hash's sensitivity to the warranty's own
  // expiryDate from any visible change in the score/action itself.
  const before = await getPromotedHomeActions('property-1', stubSources({
    property: baseProperty({
      inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: new Date('2005-01-01') }],
      warranties: [{ id: 'w-1', expiryDate: new Date('2019-01-01') }],
    }),
  }), { evaluatedAt: NOW, includePersonalization: false });
  const after = await getPromotedHomeActions('property-1', stubSources({
    property: baseProperty({
      inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: new Date('2005-01-01') }],
      warranties: [{ id: 'w-1', expiryDate: new Date('2020-06-01') }],
    }),
  }), { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(before.actions.length, 1);
  assert.equal(after.actions.length, 1);
  assert.equal(before.actions[0].id, after.actions[0].id, 'the produced action itself is identical in content');
  assert.notEqual(before.actions[0].source.version, after.actions[0].source.version, 'the same warranty id with a different (still-expired) expiryDate must still change the version');
});

test('sourceVersion changes when an existing active booking\'s insightFactor changes', async () => {
  const property = baseProperty({
    inventoryItems: [{ id: 'item-1', name: 'Refrigerator', category: 'APPLIANCE', installedOn: null }],
  });
  const before = await getPromotedHomeActions('property-1', stubSources({ property, bookings: [{ id: 'booking-1', insightFactor: 'Roof Age' }] }), { evaluatedAt: NOW, includePersonalization: false });
  const after = await getPromotedHomeActions('property-1', stubSources({ property, bookings: [{ id: 'booking-1', insightFactor: 'HVAC Age' }] }), { evaluatedAt: NOW, includePersonalization: false });

  assert.notEqual(before.actions[0].source.version, after.actions[0].source.version, 'the same booking id with a different insightFactor must change the version');
});

test('sourceVersion changes when an inventory item\'s name changes (feeds the generated action title/id directly)', async () => {
  const before = await getPromotedHomeActions('property-1', stubSources({
    property: baseProperty({ inventoryItems: [{ id: 'item-1', name: 'Fridge', category: 'APPLIANCE', installedOn: new Date('2005-01-01') }] }),
  }), { evaluatedAt: NOW, includePersonalization: false });
  const after = await getPromotedHomeActions('property-1', stubSources({
    property: baseProperty({ inventoryItems: [{ id: 'item-1', name: 'Kitchen Refrigerator', category: 'APPLIANCE', installedOn: new Date('2005-01-01') }] }),
  }), { evaluatedAt: NOW, includePersonalization: false });

  const versionBefore = before.actions.find((a) => a.id.includes('aging'))?.source.version;
  const versionAfter = after.actions.find((a) => a.id.includes('aging'))?.source.version;
  assert.ok(versionBefore, 'expected a criticallyAging insight for a 21-year-old appliance');
  assert.notEqual(versionBefore, versionAfter, 'the same item id with a different name must change the version, since the name feeds the action title/factorSlug directly');
});

test('a db stub without property/document/booking tables does not throw and yields no health-insight actions', async () => {
  const db = {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
  };
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 0);
});
