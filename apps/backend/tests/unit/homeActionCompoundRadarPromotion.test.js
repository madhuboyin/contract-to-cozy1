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

function baseInsightRow(overrides = {}) {
  return {
    id: 'insight-1',
    propertyId: 'property-1',
    ruleCode: 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP',
    ruleVersion: 'compound-v1',
    correlationKey: 'corr-key-1',
    status: 'active',
    title: 'Rain and outage may affect sump protection',
    summary: 'Heavy rain and a utility outage overlap, and this home has a sump pump with no recorded backup.',
    sourceMatchIdsJson: ['match-1', 'match-2'],
    sourceEventIdsJson: ['event-1', 'event-2'],
    sourceEvidenceJson: [
      {
        eventId: 'event-1',
        eventType: 'heavy_rain',
        eventSubType: null,
        severity: 'high',
        effectiveAt: '2026-08-24T10:00:00.000Z',
        expiresAt: '2026-08-25T10:00:00.000Z',
        sourceName: 'National Weather Service',
        provider: 'NWS',
      },
      {
        eventId: 'event-2',
        eventType: 'utility_outage',
        eventSubType: null,
        severity: 'medium',
        effectiveAt: '2026-08-24T11:00:00.000Z',
        expiresAt: '2026-08-25T02:00:00.000Z',
        sourceName: 'Utility Outage Feed',
        provider: 'Utility',
      },
    ],
    factEvidenceJson: [
      { factKey: 'property.hasSumpPump', state: 'confirmed', value: true },
      { factKey: 'property.hasSumpPumpBackup', state: 'absent', value: false },
    ],
    recommendedActionsJson: {
      actions: [
        { code: 'INSPECT_SUMP_PUMP', label: 'Test the sump pump and backup plan before power is interrupted.', priority: 'high' },
      ],
    },
    evaluatedAt: new Date('2026-08-24T11:30:00.000Z'),
    resolvedAt: null,
    createdAt: new Date('2026-08-24T11:30:00.000Z'),
    updatedAt: new Date('2026-08-24T11:30:00.000Z'),
    ...overrides,
  };
}

test('an active compound insight produces a SYSTEM Home Action grounded in its evidence', async () => {
  const db = baseStubs({
    propertyRadarCompoundInsight: { findMany: async () => [baseInsightRow()] },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.id, 'compound-radar:corr-key-1');
  assert.equal(action.lineageId, 'compound-radar:corr-key-1');
  assert.equal(action.signal, 'Rain and outage may affect sump protection');
  assert.equal(action.priority, 'NOW');
  assert.equal(action.governance.safetyTier, 'LOW_CONSEQUENCE');
  assert.equal(action.feedbackControls.includes('ACKNOWLEDGE'), true);
  assert.equal(action.feedbackControls.includes('COMPLETE'), false);
  assert.equal(action.evidence.length, 4, 'two Home Event evidences plus two Property Fact evidences');
  assert.ok(action.evidence.some((entry) => entry.type === 'HOME_EVENT' && entry.label.includes('heavy_rain')));
  assert.ok(action.evidence.some((entry) => entry.type === 'PROPERTY_FACT' && entry.label === 'property.hasSumpPumpBackup'));
  assert.equal(action.primaryCta.href, '/dashboard/home-event-radar?propertyId=property-1');
  assert.equal(action.confidence.missing.length, 0);
});

test('no active compound insights produce no actions', async () => {
  const db = baseStubs({ propertyRadarCompoundInsight: { findMany: async () => [] } });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('a db stub without the propertyRadarCompoundInsight table does not throw and yields no compound actions', async () => {
  const db = baseStubs();
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(actions.length, 0);
});

test('an unknown constituent fact lowers confidence and populates the missing list', async () => {
  const db = baseStubs({
    propertyRadarCompoundInsight: {
      findMany: async () => [baseInsightRow({
        factEvidenceJson: [
          { factKey: 'property.hasSumpPump', state: 'confirmed', value: true },
          { factKey: 'property.hasSumpPumpBackup', state: 'unknown', value: null },
        ],
      })],
    },
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].confidence.label, 'MEDIUM');
  assert.deepEqual(actions[0].confidence.missing, ['property.hasSumpPumpBackup']);
});

test('recommended-action priority maps to Home Action priority (medium -> SOON, low -> PLAN)', async () => {
  const mediumDb = baseStubs({
    propertyRadarCompoundInsight: {
      findMany: async () => [baseInsightRow({
        correlationKey: 'corr-key-medium',
        recommendedActionsJson: { actions: [{ code: 'X', label: 'Check the filter.', priority: 'medium' }] },
      })],
    },
  });
  const mediumResult = await getPromotedHomeActions('property-1', mediumDb, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(mediumResult.actions[0].priority, 'SOON');

  const lowDb = baseStubs({
    propertyRadarCompoundInsight: {
      findMany: async () => [baseInsightRow({
        correlationKey: 'corr-key-low',
        recommendedActionsJson: { actions: [{ code: 'X', label: 'Note for later.', priority: 'low' }] },
      })],
    },
  });
  const lowResult = await getPromotedHomeActions('property-1', lowDb, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(lowResult.actions[0].priority, 'PLAN');
});

// HI-ATT-007 stable-version requirement: two evaluations of the same
// reconciled insight row must converge on the same sourceVersion so
// unrelated recomputation runs don't manufacture a spurious change.
test('sourceVersion is deterministic for identical insight rows and changes when the insight is re-evaluated', async () => {
  const row = baseInsightRow();
  const same = await getPromotedHomeActions('property-1', baseStubs({
    propertyRadarCompoundInsight: { findMany: async () => [row] },
  }), { evaluatedAt: NOW, includePersonalization: false });
  const again = await getPromotedHomeActions('property-1', baseStubs({
    propertyRadarCompoundInsight: { findMany: async () => [row] },
  }), { evaluatedAt: new Date('2026-08-25T00:00:00.000Z'), includePersonalization: false });
  assert.equal(same.actions[0].source.version, again.actions[0].source.version);

  const reEvaluated = await getPromotedHomeActions('property-1', baseStubs({
    propertyRadarCompoundInsight: {
      findMany: async () => [baseInsightRow({ evaluatedAt: new Date('2026-08-25T09:00:00.000Z') })],
    },
  }), { evaluatedAt: NOW, includePersonalization: false });
  assert.notEqual(same.actions[0].source.version, reEvaluated.actions[0].source.version);
});
