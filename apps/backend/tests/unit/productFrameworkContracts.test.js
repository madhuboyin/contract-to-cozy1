const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  HomeActionSchema,
  HomeownerEntryContextSchema,
  RecommendationGovernanceSchema,
  evaluateNorthStarAction,
  aggregateNorthStarMetric,
  NORTH_STAR_METRIC_DEFINITION,
  adaptHomeActionSource,
  HOME_ACTION_SOURCE_ADAPTERS,
  evaluateRecommendationLaunchReadiness,
} = require('../../src/productFramework/index.ts');
const { buildNorthStarAnalyticsEvent } = require('../../src/services/analytics/northStarLineage.ts');
const { aggregateNorthStarEvents } = require('../../src/services/analytics/northStarMetric.service.ts');
const { goldenTestHomes, NOW, NEXT_MONTH } = require('../fixtures/productFramework/goldenTestHomes.js');
const { SOURCE_KINDS, sourceAdapterFixtures } = require('../fixtures/productFramework/sourceAdapterFixtures.js');

test('all seven framework golden homes satisfy entry and action contracts', () => {
  assert.equal(goldenTestHomes.length, 7);
  for (const fixture of goldenTestHomes) {
    assert.doesNotThrow(() => HomeownerEntryContextSchema.parse(fixture.entryContext), fixture.name);
    assert.doesNotThrow(() => HomeActionSchema.parse(fixture.action), fixture.name);
  }
});

test('entry context keeps tenure, property origin, entry path, and trigger orthogonal', () => {
  const buyer = goldenTestHomes.find((fixture) => fixture.id === 'existing-home-buyer').entryContext;
  const newHome = goldenTestHomes.find((fixture) => fixture.id === 'new-construction').entryContext;

  assert.equal(buyer.entryPath, 'EXISTING_HOME_PURCHASE');
  assert.equal(buyer.propertyOrigin, 'EXISTING_HOME');
  assert.equal(newHome.entryPath, 'NEW_HOME_SETUP');
  assert.equal(newHome.propertyOrigin, 'NEW_CONSTRUCTION');
});

test('new-home entry path rejects a non-new-construction origin', () => {
  const fixture = structuredClone(goldenTestHomes.find((item) => item.id === 'new-construction').entryContext);
  fixture.propertyOrigin = 'EXISTING_HOME';
  const result = HomeownerEntryContextSchema.safeParse(fixture);
  assert.equal(result.success, false);
});

test('material recommendations require assumptions, options, and tradeoffs', () => {
  const fixture = structuredClone(goldenTestHomes.find((item) => item.id === 'existing-repair').action);
  fixture.assumptions = [];
  fixture.options = [];
  fixture.tradeoffs = [];
  const result = HomeActionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  const messages = result.error.issues.map((issue) => issue.message).join(' ');
  assert.match(messages, /assumption/i);
  assert.match(messages, /options/i);
  assert.match(messages, /tradeoffs/i);
});

test('commercial CTA requires a recorded disclosure and non-commercial alternative', () => {
  const fixture = structuredClone(goldenTestHomes.find((item) => item.id === 'contractor-quote').action);
  fixture.governance.commercialDisclosure.relationshipType = 'NOT_RECORDED';
  fixture.governance.commercialDisclosure.nonCommercialAlternatives = [];
  const result = HomeActionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /commercial|alternative/i);
});

test('safety recommendation requires conservative fallback, escalation copy, and escalation CTA', () => {
  const fixture = structuredClone(goldenTestHomes.find((item) => item.id === 'safety-emergency').action);
  fixture.governance.conservativeFallback = null;
  fixture.governance.emergencyEscalation = null;
  fixture.primaryCta.kind = 'REVIEW';
  const result = HomeActionSchema.safeParse(fixture);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /fallback|escalation/i);
});

test('regulated guidance cannot launch without jurisdiction and professional controls', () => {
  const governance = structuredClone(goldenTestHomes[0].action.governance);
  governance.safetyTier = 'REGULATED_COVERAGE';
  governance.professionalBoundary = null;
  governance.jurisdictionCheck.status = 'UNKNOWN';
  const result = RecommendationGovernanceSchema.safeParse(governance);
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((issue) => issue.message).join(' '), /professional|jurisdiction/i);
});

test('north-star evaluation counts verified completion identified inside the action window', () => {
  const evaluation = evaluateNorthStarAction({
    lineage: {
      entryId: 'entry-1', triggerId: 'trigger-1', signalId: 'signal-1', actionId: 'action-1',
      recommendationVersion: 'v1', journeyId: 'journey-1', decisionId: 'decision-1',
      executionId: 'execution-1', verificationId: 'verification-1', outcomeId: 'outcome-1',
    },
    importantReasons: ['MATERIAL_FINANCIAL_CONSEQUENCE'],
    identifiedAt: NOW,
    surfacedAt: NOW,
    actionWindowClosesAt: NEXT_MONTH,
    resolution: {
      disposition: 'COMPLETED', resolvedAt: NEXT_MONTH, reason: 'Work verified complete',
      consequenceAcknowledged: true, nextTriggerAt: null, unresolvedSafetyRequirement: false,
      verificationStatus: 'VERIFIED',
    },
  });
  assert.deepEqual(evaluation, {
    important: true,
    eligibleForDenominator: true,
    identifiedEarly: true,
    successfullyResolved: true,
    eligibleForNumerator: true,
    reasons: [],
  });
});

test('every declared production action source has a validating canonical adapter fixture', () => {
  assert.deepEqual(Object.keys(HOME_ACTION_SOURCE_ADAPTERS).sort(), [...SOURCE_KINDS].sort());
  for (const fixture of sourceAdapterFixtures) {
    const action = adaptHomeActionSource(fixture.sourceKind, fixture.input);
    assert.equal(action.source.kind, fixture.sourceKind);
    assert.equal(action.source.version, 'phase0-v1');
    assert.doesNotThrow(() => HomeActionSchema.parse(action));
  }
});

test('north-star metric declares owners and aggregates an explicit eligible denominator', () => {
  const eligibleSuccess = {
    lineage: {
      entryId: 'entry-success', triggerId: 'trigger-success', signalId: null, actionId: 'action-success',
      recommendationVersion: 'v1', journeyId: null, decisionId: null,
      executionId: 'execution-success', verificationId: 'verification-success', outcomeId: 'outcome-success',
    },
    importantReasons: ['REVIEWED_DOMAIN_RULE'],
    identifiedAt: NOW,
    surfacedAt: NOW,
    actionWindowClosesAt: NEXT_MONTH,
    resolution: {
      disposition: 'COMPLETED', resolvedAt: NEXT_MONTH, reason: 'Verified',
      consequenceAcknowledged: true, nextTriggerAt: null, unresolvedSafetyRequirement: false,
      verificationStatus: 'VERIFIED',
    },
  };
  const excluded = structuredClone(eligibleSuccess);
  excluded.lineage.actionId = 'action-excluded';
  excluded.eligibility = { status: 'INELIGIBLE', reason: 'Synthetic QA record' };
  const surfacedLate = structuredClone(eligibleSuccess);
  surfacedLate.lineage.actionId = 'action-surfaced-late';
  surfacedLate.surfacedAt = '2026-09-18T12:00:00.000Z';

  assert.equal(NORTH_STAR_METRIC_DEFINITION.dataOwner, 'Product Analytics');
  assert.equal(NORTH_STAR_METRIC_DEFINITION.businessOwner, 'Homeowner Product');
  assert.deepEqual(aggregateNorthStarMetric([eligibleSuccess, excluded, surfacedLate]), {
    metricId: NORTH_STAR_METRIC_DEFINITION.id,
    numerator: 1,
    denominator: 2,
    percentage: 50,
    excluded: 1,
  });
});

test('typed runtime lineage enforces stage requirements and produces analytics metadata', () => {
  const base = {
    propertyId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    source: 'contract_test',
    entryId: 'entry-1',
    triggerId: 'trigger-1',
    actionId: 'action-1',
    recommendationVersion: 'phase0-v1',
  };
  const event = buildNorthStarAnalyticsEvent({ ...base, eventType: 'HOME_ACTION_SURFACED' });
  assert.equal(event.eventType, 'HOME_ACTION_SURFACED');
  assert.equal(event.metadataJson.lineageStage, 4);
  assert.equal(event.metadataJson.actionId, 'action-1');
  assert.throws(
    () => buildNorthStarAnalyticsEvent({ ...base, eventType: 'HOME_ACTION_OUTCOME_VERIFIED' }),
    /verificationId|outcomeId|verificationStatus/,
  );
});

test('event-backed north-star reporting joins identified, surfaced, and verified lineage', () => {
  const propertyId = '11111111-1111-4111-8111-111111111111';
  const metadata = {
    actionId: 'action-1',
    recommendationVersion: 'phase0-v1',
    importantReasons: ['MATERIAL_FINANCIAL_CONSEQUENCE'],
    actionWindowClosesAt: NEXT_MONTH,
  };
  const rows = [
    { eventType: 'HOME_ACTION_IDENTIFIED', propertyId, occurredAt: new Date(NOW), metadataJson: metadata },
    { eventType: 'HOME_ACTION_SURFACED', propertyId, occurredAt: new Date(NOW), metadataJson: metadata },
    {
      eventType: 'HOME_ACTION_OUTCOME_VERIFIED', propertyId, occurredAt: new Date(NEXT_MONTH),
      metadataJson: { ...metadata, verificationStatus: 'VERIFIED' },
    },
  ];
  const report = aggregateNorthStarEvents(
    rows,
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-09-01T00:00:00.000Z'),
  );
  assert.equal(report.numerator, 1);
  assert.equal(report.denominator, 1);
  assert.equal(report.percentage, 100);
  assert.equal(report.dataOwner, 'Product Analytics');
});

test('launch gate requires tier-specific and commercial approvals for the active policy version', () => {
  const governance = structuredClone(goldenTestHomes.find((item) => item.id === 'contractor-quote').action.governance);
  const blocked = evaluateRecommendationLaunchReadiness(governance, []);
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.missingRoles, ['PRODUCT', 'DOMAIN', 'TRUST', 'COMMERCIAL_INTEGRITY']);

  const approvals = blocked.requiredRoles.map((role) => ({
    role,
    reviewerId: `reviewer-${role.toLowerCase()}`,
    approvedAt: NOW,
    policyVersion: governance.policyVersion,
    notes: null,
  }));
  assert.equal(evaluateRecommendationLaunchReadiness(governance, approvals).ready, true);
});

test('unsafe deferment does not count as a successful resolution', () => {
  const evaluation = evaluateNorthStarAction({
    lineage: {
      entryId: 'entry-2', triggerId: 'trigger-2', signalId: null, actionId: 'action-2',
      recommendationVersion: 'v1', journeyId: null, decisionId: null,
      executionId: null, verificationId: null, outcomeId: null,
    },
    importantReasons: ['SAFETY_OR_ACTIVE_DAMAGE'],
    identifiedAt: NOW,
    surfacedAt: NOW,
    actionWindowClosesAt: NEXT_MONTH,
    resolution: {
      disposition: 'INTENTIONALLY_DEFERRED', resolvedAt: NOW, reason: 'Wait until later',
      consequenceAcknowledged: true, nextTriggerAt: NEXT_MONTH, unresolvedSafetyRequirement: true,
      verificationStatus: 'PENDING',
    },
  });
  assert.equal(evaluation.successfullyResolved, false);
  assert.equal(evaluation.eligibleForNumerator, false);
  assert.deepEqual(evaluation.reasons, ['DEFERMENT_MISSING_SAFE_FOLLOW_UP']);
});

test('Prisma taxonomy contains the complete north-star lineage without a migration script requirement', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  for (const event of [
    'ENTRY_CONTEXT_CAPTURED',
    'ACTIVE_TRIGGER_IDENTIFIED',
    'HOME_ACTION_IDENTIFIED',
    'HOME_ACTION_SURFACED',
    'HOME_ACTION_RESOLUTION_RECORDED',
    'HOME_ACTION_OUTCOME_VERIFIED',
  ]) {
    assert.match(schema, new RegExp(`\\b${event}\\b`));
  }
});
