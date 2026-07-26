const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  evaluateRadarNotificationPolicy,
  isRadarQuietHours,
  radarQuietHoursEnd,
  RADAR_NOTIFICATION_POLICY_VERSION,
} = require('../../src/modules/homeEventRadar/domain/radarNotificationPolicy.ts');
const {
  RadarNotificationDecisionService,
} = require('../../src/modules/homeEventRadar/services/radarNotificationDecision.service.ts');

const evaluatedAt = new Date('2026-07-26T16:00:00.000Z');

function preference(overrides = {}) {
  return {
    propertyId: 'property-1',
    userId: 'user-1',
    isEnabled: true,
    enabledCategories: ['weather', 'air_quality', 'disaster', 'utility', 'tax', 'insurance', 'other'],
    channels: ['in_app', 'email', 'push'],
    minimumSeverity: 'moderate',
    minimumImpact: 'moderate',
    deliveryMode: 'immediate',
    criticalSafetyOverrideEnabled: false,
    quietHours: null,
    timezone: 'America/New_York',
    persisted: true,
    updatedAt: '2026-07-26T12:00:00.000Z',
    ...overrides,
  };
}

function policy(overrides = {}) {
  return evaluateRadarNotificationPolicy({
    preference: preference(),
    availableChannels: ['in_app', 'email', 'push'],
    event: {
      sourceFamily: 'weather',
      severity: 'high',
      impact: 'high',
      confidence: 'high',
      lifecycleStatus: 'active',
      effectiveAt: '2026-07-26T15:00:00.000Z',
      expiresAt: '2026-07-26T20:00:00.000Z',
      providerUrgency: 'immediate',
      certainty: 'observed',
      isSynthetic: false,
    },
    isInitialMatch: true,
    isMaterialRevision: false,
    previousDecision: null,
    evaluatedAt,
    ...overrides,
  });
}

test('initial qualifying match is immediately eligible on available preferred channels', () => {
  const decision = policy();
  assert.equal(decision.policyVersion, RADAR_NOTIFICATION_POLICY_VERSION);
  assert.equal(decision.outcome, 'immediate');
  assert.deepEqual(decision.reasonCodes, ['ELIGIBLE_INITIAL_MATCH', 'USER_IMMEDIATE_MODE']);
  assert.deepEqual(decision.eligibleChannels, ['in_app', 'email', 'push']);
});

test('non-material revisions and non-escalating material revisions do not re-alert', () => {
  assert.equal(policy({
    isInitialMatch: false,
    isMaterialRevision: false,
  }).reasonCodes[0], 'NOT_MATERIAL_REVISION');

  const noEscalation = policy({
    isInitialMatch: false,
    isMaterialRevision: true,
    previousDecision: {
      outcome: 'immediate',
      severity: 'high',
      impact: 'high',
      timing: 'active',
    },
  });
  assert.equal(noEscalation.outcome, 'suppressed');
  assert.deepEqual(noEscalation.reasonCodes, ['NO_MATERIAL_ESCALATION']);
});

test('material severity, impact, or timing escalation can notify exactly once per revision', () => {
  const decision = policy({
    isInitialMatch: false,
    isMaterialRevision: true,
    previousDecision: {
      outcome: 'immediate',
      severity: 'moderate',
      impact: 'moderate',
      timing: 'future',
    },
  });
  assert.equal(decision.outcome, 'immediate');
  assert.equal(decision.reasonCodes[0], 'ELIGIBLE_MATERIAL_ESCALATION');
});

test('terminal updates are non-interruptive and low confidence fails closed', () => {
  assert.deepEqual(policy({
    event: {
      ...policyEvent(),
      lifecycleStatus: 'resolved',
    },
  }).reasonCodes, ['TERMINAL_NON_INTERRUPTIVE']);
  assert.deepEqual(policy({
    event: {
      ...policyEvent(),
      confidence: 'low',
    },
  }).reasonCodes, ['CONFIDENCE_BELOW_FLOOR']);
});

function policyEvent() {
  return {
    sourceFamily: 'weather',
    severity: 'high',
    impact: 'high',
    confidence: 'high',
    lifecycleStatus: 'active',
    effectiveAt: '2026-07-26T15:00:00.000Z',
    expiresAt: '2026-07-26T20:00:00.000Z',
    providerUrgency: 'immediate',
    certainty: 'observed',
    isSynthetic: false,
  };
}

test('preference thresholds, category selection, and channel availability are enforced', () => {
  assert.deepEqual(policy({
    preference: preference({ isEnabled: false }),
  }).reasonCodes, ['PREFERENCES_DISABLED']);
  assert.deepEqual(policy({
    preference: preference({ enabledCategories: ['utility'] }),
  }).reasonCodes, ['CATEGORY_DISABLED']);
  assert.deepEqual(policy({
    preference: preference({ minimumSeverity: 'extreme' }),
  }).reasonCodes, ['BELOW_MINIMUM_SEVERITY']);
  assert.deepEqual(policy({
    preference: preference({ minimumImpact: 'critical' }),
  }).reasonCodes, ['BELOW_MINIMUM_IMPACT']);
  assert.deepEqual(policy({
    preference: preference({ channels: ['email'] }),
    availableChannels: ['in_app'],
  }).reasonCodes, ['CHANNEL_UNAVAILABLE']);
});

test('digest mode and far-future events are digest eligible', () => {
  assert.equal(policy({
    preference: preference({ deliveryMode: 'digest' }),
  }).outcome, 'digest');
  const future = policy({
    event: {
      ...policyEvent(),
      effectiveAt: '2026-07-29T16:00:00.000Z',
      expiresAt: '2026-07-30T16:00:00.000Z',
    },
  });
  assert.equal(future.outcome, 'digest');
  assert.equal(future.reasonCodes[1], 'FUTURE_EVENT_DIGEST');
});

test('quiet hours defer immediate decisions to the first local minute outside the window', () => {
  const quietEvaluation = new Date('2026-01-15T04:00:00.000Z');
  assert.equal(
    isRadarQuietHours(quietEvaluation, 'America/New_York', '22:00', '07:00'),
    true,
  );
  assert.equal(
    radarQuietHoursEnd(
      quietEvaluation,
      'America/New_York',
      '22:00',
      '07:00',
    ).toISOString(),
    '2026-01-15T12:00:00.000Z',
  );
  const decision = policy({
    preference: preference({ quietHours: { start: '22:00', end: '07:00' } }),
    evaluatedAt: quietEvaluation,
    event: {
      ...policyEvent(),
      effectiveAt: '2026-01-15T03:00:00.000Z',
      expiresAt: '2026-01-15T15:00:00.000Z',
    },
  });
  assert.equal(decision.outcome, 'deferred');
  assert.equal(decision.deferredUntil.toISOString(), '2026-01-15T12:00:00.000Z');
});

test('only opted-in reviewed extreme safety evidence can override quiet hours', () => {
  const quietEvaluation = new Date('2026-01-15T04:00:00.000Z');
  const decision = policy({
    preference: preference({
      quietHours: { start: '22:00', end: '07:00' },
      criticalSafetyOverrideEnabled: true,
    }),
    evaluatedAt: quietEvaluation,
    event: {
      ...policyEvent(),
      severity: 'extreme',
      confidence: 'verified',
      effectiveAt: '2026-01-15T03:00:00.000Z',
      expiresAt: '2026-01-15T15:00:00.000Z',
    },
  });
  assert.equal(decision.outcome, 'immediate');
  assert.equal(decision.criticalOverrideApplied, true);
  assert.equal(decision.reasonCodes[1], 'CRITICAL_SAFETY_OVERRIDE');

  const unobserved = policy({
    preference: preference({
      quietHours: { start: '22:00', end: '07:00' },
      criticalSafetyOverrideEnabled: true,
    }),
    evaluatedAt: quietEvaluation,
    event: {
      ...policyEvent(),
      severity: 'extreme',
      confidence: 'verified',
      certainty: 'likely',
      effectiveAt: '2026-01-15T03:00:00.000Z',
      expiresAt: '2026-01-15T15:00:00.000Z',
    },
  });
  assert.equal(unobserved.outcome, 'deferred');
  assert.equal(unobserved.criticalOverrideApplied, false);
});

test('test and synthetic sources are always suppressed before delivery policy', () => {
  const decision = policy({
    event: { ...policyEvent(), isSynthetic: true },
  });
  assert.equal(decision.outcome, 'suppressed');
  assert.deepEqual(decision.reasonCodes, ['TEST_OR_SYNTHETIC_SOURCE']);
});

test('decision persistence is idempotent on match, immutable revision, and user', async () => {
  const decisions = [];
  const materializations = [];
  const db = {
    property: {
      findUnique: async () => ({
        timezone: 'America/New_York',
        homeownerProfile: {
          user: {
            id: 'user-1',
            status: 'ACTIVE',
            emailVerified: true,
            pushSubscriptions: [{ id: 'push-1' }],
          },
        },
        householdMembers: [],
      }),
    },
    propertyRadarNotificationPreference: {
      findMany: async () => [],
    },
    propertyRadarNotificationDecision: {
      findMany: async ({ where }) => {
        if (typeof where.radarEventRevisionId === 'string') {
          return decisions.filter((decision) =>
            decision.radarEventRevisionId === where.radarEventRevisionId
          );
        }
        return decisions.filter((decision) =>
          decision.radarEventRevisionId !== where.radarEventRevisionId.not
        );
      },
      upsert: async ({ create }) => {
        const row = { id: `decision-${decisions.length + 1}`, ...create };
        decisions.push(row);
        return row;
      },
    },
  };
  const service = new RadarNotificationDecisionService(
    db,
    { NODE_ENV: 'production' },
    {
      materialize: async (input) => {
        materializations.push(input);
      },
    },
  );
  const input = {
    propertyId: 'property-1',
    match: {
      id: 'match-1',
      impactLevel: 'high',
      confidence: 'verified',
      lifecycleStatus: 'now',
    },
    event: {
      id: 'event-1',
      status: 'active',
      startAt: new Date('2026-07-26T15:00:00.000Z'),
      endAt: new Date('2026-07-26T20:00:00.000Z'),
      severity: 'high',
      sourceDefinition: {
        key: 'nws-active-alerts',
        family: 'weather',
        environments: ['production'],
      },
    },
    revision: {
      id: 'revision-1',
      normalizedJson: {
        sourceFamily: 'weather',
        severity: 'high',
        lifecycleStatus: 'active',
        effectiveAt: '2026-07-26T15:00:00.000Z',
        expiresAt: '2026-07-26T20:00:00.000Z',
        providerUrgency: 'immediate',
        certainty: 'observed',
      },
    },
    isInitialMatch: true,
    isMaterialRevision: false,
    evaluatedAt,
  };

  const first = await service.evaluateMatch(input);
  const replay = await service.evaluateMatch(input);
  assert.deepEqual(first, {
    evaluated: 1,
    created: 1,
    deduped: 0,
    eligible: 1,
    suppressed: 0,
  });
  assert.deepEqual(replay, {
    evaluated: 1,
    created: 0,
    deduped: 1,
    eligible: 1,
    suppressed: 0,
  });
  assert.equal(decisions.length, 1);
  assert.equal(materializations.length, 2);
  assert.equal(materializations[0].decision.id, decisions[0].id);
  assert.equal(decisions[0].policyVersion, RADAR_NOTIFICATION_POLICY_VERSION);
});

test('matcher evaluates durable decisions for active, terminal, and inapplicable revisions', () => {
  const matcher = fs.readFileSync(path.resolve(
    __dirname,
    '../../src/services/homeEventRadarMatcher.service.ts',
  ), 'utf8');
  assert.equal(
    [...matcher.matchAll(/radarNotificationDecisionService\.evaluateMatch\(/g)].length,
    3,
  );
  assert.doesNotMatch(matcher, /notificationService|notification\.create/);
});
