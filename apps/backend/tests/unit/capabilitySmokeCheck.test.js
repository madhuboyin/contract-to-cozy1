const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  CapabilitySmokeConfigSchema,
  canonicalCapabilityRegistry,
  runCapabilitySmokeCheck,
} = require('../../src/productFramework/capabilities/index.ts');

const registryVersion = canonicalCapabilityRegistry.version;
const capability = canonicalCapabilityRegistry.getById('coverage-options');

function scenario(name, propertyId) {
  return {
    name,
    propertyId,
    expectedCapabilityIds: ['coverage-options'],
    forbiddenCapabilityIds: ['financing'],
    minimumHomeSuggestions: 1,
    minimumPropertySuggestions: 1,
  };
}

function config() {
  return {
    contractVersion: 'capability-smoke-v1',
    unauthorizedPropertyId: 'property-not-authorized',
    requireRealUserLaunchMode: true,
    requireReleaseReady: true,
    scenarios: [
      scenario('sparse new home', 'property-new'),
      scenario('established home', 'property-established'),
      scenario('active ownership decision', 'property-decision'),
    ],
  };
}

function catalog(propertyId) {
  return {
    registryVersion,
    propertyId,
    workflowContextIncluded: false,
    capabilities: [{
      id: capability.id,
      version: capability.version,
      label: capability.presentation.label,
      shortDescription: capability.presentation.shortDescription,
      longDescription: capability.presentation.longDescription,
      iconName: capability.presentation.iconName,
      outcomeCategory: capability.presentation.outcomeCategory,
      primaryJob: capability.productFramework.primaryJob,
      primaryDestination: capability.productFramework.primaryDestination,
      intentAliases: capability.presentation.intentAliases,
      supportedContext: capability.destination.acceptedContext,
      readinessRequirements: capability.recommendation.readinessRequirements,
      expectedOutput: capability.lifecycle.expectedOutput,
      routeTemplate: capability.destination.routeTemplate,
      href: capability.destination.routeTemplate.replace('[id]', propertyId),
      workflowOnly: false,
      releaseStage: capability.governance.releaseStage,
      badges: capability.presentation.badges,
    }],
  };
}

function suggestions(propertyId, surface) {
  return {
    contractVersion: 'capability-suggestions-v1',
    registryVersion,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: `context-${propertyId}`,
    generatedAt: '2026-07-25T12:00:00.000Z',
    surface,
    suggestions: [{
      suggestionId: `coverage-options:HOME_ACTION:action-${propertyId}:context-${propertyId}`,
      capabilityId: 'coverage-options',
      manifestVersion: capability.version,
      recommendationVersion: 'capability-recommendation-v1',
      contextVersion: `context-${propertyId}`,
      rank: 1,
      scoreBand: 'HIGH',
      label: capability.presentation.label,
      shortDescription: capability.presentation.shortDescription,
      iconName: capability.presentation.iconName,
      outcomeCategory: capability.presentation.outcomeCategory,
      reasonCode: 'COVERAGE_GAPS_PRESENT',
      whyNow: 'A current coverage decision makes this useful now.',
      expectedOutcome: capability.recommendation.expectedOutcome,
      readiness: {
        state: 'READY',
        reasonCodes: [],
        missingFactKeys: [],
        explanations: [],
      },
      evidence: {
        mode: 'STRUCTURED_ONLY',
        summary: 'Based on authorized Home Record context.',
        sourceObservedAt: '2026-07-25T11:00:00.000Z',
        actionConfidence: null,
        contextWarningCodes: [],
      },
      source: {
        kind: 'HOME_ACTION',
        id: `action-${propertyId}`,
        actionId: `action-${propertyId}`,
        journeyId: null,
        entityType: 'INVENTORY_ITEM',
        entityId: `item-${propertyId}`,
        sourceVersion: '1',
        observedAt: '2026-07-25T11:00:00.000Z',
      },
      launch: {
        label: `Open ${capability.presentation.label}`,
        href: capability.destination.routeTemplate.replace('[id]', propertyId),
      },
    }],
  };
}

function response(status, body, cacheControl = null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cacheControl) {
    headers.set('cache-control', cacheControl);
    headers.set('vary', 'Authorization, Cookie');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function smokeFetcher(overrides = {}) {
  return async (input, init) => {
    const url = new URL(input);
    assert.equal(init.headers.Authorization, 'Bearer opaque-test-token');
    assert.match(
      init.headers['X-Capability-Smoke-Run'],
      /^capability-smoke:/,
    );
    if (url.pathname === '/api/tool-discovery/availability') {
      return response(200, {
        success: true,
        data: {
          releaseMode: 'REAL_USER_LAUNCH',
          releaseReady: true,
          releaseBlockers: [],
          registryVersion,
          configurationValid: true,
          rolloutKeyParity: { valid: true, missingKeys: [], unknownKeys: [] },
        },
      });
    }
    const propertyId = decodeURIComponent(
      url.pathname.match(/properties\/([^/]+)/)?.[1]
      ?? url.searchParams.get('propertyId')
      ?? '',
    );
    if (propertyId === 'property-not-authorized') {
      return response(overrides.unauthorizedStatus ?? 404, {
        success: false,
        error: { code: 'PROPERTY_NOT_FOUND' },
      });
    }
    if (url.pathname === '/api/tool-capabilities') {
      return response(
        200,
        { success: true, data: catalog(propertyId) },
        'private, max-age=60',
      );
    }
    const surface = url.searchParams.get('surface');
    return response(
      200,
      { success: true, data: suggestions(propertyId, surface) },
      overrides.suggestionCacheControl ?? 'private, no-store',
    );
  };
}

test('CAP-904 requires distinct representative and unauthorized properties', () => {
  const invalid = config();
  invalid.scenarios[1].propertyId = invalid.scenarios[0].propertyId;
  invalid.unauthorizedPropertyId = invalid.scenarios[2].propertyId;

  const result = CapabilitySmokeConfigSchema.safeParse(invalid);
  assert.equal(result.success, false);
  assert.match(
    result.error.issues.map((issue) => issue.message).join(' '),
    /unique|unauthorized/i,
  );
});

test('CAP-904 validates authenticated representative-property contracts read-only', async () => {
  const report = await runCapabilitySmokeCheck({
    baseUrl: 'https://api.example.test',
    token: 'opaque-test-token',
    config: config(),
    registry: canonicalCapabilityRegistry,
    fetcher: smokeFetcher(),
    now: () => new Date('2026-07-25T12:30:00.000Z'),
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.requestCount, 12);
  assert.equal(report.unauthorizedPropertyProbe, 'PASS');
  assert.equal(
    report.smokeCorrelationId,
    'capability-smoke:2026-07-25T12:30:00.000Z',
  );
  assert.equal(report.scenarios.length, 3);
  assert.deepEqual(
    report.scenarios.map((item) => item.observedCapabilityIds),
    [
      ['coverage-options'],
      ['coverage-options'],
      ['coverage-options'],
    ],
  );
  assert.equal(
    JSON.stringify(report).includes('opaque-test-token'),
    false,
  );
});

test('CAP-904 fails when authorization or private no-store policy regresses', async () => {
  await assert.rejects(
    runCapabilitySmokeCheck({
      baseUrl: 'https://api.example.test',
      token: 'opaque-test-token',
      config: config(),
      registry: canonicalCapabilityRegistry,
      fetcher: smokeFetcher({ unauthorizedStatus: 200 }),
    }),
    /expected 404/,
  );

  await assert.rejects(
    runCapabilitySmokeCheck({
      baseUrl: 'https://api.example.test',
      token: 'opaque-test-token',
      config: config(),
      registry: canonicalCapabilityRegistry,
      fetcher: smokeFetcher({
        suggestionCacheControl: 'private, max-age=60',
      }),
    }),
    /no-store/,
  );
});
