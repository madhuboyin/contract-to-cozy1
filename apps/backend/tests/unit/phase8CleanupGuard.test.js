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

test('remaining legacy classification work is explicitly inventoried, not silently accepted', () => {
  const status = read('../../../../docs/property-context/PHASE8_IMPLEMENTATION_STATUS.md');
  assert.match(status, /Property\.propertyType/);
  assert.match(status, /Property\.ownershipType/);
  assert.match(status, /Remaining Phase 8 slices/);
  assert.match(status, /Phase 8 is in progress/);
});
