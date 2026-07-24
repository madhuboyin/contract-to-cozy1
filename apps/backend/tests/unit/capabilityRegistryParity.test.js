const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  CAPABILITY_GOLDEN_FIXTURES,
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  canonicalizeToolLifecycleId,
} = require('../../src/services/analytics/toolLifecycle.contract.ts');

const repoRoot = path.resolve(__dirname, '../../../..');
const inventory = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'docs/product/capability-discovery/current-capability-inventory.json'),
  'utf8',
));

function parseLegacyRelationships() {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/frontend/src/features/tools/contextToolMappings.ts'),
    'utf8',
  );
  const body = source.match(/CONTEXT_TOOL_MAPPINGS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
  const relationships = new Map();
  for (const match of body.matchAll(/^\s*(?:'([^']+)'|([a-z][a-z0-9-]*)):\s*\[([^\]]*)\]/gm)) {
    const id = match[1] ?? match[2];
    if (!canonicalCapabilityRegistry.getById(id)) continue;
    relationships.set(
      id,
      [...match[3].matchAll(/'([^']+)'/g)].map((entry) => entry[1]),
    );
  }
  return relationships;
}

test('canonical registry has exact catalog identity, route, release, and lifecycle parity', () => {
  assert.equal(canonicalCapabilityRegistry.capabilities.length, 52);
  assert.equal(inventory.summary.distinctCapabilities, 52);

  const expectedIds = inventory.capabilities.map((entry) => entry.id).sort();
  const actualIds = canonicalCapabilityRegistry.capabilities.map((entry) => entry.id);
  assert.deepEqual(actualIds, expectedIds);

  for (const expected of inventory.capabilities) {
    const actual = canonicalCapabilityRegistry.getById(expected.id);
    assert.ok(actual, `Missing canonical definition for ${expected.id}`);
    assert.equal(actual.presentation.label, expected.label, `${expected.id} label`);
    assert.equal(actual.destination.routeTemplate, expected.canonicalRoute, `${expected.id} route`);
    assert.equal(actual.presentation.outcomeCategory, expected.outcomeCategory, `${expected.id} outcome`);
    assert.equal(actual.governance.rolloutKey, expected.rolloutKey, `${expected.id} rollout`);
    assert.equal(actual.governance.releaseStage, expected.releaseStage, `${expected.id} release`);
    assert.equal(actual.governance.safetyTier, expected.safetyTier, `${expected.id} safety`);
    assert.equal(actual.lifecycle.completionKind, expected.completionKind, `${expected.id} completion`);
    assert.equal(canonicalizeToolLifecycleId(expected.id), expected.id, `${expected.id} lifecycle`);

    const expectedMode = expected.recommendationDisposition === 'WORKFLOW_ONLY'
      ? 'WORKFLOW_ONLY'
      : expected.recommendationDisposition.startsWith('CONTEXTUAL_')
        ? 'CONTEXTUAL'
        : 'CATALOG_ONLY';
    assert.equal(actual.recommendation.mode, expectedMode, `${expected.id} recommendation mode`);
  }
});

test('canonical explicit relationships preserve current related-tool edges', () => {
  const relationships = parseLegacyRelationships();
  assert.equal(relationships.size, 31);
  for (const [id, expectedRelatedIds] of relationships) {
    const actual = canonicalCapabilityRegistry.getById(id);
    assert.deepEqual(
      actual.recommendation.explicitRelatedCapabilityIds,
      expectedRelatedIds,
      `${id} related capabilities`,
    );
  }
});

test('workflow-only capabilities never enter the general catalog projection', () => {
  const workflowOnly = canonicalCapabilityRegistry.capabilities
    .filter((entry) => entry.destination.workflowOnly)
    .map((entry) => entry.id);
  assert.deepEqual(workflowOnly, ['quote-comparison']);
  assert.equal(
    canonicalCapabilityRegistry.capabilities
      .filter((entry) => !entry.destination.workflowOnly)
      .some((entry) => entry.id === 'quote-comparison'),
    false,
  );
});

test('golden fixtures cover every contextual definition and its readiness references', () => {
  assert.equal(CAPABILITY_GOLDEN_FIXTURES.length, 9);
  const covered = new Set(
    CAPABILITY_GOLDEN_FIXTURES.flatMap((fixture) => fixture.contextualCapabilityIds),
  );
  const contextualIds = canonicalCapabilityRegistry.capabilities
    .filter((entry) => entry.recommendation.mode === 'CONTEXTUAL')
    .map((entry) => entry.id);

  assert.deepEqual([...covered].sort(), contextualIds);

  for (const fixture of CAPABILITY_GOLDEN_FIXTURES) {
    for (const capabilityId of fixture.contextualCapabilityIds) {
      const capability = canonicalCapabilityRegistry.getById(capabilityId);
      assert.equal(
        capability.recommendation.mode,
        'CONTEXTUAL',
        `${fixture.id} references non-contextual ${capabilityId}`,
      );
    }
    for (const capabilityId of fixture.needsContextCapabilityIds) {
      const capability = canonicalCapabilityRegistry.getById(capabilityId);
      assert.ok(
        capability.recommendation.readinessRequirements.length > 0,
        `${fixture.id} expects a readiness gate for ${capabilityId}`,
      );
    }
  }
});
