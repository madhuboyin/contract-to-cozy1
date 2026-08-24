const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveDecisionFamilyRef } = require('../../../src/services/decisionPlatform/homeActionDecisionLineage.ts');

test('a repair-replace lineageId resolves to the HVAC_REPAIR_REPLACE decision family (Home Intelligence FRD HI-DEC-002)', () => {
  const ref = resolveDecisionFamilyRef({ lineageId: 'repair-replace:item-123' });
  assert.deepEqual(ref, { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId: 'item-123' });
});

test('a lineageId with no matching decision-family prefix resolves to null, not a fail-closed state', () => {
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'operational-work:work-1' }), null);
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'maintenance:task-1' }), null);
});

test('a malformed repair-replace lineageId with no entity id does not resolve', () => {
  assert.equal(resolveDecisionFamilyRef({ lineageId: 'repair-replace:' }), null);
});
