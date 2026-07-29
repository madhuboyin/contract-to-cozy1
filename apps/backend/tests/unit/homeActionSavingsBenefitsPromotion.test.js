const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  getPromotedHomeActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');

function decimal(value) {
  if (value == null) return null;
  return { toNumber: () => value };
}

function emptyDb(overrides = {}) {
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

function match(overrides = {}) {
  return {
    id: 'match-1',
    confidenceLevel: 'HIGH',
    estimatedValueMax: decimal(500),
    estimatedValueMin: null,
    matchReasons: ['Located in New Jersey, where this program applies'],
    firstDetectedAt: new Date('2026-01-01T00:00:00Z'),
    lastEvaluatedAt: new Date('2026-01-02T00:00:00Z'),
    program: {
      name: 'ANCHOR Program',
      regionValue: 'NJ',
      sourceLabel: 'NJ Division of Taxation',
      sourceUrl: 'https://www.nj.gov/treasury/media/anchor/index.shtml',
      lastVerifiedAt: new Date(),
      applicationWindowClosesAt: null,
      currency: 'USD',
      source: {
        status: 'ACTIVE',
        officialUrl: 'https://www.nj.gov/treasury/taxation/relief.shtml',
        lastReviewedAt: new Date(),
        reviewSlaDays: 180,
      },
    },
    ...overrides,
  };
}

test('promotes a HIGH-confidence match with a material value at SOON priority', async () => {
  const db = emptyDb({
    propertyHiddenAssetMatch: { findMany: async () => [match()] },
  });

  const result = await getPromotedHomeActions('property-1', db);
  const savingsActions = result.actions.filter((a) => a.source.kind === 'SAVINGS_BENEFITS');

  assert.equal(savingsActions.length, 1);
  assert.equal(savingsActions[0].priority, 'SOON');
  assert.match(savingsActions[0].whyItMatters, /USD 500/);
  assert.equal(savingsActions[0].governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.ok(savingsActions[0].assumptions.length >= 1, 'material tier requires an assumption');
  assert.ok(savingsActions[0].options.length >= 2, 'material tier requires at least two options');
  assert.ok(savingsActions[0].tradeoffs.length >= 1, 'material tier requires a tradeoff');
});

test('promotes a match with a closing application window at NOW priority', async () => {
  const db = emptyDb({
    propertyHiddenAssetMatch: {
      findMany: async () => [
        match({
          estimatedValueMax: null,
          program: {
            ...match().program,
            applicationWindowClosesAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
        }),
      ],
    },
  });

  const result = await getPromotedHomeActions('property-1', db);
  const savingsActions = result.actions.filter((a) => a.source.kind === 'SAVINGS_BENEFITS');

  assert.equal(savingsActions.length, 1);
  assert.equal(savingsActions[0].priority, 'NOW');
  assert.match(savingsActions[0].signal, /closing soon/);
  assert.ok(savingsActions[0].timing.dueAt, 'a closing window should populate a due date');
});

test('produces no savings-benefits action when there are no qualifying matches', async () => {
  const db = emptyDb({
    propertyHiddenAssetMatch: { findMany: async () => [] },
  });

  const result = await getPromotedHomeActions('property-1', db);
  assert.equal(result.actions.filter((a) => a.source.kind === 'SAVINGS_BENEFITS').length, 0);
});

test('promotes a started canonical action so the homeowner can resume it', async () => {
  const now = new Date();
  const db = emptyDb({
    propertyHiddenAssetMatch: { findMany: async () => [] },
    savingsBenefitAction: {
      findMany: async () => [{
        id: 'action-1',
        actionType: 'PREPARE',
        state: 'STARTED',
        checklistJson: [{ key: 'proof', completedAt: null }],
        startedAt: new Date(now.getTime() - 60_000),
        updatedAt: now,
        followUpAt: null,
        hiddenAssetMatch: {
          program: {
            name: 'Energy rebate',
            regionValue: 'NJ',
            sourceLabel: 'State energy office',
            sourceUrl: 'https://example.gov/rebate',
            lastVerifiedAt: now,
            applicationWindowClosesAt: null,
          },
        },
        homeSavingsOpportunity: null,
      }],
    },
  });

  const result = await getPromotedHomeActions('property-1', db);
  const action = result.actions.find((candidate) => candidate.id === 'savings-benefit-action:action-1');
  assert.ok(action);
  assert.equal(action.state, 'IN_PROGRESS');
  assert.match(action.primaryCta.href, /section=in-progress/);
});

test('suppresses a stale-source match instead of promoting it to Home', async () => {
  const db = emptyDb({
    propertyHiddenAssetMatch: {
      findMany: async () => [
        match({ program: { ...match().program, lastVerifiedAt: null } }),
      ],
    },
  });

  const result = await getPromotedHomeActions('property-1', db);
  const savingsActions = result.actions.filter((a) => a.source.kind === 'SAVINGS_BENEFITS');
  assert.equal(savingsActions.length, 0);
});
