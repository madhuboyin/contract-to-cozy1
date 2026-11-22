const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
require('ts-node/register');

const { withAskTimeout, askFailureStatus, askFailureBlocks, askCancelledError } = require('../../src/services/ask/support/answerGuards.ts');
const { requestStopSignal } = require('../../src/controllers/ask.controller.ts');
const { guardedPlan } = require('../../src/services/ask/modelRouting/understandingProvider.ts');

// BICC-TRN-001/002 (owner decision 2026-11-22): a browser stop reaches cancellable server work, is a normal state, and never races committed work.
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('a stop during cancellable work ends the turn with a cancellation, not a timeout or an error', async () => {
  const stop = new AbortController();
  const slow = deferred();
  const pending = withAskTimeout(slow.promise, 5_000, stop.signal);
  stop.abort();
  await assert.rejects(pending, (error) => error.name === 'AskExecutionCancelledError');
  slow.resolve('late');
});

test('a stop that already happened rejects pending work at once; without a signal the work simply completes', async () => {
  const stop = new AbortController(); stop.abort();
  await assert.rejects(withAskTimeout(new Promise(() => {}), 5_000, stop.signal), (error) => error.name === 'AskExecutionCancelledError');
  assert.equal(await withAskTimeout(Promise.resolve('done'), 5_000), 'done');
});

test('work that finishes before any stop returns its result and detaches the listener', async () => {
  const stop = new AbortController();
  assert.equal(await withAskTimeout(Promise.resolve('ok'), 5_000, stop.signal), 'ok');
  stop.abort(); // a later stop changes nothing: the committed result stands
});

test('a stop is a CANCELLED status with a calm "Stopped" block, not a failure', () => {
  const error = askCancelledError();
  assert.equal(askFailureStatus(error), 'CANCELLED');
  assert.equal(askFailureStatus(new Error('boom')), 'FAILED_RETRYABLE');
  const [block] = askFailureBlocks(error, false);
  assert.equal(block.title, 'Stopped');
  assert.match(block.body, /Nothing was changed/);
});

test('the request stop signal fires only when the client closes before the response finished', () => {
  const closedEarly = Object.assign(new EventEmitter(), { writableFinished: false });
  const early = requestStopSignal(closedEarly);
  closedEarly.emit('close');
  assert.equal(early.signal.aborted, true);

  const finished = Object.assign(new EventEmitter(), { writableFinished: true });
  const normal = requestStopSignal(finished);
  finished.emit('close');
  assert.equal(normal.signal.aborted, false, 'a normal close after the response never aborts anything');

  const released = Object.assign(new EventEmitter(), { writableFinished: false });
  const handle = requestStopSignal(released);
  handle.release();
  released.emit('close');
  assert.equal(handle.signal.aborted, false, 'a released signal ignores a later close');
});

test('a stop aborts the planner provider call', async () => {
  const stop = new AbortController();
  let seenSignal;
  const provider = { plan: (input) => { seenSignal = input.signal; return new Promise(() => {}); }, timeoutBudgetMs: 5_000 };
  const pending = guardedPlan({ message: 'When was the roof replaced?', provider, providerTermsRecorded: true, planContext: { eligibleOperationIds: new Set(), eligibleDataPointIds: new Set() }, signal: stop.signal });
  stop.abort();
  const outcome = await pending;
  assert.equal(seenSignal.aborted, true);
  assert.equal(outcome.kind, 'UNAVAILABLE');
});
