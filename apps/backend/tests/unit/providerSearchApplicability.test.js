const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { shouldPauseProviderSearch } = require('../../src/services/providerSearchApplicability.ts');

const context = (status) => ({ decision: { status } });

test('provider discovery remains available while responsibility is unknown', () => {
  assert.equal(shouldPauseProviderSearch(context('UNKNOWN')), false);
});

test('provider discovery remains available for owner or shared responsibility', () => {
  assert.equal(shouldPauseProviderSearch(context('APPLICABLE')), false);
});

test('provider discovery pauses for a confirmed not-applicable responsibility', () => {
  assert.equal(shouldPauseProviderSearch(context('NOT_APPLICABLE')), true);
});
