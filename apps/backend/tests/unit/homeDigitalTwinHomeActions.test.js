const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  getPromotedHomeActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-07-18T12:00:00.000Z');

// Minimal empty stubs for every other source loader so getPromotedHomeActions
// only surfaces what the Digital Twin / Capital Timeline stubs below add.
function baseSources(overrides = {}) {
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
    ...overrides,
  };
}

test('a conflicted home fact is promoted as a SOON-priority CORRECT_FACT action', async () => {
  const sources = baseSources({
    homeDigitalTwin: { findUnique: async () => ({ id: 'twin-1', updatedAt: NOW }) },
    inventoryItem: { findMany: async () => [{ id: 'hvac-1', name: 'HVAC system', category: 'HVAC' }] },
    homeTwinComponent: {
      findMany: async () => [{
        id: 'component-1', label: 'HVAC system', componentType: 'HVAC',
        sourceType: 'INVENTORY', sourceReferenceId: 'hvac-1',
        projectedFacts: [{
          id: 'fact-1', fieldName: 'conditionScore', valueNumeric: 0.4,
          factState: 'CONFLICTED',
          correctionDestination: '/dashboard/properties/property-1/edit#structure',
        }],
      }],
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-digital-twin-fact-review:component-1');

  assert.ok(action, 'expected a fact-review action');
  assert.equal(action.priority, 'SOON');
  assert.equal(action.primaryCta.kind, 'CORRECT_FACT');
  assert.match(action.primaryCta.href, /^\/dashboard\/resolution-center\?/);
  assert.match(action.primaryCta.href, /sourceEntityId=hvac-1/);
  assert.deepEqual(action.propertyContextFeature.operationInput, { inventoryItemId: 'hvac-1' });
  assert.deepEqual(action.presentation.subject, { kind: 'INVENTORY_ITEM', id: 'hvac-1', label: 'HVAC system' });
});

test('a non-conflicting default/unknown fact is promoted at CONSIDER priority', async () => {
  const sources = baseSources({
    homeDigitalTwin: { findUnique: async () => ({ id: 'twin-1', updatedAt: NOW }) },
    inventoryItem: { findMany: async () => [{ id: 'washer-1', name: 'Washer Dryer', category: 'APPLIANCE' }] },
    homeTwinComponent: {
      findMany: async () => [{
        id: 'component-2', label: 'Washer Dryer', componentType: 'WASHER_DRYER',
        sourceType: 'INVENTORY', sourceReferenceId: 'washer-1',
        projectedFacts: [{ id: 'fact-2', fieldName: 'installYear', valueNumeric: 2016, factState: 'DEFAULT' }],
      }],
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-digital-twin-fact-review:component-2');

  assert.ok(action);
  assert.equal(action.priority, 'CONSIDER');
});

test('no twin and no needs-attention facts produce no fact-review action', async () => {
  const noTwin = await getPromotedHomeActions('property-1', baseSources({
    homeDigitalTwin: { findUnique: async () => null },
    homeTwinComponent: { findMany: async () => [] },
  }));
  assert.equal(noTwin.actions.some((a) => a.id.startsWith('home-digital-twin-fact-review')), false);

  const allClear = await getPromotedHomeActions('property-1', baseSources({
    homeDigitalTwin: { findUnique: async () => ({ id: 'twin-1', updatedAt: NOW }) },
    inventoryItem: { findMany: async () => [] },
    // The real query's `where` already excludes REPORTED/VERIFIED/etc facts
    // (only CONFLICTED/DEFAULT/UNKNOWN are selected) — this stub reflects
    // what Prisma would actually return, not the unfiltered component.
    homeTwinComponent: {
      findMany: async () => [{ projectedFacts: [] }],
    },
  }));
  assert.equal(allClear.actions.some((a) => a.id.startsWith('home-digital-twin-fact-review')), false);

  const noCanonicalItem = await getPromotedHomeActions('property-1', baseSources({
    homeDigitalTwin: { findUnique: async () => ({ id: 'twin-1', updatedAt: NOW }) },
    inventoryItem: { findMany: async () => [] },
    homeTwinComponent: {
      findMany: async () => [{
        id: 'property-hvac', label: 'HVAC system', componentType: 'HVAC',
        sourceType: 'PROPERTY', sourceReferenceId: 'property-1',
        projectedFacts: [{ id: 'fact-3', fieldName: 'conditionScore', factState: 'UNKNOWN' }],
      }],
    },
  }));
  assert.equal(noCanonicalItem.actions.some((a) => a.id.startsWith('home-digital-twin-fact-review')), false);
});

test('a HIGH-priority capital item becomes a standalone evidence-backed lifecycle action', async () => {
  const sources = baseSources({
    homeCapitalTimelineAnalysis: {
      findFirst: async () => ({
        id: 'analysis-1',
        computedAt: NOW,
        inputsSnapshot: { _propertyContextVersion: 'context-v4' },
        items: [{
          id: 'item-1',
          category: 'ROOF',
          windowStart: new Date('2027-06-01'),
          windowEnd: new Date('2028-06-01'),
          estimatedCostMinCents: 900000,
          estimatedCostMaxCents: 1400000,
          confidence: 'HIGH',
          why: 'Roof is estimated at ~24.0 years old.',
          inventoryItemId: 'roof-1',
          inventoryItem: {
            name: 'Roof', condition: 'GOOD', installedOn: null, purchasedOn: new Date('2002-06-01'),
            lastServicedOn: null, isVerified: true, updatedAt: NOW,
            warranty: null, linkedWarranties: [], insurancePolicy: null, homeEvents: [],
          },
        }],
      }),
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-capital-timeline-window:item-1');

  assert.ok(action, 'expected a capital timeline window action');
  assert.equal(action.priority, 'SOON');
  assert.equal(action.job, 'MAJOR_MOMENT');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.match(action.primaryCta.href, /^\/dashboard\/properties\/property-1\/tools\/capital-timeline\?/);
  assert.match(action.primaryCta.href, /itemId=roof-1/);
  assert.match(action.primaryCta.href, /sourceActionId=home-capital-timeline-window%3Aitem-1/);
  assert.match(action.primaryCta.href, /contextVersion=context-v4/);
  assert.equal(action.primaryCta.label, 'Plan Roof replacement');
  assert.equal(action.presentation.variant, 'ASSET_LIFECYCLE');
  assert.equal(action.presentation.headline, 'Plan for Roof replacement');
  assert.equal(action.presentation.subject.id, 'roof-1');
  assert.equal(action.presentation.group, null);
  assert.equal(action.presentation.detailLabel, 'Why this estimate?');
  assert.deepEqual(action.propertyContextFeature.operationInput, { inventoryItemId: 'roof-1' });
  assert.deepEqual(
    action.presentation.factGroups.flatMap((group) => group.facts).filter((fact) => fact.kind === 'MISSING'),
    [],
    'an empty service/repair/coverage history is a known absence, not another correction request',
  );
  assert.match(action.expectedOutcome, /\$9,000.*\$14,000/);
});

test('keeps nearby capital items standalone and presents every known item fact', async () => {
  const sources = baseSources({
    homeCapitalTimelineAnalysis: {
      findFirst: async () => ({
        id: 'analysis-1',
        computedAt: NOW,
        inputsSnapshot: {},
        items: [
          {
            id: 'item-1', category: 'APPLIANCE',
            windowStart: new Date('2027-01-01'), windowEnd: new Date('2028-01-01'),
            estimatedCostMinCents: 80000, estimatedCostMaxCents: 250000,
            confidence: 'HIGH', why: 'Refrigerator age and condition projection.',
            inventoryItemId: 'fridge-1',
            inventoryItem: {
              name: 'Refrigerator', condition: 'GOOD', installedOn: null, purchasedOn: new Date('2018-01-01'),
              lastServicedOn: null, isVerified: false, updatedAt: NOW,
              warranty: null, linkedWarranties: [], insurancePolicy: null, homeEvents: [],
            },
          },
          {
            id: 'item-2', category: 'APPLIANCE',
            windowStart: new Date('2027-04-01'), windowEnd: new Date('2028-04-01'),
            estimatedCostMinCents: 80000, estimatedCostMaxCents: 250000,
            confidence: 'MEDIUM', why: 'Dishwasher age and fair condition projection.',
            inventoryItemId: 'dishwasher-1',
            inventoryItem: {
              name: 'Dishwasher', condition: 'FAIR', installedOn: null, purchasedOn: new Date('2016-03-01'),
              lastServicedOn: new Date('2025-11-15'), isVerified: true, updatedAt: NOW,
              warranty: { id: 'warranty-1', providerName: 'Acme', expiryDate: new Date('2027-03-01'), updatedAt: NOW },
              linkedWarranties: [],
              insurancePolicy: { id: 'policy-1', carrierName: 'Safe Home', expiryDate: null, isVerified: true, lastVerifiedAt: NOW, updatedAt: NOW },
              homeEvents: [{ id: 'repair-1', type: 'REPAIR', occurredAt: new Date('2025-04-02'), verificationStatus: 'VERIFIED' }],
            },
          },
        ],
      }),
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const actions = result.actions.filter((action) => action.id.startsWith('home-capital-timeline-window'));

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.presentation.subject.label).sort(), ['Dishwasher', 'Refrigerator']);

  const dishwasher = actions.find((action) => action.presentation.subject.id === 'dishwasher-1');
  assert.ok(dishwasher);
  const facts = Object.fromEntries(dishwasher.presentation.factGroups.flatMap((group) => group.facts.map((fact) => [fact.key, fact])));
  assert.equal(facts.age.value, '10 years old · purchased Mar 2016');
  assert.equal(facts.condition.value, 'Fair');
  assert.equal(facts['last-service'].value, 'Nov 2025');
  assert.equal(facts.repairs.value, '1 recorded');
  assert.equal(facts.warranty.value, 'Active · Acme · Mar 2027');
  assert.equal(facts.insurance.value, 'Safe Home policy linked · coverage not confirmed');
  assert.equal(facts.window.value, '2027–2028');
  assert.equal(facts.budget.value, '$800–$2,500');
  assert.match(dishwasher.primaryCta.href, /itemId=dishwasher-1/);
  assert.equal(dishwasher.secondaryCtas[0].label, 'Update item details');
});

test('no HIGH-priority capital timeline items produce no window action', async () => {
  const result = await getPromotedHomeActions('property-1', baseSources({
    homeCapitalTimelineAnalysis: { findFirst: async () => null },
  }));
  assert.equal(result.actions.some((a) => a.id.startsWith('home-capital-timeline-window')), false);
});
