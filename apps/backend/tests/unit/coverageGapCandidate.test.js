const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { isCoverageAssetCandidate } = require('../../src/services/coverageGap.service.ts');

test('coverage candidate rules exclude task-like inventory records and low-value appliances', () => {
  assert.equal(isCoverageAssetCandidate({ name: 'Smoke & CO Detector Check', category: 'APPLIANCE', recordGroup: 'OTHER', exposureCents: 30000 }), false);
  assert.equal(isCoverageAssetCandidate({ name: 'Microwave', category: 'APPLIANCE', recordGroup: 'OTHER', exposureCents: 120000 }), true);
  assert.equal(isCoverageAssetCandidate({ name: 'Countertop toaster', category: 'APPLIANCE', recordGroup: 'OTHER', exposureCents: 12000 }), false);
  assert.equal(isCoverageAssetCandidate({ name: 'Main electrical panel', category: 'SYSTEM', recordGroup: 'SYSTEMS_STRUCTURE', exposureCents: null }), true);
});
