const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const {
  updateRadarNotificationPreferencesBodySchema,
} = require('../../src/validators/homeEventRadar.validators.ts');
const {
  RadarNotificationPreferenceService,
} = require('../../src/modules/homeEventRadar/services/radarNotificationPreference.service.ts');

const propertyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function validInput(overrides = {}) {
  return {
    isEnabled: true,
    enabledCategories: ['insurance', 'weather', 'weather'],
    channels: ['email', 'in_app'],
    minimumSeverity: 'moderate',
    minimumImpact: 'high',
    deliveryMode: 'digest',
    criticalSafetyOverrideEnabled: false,
    quietHours: { start: '22:30', end: '06:15' },
    timezone: 'America/New_York',
    ...overrides,
  };
}

test('preference input validates and canonicalizes the complete homeowner contract', () => {
  const parsed = updateRadarNotificationPreferencesBodySchema.parse(validInput());
  assert.deepEqual(parsed.enabledCategories, ['weather', 'insurance']);
  assert.deepEqual(parsed.channels, ['in_app', 'email']);
  assert.equal(parsed.minimumSeverity, 'moderate');
  assert.equal(parsed.minimumImpact, 'high');
  assert.equal(parsed.deliveryMode, 'digest');
  assert.equal(parsed.criticalSafetyOverrideEnabled, false);
  assert.deepEqual(parsed.quietHours, { start: '22:30', end: '06:15' });
});

test('preference input rejects invalid timezone, incomplete category/channel sets, and invalid quiet hours', () => {
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ timezone: 'Not/A_Timezone' }),
  ).success, false);
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ enabledCategories: [] }),
  ).success, false);
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ channels: [] }),
  ).success, false);
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ channels: ['sms'] }),
  ).success, false);
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ quietHours: { start: '22:00', end: '22:00' } }),
  ).success, false);
  assert.equal(updateRadarNotificationPreferencesBodySchema.safeParse(
    validInput({ quietHours: { start: '10 PM', end: '07:00' } }),
  ).success, false);
});

test('read returns non-mutating property-timezone defaults when no preference exists', async () => {
  let upsertCalls = 0;
  const service = new RadarNotificationPreferenceService({
    propertyRadarNotificationPreference: {
      findUnique: async () => null,
      upsert: async () => {
        upsertCalls += 1;
        throw new Error('read must not write');
      },
    },
    property: {
      findUnique: async () => ({ timezone: 'America/Chicago' }),
    },
  });

  const result = await service.get(propertyId, userId);
  assert.equal(result.persisted, false);
  assert.equal(result.timezone, 'America/Chicago');
  assert.deepEqual(result.channels, ['in_app']);
  assert.equal(result.minimumSeverity, 'moderate');
  assert.equal(result.minimumImpact, 'moderate');
  assert.equal(result.deliveryMode, 'immediate');
  assert.equal(result.criticalSafetyOverrideEnabled, false);
  assert.equal(result.updatedAt, null);
  assert.equal(upsertCalls, 0);
});

test('update atomically replaces one per-user/property preference and normalizes quiet-hour storage', async () => {
  let captured;
  const service = new RadarNotificationPreferenceService({
    propertyRadarNotificationPreference: {
      findUnique: async () => null,
      upsert: async (args) => {
        captured = args;
        return {
          propertyId,
          userId,
          ...args.create,
          updatedAt: new Date('2026-07-26T12:00:00.000Z'),
        };
      },
    },
    property: { findUnique: async () => null },
  });
  const input = updateRadarNotificationPreferencesBodySchema.parse(validInput());
  const result = await service.update(propertyId, userId, input);

  assert.deepEqual(captured.where, { propertyId_userId: { propertyId, userId } });
  assert.equal(captured.create.quietHoursStartMinutes, 1_350);
  assert.equal(captured.create.quietHoursEndMinutes, 375);
  assert.deepEqual(result.quietHours, { start: '22:30', end: '06:15' });
  assert.equal(result.persisted, true);
  assert.equal(result.updatedAt, '2026-07-26T12:00:00.000Z');
});

test('canonical routes expose property-authorized GET and validated PUT preference operations', () => {
  const routes = fs.readFileSync(path.resolve(
    __dirname,
    '../../src/routes/homeEventRadar.routes.ts',
  ), 'utf8');
  assert.match(routes, /router\.get\(\s*'\/properties\/:propertyId\/radar\/preferences',\s*propertyAuthMiddleware,\s*getRadarNotificationPreferences/s);
  assert.match(routes, /router\.put\(\s*'\/properties\/:propertyId\/radar\/preferences',\s*propertyAuthMiddleware,\s*validateBody\(updateRadarNotificationPreferencesBodySchema\),\s*updateRadarNotificationPreferences/s);
});
