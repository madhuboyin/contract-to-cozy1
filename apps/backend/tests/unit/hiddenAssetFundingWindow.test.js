const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  isFundingAvailable,
  fundingAvailableWhereConditions,
} = require('../../src/services/hiddenAssets/fundingWindow.ts');

const NOW = new Date('2026-07-28T12:00:00Z');

function program(overrides = {}) {
  return {
    fundingStatus: 'UNKNOWN',
    applicationWindowOpensAt: null,
    applicationWindowClosesAt: null,
    ...overrides,
  };
}

test('UNKNOWN funding status never blocks a program by itself', () => {
  assert.equal(isFundingAvailable(program({ fundingStatus: 'UNKNOWN' }), NOW), true);
});

test('OPEN funding status does not block a program', () => {
  assert.equal(isFundingAvailable(program({ fundingStatus: 'OPEN' }), NOW), true);
});

test('CLOSED funding status excludes the program regardless of the window', () => {
  assert.equal(isFundingAvailable(program({ fundingStatus: 'CLOSED' }), NOW), false);
  assert.equal(
    isFundingAvailable(
      program({
        fundingStatus: 'CLOSED',
        applicationWindowOpensAt: new Date('2026-01-01'),
        applicationWindowClosesAt: new Date('2027-01-01'),
      }),
      NOW,
    ),
    false,
  );
});

test('a not-yet-open application window excludes the program', () => {
  assert.equal(
    isFundingAvailable(
      program({ applicationWindowOpensAt: new Date('2026-08-01') }),
      NOW,
    ),
    false,
  );
});

test('an already-closed application window excludes the program', () => {
  assert.equal(
    isFundingAvailable(
      program({ applicationWindowClosesAt: new Date('2026-06-01') }),
      NOW,
    ),
    false,
  );
});

test('a program inside its open application window is available', () => {
  assert.equal(
    isFundingAvailable(
      program({
        applicationWindowOpensAt: new Date('2026-01-01'),
        applicationWindowClosesAt: new Date('2026-12-31'),
      }),
      NOW,
    ),
    true,
  );
});

test('an unset application window never excludes the program', () => {
  assert.equal(isFundingAvailable(program(), NOW), true);
});

test('fundingAvailableWhereConditions excludes CLOSED and respects null windows', () => {
  const conditions = fundingAvailableWhereConditions(NOW);
  assert.deepEqual(conditions[0], { fundingStatus: { not: 'CLOSED' } });
  assert.deepEqual(conditions[1], {
    OR: [{ applicationWindowOpensAt: null }, { applicationWindowOpensAt: { lte: NOW } }],
  });
  assert.deepEqual(conditions[2], {
    OR: [{ applicationWindowClosesAt: null }, { applicationWindowClosesAt: { gte: NOW } }],
  });
});
