// apps/backend/tests/unit/providerCredentialLapseIncident.test.js
//
// W3 (provider compliance): two real gaps found and fixed in the booking-risk
// path (ProviderCredentialLapseAdapter -> Incident pipeline):
//
// 1. PROVIDER_CREDENTIAL_EXPIRY wasn't in evaluateIncident's
//    hasExternalAuthoritativeSignal allowlist, so a fresh booking-risk
//    incident scored confidence 40 (< the 45 activation threshold) on
//    first detection — the homeowner silently got no notification until a
//    second signal accumulated a day+ later.
// 2. The adapter's severityScore hint gets discarded by evaluateIncident's
//    generic computeSeverity(), which reads timeWindowHours from
//    `details` — the adapter never populated it, so every booking-risk
//    incident scored the same lowest urgency bucket regardless of whether
//    expiry was in 1 day or 29 days.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { computeConfidence, computeSeverity } = require('../../src/services/incidents/incident.scoring.ts');

test('computeConfidence: PROVIDER_CREDENTIAL_EXPIRY as the sole fresh signal now crosses the activation threshold', () => {
  const AUTO_ACTIVATE_MIN_CONFIDENCE = 45;

  const withoutAuthoritativeFlag = computeConfidence({
    probabilityPct: null,
    hasMultipleSignals: false,
    hasExternalAuthoritativeSignal: false,
    signalAgeMinutes: 5,
  });
  const withAuthoritativeFlag = computeConfidence({
    probabilityPct: null,
    hasMultipleSignals: false,
    hasExternalAuthoritativeSignal: true,
    signalAgeMinutes: 5,
  });

  assert.ok(withoutAuthoritativeFlag < AUTO_ACTIVATE_MIN_CONFIDENCE, 'regression baseline: this is the bug that was fixed');
  assert.ok(withAuthoritativeFlag >= AUTO_ACTIVATE_MIN_CONFIDENCE, 'fix: a fresh, sole, authoritative signal now activates immediately');
});

test('computeSeverity: an imminent expiry now scores a higher time-sensitivity bucket than a distant one', () => {
  const imminent = computeSeverity({ typeKey: 'PROVIDER_CREDENTIAL_LAPSE', timeWindowHours: 2 * 24 }); // 2 days
  const distant = computeSeverity({ typeKey: 'PROVIDER_CREDENTIAL_LAPSE', timeWindowHours: 29 * 24 }); // 29 days
  const unset = computeSeverity({ typeKey: 'PROVIDER_CREDENTIAL_LAPSE' }); // regression baseline: the old default

  assert.equal(imminent.breakdown.timeSensitivity, 20);
  assert.equal(distant.breakdown.timeSensitivity, 15);
  assert.ok(
    imminent.breakdown.total > distant.breakdown.total,
    'a 2-day expiry must score higher than a 29-day expiry',
  );
  assert.equal(unset.breakdown.timeSensitivity, 5, 'regression baseline: unset timeWindowHours defaulted to the lowest bucket');
});

function loadEvaluator({ incident }) {
  const updateCalls = [];
  const snapshotCalls = [];
  const notifyCalls = [];

  const prismaMock = {
    incident: {
      findUnique: async () => incident,
      update: async (args) => {
        updateCalls.push(args);
        return { ...incident, ...args.data };
      },
    },
    incidentScoreSnapshot: {
      create: async (args) => {
        snapshotCalls.push(args);
        return { id: 'snapshot-1' };
      },
    },
    incidentEvent: {
      create: async () => ({ id: 'event-1' }),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const notificationIntegrationPath = require.resolve('../../src/services/incidents/integrations/incidentNotification.service.ts');
  require.cache[notificationIntegrationPath] = {
    id: notificationIntegrationPath,
    filename: notificationIntegrationPath,
    loaded: true,
    exports: {
      IncidentNotificationService: {
        notifyIncidentActivated: async (args) => {
          notifyCalls.push(args);
        },
      },
    },
  };

  const evaluatorPath = require.resolve('../../src/services/incidents/incident.evaluator.ts');
  delete require.cache[evaluatorPath];
  return {
    evaluateIncident: require(evaluatorPath).evaluateIncident,
    getUpdateCalls: () => updateCalls,
    getNotifyCalls: () => notifyCalls,
  };
}

function freshBookingRiskIncident(overrides = {}) {
  const now = new Date();
  return {
    id: 'incident-1',
    propertyId: 'property-1',
    userId: 'homeowner-1',
    sourceType: 'SYSTEM',
    typeKey: 'PROVIDER_CREDENTIAL_LAPSE',
    status: 'DETECTED',
    isSuppressed: false,
    activatedAt: null,
    details: {
      bookingId: 'booking-1',
      providerProfileId: 'provider-1',
      credentialId: 'credential-1',
      credentialType: 'TRADE_LICENSE',
      timeWindowHours: 3 * 24, // 3 days to expiry -> WARNING-tier time sensitivity
    },
    signals: [
      { signalType: 'PROVIDER_CREDENTIAL_EXPIRY', observedAt: now, payload: {} },
    ],
    actions: [],
    property: {
      hasDrainageIssues: null,
      hasSumpPumpBackup: null,
      coolingType: null,
      hvacInstallYear: null,
      roofType: null,
      roofReplacementYear: null,
      heatingType: null,
      hasSecondaryHeat: null,
    },
    ...overrides,
  };
}

test('a fresh booking-risk incident activates and notifies the homeowner on first detection', async () => {
  const { evaluateIncident, getUpdateCalls, getNotifyCalls } = loadEvaluator({
    incident: freshBookingRiskIncident(),
  });

  await evaluateIncident('incident-1');

  const activatingUpdate = getUpdateCalls().find((c) => c.data.status === 'ACTIVE');
  assert.ok(activatingUpdate, 'incident must transition to ACTIVE on first detection, not wait for a second signal');
  assert.equal(getNotifyCalls().length, 1, 'homeowner must be notified on first detection');
});
