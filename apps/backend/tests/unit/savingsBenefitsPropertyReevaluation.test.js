const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  shouldReevaluateSavingsBenefitsForPropertyUpdate,
} = require('../../src/services/property.service.ts');

test('eligibility-affecting property changes request Savings & Benefits reevaluation', () => {
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ state: 'CA' }), true);
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ yearBuilt: 1984 }), true);
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ utilityProvider: 'Utility Co' }), true);
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ inFloodZone: true }), true);
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ name: 'My home' }), false);
  assert.equal(shouldReevaluateSavingsBenefitsForPropertyUpdate({ coverPhotoDocumentId: 'doc-1' }), false);
});
