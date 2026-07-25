const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateRefinanceDataRequiredForSnapshot,
} = require('../../src/jobs/evaluateRefinanceDataRequired.job.ts');

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  child() { return this; },
};

function rateSnapshots(currentRate, priorRate) {
  return [
    {
      id: 'snapshot-current',
      date: '2026-07-24',
      rate30yr: currentRate,
      rate15yr: currentRate - 0.75,
      source: 'FRED',
      sourceRef: null,
      createdAt: '2026-07-25T00:00:00.000Z',
    },
    {
      id: 'snapshot-prior',
      date: '2026-05-01',
      rate30yr: priorRate,
      rate15yr: priorRate - 0.75,
      source: 'FRED',
      sourceRef: null,
      createdAt: '2026-05-02T00:00:00.000Z',
    },
  ];
}

test('creates durable DATA_REQUIRED events only for unsuppressed incomplete properties', async () => {
  const pages = [
    [
      {
        propertyId: 'property-create',
        missingFields: ['currentMortgageBalance', 'remainingTerm'],
      },
      {
        propertyId: 'property-cooldown',
        missingFields: ['interestRate'],
      },
    ],
    [],
  ];
  const created = [];
  const result = await evaluateRefinanceDataRequiredForSnapshot(
    'snapshot-current',
    {
      loadIncompleteProperties: async () => pages.shift() ?? [],
      loadRecentSnapshots: async () => rateSnapshots(6, 6.5),
      hasRecentPrompt: async (propertyId) => propertyId === 'property-cooldown',
      createPromptEvent: async (input) => created.push(input),
      logger: noopLogger,
    },
    { pageSize: 2, cooldownDays: 30 },
  );

  assert.equal(result.examined, 2);
  assert.equal(result.created, 1);
  assert.equal(result.cooldownSuppressed, 1);
  assert.equal(created[0].propertyId, 'property-create');
  assert.deepEqual(created[0].missingFields, [
    'currentMortgageBalance',
    'remainingTerm',
  ]);
  assert.equal(created[0].currentRatePct, 6);
  assert.equal(created[0].priorRatePct, 6.5);
});

test('does not scan incomplete properties when the rate decline is immaterial', async () => {
  let candidateReads = 0;
  const result = await evaluateRefinanceDataRequiredForSnapshot(
    'snapshot-current',
    {
      loadIncompleteProperties: async () => {
        candidateReads++;
        return [];
      },
      loadRecentSnapshots: async () => rateSnapshots(6.45, 6.5),
      hasRecentPrompt: async () => false,
      createPromptEvent: async () => {
        throw new Error('should not create');
      },
      logger: noopLogger,
    },
  );

  assert.equal(candidateReads, 0);
  assert.equal(result.examined, 0);
  assert.equal(result.created, 0);
});
