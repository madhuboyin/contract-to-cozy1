const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { classifyThreadSelection } = require('../../../src/services/decisionPlatform/decisionThreadService.ts');

test('zero active threads classifies as NONE (FRD §10.3/§10.4)', () => {
  assert.deepEqual(classifyThreadSelection([]), { kind: 'NONE' });
});

test('exactly one active thread classifies as UNIQUE', () => {
  const thread = { id: 'thread-1' };
  assert.deepEqual(classifyThreadSelection([thread]), { kind: 'UNIQUE', thread });
});

test('more than one active thread classifies as AMBIGUOUS, never guessed by recency (FRD §10.3: "recency alone... may not select a material thread")', () => {
  const threads = [{ id: 'thread-1', createdAt: '2026-01-01' }, { id: 'thread-2', createdAt: '2026-06-01' }];
  const result = classifyThreadSelection(threads);
  assert.equal(result.kind, 'AMBIGUOUS');
  assert.deepEqual(result.candidates, threads);
});
