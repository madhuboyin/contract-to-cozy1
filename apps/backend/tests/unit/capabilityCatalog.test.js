const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilityCatalogSchema,
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} = require('../../src/productFramework/capabilities/index.ts');

function availability(options = {}) {
  return createCapabilityAvailabilityAdapter({
    registry: canonicalCapabilityRegistry,
    failureMode: options.failureMode ?? 'BETA_FAIL_OPEN',
    loadPolicy: () => ({
      enabled: options.enabled ?? true,
      enforceReleaseGates: options.enforceReleaseGates ?? false,
      disabledToolIds: options.disabledToolIds ?? [],
      rollouts: options.rollouts ?? {},
    }),
  });
}

test('catalog projection is serializable, narrow, and excludes workflow-only capabilities', () => {
  const result = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability(),
    userId: 'user-1',
    propertyId: 'property-1',
  });

  assert.doesNotThrow(() => CapabilityCatalogSchema.parse(result));
  assert.equal(result.capabilities.length, 51);
  assert.equal(result.capabilities.some((entry) => entry.id === 'quote-comparison'), false);

  const material = result.capabilities.find((entry) => entry.id === 'material-specs');
  assert.equal(material.href, '/dashboard/properties/property-1/materials');
  assert.equal(material.routeTemplate, '/dashboard/properties/[id]/materials');
  assert.equal('baseScore' in material, false);
  assert.equal('reasonTemplates' in material, false);
  assert.equal('governance' in material, false);
});

test('catalog can include workflow-only capabilities for an explicit workflow context', () => {
  const result = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability(),
    userId: 'user-1',
    includeWorkflowContext: true,
  });

  assert.equal(result.capabilities.length, 52);
  assert.equal(result.capabilities.find((entry) => entry.id === 'quote-comparison').workflowOnly, true);
});

test('catalog preserves property selection through hrefs and provides property selection fallbacks', () => {
  const selected = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability(),
    propertyId: 'property with spaces',
  });
  const unselected = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability(),
  });

  assert.equal(
    selected.capabilities.find((entry) => entry.id === 'seller-prep').href,
    '/dashboard/properties/property%20with%20spaces/seller-prep',
  );
  assert.match(
    unselected.capabilities.find((entry) => entry.id === 'seller-prep').href,
    /^\/dashboard\/properties\?navTarget=tool%3Aseller-prep$/,
  );
});

test('catalog applies global, individual, and release availability filtering', () => {
  const disabled = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability({ disabledToolIds: ['material-specs'] }),
  });
  assert.equal(disabled.capabilities.some((entry) => entry.id === 'material-specs'), false);

  const globallyDisabled = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability({ enabled: false }),
  });
  assert.equal(globallyDisabled.capabilities.length, 0);

  const releaseGated = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: availability({
      failureMode: 'LAUNCH_FAIL_CLOSED',
      enforceReleaseGates: true,
      rollouts: {
        MATERIAL_SPECS: { enabled: true, cohort: 'FULL', rolloutPct: 100 },
      },
    }),
  });
  assert.deepEqual(releaseGated.capabilities.map((entry) => entry.id), ['material-specs']);
});
