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
} = require('../../src/productFramework/index.ts');
const { goldenTestHomes, NOW, NEXT_MONTH } = require('../fixtures/productFramework/goldenTestHomes.js');

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
    actionWindowClosesAt: NEXT_MONTH,
    resolution: {
      disposition: 'COMPLETED', resolvedAt: NEXT_MONTH, reason: 'Work verified complete',
      consequenceAcknowledged: true, nextTriggerAt: null, unresolvedSafetyRequirement: false,
      verificationStatus: 'VERIFIED',
    },
  });
  assert.deepEqual(evaluation, {
    important: true,
    identifiedEarly: true,
    successfullyResolved: true,
    eligibleForNumerator: true,
    reasons: [],
  });
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
