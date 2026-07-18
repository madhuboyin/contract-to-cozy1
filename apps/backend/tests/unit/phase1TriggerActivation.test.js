const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  EntryContextCaptureSchema,
  FirstActionResolutionSchema,
  FirstValueFeedbackSchema,
  TriggerEvidenceInputSchema,
} = require('../../src/services/entryContext.service.ts');
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

test('operating-mode policy uses persisted orthogonal entry context', () => {
  assert.equal(resolveHomeownerOperatingMode({
    entryPath: 'EXISTING_OWNER_TRIGGER',
    ownershipState: 'ESTABLISHED_OWNER',
  }), 'OWNERSHIP');
  assert.equal(resolveHomeownerOperatingMode({
    entryPath: 'EXISTING_HOME_PURCHASE',
    ownershipState: 'UNDER_CONTRACT',
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

test('multimodal trigger evidence requires uploaded records for file-backed kinds', () => {
  assert.equal(TriggerEvidenceInputSchema.safeParse({
    kind: 'FREE_TEXT', label: 'Observed leak', detail: 'Under the sink', consentContext: 'User supplied',
  }).success, true);
  assert.equal(TriggerEvidenceInputSchema.safeParse({
    kind: 'QUOTE', label: 'HVAC quote', consentContext: 'User supplied',
  }).success, false);
  assert.equal(TriggerEvidenceInputSchema.safeParse({
    kind: 'QUOTE', label: 'HVAC quote', documentId: 'f27f66e8-9c22-406b-aeef-f67c98681768', consentContext: 'User supplied',
  }).success, true);
  assert.equal(FirstValueFeedbackSchema.safeParse({ feedback: 'USEFUL_NEW' }).success, true);
});

test('entry-context and first-value routes enforce property authorization', () => {
  for (const [routePath, method] of [
    ['/properties/:propertyId/onboarding/entry-context', 'get'],
    ['/properties/:propertyId/onboarding/entry-context', 'put'],
    ['/properties/:propertyId/onboarding/first-value', 'get'],
    ['/properties/:propertyId/onboarding/first-action-resolution', 'post'],
    ['/properties/:propertyId/onboarding/trigger-evidence', 'post'],
    ['/properties/:propertyId/onboarding/first-value-feedback', 'post'],
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
    'triggerEntityType', 'triggerEvidenceJson', 'firstValueType', 'firstValueAt', 'firstActionResolvedAt',
    'firstValueFeedback', 'firstValueFeedbackAt',
  ]) {
    assert.ok(schema.includes(field));
  }
  assert.doesNotMatch(schema, /enum HomeownerSegment|segment\s+HomeownerSegment/);
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
  const revealPage = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/onboarding/reveal/page.tsx'),
    'utf8',
  );
  assert.match(addressPage, /What brought you here\?/);
  assert.match(addressPage, /activeTrigger/);
  assert.match(addressPage, /Continue without public records/);
  assert.match(addressPage, /Unknown home facts will stay unknown/);
  assert.match(confirmPage, /captureEntryContext/);
  assert.match(firstValuePage, /Evidence used/);
  assert.match(firstValuePage, /Still unknown/);
  assert.match(firstValuePage, /Already handled/);
  assert.match(firstValuePage, /Remind me later/);
  assert.match(firstValuePage, /Not relevant/);
  assert.match(firstValuePage, /secondaryCtas\.map/);
  assert.match(firstValuePage, /Add evidence that changes this decision/);
  assert.match(firstValuePage, /Evidence-bounded 12-month plan/);
  assert.match(firstValuePage, /Useful and new/);
  assert.match(revealPage, /redirect\('\/onboarding\/confirm'\)/);
  assert.doesNotMatch(revealPage, /Annual Savings|Maintenance Risks|tax appeal window/);
});

test('first-value triggers link only to existing specialized route families', () => {
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/entryContext.service.ts'),
    'utf8',
  );
  assert.doesNotMatch(service, /`\/dashboard\/properties\/\$\{propertyId\}\/guidance`/);
  for (const route of [
    '/tools/guidance-overview', '/fix', '/dashboard/maintenance', '/dashboard/quote-comparison',
    '/tools/capital-timeline', '/inspection-hub', '/claims', '/seller-prep', '/projects', '/protect',
  ]) {
    assert.ok(service.includes(route), `Expected specialized Phase 1 route ${route}`);
  }
});

test('Phase 1 pilot reporting declares eligibility, targets, and the 30-day window', () => {
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/adminAnalytics/phase1PilotService.ts'),
    'utf8',
  );
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminAnalytics.routes.ts'),
    'utf8',
  );
  const adminPage = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx'),
    'utf8',
  );
  const adminApi = fs.readFileSync(
    path.resolve(__dirname, '../../../frontend/src/lib/api/adminAnalytics.ts'),
    'utf8',
  );
  assert.match(routes, /\/admin\/analytics\/phase1-pilot/);
  assert.match(service, /entryContextCapturedAt/);
  assert.match(service, /firstValueFeedback === 'USEFUL_NEW'/);
  assert.match(service, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(adminApi, /\/api\/admin\/analytics\/phase1-pilot/);
  assert.match(adminPage, /Phase 1 Pilot Scorecard/);
  assert.match(adminPage, /Target met/);
  for (const target of ['target: 0.6', 'target: 0.5', 'target: 0.3']) assert.match(service, new RegExp(target));
});
