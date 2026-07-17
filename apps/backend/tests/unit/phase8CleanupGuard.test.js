const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Personalization has no duplicate production property-fact loader', () => {
  const repository = read('../../src/modules/personalization/infrastructure/propertyTraitRepository.ts');
  const compute = read('../../src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts');
  assert.doesNotMatch(repository, /export async function loadPropertyTraitFacts\(/);
  assert.match(repository, /getAggregationPropertyContext/);
  assert.doesNotMatch(compute, /loadPropertyTraitFacts\(/);
});

test('Personalization rule paths use canonical Property Context ownership', () => {
  const rules = read('../../src/modules/personalization/domain/ruleAst.ts');
  for (const obsolete of [
    'property.propertyType',
    'property.yearBuilt',
    'property.zipCode',
    'property.purchaseDate',
    'property.lastAppraisalDate',
  ]) {
    assert.equal(rules.includes(`'${obsolete}'`), false, obsolete);
  }
  for (const canonical of ['core.dwellingType', 'core.yearBuilt', 'location.zipCode']) {
    assert.ok(rules.includes(`'${canonical}'`), canonical);
  }
});

test('Phase 0 obsolete item and finance models remain removed', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.doesNotMatch(schema, /model HomeAsset\s*\{/);
  assert.doesNotMatch(schema, /model PropertyFinanceSnapshot\s*\{/);
  const homeItem = schema.match(/model HomeItem\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(homeItem, /inventoryItemId\s+String\s+@unique/);
  assert.doesNotMatch(homeItem, /homeAssetId|kind\s+HomeItemKind/);
});

test('legacy Property classification columns and direct readers remain removed', () => {
  const schema = read('../../prisma/schema.prisma');
  const propertyModel = schema.match(/model Property\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(propertyModel, /\bpropertyType\b/);
  assert.doesNotMatch(propertyModel, /\bownershipType\b/);

  const sourceRoots = [
    path.resolve(__dirname, '../../src'),
    path.resolve(__dirname, '../../../workers/src'),
    path.resolve(__dirname, '../../../frontend/src'),
  ];
  const directReaderPatterns = [
    /property\.propertyType\b/,
    /property\.ownershipType\b/,
    /propertyType:\s*true/,
    /ownershipType:\s*true/,
  ];
  const findings = [];
  const visit = (entry) => {
    for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
      const absolute = path.join(entry, child.name);
      if (child.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx)$/.test(child.name)) {
        const source = fs.readFileSync(absolute, 'utf8');
        // Service Price Radar's local snapshot DTO retains a compatibility
        // output key; its source value is canonical dwellingType.
        if (absolute.endsWith('servicePriceRadar.engine.ts')) continue;
        for (const pattern of directReaderPatterns) {
          if (pattern.test(source)) findings.push(`${path.relative(path.resolve(__dirname, '../../../..'), absolute)}: ${pattern}`);
        }
      }
    }
  };
  sourceRoots.forEach(visit);
  assert.deepEqual(findings, []);

  const status = read('../../../../docs/property-context/PHASE8_IMPLEMENTATION_STATUS.md');
  assert.match(status, /legacy Property classification removal is implemented/);
  assert.match(status, /Remaining Phase 8 slices/);
  assert.match(status, /Phase 8 is in progress/);
});

test('generic assistant and persisted response snapshots use bounded canonical contracts', () => {
  const gemini = read('../../src/services/gemini.service.ts');
  const propertyService = read('../../src/services/property.service.ts');
  assert.doesNotMatch(gemini, /private getPropertyContext\(/);
  assert.doesNotMatch(gemini, /PropertyAIGuidance|=== PROPERTY OVERVIEW ===/);
  assert.match(gemini, /getAggregationPropertyContext\(propertyId, userId, 'SEARCH_ASSISTANT'\)/);
  assert.doesNotMatch(propertyService, /getPropertyContextForAI|PropertyAIGuidance/);

  const canonicalSnapshotSources = [
    read('../../src/services/propertyInsight.service.ts'),
    read('../../src/services/homeRiskReplay.service.ts'),
    read('../../src/services/homeRiskReplay.engine.ts'),
    read('../../src/services/servicePriceRadar.engine.ts'),
    read('../../src/services/homeEventRadarMatcher.service.ts'),
  ];
  for (const source of canonicalSnapshotSources) {
    assert.doesNotMatch(source, /propertyType:\s*(?:property|context)\./);
    assert.doesNotMatch(source, /homeType:\s*(?:property|context)\./);
    assert.doesNotMatch(source, /squareFootage:\s*(?:property|context)\./);
  }

  const homeScore = read('../../src/services/homeScoreReport.service.ts');
  const frontendTypes = read('../../../frontend/src/types/index.ts');
  assert.doesNotMatch(homeScore, /propertyType\?:\s*string/);
  assert.doesNotMatch(frontendTypes, /reportMeta\.propertyType/);
  assert.match(homeScore, /dwellingType:\s*propertyContext\.dwellingType/);
});

test('financial, item, and snapshot ownership stays explicit', () => {
  const schema = read('../../prisma/schema.prisma');
  const coverageAnalysis = schema.match(/model CoverageAnalysis\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(coverageAnalysis, /inventoryItemId\s+String\?/);
  assert.match(coverageAnalysis, /inventoryItem\s+InventoryItem\?/);
  assert.match(coverageAnalysis, /@@index\(\[inventoryItemId, computedAt\(sort: Desc\)\]\)/);

  const coverageService = read('../../src/services/coverageAnalysis.service.ts');
  const resolutionCenter = read('../../src/services/resolutionCenter.service.ts');
  assert.doesNotMatch(coverageService, /parseItemIdFromInputsSnapshot/);
  assert.doesNotMatch(resolutionCenter, /parseItemIdFromInputsSnapshot/);
  assert.match(coverageService, /where: \{ propertyId, inventoryItemId: itemId \}/);
  assert.match(coverageService, /where: \{ propertyId, inventoryItemId: null \}/);

  const propertyService = read('../../src/services/property.service.ts');
  const propertyValidation = read('../../src/utils/validators.ts');
  const homeManagementRoutes = read('../../src/routes/home-management.routes.ts');
  assert.doesNotMatch(propertyService, /homeAssets|HomeAsset/);
  assert.doesNotMatch(propertyValidation, /homeAssets|HomeAsset/);
  assert.doesNotMatch(homeManagementRoutes, /home-assets/);
  assert.match(propertyService, /majorAppliances/);

  const sellHoldRentApi = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/sellHoldRentApi.ts');
  assert.doesNotMatch(sellHoldRentApi, /FinanceSnapshot|getFinanceSnapshot|saveFinanceSnapshot/);
  assert.match(sellHoldRentApi, /FinancingProfileProjection/);

  const ownershipAudit = read('../../../../docs/property-context/PHASE8_OWNERSHIP_AUDIT.md');
  assert.match(ownershipAudit, /PropertyFinancingProfile.*current financing/s);
  assert.match(ownershipAudit, /InventoryItem.*physical-item/s);
  assert.match(ownershipAudit, /inputsSnapshot.*evidence/s);
});
