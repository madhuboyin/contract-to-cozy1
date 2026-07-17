const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('InventoryItem is the sole canonical physical-item schema', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.doesNotMatch(schema, /model HomeAsset\s*\{/);
  assert.doesNotMatch(schema, /homeAssetId|linkedHomeAssetId/);
  assert.match(schema, /model InventoryItem[\s\S]*assetType\s+String\?/);
  assert.match(schema, /model InventoryItem[\s\S]*efficiencyRating\s+String\?/);
});

test('HomeItem is a one-to-one InventoryItem status projection', () => {
  const schema = read('../../prisma/schema.prisma');
  const homeItem = schema.match(/model HomeItem \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(homeItem, /inventoryItemId\s+String\s+@unique/);
  assert.doesNotMatch(homeItem, /kind|homeAsset/);
});

test('runtime code has no HomeAsset Prisma access', () => {
  const roots = ['../../src', '../../../workers/src'];
  for (const root of roots) {
    const absolute = path.resolve(__dirname, root);
    const stack = [absolute];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(target);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /prisma\.homeAsset/);
        }
      }
    }
  }
});

test('backend and worker runtime scopes use InventoryItem identity only', () => {
  const roots = ['../../src', '../../../workers/src'];
  for (const root of roots) {
    const absolute = path.resolve(__dirname, root);
    const stack = [absolute];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(target);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = fs.readFileSync(target, 'utf8');
          assert.doesNotMatch(source, /homeAssetId|linkedHomeAssetId|HOME_ASSET/);
        }
      }
    }
  }
});

test('PropertyFinancingProfile is the sole current financing model', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.doesNotMatch(schema, /model PropertyFinanceSnapshot\s*\{/);
  const property = schema.match(/model Property \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(property, /purchasePriceCents|purchaseDate/);

  const adapter = read('../../src/services/canonicalFinanceAdapter.service.ts');
  assert.match(adapter, /propertyFinancingProfile\.findUnique/);
  assert.doesNotMatch(adapter, /PropertyFinanceSnapshot/);

  const seed = read('../../prisma/seed.ts');
  assert.match(seed, /propertyFinancingProfile\.upsert/);
  assert.doesNotMatch(seed, /propertyFinanceSnapshot/);
});

test('Phase 0 consolidation has an explicit recorded disposition', () => {
  const decision = read('../../../../docs/property-context/PHASE0_CONSOLIDATION_DECISION.md');
  assert.match(decision, /InventoryItem.*only canonical/s);
  assert.match(decision, /HomeItem.*one-to-one/s);
  assert.match(decision, /PropertyFinancingProfile.*only current/s);
  assert.match(decision, /No database migration scripts/);
});
