const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

const {
  buildCapabilityProductToolSeeds,
} = require('../../prisma/knowledgeHubCapabilityProjection.ts');
const {
  PRODUCT_TOOL_SEEDS,
} = require('../../prisma/knowledgeHub.seed.ts');
const {
  KNOWLEDGE_HUB_PGADMIN_SEED_PATH,
  renderKnowledgeHubPgAdminSeedSql,
} = require('../../prisma/generateKnowledgeHubPgAdminSeed.ts');
const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');

const EXISTING_STABLE_KEYS = {
  'replace-repair': 'REPLACE_REPAIR',
  'coverage-intelligence': 'COVERAGE_INTELLIGENCE',
  'do-nothing-simulator': 'DO_NOTHING_SIMULATOR',
  budget: 'BUDGET_PLANNER',
  oracle: 'APPLIANCE_ORACLE',
  documents: 'DOCUMENT_VAULT',
  appreciation: 'VALUE_TRACKER',
  emergency: 'EMERGENCY_HELP',
  'property-tax': 'PROPERTY_TAX',
  'ownership-costs': 'OWNERSHIP_COSTS',
  'sell-hold-rent': 'SELL_HOLD_RENT',
  'break-even': 'BREAK_EVEN',
  'capital-timeline': 'CAPITAL_TIMELINE',
  'seller-prep': 'SELLER_PREP',
  'home-timeline': 'HOME_TIMELINE',
  'status-board': 'STATUS_BOARD',
};

test('Knowledge Hub projection includes every canonical capability exactly once', () => {
  const seeds = buildCapabilityProductToolSeeds();
  assert.equal(seeds.length, 43);
  assert.equal(new Set(seeds.map((seed) => seed.key)).size, 43);
  assert.equal(new Set(seeds.map((seed) => seed.slug)).size, 43);
  assert.deepEqual(
    seeds.map((seed) => seed.slug).sort(),
    canonicalCapabilityRegistry.capabilities.map((capability) => capability.id),
  );
});

test('Knowledge Hub projection preserves all previously published stable keys', () => {
  const bySlug = new Map(buildCapabilityProductToolSeeds().map((seed) => [seed.slug, seed]));
  for (const [capabilityId, stableKey] of Object.entries(EXISTING_STABLE_KEYS)) {
    assert.equal(bySlug.get(capabilityId).key, stableKey, capabilityId);
  }
});

test('registry-owned ProductTool fields match canonical capability metadata', () => {
  const bySlug = new Map(buildCapabilityProductToolSeeds().map((seed) => [seed.slug, seed]));
  for (const capability of canonicalCapabilityRegistry.capabilities) {
    const seed = bySlug.get(capability.id);
    assert.equal(seed.name, capability.presentation.label, `${capability.id} label`);
    assert.equal(seed.shortDescription, capability.presentation.shortDescription, `${capability.id} description`);
    assert.equal(seed.iconName, capability.presentation.iconName, `${capability.id} icon`);
    assert.equal(
      seed.routePath,
      capability.destination.routeTemplate.split('[id]').join(':propertyId'),
      `${capability.id} route`,
    );
    assert.equal(seed.metadata.capabilityId, capability.id);
    assert.equal(seed.metadata.capabilityVersion, capability.version);
    assert.equal(seed.metadata.registryVersion, canonicalCapabilityRegistry.version);
    assert.equal(seed.metadata.rolloutKey, capability.governance.rolloutKey);
    assert.equal('reasonTemplates' in seed.metadata, false);
    assert.equal('reviewer' in seed.metadata, false);
  }
});

test('Knowledge Hub seed preserves explicit platform entries without reviving retired capabilities', () => {
  assert.equal(PRODUCT_TOOL_SEEDS.length, 45);
  const keys = new Set(PRODUCT_TOOL_SEEDS.map((seed) => seed.key));
  assert.equal(keys.size, PRODUCT_TOOL_SEEDS.length);
  assert.equal(keys.has('SEASONAL_MAINTENANCE'), true);
  assert.equal(keys.has('HOME_SCORE_REPORT'), false);
  assert.equal(keys.has('REPORT_PACK'), true);
  for (const capabilitySeed of buildCapabilityProductToolSeeds()) {
    assert.equal(keys.has(capabilitySeed.key), true);
  }
});

test('pgAdmin SQL seed is current with the canonical Knowledge Hub projection', () => {
  const checkedInSql = fs.readFileSync(KNOWLEDGE_HUB_PGADMIN_SEED_PATH, 'utf8');
  assert.equal(checkedInSql, renderKnowledgeHubPgAdminSeedSql());
  assert.match(checkedInSql, /^BEGIN;$/m);
  assert.match(checkedInSql, /^COMMIT;$/m);
  assert.match(checkedInSql, /ON CONFLICT \("key"\) DO UPDATE SET/);
  for (const productTool of PRODUCT_TOOL_SEEDS) {
    assert.match(checkedInSql, new RegExp(`'${productTool.key}'`));
  }
});
