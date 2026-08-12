const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { withEnhancerTimeout } = require('../../../src/services/decisionPlatform/decisionContextEnhancer.ts');

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

test('a fast resolving enhancer returns its value with no limitation codes', async () => {
  const result = await withEnhancerTimeout(() => delay(5, 'quote-data'), 50, 'ENHANCER_TIMED_OUT');
  assert.deepEqual(result, { value: 'quote-data', limitationCodes: [] });
});

test('a slow enhancer past its budget is omitted and disclosed, not left hanging (FRD §12.2)', async () => {
  const result = await withEnhancerTimeout(() => delay(50, 'too-slow'), 5, 'HVAC_CURRENT_QUOTE_LOOKUP_TIMED_OUT');
  assert.deepEqual(result, { value: null, limitationCodes: ['HVAC_CURRENT_QUOTE_LOOKUP_TIMED_OUT'] });
});

test('a non-timeout error still propagates rather than being silently swallowed as a timeout', async () => {
  const boom = new Error('database connection reset');
  await assert.rejects(
    withEnhancerTimeout(() => Promise.reject(boom), 50, 'SOME_TIMEOUT_CODE'),
    (error) => error === boom,
  );
});

test('the returned limitation code exactly matches what the caller passed in, for correct downstream disclosure', async () => {
  const result = await withEnhancerTimeout(() => delay(50, 'x'), 5, 'HVAC_REQUIRED_FACT_LOOKUP_TIMED_OUT');
  assert.deepEqual(result.limitationCodes, ['HVAC_REQUIRED_FACT_LOOKUP_TIMED_OUT']);
});
