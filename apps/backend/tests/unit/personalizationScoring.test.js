const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { priorityBandFromScore } = require('../../src/modules/personalization/domain/scoring.ts');

test('maps the code-owned personalization score to stable priority bands', () => {
  assert.equal(priorityBandFromScore(100), 'HIGH');
  assert.equal(priorityBandFromScore(70), 'HIGH');
  assert.equal(priorityBandFromScore(69.9), 'MEDIUM');
  assert.equal(priorityBandFromScore(45), 'MEDIUM');
  assert.equal(priorityBandFromScore(44.9), 'LOW');
  assert.equal(priorityBandFromScore(0), 'LOW');
});
