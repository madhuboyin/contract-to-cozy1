const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  computeRoomHealthScore,
} = require('../../src/services/roomHealthScore.service.ts');

function emptyStats() {
  return {
    itemCount: 0,
    docsLinkedCount: 0,
    coverageGapsCount: 0,
  };
}

test('does not manufacture a health score for an empty room', () => {
  const result = computeRoomHealthScore({ stats: emptyStats() });

  assert.equal(result.score, null);
  assert.equal(result.band, null);
  assert.equal(result.evaluationState, 'NOT_STARTED');
  assert.equal(result.label, 'Not started');
  assert.deepEqual(
    result.improvements.map((improvement) => improvement.title),
    ['Add your first item', 'Complete the room profile'],
  );
  assert.doesNotMatch(JSON.stringify(result), /coverage gap|document/i);
});

test('uses insufficient data when a room profile exists without items', () => {
  const result = computeRoomHealthScore({
    stats: emptyStats(),
    profileContextAvailable: true,
  });

  assert.equal(result.score, null);
  assert.equal(result.evaluationState, 'INSUFFICIENT_DATA');
  assert.equal(result.label, 'Insufficient data');
  assert.deepEqual(
    result.improvements.map((improvement) => improvement.title),
    ['Add your first item'],
  );
});

test('scores a room after an item exists and only then suggests documents', () => {
  const result = computeRoomHealthScore({
    stats: {
      itemCount: 1,
      docsLinkedCount: 0,
      coverageGapsCount: 0,
    },
  });

  assert.equal(result.evaluationState, 'SCORED');
  assert.equal(typeof result.score, 'number');
  assert.match(
    result.improvements.map((improvement) => improvement.title).join(' '),
    /document/i,
  );
});
