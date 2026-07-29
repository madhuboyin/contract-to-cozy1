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
let documents = [];
const documentOwnershipQueries = [];
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
        update: async ({ where, data }) => {
          const opportunity = opportunities.get(where.id);
          Object.assign(opportunity, data);
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
      document: {
        findMany: async ({ where }) => {
          documentOwnershipQueries.push(where);
          return documents
            .filter((document) =>
              where.id.in.includes(document.id)
              && document.uploadedBy === where.uploadedBy
              && document.propertyId === where.propertyId)
            .map(({ id }) => ({ id }));
        },
        updateMany: async () => ({ count: 1 }),
      },
      $transaction: async (fn) =>
        fn({
          hiddenAssetMatchOutcome: require.cache[prismaPath].exports.prisma.hiddenAssetMatchOutcome,
          propertyHiddenAssetMatch: require.cache[prismaPath].exports.prisma.propertyHiddenAssetMatch,
          document: require.cache[prismaPath].exports.prisma.document,
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
    ['match-1', { id: 'match-1', propertyId: 'property-1', userId: 'user-1', status: 'PURSUING', pursuedAt: null }],
  ]);
  matchOutcomes = [];
  opportunities = new Map([
    ['opp-1', { id: 'opp-1', userId: 'user-1', propertyId: 'property-1', currency: 'USD' }],
  ]);
  opportunityOutcomes = [];
  documents = [];
  documentOwnershipQueries.length = 0;
  publishSavingsRealizationSignalCalls.length = 0;
  publishSavingsRealizationSignalImpl = async () => ({ id: 'signal-1' });
  recordedAtSequence = 0;
});

// ============================================================================
// Pure transition rules
// ============================================================================

test('a first-ever outcome can start with submission or a reasoned no-value closure', () => {
  assert.equal(isValidOutcomeTransition(null, 'SUBMITTED'), true);
  assert.equal(isValidOutcomeTransition(null, 'EXPIRED'), true);
  assert.equal(isValidOutcomeTransition(null, 'NO_ACTION'), true);
  assert.equal(isValidOutcomeTransition(null, 'RECEIVED'), false);
  assert.equal(isValidOutcomeTransition(null, 'DENIED'), false);
});

test('SUBMITTED can move to approval or a reasoned terminal stage, but not RECEIVED', () => {
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'APPROVED'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'DENIED'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'WITHDRAWN'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'EXPIRED'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'NO_ACTION'), true);
  assert.equal(isValidOutcomeTransition('SUBMITTED', 'RECEIVED'), false);
});

test('APPROVED can move to RECEIVED or WITHDRAWN, but not back to SUBMITTED', () => {
  assert.equal(isValidOutcomeTransition('APPROVED', 'RECEIVED'), true);
  assert.equal(isValidOutcomeTransition('APPROVED', 'WITHDRAWN'), true);
  assert.equal(isValidOutcomeTransition('APPROVED', 'SUBMITTED'), false);
});

test('every closed outcome stage is terminal', () => {
  for (const terminal of ['DENIED', 'RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION']) {
    for (const next of ['SUBMITTED', 'APPROVED', 'DENIED', 'RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION']) {
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

test('expiration and no-action feedback require a reason and close the opportunity status', async () => {
  await assert.rejects(
    () => recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'EXPIRED' }),
    SavingsOutcomeGovernanceError,
  );
  const expired = await recordHiddenAssetMatchOutcome('match-1', 'user-1', {
    stage: 'EXPIRED',
    closureReason: 'The official application window closed before documents were ready.',
  });
  assert.equal(expired.closureReason, 'The official application window closed before documents were ready.');
  assert.equal(matches.get('match-1').status, 'EXPIRED');

  const noAction = await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
    stage: 'NO_ACTION',
    closureReason: 'The contract exit fee outweighed the expected savings.',
  });
  assert.equal(noAction.closureReason, 'The contract exit fee outweighed the expected savings.');
  assert.equal(opportunities.get('opp-1').status, 'DISMISSED');
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

test('outcome evidence must belong to the authenticated user and the same property', async () => {
  documents = [{ id: 'document-1', uploadedBy: 'user-1', propertyId: 'property-1' }];
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', {
    stage: 'SUBMITTED',
    documentIds: ['document-1'],
  });
  assert.deepEqual(documentOwnershipQueries[0], {
    id: { in: ['document-1'] },
    uploadedBy: 'user-1',
    propertyId: 'property-1',
  });

  documents = [{ id: 'other-property-document', uploadedBy: 'user-1', propertyId: 'property-2' }];
  await assert.rejects(
    () => recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
      stage: 'SUBMITTED',
      documentIds: ['other-property-document'],
    }),
    /not found/,
  );
});

test('recordHiddenAssetMatchOutcome never calls the shared realization signal', async () => {
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'SUBMITTED' });
  await recordHiddenAssetMatchOutcome('match-1', 'user-1', { stage: 'APPROVED' });
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

test('a homeowner-recorded recurring outcome does not publish a verified realization signal', async () => {
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'SUBMITTED' });
  assert.equal(publishSavingsRealizationSignalCalls.length, 0);
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'APPROVED' });
  assert.equal(publishSavingsRealizationSignalCalls.length, 0);

  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
    stage: 'RECEIVED',
    observedAnnualValue: 240,
    observedMonthlyValue: 20,
    evidenceNote: 'Compared two full bills after switching.',
    observationStartedAt: new Date('2026-01-01T00:00:00Z'),
    observationEndedAt: new Date('2026-02-01T00:00:00Z'),
  });

  assert.equal(publishSavingsRealizationSignalCalls.length, 0);
});

test('recordHomeSavingsOpportunityOutcome stores a sufficient observation window', async () => {
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'SUBMITTED' });
  await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'APPROVED' });
  const outcome = await recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', {
    stage: 'RECEIVED',
    observedAnnualValue: 240,
    evidenceNote: 'Observed on the latest bill.',
    observationStartedAt: new Date('2026-01-01T00:00:00Z'),
    observationEndedAt: new Date('2026-02-01T00:00:00Z'),
  });

  assert.equal(outcome.stage, 'RECEIVED');
  const history = await getHomeSavingsOpportunityOutcomes('opp-1', 'user-1');
  assert.equal(history.length, 3);
});

test('recordHomeSavingsOpportunityOutcome rejects RECEIVED without an observed value', async () => {
  await assert.rejects(
    () => recordHomeSavingsOpportunityOutcome('opp-1', 'user-1', { stage: 'RECEIVED', evidenceNote: 'note' }),
    SavingsOutcomeGovernanceError
  );
});
