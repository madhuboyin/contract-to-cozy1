const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  aggregateFeedbackQualityByTargetType,
  aggregateCapabilityVersionQuality,
} = require('../../src/services/feedback/feedbackQualityAggregates.service.ts');

test('aggregateFeedbackQualityByTargetType groups by targetType and computes usefulRate from rated rows only', () => {
  const rows = [
    { targetType: 'HOME_ACTION', reasonCodes: ['USEFUL'] },
    { targetType: 'HOME_ACTION', reasonCodes: ['NOT_USEFUL', 'WRONG_FACT'] },
    { targetType: 'HOME_ACTION', reasonCodes: ['NOT_USEFUL', 'ALREADY_HANDLED'] },
    { targetType: 'ASK_EXECUTION', reasonCodes: ['USEFUL'] },
    { targetType: null, reasonCodes: [] },
  ];
  const result = aggregateFeedbackQualityByTargetType(rows);

  const homeAction = result.find((r) => r.targetType === 'HOME_ACTION');
  assert.equal(homeAction.totalCount, 3);
  assert.equal(homeAction.usefulCount, 1);
  assert.equal(homeAction.notUsefulCount, 2);
  assert.equal(homeAction.usefulRate, 1 / 3);
  assert.equal(homeAction.reasonCodeCounts.WRONG_FACT, 1);
  assert.equal(homeAction.reasonCodeCounts.ALREADY_HANDLED, 1);

  const untyped = result.find((r) => r.targetType === 'UNTYPED');
  assert.equal(untyped.totalCount, 1);
  assert.equal(untyped.usefulRate, null);

  const askExecution = result.find((r) => r.targetType === 'ASK_EXECUTION');
  assert.equal(askExecution.usefulRate, 1);
});

test('aggregateFeedbackQualityByTargetType counts safety-sensitive rows separately from the usefulness rate', () => {
  const rows = [
    { targetType: 'HOME_ACTION', reasonCodes: ['NOT_USEFUL', 'UNSAFE_OR_INAPPROPRIATE'] },
    { targetType: 'HOME_ACTION', reasonCodes: ['USEFUL'] },
  ];
  const result = aggregateFeedbackQualityByTargetType(rows);
  const homeAction = result.find((r) => r.targetType === 'HOME_ACTION');
  assert.equal(homeAction.safetySensitiveCount, 1);
  assert.equal(homeAction.usefulRate, 0.5);
});

test('aggregateFeedbackQualityByTargetType sorts by total count descending, then targetType', () => {
  const rows = [
    { targetType: 'ASK_EXECUTION', reasonCodes: ['USEFUL'] },
    { targetType: 'HOME_ACTION', reasonCodes: ['USEFUL'] },
    { targetType: 'HOME_ACTION', reasonCodes: ['NOT_USEFUL'] },
  ];
  const result = aggregateFeedbackQualityByTargetType(rows);
  assert.deepEqual(result.map((r) => r.targetType), ['HOME_ACTION', 'ASK_EXECUTION']);
});

test('aggregateCapabilityVersionQuality reports feedback, conversion, outcome, currentness, evaluation, and cross-surface quality by version', () => {
  const rows = aggregateCapabilityVersionQuality({
    feedback: [
      { targetType: 'HOME_ACTION', targetId: 'action-1', surface: 'HOME', reasonCodes: ['USEFUL'], rating: 'up', capabilityId: 'home-actions', capabilityVersion: 'v2' },
      { targetType: 'HOME_ACTION', targetId: 'action-1', surface: 'ASK', reasonCodes: ['NOT_USEFUL', 'WRONG_FACT'], rating: 'dismissed', capabilityId: 'home-actions', capabilityVersion: 'v2' },
    ],
    workItems: [{ state: 'VERIFIED', acceptanceState: 'ACCEPTED', disposition: null, sourceVersion: 'v2', sources: [{ sourceType: 'HOME_ACTION', sourceVersion: 'v2', active: true }] }],
    outcomes: [
      { sourceType: 'HOME_ACTION', observedPayloadVersion: 'v2', verificationStatus: 'CORROBORATED' },
      { sourceType: 'HOME_ACTION', observedPayloadVersion: 'v2', verificationStatus: 'VERIFIED' },
    ],
    currentness: [{ consumerKey: 'home-actions', consumerVersion: 'v2', status: 'STALE' }],
    evaluations: [{ scenarioId: 'rank-1', category: 'RANKING', capabilityId: 'home-actions', capabilityVersion: 'v2', passed: true, details: 'ok' }],
  });
  const feedback = rows.find((row) => row.capabilityId === 'home-actions' && row.version === 'v2');
  assert.equal(feedback.feedbackCount, 2);
  assert.equal(feedback.usefulRate, 0.5);
  assert.equal(feedback.correctionRate, 0.5);
  assert.equal(feedback.crossSurfaceInconsistencyCount, 1);
  assert.equal(feedback.staleOutputIncidentCount, 1);
  assert.equal(feedback.generatedEvaluationPassRate, 1);

  const work = rows.find((row) => row.capabilityId === 'work:home_action');
  assert.equal(work.completionConversionRate, 1);
  const outcomes = rows.find((row) => row.capabilityId === 'outcome:home_action');
  assert.equal(outcomes.corroboratedOutcomeCount, 1);
  assert.equal(outcomes.verifiedOutcomeRate, 0.5);
});

test('admin feedback-quality route requires authenticate, MFA, ADMIN role, and ANALYTICS_VIEW', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminFeedbackQuality.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/feedback-quality', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\)\)/,
  );
  assert.match(routeSource, /router\.get\('\/admin\/feedback-quality', requireCapability\('ANALYTICS_VIEW'\), getFeedbackQualityHandler\)/);
});

test('the router is registered in src/index.ts', () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../../src/index.ts'), 'utf8');
  assert.match(indexSource, /import adminFeedbackQualityRoutes from '\.\/routes\/adminFeedbackQuality\.routes'/);
  assert.match(indexSource, /app\.use\('\/api', adminFeedbackQualityRoutes\)/);
});
