const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  hasConfirmedBasement,
  isRiskReportInventoryAssetType,
  visibleInventoryItemWhere,
} = require('../../src/services/riskAssetApplicability.ts');

test('basement flood risk requires an explicitly confirmed basement', () => {
  assert.equal(hasConfirmedBasement('BASEMENT'), true);
  assert.equal(hasConfirmedBasement('SLAB'), false);
  assert.equal(hasConfirmedBasement('CRAWL_SPACE'), false);
  assert.equal(hasConfirmedBasement('UNKNOWN'), false);
  assert.equal(hasConfirmedBasement(null), false);
});

test('risk concepts cannot be projected as physical inventory assets', () => {
  assert.equal(isRiskReportInventoryAssetType('HVAC_FURNACE'), true);
  assert.equal(isRiskReportInventoryAssetType('ROOF_SHINGLE'), true);
  assert.equal(isRiskReportInventoryAssetType('BASEMENT_FLOOD_RISK'), false);
  assert.equal(isRiskReportInventoryAssetType('UNRECOGNIZED_RISK'), false);
  assert.deepEqual(visibleInventoryItemWhere(), {
    AND: [
      {
        OR: [
          { assetType: null },
          { assetType: { notIn: ['BASEMENT_FLOOD_RISK'] } },
        ],
      },
      { tags: { hasNone: ['INFERRED_NOT_PRESENT'] } },
    ],
  });
});
