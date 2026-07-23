// apps/workers/tests/unit/workerRunResult.test.js
//
// WKR-008: SUCCEEDED/PARTIAL/FAILED/SKIPPED status derivation for handlers
// that opt into structured reporting instead of a plain Promise<void>.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { isWorkerRunResult, deriveRunStatus } = require('../../src/lib/workerRunResult.ts');

test('isWorkerRunResult recognizes a result object and rejects plain values', () => {
  assert.equal(isWorkerRunResult({ examined: 3, notified: 2, skipped: 1 }), true);
  assert.equal(isWorkerRunResult(undefined), false);
  assert.equal(isWorkerRunResult(null), false);
  assert.equal(isWorkerRunResult('ok'), false);
  assert.equal(isWorkerRunResult({ notified: 2 }), false); // no `examined`
});

test('deriveRunStatus: no failures is SUCCEEDED', () => {
  assert.equal(deriveRunStatus({ examined: 5, notified: 5, skipped: 0 }), 'SUCCEEDED');
  assert.equal(deriveRunStatus({ examined: 0, notified: 0 }), 'SUCCEEDED');
});

test('deriveRunStatus: some failures with some success is PARTIAL', () => {
  assert.equal(deriveRunStatus({ examined: 5, notified: 3, failed: 2 }), 'PARTIAL');
  assert.equal(deriveRunStatus({ examined: 5, created: 1, failed: 4 }), 'PARTIAL');
  assert.equal(deriveRunStatus({ examined: 5, updated: 1, failed: 4 }), 'PARTIAL');
  // `refreshed` is the success signal radar/hidden-asset-style refresh jobs
  // use — must count toward "some succeeded" the same as notified/created/updated.
  assert.equal(deriveRunStatus({ examined: 5, refreshed: 1, failed: 4 }), 'PARTIAL');
});

test('deriveRunStatus: failures with zero successes is FAILED even though the promise resolved', () => {
  assert.equal(deriveRunStatus({ examined: 5, notified: 0, failed: 5 }), 'FAILED');
  assert.equal(deriveRunStatus({ examined: 5, failed: 5 }), 'FAILED');
});
