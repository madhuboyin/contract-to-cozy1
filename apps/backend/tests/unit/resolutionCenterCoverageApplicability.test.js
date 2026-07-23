const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildInventoryCoveragePresentation,
} = require('../../src/services/inventoryCoverageState.service.ts');
const {
  isRiskReportInventoryAssetType,
  visibleInventoryItemWhere,
} = require('../../src/services/riskAssetApplicability.ts');

function inferredRoof(overrides = {}) {
  return {
    assetType: 'ROOF_SHINGLE',
    name: 'Roof Shingle',
    category: 'ROOF_EXTERIOR',
    condition: 'UNKNOWN',
    coverageEvidenceStatus: 'UNKNOWN',
    coverageNotRequired: false,
    installedOn: null,
    purchasedOn: null,
    isVerified: false,
    verificationSource: 'PROPERTY_DETAILS',
    sourceHash: 'RISK_REPORT_SYSTEM:ROOF_SHINGLE',
    sourceType: 'INTEGRATION',
    tags: ['RISK_REPORT_INFERRED', 'PROPERTY_LEVEL_SYSTEM'],
    replacementCostCents: null,
    roomId: null,
    warranty: null,
    insurancePolicy: null,
    ...overrides,
  };
}

test('Resolution Center delegates coverage cases to the canonical detector', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/resolutionCenter.service.ts'),
    'utf8',
  );

  assert.match(
    source,
    /import \{ detectCoverageGaps, type CoverageGapResult \} from '\.\/coverageGap\.service';/,
  );
  assert.match(source, /detectCoverageGaps\(propertyId\)/);
  assert.doesNotMatch(source, /function detectResolutionCoverageGaps/);
});

test('association-managed roofs cannot become homeowner coverage cases', () => {
  const presentation = buildInventoryCoveragePresentation(
    inferredRoof(),
    [{ scope: 'ROOF', party: 'ASSOCIATION' }],
  );

  assert.equal(presentation.coverageState, 'MANAGED_ELSEWHERE');
  assert.equal(presentation.coverageActionable, false);
  assert.equal(presentation.coverageStateLabel, 'Managed by your HOA');
});

test('unknown roof context remains incomplete instead of becoming a coverage case', () => {
  const presentation = buildInventoryCoveragePresentation(inferredRoof(), []);

  assert.equal(presentation.coverageState, 'INCOMPLETE');
  assert.equal(presentation.coverageActionable, false);
  assert.ok(presentation.missingContext.includes('ITEM_CONFIRMATION'));
  assert.ok(presentation.missingContext.includes('RESPONSIBILITY'));
});

test('basement flood risk is excluded from physical inventory and coverage cases', () => {
  assert.equal(isRiskReportInventoryAssetType('BASEMENT_FLOOD_RISK'), false);
  assert.deepEqual(visibleInventoryItemWhere().AND[0], {
    OR: [
      { assetType: null },
      { assetType: { notIn: ['BASEMENT_FLOOD_RISK'] } },
    ],
  });
});
