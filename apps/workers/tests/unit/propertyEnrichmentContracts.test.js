const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  PROPERTY_ENRICHMENT_CONTRACT_VERSION,
  RENTCAST_EVIDENCE_SOURCE,
  RENTCAST_PROVIDER,
  RENTCAST_SOURCE_ENTITY_TYPE,
} = require('../../src/propertyEnrichment/contracts.ts');

test('RentCast enrichment contracts are versioned and public-record sourced', () => {
  assert.equal(PROPERTY_ENRICHMENT_CONTRACT_VERSION, 1);
  assert.equal(RENTCAST_PROVIDER, 'RENTCAST');
  assert.equal(RENTCAST_EVIDENCE_SOURCE, 'PUBLIC_RECORD');
  assert.notEqual(RENTCAST_EVIDENCE_SOURCE, 'USER_REPORTED');
  assert.equal(RENTCAST_SOURCE_ENTITY_TYPE, 'RENTCAST_PROPERTY_RECORD');
});
