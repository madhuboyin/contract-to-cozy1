const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CAPABILITY_GOLDEN_FIXTURES,
  CAPABILITY_GOLDEN_RANKING_EXPECTATIONS,
  evaluateCapabilityGoldenRankingFixture,
} = require('../../src/productFramework/capabilities/index.ts');

function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

test('CAP-408 defines one complete ranking expectation for every golden home', () => {
  assert.deepEqual(
    sorted(CAPABILITY_GOLDEN_RANKING_EXPECTATIONS.map(
      (expectation) => expectation.fixtureId,
    )),
    sorted(CAPABILITY_GOLDEN_FIXTURES.map((fixture) => fixture.id)),
  );
});

for (const fixture of CAPABILITY_GOLDEN_FIXTURES) {
  test(`CAP-408 ${fixture.id} preserves eligibility, ranking, and lineage`, () => {
    const expectation = CAPABILITY_GOLDEN_RANKING_EXPECTATIONS.find(
      (item) => item.fixtureId === fixture.id,
    );
    assert.ok(expectation, `Missing ranking expectation for ${fixture.id}`);

    const actual = evaluateCapabilityGoldenRankingFixture(fixture.id);
    assert.deepEqual(
      actual.eligibleCapabilityIds,
      sorted(fixture.contextualCapabilityIds),
      'eligible capabilities',
    );
    assert.ok(
      actual.ineligibleCapabilityIds.includes(expectation.ineligibleCapabilityId),
      `Expected ${expectation.ineligibleCapabilityId} to be ineligible`,
    );
    assert.deepEqual(
      actual.needsContextCapabilityIds,
      sorted(fixture.needsContextCapabilityIds),
      'needs-context capabilities',
    );
    assert.deepEqual(
      actual.topCapabilityIds,
      expectation.expectedTopCapabilityIds,
      'ranked top set',
    );
    assert.deepEqual(
      actual.reasonCodes,
      expectation.expectedReasonCodes,
      'reviewed reason codes',
    );
    assert.deepEqual(
      actual.sourceIdentities,
      expectation.expectedSourceIdentities,
      'contextual source lineage',
    );
    assert.deepEqual(
      actual.readinessExplanations,
      expectation.expectedReadinessExplanations,
      'readiness explanations',
    );
    assert.ok(actual.topCapabilityIds.length <= 3, 'Home is bounded to three');

    const duplicate = actual.suppressedDuplicates.find(
      (item) =>
        item.capabilityId === expectation.duplicateCapabilityId
        && item.reasonCodes.includes('SOURCE_ACTION_ALREADY_LAUNCHES_CAPABILITY'),
    );
    assert.ok(
      duplicate,
      `Expected source-action duplicate suppression for ${expectation.duplicateCapabilityId}`,
    );
    assert.equal(
      actual.topCapabilityIds.some((capabilityId) =>
        actual.sourceIdentities[capabilityId]?.id === duplicate.sourceId),
      false,
      'a source action CTA never becomes a duplicate top suggestion',
    );

    for (const capabilityId of fixture.contextualCapabilityIds) {
      assert.ok(
        actual.governanceStates[capabilityId].decisions.includes('PROMOTABLE'),
        `${capabilityId} is promotable`,
      );
    }
    const ineligibleGovernance =
      actual.governanceStates[expectation.ineligibleCapabilityId];
    assert.ok(
      ineligibleGovernance.decisions.includes('BLOCKED'),
      `${expectation.ineligibleCapabilityId} is blocked`,
    );
    assert.ok(
      ineligibleGovernance.reasonCodes.includes('CAPABILITY_NOT_AVAILABLE'),
      `${expectation.ineligibleCapabilityId} records its availability reason`,
    );
  });
}

test('CAP-408 golden-home evaluation is deterministic', () => {
  for (const fixture of CAPABILITY_GOLDEN_FIXTURES) {
    assert.deepEqual(
      evaluateCapabilityGoldenRankingFixture(fixture.id),
      evaluateCapabilityGoldenRankingFixture(fixture.id),
      fixture.id,
    );
  }
});
