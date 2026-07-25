const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NotificationCadence,
  NotificationSensitivity,
  RefinanceConfidenceLevel,
} = require('@prisma/client');
const {
  decideRefinanceExternalAlert,
  defaultRefinanceAlertPreference,
} = require('../../dist/refinanceRadar/refinanceAlertPreference.service');
const {
  refinanceAlertPreferenceSchema,
} = require('../../dist/refinanceRadar/validators/refinanceRadar.validators');
const refinanceRouter =
  require('../../dist/refinanceRadar/refinanceRadar.routes').default;
const {
  propertyAuthMiddleware,
} = require('../../dist/middleware/propertyAuth.middleware');

function optedIn(overrides = {}) {
  return {
    ...defaultRefinanceAlertPreference(),
    emailEnabled: true,
    cadence: NotificationCadence.IMMEDIATE,
    sensitivity: NotificationSensitivity.BALANCED,
    explicitEmailConsent: true,
    ...overrides,
  };
}

function routeFor(method) {
  return refinanceRouter.stack
    .filter((layer) => layer.route)
    .find((layer) =>
      layer.route.path ===
        '/properties/:propertyId/refinance-radar/alert-preferences' &&
      layer.route.methods?.[method])
    ?.route;
}

test('refinance alert preference defaults to Home-only with no external consent', () => {
  const preference = defaultRefinanceAlertPreference();
  assert.equal(preference.homeEnabled, true);
  assert.equal(preference.emailEnabled, false);
  assert.equal(preference.cadence, NotificationCadence.MUTED);
  assert.equal(preference.sensitivity, NotificationSensitivity.CONSERVATIVE);
  assert.equal(preference.externalDeliveryEnabled, false);
});

test('preference validation requires explicit cadence and paired quiet hours', () => {
  assert.equal(refinanceAlertPreferenceSchema.safeParse({
    emailEnabled: false,
    cadence: 'MUTED',
    sensitivity: 'CONSERVATIVE',
    quietStart: '21:00',
    quietEnd: '07:00',
    timezone: 'America/New_York',
  }).success, true);
  assert.equal(refinanceAlertPreferenceSchema.safeParse({
    emailEnabled: true,
    cadence: 'MUTED',
    sensitivity: 'BALANCED',
    timezone: 'UTC',
  }).success, false);
  assert.equal(refinanceAlertPreferenceSchema.safeParse({
    emailEnabled: true,
    cadence: 'IMMEDIATE',
    sensitivity: 'BALANCED',
    quietStart: '21:00',
    timezone: 'UTC',
  }).success, false);
});

test('delivery rollout and explicit consent fail external refinance alerts closed', () => {
  const preference = optedIn();
  assert.deepEqual(decideRefinanceExternalAlert({
    preference,
    alertReadiness: 'READY',
    confidenceLevel: RefinanceConfidenceLevel.STRONG,
    deliveryEnabled: false,
  }), { eligible: false, suppressionReason: 'DELIVERY_DISABLED' });
  assert.deepEqual(decideRefinanceExternalAlert({
    preference: {
      ...preference,
      emailEnabled: false,
      explicitEmailConsent: false,
    },
    alertReadiness: 'READY',
    confidenceLevel: RefinanceConfidenceLevel.STRONG,
    deliveryEnabled: true,
  }), { eligible: false, suppressionReason: 'NO_EXPLICIT_CONSENT' });
});

test('freshness and sensitivity are enforced after explicit consent', () => {
  const balanced = optedIn();
  assert.deepEqual(decideRefinanceExternalAlert({
    preference: balanced,
    alertReadiness: 'REVIEW_MORTGAGE_DATA',
    confidenceLevel: RefinanceConfidenceLevel.STRONG,
    deliveryEnabled: true,
  }), { eligible: false, suppressionReason: 'INPUTS_NOT_CURRENT' });
  assert.deepEqual(decideRefinanceExternalAlert({
    preference: balanced,
    alertReadiness: 'READY',
    confidenceLevel: RefinanceConfidenceLevel.WEAK,
    deliveryEnabled: true,
  }), { eligible: false, suppressionReason: 'CONFIDENCE_BELOW_PREFERENCE' });
  assert.deepEqual(decideRefinanceExternalAlert({
    preference: balanced,
    alertReadiness: 'READY',
    confidenceLevel: RefinanceConfidenceLevel.GOOD,
    deliveryEnabled: true,
  }), { eligible: true, suppressionReason: null });
});

test('refinance alert preference reads and writes are property-authorized', () => {
  const getRoute = routeFor('get');
  const putRoute = routeFor('put');
  assert.ok(getRoute);
  assert.ok(putRoute);
  assert.ok(getRoute.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(putRoute.stack.some((layer) => layer.handle === propertyAuthMiddleware));
  assert.ok(putRoute.stack.length > getRoute.stack.length);
});
