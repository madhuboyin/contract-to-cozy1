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
    homeTwinComponent: {
      findMany: async () => [{
        projectedFacts: [{
          factState: 'CONFLICTED',
          correctionDestination: '/dashboard/properties/property-1/edit#structure',
        }],
      }],
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-digital-twin-fact-review:property-1');

  assert.ok(action, 'expected a fact-review action');
  assert.equal(action.priority, 'SOON');
  assert.equal(action.primaryCta.kind, 'CORRECT_FACT');
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/edit#structure');
});

test('a non-conflicting default/unknown fact is promoted at CONSIDER priority', async () => {
  const sources = baseSources({
    homeDigitalTwin: { findUnique: async () => ({ id: 'twin-1', updatedAt: NOW }) },
    homeTwinComponent: {
      findMany: async () => [{
        projectedFacts: [{ factState: 'DEFAULT', correctionDestination: '/dashboard/properties/property-1/inventory' }],
      }],
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-digital-twin-fact-review:property-1');

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
    // The real query's `where` already excludes REPORTED/VERIFIED/etc facts
    // (only CONFLICTED/DEFAULT/UNKNOWN are selected) — this stub reflects
    // what Prisma would actually return, not the unfiltered component.
    homeTwinComponent: {
      findMany: async () => [{ projectedFacts: [] }],
    },
  }));
  assert.equal(allClear.actions.some((a) => a.id.startsWith('home-digital-twin-fact-review')), false);
});

test('a HIGH-priority capital timeline item is promoted as a MATERIAL_FINANCIAL PLAN action', async () => {
  const sources = baseSources({
    homeCapitalTimelineAnalysis: {
      findFirst: async () => ({
        id: 'analysis-1',
        computedAt: NOW,
        items: [{
          id: 'item-1',
          category: 'ROOF',
          windowStart: new Date('2027-06-01'),
          windowEnd: new Date('2028-06-01'),
          estimatedCostMinCents: 900000,
          estimatedCostMaxCents: 1400000,
          confidence: 'HIGH',
          why: 'Roof is estimated at ~24.0 years old.',
        }],
      }),
    },
  });

  const result = await getPromotedHomeActions('property-1', sources);
  const action = result.actions.find((a) => a.id === 'home-capital-timeline-window:item-1');

  assert.ok(action, 'expected a capital timeline window action');
  assert.equal(action.priority, 'PLAN');
  assert.equal(action.job, 'MAJOR_MOMENT');
  assert.equal(action.governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/tools/capital-timeline');
  assert.match(action.expectedOutcome, /\$9,000.*\$14,000/);
});

test('no HIGH-priority capital timeline items produce no window action', async () => {
  const result = await getPromotedHomeActions('property-1', baseSources({
    homeCapitalTimelineAnalysis: { findFirst: async () => null },
  }));
  assert.equal(result.actions.some((a) => a.id.startsWith('home-capital-timeline-window')), false);
});
