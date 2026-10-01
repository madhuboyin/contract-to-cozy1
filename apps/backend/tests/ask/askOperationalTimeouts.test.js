const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { askFailureBlocks, withAskTimeout } = require('../../src/services/ask/support/answerGuards.ts');
const { readRadonFetchTimeoutMs } = require('../../src/services/environment/radonZone.service.ts');

test('EPA radon lookup has a short independent timeout with a bounded override', () => {
  assert.equal(readRadonFetchTimeoutMs({}), 2_000);
  assert.equal(readRadonFetchTimeoutMs({ EPA_RADON_FETCH_TIMEOUT_MS: '750' }), 750);
  assert.equal(readRadonFetchTimeoutMs({ EPA_RADON_FETCH_TIMEOUT_MS: '12000' }), 5_000);
  assert.equal(readRadonFetchTimeoutMs({ EPA_RADON_FETCH_TIMEOUT_MS: 'invalid' }), 2_000);
});

test('the outer Ask operational timeout renders the specific retryable timeout state', async () => {
  await assert.rejects(
    withAskTimeout(new Promise(() => {}), 1),
    (error) => {
      assert.equal(error.name, 'AskExecutionTimeoutError');
      assert.deepEqual(askFailureBlocks(error, true), [{
        type: 'ERROR_STATE',
        id: 'execution-failed',
        title: 'Ask timed out',
        body: 'Ask exceeded its operational time limit. No changes were made; try again with current records.',
        retryable: true,
        actions: [],
      }]);
      return true;
    },
  );
});
