const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ============================================================================
// Mocks
// ============================================================================

let matches = new Map();
let matchOutcomes = [];
let opportunities = new Map();
let opportunityOutcomes = [];
const publishSavingsRealizationSignalCalls = [];
let publishSavingsRealizationSignalImpl = async () => ({ id: 'signal-1' });

// Outcomes recorded within the same test often share a millisecond-precision
// `new Date()` timestamp, which would make "latest outcome" ordering
// unstable. A monotonic sequence stamped onto each row's recordedAt keeps
// ordering deterministic without changing the service code under test.
let recordedAtSequence = 0;
function nextRecordedAt() {
  recordedAtSequence += 1;
  return new Date(Date.now() + recordedAtSequence);
}

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      propertyHiddenAssetMatch: {
        findFirst: async ({ where }) => {
          const match = matches.get(where.id);
          if (!match) return null;
          if (match.userId !== where.property.homeownerProfile.userId) return null;
          return match;
        },
        update: async ({ where, data }) => {
          const match = matches.get(where.id);
          Object.assign(match, data);
          return match;
        },
      },
      hiddenAssetMatchOutcome: {
        findFirst: async ({ where }) => {
          const rows = matchOutcomes
            .filter((row) => row.matchId === where.matchId)
            .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
          return rows[0] ?? null;
        },
        findMany: async ({ where }) =>
          matchOutcomes
            .filter((row) => row.matchId === where.matchId)
            .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()),
        create: async ({ data }) => {
          const row = { id: `outcome-${matchOutcomes.length + 1}`, recordedAt: nextRecordedAt(), createdAt: new Date(), ...data };
          matchOutcomes.push(row);
          return row;
        },
      },
      homeSavingsOpportunity: {
        findFirst: async ({ where }) => {
          const opportunity = opportunities.get(where.id);
          if (!opportunity) return null;
          if (opportunity.userId !== where.homeownerProfile.userId) return null;
          return opportunity;
        },
      },
      homeSavingsOpportunityOutcome: {
        findFirst: async ({ where }) => {
          const rows = opportunityOutcomes
            .filter((row) => row.opportunityId === where.opportunityId)
            .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
          return rows[0] ?? null;
        },
        findMany: async ({ where }) =>
          opportunityOutcomes
            .filter((row) => row.opportunityId === where.opportunityId)
            .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()),
        create: async ({ data }) => {
          const row = { id: `opp-outcome-${opportunityOutcomes.length + 1}`, recordedAt: nextRecordedAt(), createdAt: new Date(), ...data };
          opportunityOutcomes.push(row);
          return row;
        },
      },
      $transaction: async (fn) =>
        fn({
          hiddenAssetMatchOutcome: require.cache[prismaPath].exports.prisma.hiddenAssetMatchOutcome,
          propertyHiddenAssetMatch: require.cache[prismaPath].exports.prisma.propertyHiddenAssetMatch,
        }),
    },
  },
};

const signalServicePath = require.resolve('../../src/services/signal.service.ts');
require.cache[signalServicePath] = {
  id: signalServicePath,
  filename: signalServicePath,
  loaded: true,
  exports: {
    signalService: {
      publishSavingsRealizationSignal: (...args) => {
        publishSavingsRealizationSignalCalls.push(args[0]);
        return publishSavingsRealizationSignalImpl(...args);
      },
    },
  },
};

const {
  isValidOutcomeTransition,
  recordHiddenAssetMatchOutcome,
  getHiddenAssetMatchOutcomes,
  recordHomeSavingsOpportunityOutcome,
  getHomeSavingsOpportunityOutcomes,
  SavingsOutcomeGovernanceError,
} = require('../../src/services/savingsOutcome.service.ts');

test.beforeEach(() => {
  matches = new Map([
    ['match-1', { id: 'match-1', userId: 'user-1', status: 'PURSUING', pursuedAt: null }],
  ]);
  matchOutcomes = [];
  opportunities = new Map([
    ['opp-1', { id: 'opp-1', userId: 'user-1', propertyId: 'property-1', currency: 'USD' }],
  ]);
  opportunityOutcomes = [];
  publishSavingsRealizationSignalCalls.length = 0;
  publishSavingsRealizationSignalImpl = async () => ({ id: 'signal-1' });
  recordedAtSequence = 0;
});

// ============================================================================
// Pure transition rules
// ============================================================================

test('a first-ever outcome accepts any stage', () => {
  assert.equal(isValidOutcomeTransition(null, 'SUBMITTED'), true);
  assert.equal(isValidOutcomeTransition(null, 'RECEIVED'), true);
  assert.equal(isValidOutcomeTransition(null, 'DENIED'), true);
});

test('SUBMITTED can move to APPROVED, DENIED, or WITHDRAWN, but not RECEIVED', () => {
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'APPROVED'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'DENIED'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'WITHDRAWN'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'RECEIVED'), false);
});

test('APPROVED can move to RECEIVED or WITHDRAWN, but not back to SUBMITTED', () => {
  assert.equal(isValidOutcomeTransition('APPROVED', 'RECEIVED'), true);
  assert.equal(isValidOutcomeTransition('APPROVED', 'WITHDRAWN'), true);
  assert.equal(isValidOutcomeTransition('APPROVED', 'SUBMITTED'), false);
});

test('DENIED, RECEIVED, and WITHDRAWN are terminal', () => {
  for (const terminal of ['DENIED', 'RECEIVED', 'WITHDRAWN']) {
    for (const next of ['SUBMITTED', 'APPROVED', 'DENIED', 'RECEIVED', 'WITHDRAWN']) {
      assert.equal(isValidOutcomeTransition(terminal, next), false, `${terminal} -> ${next}`);
    }
  }
});

// ============================================================================
// HiddenAssetMatchOutcome
// ============================================================================

test('recordHiddenAssetMatchOutcome rejects a RECEIVED outcome without an amount or evidence', async () => {
  await assert.rejects(
    () => recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'RECEIVED' }),
    SavingsOutcomeGovernanceError
  );
});

test('recordHiddenAssetMatchOutcome rejects a DENIED outcome without a reason', async () => {
  await assert.rejects(
    () => recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'DENIED' }),
    SavingsOutcomeGovernanceError
  );
});

test('recordHiddenAssetMatchOutcome records SUBMITTED then APPROVED then RECEIVED, and backfills pursuedAt', async () => {
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'SUBMITTED', evidenceNote: 'Applied online.' });
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'APPROVED' });
  const received = await recordHiddenAssetMatchOutcome('match-1', 'user-1', {
    stage: 'RECEIVED',
    amountReceived: 500,
    evidenceNote: 'Rebate check received in the mail.',
  });

  assert.equal(received.amountReceived, 500);
  const history = await getHiddenAssetMatchOutcomes('match-1', 'user-1');
  assert.deepEqual(history.map((row) => row.stage), ['SUBMITTED', 'APPROVED', 'RECEIVED']);
  assert.ok(matches.get('match-1').pursuedAt, 'pursuedAt should be backfilled from a PURSUING match');
});

test('recordHiddenAssetMatchOutcome rejects RECEIVED coming directly after SUBMITTED', async () => {
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'SUBMITTED' });
  await assert.rejects(
    () =>
      recordHiddenAssetMatchOutcome('match-1', 'user-1', {
        stage: 'RECEIVED',
        amountReceived: 500,
        evidenceNote: 'Check received.',
      }),
    SavingsOutcomeGovernanceError
  );
});

test('recordHiddenAssetMatchOutcome rejects a mismatched owner', async () => {
  await assert.rejects(() =>
    recordHiddenAssetMatchOutcome('match-1', 'someone-else', { stage: 'SUBMITTED' })
  );
});

test('recordHiddenAssetMatchOutcome never calls the shared realization signal', async () => {
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', {
    stage: 'RECEIVED',
    amountReceived: 500,
    evidenceNote: 'Check received.',
  });
  assert.equal(publishSavingsRealizationSignalCalls.length, 0);
});

// ============================================================================
// HomeSavingsOpportunityOutcome
// ============================================================================

test('recordHomeSavingsOpportunityOutcome publishes a realization signal only on RECEIVED', async () => {
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'SUBMITTED' });
  assert.equal(publishSavingsRealizationSignalCalls.length, 0);
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'APPROVED' });
  assert.equal(publishSavingsRealizationSignalCalls.length, 0);

  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
    stage: 'RECEIVED',
    observedAnnualValue: 240,
    observedMonthlyValue: 20,
    evidenceNote: 'Compared two full bills after switching.',
  });

  assert.equal(publishSavingsRealizationSignalCalls.length, 1);
  assert.equal(publishSavingsRealizationSignalCalls[0].observedAnnualValue, 240);
  assert.equal(publishSavingsRealizationSignalCalls[0].propertyId, 'property-1');
});

test('recordHomeSavingsOpportunityOutcome still succeeds if the signal publish throws', async () => {
  publishSavingsRealizationSignalImpl = async () => {
    throw new Error('signal service down');
  };

  const outcome = await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
    stage: 'RECEIVED',
    observedAnnualValue: 240,
    evidenceNote: 'Observed on the latest bill.',
  });

  assert.equal(outcome.stage, 'RECEIVED');
  const history = await getHomeSavingsOpportunityOutcomes('opp-1', 'user-1');
  assert.equal(history.length, 1);
});

test('recordHomeSavingsOpportunityOutcome rejects RECEIVED without an observed value', async () => {
  await assert.rejects(
    () => recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'RECEIVED', evidenceNote: 'note' }),
    SavingsOutcomeGovernanceError
  );
});
