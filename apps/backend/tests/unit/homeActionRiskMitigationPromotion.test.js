const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-24T12:00:00.000Z');

function baseStubs(overrides = {}) {
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

function governedHandoff(overrides = {}) {
  return {
    kind: 'PROVIDER',
    label: 'Find qualified professional help',
    href: '/dashboard/providers?propertyId=property-1&serviceLabel=Sump%20pump%20backup',
    safetyNote: 'Use a properly qualified professional; do not treat this as a DIY task.',
    ...overrides,
  };
}

function planItem(overrides = {}) {
  return {
    id: 'plan-item-1',
    analysisId: 'analysis-1',
    propertyId: 'property-1',
    actionType: 'SUMP_PUMP_OR_BACKUP',
    status: 'RECOMMENDED',
    priority: 'HIGH',
    targetPeril: 'WATER',
    title: 'Install a sump pump backup',
    why: 'This home has repeated water claims and no confirmed sump pump backup.',
    estimatedCost: 850,
    carrierBenefitStatus: 'UNKNOWN',
    carrierReviewQuestion: 'Does installing a battery-backup sump pump qualify for a premium credit?',
    professionalHelpLevel: 'PROFESSIONAL_RECOMMENDED',
    handoffJson: governedHandoff(),
    evidenceDocumentId: null,
    linkedHomeEventId: null,
    completedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function analysis(overrides = {}) {
  return {
    id: 'analysis-1',
    propertyId: 'property-1',
    status: 'READY',
    premiumDrivers: [
      { code: 'WATER_CLAIMS_HISTORY', title: 'Repeated water claims', detail: 'Two water claims in the last 5 years.', severity: 'HIGH', relatedPerils: ['WATER'] },
    ],
    computedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    planItems: [planItem()],
    ...overrides,
  };
}

function stubsWith(analysisRecord) {
  return baseStubs({
    riskPremiumOptimizationAnalysis: {
      findFirst: async ({ include }) => {
        if (!analysisRecord) return null;
        const items = analysisRecord.planItems.filter((item) => item.status === 'RECOMMENDED');
        return { ...analysisRecord, planItems: include?.planItems ? items : undefined };
      },
    },
  });
}

test('a peril-matched, governed RECOMMENDED plan item against a HIGH-severity driver produces a COVERAGE Home Action', async () => {
  const db = stubsWith(analysis());
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'COVERAGE');
  assert.equal(action.id, 'mitigation-plan:plan-item-1');
  assert.equal(action.priority, 'NOW');
  assert.equal(action.primaryCta.kind, 'REVIEW');
  assert.equal(action.primaryCta.href, governedHandoff().href);
  assert.ok(action.whyItMatters.includes('Repeated water claims'));
  assert.ok(action.whyItMatters.includes('carrier'));
  assert.equal(action.evidence.length, 2, 'the matched HIGH driver plus the plan item itself');
  assert.equal(action.governance.professionalBoundary, governedHandoff().safetyNote);
});

test('a plan item with no targetPeril is excluded — it cannot be tied to a specific high-severity driver', async () => {
  const db = stubsWith(analysis({
    planItems: [planItem({ targetPeril: null })],
  }));
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a plan item whose targetPeril has no HIGH-severity driver is excluded', async () => {
  const db = stubsWith(analysis({
    planItems: [planItem({ targetPeril: 'FIRE' })],
  }));
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a MEDIUM-severity driver does not count as "high premium"', async () => {
  const db = stubsWith(analysis({
    premiumDrivers: [{ code: 'WATER_CLAIMS_HISTORY', title: 'Some water risk', detail: 'detail', severity: 'MEDIUM', relatedPerils: ['WATER'] }],
  }));
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a plan item missing governed guidance (e.g. no carrierReviewQuestion) is withheld, matching the optimizer\'s own governance gate', async () => {
  const db = stubsWith(analysis({
    planItems: [planItem({ carrierReviewQuestion: null })],
  }));
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a STALE or ERROR analysis produces no mitigation actions', async () => {
  const stale = await getPromotedHomeActions('property-1', stubsWith(analysis({ status: 'STALE' })), { evaluatedAt: NOW, includePersonalization: false });
  const error = await getPromotedHomeActions('property-1', stubsWith(analysis({ status: 'ERROR' })), { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(stale.actions.length, 0);
  assert.equal(error.actions.length, 0);
});

test('no analysis at all produces no mitigation actions, and no throw', async () => {
  const db = stubsWith(null);
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a db stub without riskPremiumOptimizationAnalysis does not throw and yields no mitigation actions', async () => {
  const db = baseStubs();
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a DIY handoff maps to a START primary CTA', async () => {
  const db = stubsWith(analysis({
    planItems: [planItem({
      professionalHelpLevel: 'DIY_ALLOWED',
      handoffJson: {
        kind: 'DIY',
        label: 'Review DIY safety steps',
        href: '/dashboard/properties/property-1/tools/diy',
        safetyNote: 'Stop and use qualified help if the task exceeds your skills or involves regulated work.',
      },
    })],
  }));
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions[0].primaryCta.kind, 'START');
  assert.equal(actions[0].governance.professionalBoundary, null);
});

// HI-ATT-007 stable-version requirement.
test('sourceVersion is deterministic and changes when the plan item is updated', async () => {
  const first = await getPromotedHomeActions('property-1', stubsWith(analysis()), { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', stubsWith(analysis()), { evaluatedAt: new Date('2026-09-01T00:00:00.000Z'), includePersonalization: false });
  assert.equal(first.actions[0].source.version, second.actions[0].source.version);

  const third = await getPromotedHomeActions('property-1', stubsWith(analysis({
    planItems: [planItem({ updatedAt: new Date('2026-08-15T00:00:00.000Z') })],
  })), { evaluatedAt: NOW, includePersonalization: false });
  assert.notEqual(first.actions[0].source.version, third.actions[0].source.version);
});
