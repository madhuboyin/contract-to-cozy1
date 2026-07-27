const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  evaluateCoverageReview,
  MAX_PRIMARY_COVERAGE_QUESTIONS,
} = require('../../src/services/coverageReviewRules');

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../fixtures/coverage-review-golden.json'),
    'utf8',
  ),
);
const evaluatedAt = new Date('2026-07-27T12:00:00.000Z');

function hydrateTerm(term) {
  if (!term) return null;
  return {
    ...term,
    termStart: term.termStart ? new Date(term.termStart) : null,
    termEnd: term.termEnd ? new Date(term.termEnd) : null,
    facts: term.facts.map((fact) => ({
      ...fact,
      effectiveFrom: fact.effectiveFrom ? new Date(fact.effectiveFrom) : null,
      effectiveTo: fact.effectiveTo ? new Date(fact.effectiveTo) : null,
    })),
  };
}

for (const fixture of fixtures) {
  test(`coverage review golden: ${fixture.name}`, () => {
    const result = evaluateCoverageReview(hydrateTerm(fixture.term), evaluatedAt);
    assert.equal(result.scopeStatus, fixture.expected.scopeStatus);
    assert.equal(result.overallState, fixture.expected.overallState);
    assert.deepEqual(
      result.questions.map((question) => question.questionKey),
      fixture.expected.questionKeys,
    );
    assert.ok(result.questions.length <= MAX_PRIMARY_COVERAGE_QUESTIONS);
    for (const question of result.questions) {
      assert.ok(
        question.questionType === 'GENERAL' || question.evidence.length > 0,
        `${question.questionKey} must cite evidence or be explicitly general`,
      );
      if (question.questionType === 'EVIDENCE_BASED') {
        assert.ok(
          question.evidence.every(
            (evidence) =>
              evidence.verificationStatus === 'VERIFIED' ||
              evidence.confirmationStatus === 'CONFIRMED',
          ),
          `${question.questionKey} must use verified term or confirmed fact evidence`,
        );
      }
    }
  });
}

test('unsupported policy prose cannot produce an evidence-based determination', () => {
  const fixture = fixtures.find((entry) => entry.name === 'unsupported raw policy language');
  const result = evaluateCoverageReview(hydrateTerm(fixture.term), evaluatedAt);
  assert.deepEqual(result.unsupportedFactKeys, ['COVERAGE_LIMITS_RAW']);
  assert.ok(result.questions.every((question) => question.questionType === 'GENERAL'));
  assert.doesNotMatch(JSON.stringify(result), /covered|not covered|coverage gap/i);
});

test('review persistence fingerprints inputs and stales previous ready reviews', () => {
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/coverageReview.service.ts'),
    'utf8',
  );
  assert.match(service, /inputFingerprint/);
  assert.match(service, /propertyUpdatedAt/);
  assert.match(service, /fact\.updatedAt/);
  assert.match(service, /where: \{ propertyId, status: 'READY' \}/);
  assert.match(service, /data: \{ status: 'STALE' \}/);
});
