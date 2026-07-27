const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('canonical coverage workspace exposes the four Slice 1 stages', () => {
  const workspace = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx',
  );

  assert.match(workspace, /title="Coverage & Premium Review"/);
  for (const stage of ['current', 'questions', 'renewal', 'risk']) {
    assert.match(workspace, new RegExp(`key: '${stage}'`));
    assert.match(workspace, new RegExp(`coverage-stage-${stage}`));
  }
  assert.match(workspace, /<InsuranceTrendClient embedded \/>/);
  assert.match(workspace, /<RiskPremiumOptimizerPanel propertyId=\{propertyId\} \/>/);
});

test('legacy property routes preserve query context and select the canonical stage', () => {
  const redirect = read(
    'apps/frontend/src/components/coverage/LegacyCoverageStageRedirect.tsx',
  );
  assert.match(redirect, /new URLSearchParams\(serializedSearchParams\)/);
  assert.match(redirect, /next\.set\('stage', stage\)/);
  assert.match(
    redirect,
    /tools\/coverage-intelligence\?\$\{next\.toString\(\)\}/,
  );

  const routes = {
    'coverage-options': 'questions',
    'insurance-trend': 'renewal',
    'risk-premium-optimizer': 'risk',
  };
  for (const [route, stage] of Object.entries(routes)) {
    const page = read(
      `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/${route}/page.tsx`,
    );
    assert.match(
      page,
      new RegExp(`LegacyCoverageStageRedirect stage="${stage}"`),
    );
  }
});

test('generated capability inventory contains one coverage and premium capability', () => {
  const inventory = JSON.parse(
    read('docs/product/capability-discovery/current-capability-inventory.json'),
  );
  const retiredIds = new Set([
    'coverage-options',
    'insurance-trend',
    'risk-premium-optimizer',
  ]);
  const coverageCapabilities = inventory.capabilities.filter(
    (capability) =>
      capability.id === 'coverage-intelligence' || retiredIds.has(capability.id),
  );

  assert.deepEqual(
    coverageCapabilities.map(({ id, label }) => ({ id, label })),
    [{
      id: 'coverage-intelligence',
      label: 'Coverage & Premium Review',
    }],
  );
});

test('legacy analytics ids converge on the canonical coverage lifecycle', () => {
  const lifecycle = read(
    'apps/backend/src/services/analytics/toolLifecycle.contract.ts',
  );
  for (const legacyId of [
    'coverage-options',
    'insurance-trend',
    'risk-premium-optimizer',
  ]) {
    assert.match(
      lifecycle,
      new RegExp(`'${legacyId}': 'coverage-intelligence'`),
    );
  }
});
