const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const {
  OWNERSHIP_COST_CATEGORIES,
  OWNERSHIP_COST_EVIDENCE_STATUSES,
  OWNERSHIP_COST_INVARIANTS,
  OWNERSHIP_COST_LENSES,
  OWNERSHIP_COST_TEMPORAL_KINDS,
  OWNERSHIP_COST_VIEW_KEYS,
} = require('../../src/services/ownershipCosts/ownershipCost.contract.ts');

test('canonical ownership-cost contract separates lenses, evidence, and time', () => {
  assert.deepEqual(OWNERSHIP_COST_VIEW_KEYS, [
    'current',
    'changes',
    'forecast',
    'variability',
  ]);
  assert.ok(OWNERSHIP_COST_LENSES.includes('OPERATING_EXPENSE'));
  assert.ok(OWNERSHIP_COST_LENSES.includes('ECONOMIC_COST'));
  assert.ok(OWNERSHIP_COST_CATEGORIES.includes('MORTGAGE_PRINCIPAL'));
  assert.ok(OWNERSHIP_COST_CATEGORIES.includes('RESERVE_CONTRIBUTION'));
  assert.ok(OWNERSHIP_COST_EVIDENCE_STATUSES.includes('OBSERVED'));
  assert.ok(OWNERSHIP_COST_EVIDENCE_STATUSES.includes('FORECAST'));
  assert.ok(OWNERSHIP_COST_TEMPORAL_KINDS.includes('OBSERVED_PAST_PERIOD'));
  assert.ok(OWNERSHIP_COST_TEMPORAL_KINDS.includes('SCENARIO_PERIOD'));
  assert.ok(OWNERSHIP_COST_INVARIANTS.includes('Missing is not zero.'));
});

test('one Product Framework capability owns the consolidated outcome', () => {
  const registry = read(
    'apps/backend/src/productFramework/capabilities/definitions/saveOptimize.ts',
  );
  assert.match(registry, /\['ownership-costs', 'Ownership Costs'/);
  assert.match(
    registry,
    /'\/dashboard\/properties\/\[id\]\/ownership-costs', 'OWNERSHIP_COSTS', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'/,
  );
  for (const retiredId of [
    'cost-explainer',
    'cost-growth',
    'cost-volatility',
    'true-cost',
  ]) {
    assert.doesNotMatch(
      registry,
      new RegExp(`\\['${retiredId}',`),
      `${retiredId} must not remain a peer capability`,
    );
  }
});

test('legacy routes preserve query context and select canonical views', () => {
  const redirect = read(
    'apps/frontend/src/components/ownership-costs/LegacyOwnershipCostsViewRedirect.tsx',
  );
  assert.match(redirect, /new URLSearchParams\(serializedSearchParams\)/);
  assert.match(redirect, /next\.set\('view', view\)/);
  assert.match(redirect, /next\.delete\('stage'\)/);

  const routes = {
    'true-cost': 'current',
    'cost-explainer': 'changes',
    'cost-growth': 'forecast',
    'cost-volatility': 'variability',
  };
  for (const [route, view] of Object.entries(routes)) {
    const page = read(
      `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/${route}/page.tsx`,
    );
    assert.match(
      page,
      new RegExp(`LegacyOwnershipCostsViewRedirect view="${view}"`),
    );
  }
});

test('navigation and lifecycle aliases converge on ownership-costs', () => {
  const mobile = read(
    'apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts',
  );
  assert.equal((mobile.match(/key: 'ownership-costs'/g) ?? []).length, 2);
  for (const retiredId of [
    'cost-explainer',
    'cost-growth',
    'cost-volatility',
    'true-cost',
  ]) {
    assert.doesNotMatch(mobile, new RegExp(`key: '${retiredId}'`));
  }

  const lifecycle = read(
    'apps/backend/src/services/analytics/toolLifecycle.contract.ts',
  );
  for (const retiredId of [
    'cost-explainer',
    'cost-growth',
    'cost-volatility',
    'true-cost',
  ]) {
    assert.match(
      lifecycle,
      new RegExp(`'${retiredId}': 'ownership-costs'`),
    );
  }
});

test('canonical route shell and source-ownership ADR are present', () => {
  const workspace = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
  );
  for (const view of ['current', 'changes', 'forecast', 'variability']) {
    assert.match(workspace, new RegExp(`key: '${view}'`));
  }
  assert.match(workspace, /Missing categories are not zero/);
  assert.doesNotMatch(workspace, /workflow_completed/);

  const adr = read('docs/architecture/ADR-OWNERSHIP-COSTS-CONSOLIDATION.md');
  assert.match(adr, /\*\*Status:\*\* Accepted/);
  assert.match(adr, /Source ownership/);
});
