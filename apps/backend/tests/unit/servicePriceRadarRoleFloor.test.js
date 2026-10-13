const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Service Price Radar (FRD v1.335): saving a check writes a record on the household's property, so the route has the same contributor floor as the Ask
// command that runs one (SERVICE_PRICE_CHECK_RUN). The event route tracks the caller's own interaction and stays open to any member.

test('the save-check route requires a contributor; reads and the interaction event are unchanged', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/servicePriceRadar.routes.ts'), 'utf8');
  const statements = source.split(/\nrouter\./).slice(1);
  const post = (suffix) => statements.find((s) => s.startsWith('post(') && s.includes(`service-price-radar/${suffix}'`));
  assert.ok(post('checks').includes("requireHouseholdRole('CONTRIBUTOR')"));
  assert.ok(!post('events').includes('requireHouseholdRole'));
  assert.ok(statements.filter((s) => s.startsWith('get(')).every((s) => !s.includes('requireHouseholdRole')));
});

test('the Ask command that runs a check has the same contributor floor', () => {
  require('ts-node/register');
  const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
  assert.equal(ASK_OPERATION_DEFINITIONS.SERVICE_PRICE_CHECK_RUN.propertyRoleFloor, 'CONTRIBUTOR');
});
