const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  RADAR_ACTION_CODES,
  RADAR_ACTION_DEFINITIONS,
  RADAR_ACTION_REGISTRY,
  RADAR_ACTION_REGISTRY_VERSION,
  projectRadarActions,
} = require('../../src/modules/homeEventRadar/domain/radarActionRegistry');
const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/canonicalCapabilityRegistry');

function projection(overrides = {}) {
  return projectRadarActions({
    storedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS',
      label: 'Secure loose outdoor items',
      priority: 'high',
      responsibilityScope: 'BUILDING_EXTERIOR',
      responsibleParty: 'OWNER',
      applicability: 'owner_action',
    }],
    sourceFamily: 'weather',
    impact: 'moderate',
    confidence: 'medium',
    propertyId: 'property / one',
    matchId: 'match / one',
    eventId: 'event / one',
    officialSourceUrl: 'https://alerts.weather.gov/example',
    ...overrides,
  });
}

test('registry is complete, unique, and bound to canonical capability routes', () => {
  assert.equal(RADAR_ACTION_REGISTRY_VERSION, 'radar-actions-v1');
  assert.equal(RADAR_ACTION_REGISTRY.size, RADAR_ACTION_CODES.length);
  assert.equal(new Set(RADAR_ACTION_CODES).size, RADAR_ACTION_CODES.length);

  for (const definition of RADAR_ACTION_DEFINITIONS) {
    assert.equal(RADAR_ACTION_REGISTRY.get(definition.code), definition);
    assert.ok(definition.labelTemplate.length > 0);
    assert.ok(definition.eventFamilies.length > 0);
    assert.ok(definition.requiredContext.includes('match_id'));
    if (definition.destination.kind !== 'internal') continue;
    const capability = canonicalCapabilityRegistry.getById(
      definition.destination.targetCapability,
    );
    assert.ok(capability, `${definition.code} references a known capability`);
    assert.equal(
      capability.destination.routeTemplate,
      definition.destination.routeTemplate,
      `${definition.code} uses the capability registry route`,
    );
  }
});

test('every action emitted by impact rules has a reviewed registry code', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../../src/modules/homeEventRadar/domain/radarImpactRules.ts',
  ), 'utf8');
  const emittedCodes = [...source.matchAll(/action\(\s*'([^']+)'/g)]
    .map((match) => match[1]);

  assert.deepEqual(
    [...new Set(emittedCodes)].sort(),
    [...RADAR_ACTION_CODES].sort(),
  );
});

test('unknown, malformed, wrong-family, and under-threshold actions fail closed', () => {
  assert.deepEqual(projection({
    storedActions: [{
      code: 'UNREVIEWED_ACTION',
      label: 'Open unsafe destination',
      priority: 'high',
      href: 'javascript:alert(1)',
    }],
  }), []);
  assert.deepEqual(projection({
    storedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS',
      label: 'Secure loose outdoor items',
      priority: 'urgent',
    }],
  }), []);
  assert.deepEqual(projection({ sourceFamily: 'insurance' }), []);
  assert.deepEqual(projection({
    storedActions: [{
      code: 'INSPECT_ROOF',
      label: 'Inspect roof',
      priority: 'high',
    }],
    confidence: 'low',
  }), []);
});

test('reviewed projection exposes only bounded fields and registry-owned destinations', () => {
  const [action] = projection({
    storedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS',
      label: '  Secure loose outdoor items  ',
      priority: 'high',
      responsibilityScope: 'BUILDING_EXTERIOR',
      responsibleParty: 'OWNER',
      applicability: 'owner_action',
      href: 'javascript:alert(1)',
      destination: { kind: 'external', href: 'https://evil.example' },
      unexpected: 'not projected',
    }],
  });

  assert.deepEqual(action, {
    code: 'SECURE_OUTDOOR_ITEMS',
    label: 'Secure or bring in loose outdoor items',
    priority: 'high',
    responsibilityScope: 'BUILDING_EXTERIOR',
    responsibleParty: 'OWNER',
    applicability: 'owner_action',
    registryVersion: 'radar-actions-v1',
    completionEvidence: 'user_attestation',
    safetyClassification: 'property_protection',
    targetCapability: null,
    supportedTaskOperations: [
      'create_task',
      'create_reminder',
      'link_existing_task',
    ],
    destination: { kind: 'informational', href: null },
  });
});

test('responsibility wording is generated from reviewed templates and bounded parties', () => {
  const [action] = projection({
    storedActions: [{
      code: 'INSPECT_ROOF',
      label: 'Persisted copy is not trusted',
      priority: 'high',
      responsibilityScope: 'ROOF',
      responsibleParty: 'ASSOCIATION',
      applicability: 'coordinate',
    }],
  });

  assert.equal(
    action.label,
    'Contact your association to inspect roof shingles, flashing, and drainage',
  );
  assert.equal(action.responsibleParty, 'ASSOCIATION');
  assert.equal(action.applicability, 'coordinate');
});

test('internal destinations use reviewed routes and preserve encoded lineage', () => {
  const [action] = projection({
    storedActions: [{
      code: 'GET_QUOTES',
      label: 'Compare reviewed coverage options',
      priority: 'high',
    }],
    sourceFamily: 'insurance',
    impact: 'watch',
  });

  assert.equal(action.targetCapability, 'coverage-options');
  assert.equal(action.destination.kind, 'internal');
  const url = new URL(action.destination.href, 'https://example.test');
  assert.equal(
    url.pathname,
    '/dashboard/properties/property%20%2F%20one/tools/coverage-options',
  );
  assert.equal(url.searchParams.get('propertyId'), 'property / one');
  assert.equal(url.searchParams.get('radarMatchId'), 'match / one');
  assert.equal(url.searchParams.get('radarEventId'), 'event / one');
});

test('official-source destinations permit HTTPS only and otherwise remain informational', () => {
  const monitor = {
    code: 'MONITOR_SITUATION',
    label: 'Monitor official updates',
    priority: 'medium',
  };
  const [safe] = projection({
    storedActions: [monitor],
    sourceFamily: 'other',
    impact: 'none',
    confidence: 'low',
  });
  assert.deepEqual(safe.destination, {
    kind: 'external',
    href: 'https://alerts.weather.gov/example',
  });

  const [unsafe] = projection({
    storedActions: [monitor],
    sourceFamily: 'other',
    impact: 'none',
    confidence: 'low',
    officialSourceUrl: 'http://untrusted.example/event',
  });
  assert.deepEqual(unsafe.destination, { kind: 'informational', href: null });
});
