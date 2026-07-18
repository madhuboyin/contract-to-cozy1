const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { EntryContextCaptureSchema, FirstActionResolutionSchema } = require('../../src/services/entryContext.service.ts');
const { resolveHomeownerOperatingMode, supportsOwnershipCare } = require('../../src/services/entryContextPolicy.ts');
const router = require('../../src/routes/propertyOnboarding.routes.ts').default;
const { propertyAuthMiddleware } = require('../../src/middleware/propertyAuth.middleware.ts');

function validContext(overrides = {}) {
  return {
    entryPath: 'EXISTING_OWNER_TRIGGER',
    ownershipState: 'ESTABLISHED_OWNER',
    propertyOrigin: 'EXISTING_HOME',
    activeTrigger: {
      type: 'REPAIR',
      label: 'HVAC is not cooling',
      detail: null,
      entityType: 'PROPERTY',
      entityId: null,
      source: 'USER_SELECTED',
    },
    ...overrides,
  };
}

function routeFor(routePath, method) {
  return router.stack
    .filter((layer) => layer.route)
    .find((layer) => layer.route.path === routePath && layer.route.methods?.[method])
    ?.route;
}

test('entry-context capture accepts established owners without inspection evidence', () => {
  const parsed = EntryContextCaptureSchema.parse(validContext());
  assert.equal(parsed.activeTrigger.type, 'REPAIR');
  assert.equal(parsed.ownershipState, 'ESTABLISHED_OWNER');
});

test('entry-context capture keeps purchase and new-construction paths consistent', () => {
  assert.equal(EntryContextCaptureSchema.safeParse(validContext({
    entryPath: 'EXISTING_HOME_PURCHASE',
    ownershipState: 'UNDER_CONTRACT',
    propertyOrigin: 'EXISTING_HOME',
  })).success, true);
  assert.equal(EntryContextCaptureSchema.safeParse(validContext({
    entryPath: 'NEW_HOME_SETUP',
    ownershipState: 'UNDER_CONTRACT',
    propertyOrigin: 'EXISTING_HOME',
  })).success, false);
});

test('operating-mode policy prefers persisted entry context over legacy segment', () => {
  assert.equal(resolveHomeownerOperatingMode({
    entryPath: 'EXISTING_OWNER_TRIGGER',
    ownershipState: 'ESTABLISHED_OWNER',
    legacySegment: 'HOME_BUYER',
  }), 'OWNERSHIP');
  assert.equal(resolveHomeownerOperatingMode({
    entryPath: 'EXISTING_HOME_PURCHASE',
    ownershipState: 'UNDER_CONTRACT',
    legacySegment: 'EXISTING_OWNER',
  }), 'PURCHASE');
  assert.equal(supportsOwnershipCare({ ownershipState: 'RECENT_OWNER' }), true);
});

test('deferred first action requires an explicit next trigger', () => {
  assert.equal(FirstActionResolutionSchema.safeParse({
    disposition: 'INTENTIONALLY_DEFERRED',
    reason: 'Later',
    consequenceAcknowledged: true,
  }).success, false);
});

test('entry-context and first-value routes enforce property authorization', () => {
  for (const [routePath, method] of [
    ['/properties/:propertyId/onboarding/entry-context', 'get'],
    ['/properties/:propertyId/onboarding/entry-context', 'put'],
    ['/properties/:propertyId/onboarding/first-value', 'get'],
    ['/properties/:propertyId/onboarding/first-action-resolution', 'post'],
  ]) {
    const route = routeFor(routePath, method);
    assert.ok(route, `Expected ${method.toUpperCase()} ${routePath}`);
    assert.equal(route.stack.some((entry) => entry.handle === propertyAuthMiddleware), true);
  }
});

test('Prisma stores orthogonal Phase 1 context without a migration artifact', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  for (const field of [
    'entryPath', 'ownershipState', 'propertyOrigin', 'activeTriggerId', 'activeTriggerType',
    'triggerEntityType', 'firstValueType', 'firstValueAt', 'firstActionResolvedAt',
  ]) {
    assert.ok(schema.includes(field));
  }
});

test('trigger-first UI asks the situation before address and renders evidence-bounded first value', () => {
  const addressPage = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/onboarding/address/page.tsx'),
    'utf8',
  );
  const confirmPage = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/onboarding/confirm/page.tsx'),
    'utf8',
  );
  const firstValuePage = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/onboarding/first-value/page.tsx'),
    'utf8',
  );
  assert.match(addressPage, /What brought you here\?/);
  assert.match(addressPage, /activeTrigger/);
  assert.match(confirmPage, /captureEntryContext/);
  assert.match(firstValuePage, /Evidence used/);
  assert.match(firstValuePage, /Still unknown/);
  assert.match(firstValuePage, /Already handled/);
  assert.match(firstValuePage, /Remind me later/);
  assert.match(firstValuePage, /Not relevant/);
});
