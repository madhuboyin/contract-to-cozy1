const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  createCapabilityAvailabilityAdapter,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  buildToolLifecycleAnalyticsEvents,
} = require('../../src/services/analytics/toolLifecycle.ts');
const {
  homeContinuityAccessTestCompletionEvent,
} = require('../../src/services/analytics/homeDigitalWillLifecycle.ts');
const {
  buildTrustedContactScopedWill,
  evaluateHomeDigitalWillHandoffReadiness,
  HomeDigitalWillService,
} = require('../../src/services/homeDigitalWill.service.ts');

function entry(isEmergency = false) {
  return {
    id: 'entry-1',
    sectionId: 'section-1',
    entryType: 'INSTRUCTION',
    title: 'Main shutoff',
    content: 'Transferable property instruction',
    summary: null,
    priority: 'CRITICAL',
    sortOrder: 0,
    isPinned: true,
    isEmergency,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function willFixture(options = {}) {
  const emergency = options.emergency ?? true;
  const primary = options.primary ?? true;
  const reachable = options.reachable ?? true;
  return {
    id: 'will-1',
    propertyId: 'property-1',
    title: 'Home Digital Will',
    status: 'DRAFT',
    readiness: 'IN_PROGRESS',
    completionPercent: 50,
    setupCompletedAt: null,
    lastReviewedAt: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    sections: [{
      id: 'section-1',
      digitalWillId: 'will-1',
      type: 'EMERGENCY',
      title: 'Emergency',
      description: null,
      sortOrder: 0,
      isEnabled: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      entries: [entry(emergency)],
    }],
    trustedContacts: primary ? [{
      id: 'contact-1',
      digitalWillId: 'will-1',
      name: 'Private contact',
      email: reachable ? 'private@example.com' : null,
      phone: null,
      relationship: 'Family',
      role: 'FAMILY_MEMBER',
      accessLevel: 'VIEW',
      isPrimary: true,
      notes: 'Preparation-private grant notes',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }] : [],
    counts: {
      sectionCount: 1,
      entryCount: 1,
      trustedContactCount: primary ? 1 : 0,
      hasEmergencyEntries: emergency,
    },
  };
}

test('CAP-802 Home Continuity Plan owns reviewed package and access contracts', () => {
  const capability = canonicalCapabilityRegistry.getById('home-digital-will');
  assert.ok(capability);
  assert.equal(capability.version, 3);
  assert.equal(capability.presentation.label, 'Home Continuity Plan');
  assert.ok(
    capability.presentation.intentAliases.includes(
      'critical home documents handoff',
    ),
  );
  assert.equal(capability.lifecycle.completionKind, 'ARTIFACT_CREATED');
  assert.equal(
    capability.lifecycle.completionSignal,
    'home_continuity_access_tested',
  );
  assert.deepEqual(capability.productFramework.livingHomeRecordWrites, [
    'home-continuity-package',
    'handoff-recipient',
    'handoff-access-grant',
    'handoff-access-log',
  ]);
});

test('CAP-802 continuity plan stays contextual instead of entering general catalog search', () => {
  const availability = createCapabilityAvailabilityAdapter({
    registry: canonicalCapabilityRegistry,
    failureMode: 'LAUNCH_FAIL_CLOSED',
    loadPolicy: () => ({
      enabled: true,
      enforceReleaseGates: false,
      disabledToolIds: [],
      rollouts: {},
    }),
  });
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability,
    userId: 'user-1',
    propertyId: 'property-1',
  });
  const query = 'what someone needs to manage my home';
  const matches = catalog.capabilities.filter((capability) =>
    [
      capability.label,
      capability.shortDescription,
      ...capability.intentAliases,
    ].join(' ').toLowerCase().includes(query),
  );
  assert.deepEqual(
    matches.map((capability) => capability.id),
    [],
  );
});

test('CAP-802 publish readiness requires emergency content and a reachable primary contact', () => {
  assert.deepEqual(evaluateHomeDigitalWillHandoffReadiness(willFixture()), {
    state: 'READY',
    missingRequirements: [],
  });
  assert.deepEqual(evaluateHomeDigitalWillHandoffReadiness(willFixture({
    emergency: false,
    primary: false,
  })), {
    state: 'NEEDS_CONTEXT',
    missingRequirements: [
      'emergency-instruction',
      'primary-trusted-contact',
    ],
  });
  assert.deepEqual(evaluateHomeDigitalWillHandoffReadiness(willFixture({
    reachable: false,
  })), {
    state: 'NEEDS_CONTEXT',
    missingRequirements: ['primary-contact-method'],
  });
});

test('CAP-802 transferable views exclude preparation-private contact data', () => {
  const scoped = buildTrustedContactScopedWill(willFixture(), 'VIEW');
  assert.equal(scoped.sections[0].entries[0].content, 'Transferable property instruction');
  assert.deepEqual(scoped.trustedContacts, []);
  assert.equal(scoped.counts.trustedContactCount, 0);
  assert.equal(JSON.stringify(scoped).includes('private@example.com'), false);
  assert.equal(JSON.stringify(scoped).includes('Preparation-private'), false);
});

test('CAP-802 viewer access is blocked and publish is explicit', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/homeDigitalWill.routes.ts'),
    'utf8',
  );
  const propertyRead = routeSource.slice(routeSource.indexOf(
    "router.get(\n  '/properties/:propertyId/home-digital-will',",
  ));
  assert.ok(
    propertyRead.slice(0, 220).includes(
      "requireHouseholdRole('CONTRIBUTOR')",
    ),
  );
  assert.ok(routeSource.includes("'/home-digital-wills/:id/publish'"));
});

test('CAP-802 generic updates cannot bypass governed publishing', async () => {
  const service = new HomeDigitalWillService();
  service.assertWillOwnership = async () => ({ id: 'will-1' });
  await assert.rejects(
    service.updateWill('will-1', 'user-1', { status: 'ACTIVE' }),
    (error) => {
      assert.equal(error.code, 'USE_DIGITAL_WILL_PUBLISH');
      return true;
    },
  );
});

test('CAP-802 tested recipient access emits canonical continuity completion', () => {
  const [event] = buildToolLifecycleAnalyticsEvents({
    userId: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    events: [homeContinuityAccessTestCompletionEvent({
      handoffPackageId: 'handoff-1',
      grantId: 'grant-1',
      recipientId: 'recipient-1',
      accessTestId: 'access-test-1',
    })],
  });
  assert.equal(event.eventName, 'TOOL_COMPLETED');
  assert.equal(event.featureKey, 'home-digital-will');
  assert.equal(event.metadataJson.completionKind, 'ARTIFACT_CREATED');
  assert.equal(event.metadataJson.artifactType, 'home-continuity-package');
  assert.equal(event.metadataJson.outputKey, 'access-test-1');
});
