const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  isReviewedProgramCurrent,
  isSourceReviewCurrent,
} = require('../../src/services/hiddenAssets/sourceFreshness.ts');

const NOW = new Date('2026-07-29T12:00:00.000Z');

function source(overrides = {}) {
  return {
    status: 'ACTIVE',
    officialUrl: 'https://agency.gov/benefits',
    lastReviewedAt: new Date('2026-07-01T12:00:00.000Z'),
    reviewSlaDays: 180,
    version: 1,
    reviewedVersion: 1,
    ...overrides,
  };
}

function program(overrides = {}) {
  return {
    sourceUrl: 'https://agency.gov/benefits/program',
    lastVerifiedAt: new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  };
}

test('active sources inside their review SLA are current', () => {
  assert.equal(isSourceReviewCurrent(source(), NOW), true);
});

test('paused, never-reviewed, and overdue sources fail closed', () => {
  assert.equal(isSourceReviewCurrent(source({ status: 'PAUSED' }), NOW), false);
  assert.equal(isSourceReviewCurrent(source({ lastReviewedAt: null }), NOW), false);
  assert.equal(
    isSourceReviewCurrent(source({ lastReviewedAt: new Date('2025-01-01T00:00:00Z') }), NOW),
    false,
  );
  assert.equal(isSourceReviewCurrent(source({ version: 2, reviewedVersion: 1 }), NOW), false);
});

test('programs require an official URL and a current verification date', () => {
  assert.equal(isReviewedProgramCurrent(program(), source(), NOW), true);
  assert.equal(isReviewedProgramCurrent(program({ sourceUrl: null }), source(), NOW), false);
  assert.equal(isReviewedProgramCurrent(program({ lastVerifiedAt: null }), source(), NOW), false);
  assert.equal(
    isReviewedProgramCurrent(
      program({ lastVerifiedAt: new Date('2025-01-01T00:00:00Z') }),
      source(),
      NOW,
    ),
    false,
  );
});
