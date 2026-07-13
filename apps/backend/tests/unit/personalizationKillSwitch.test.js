const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock(initialSetting = null) {
  let setting = initialSetting;
  const auditLogEntries = [];

  const prismaMock = {
    systemSetting: {
      findUnique: async ({ where }) => {
        if (setting && where.key === setting.key) return setting;
        return null;
      },
      upsert: async ({ where, create, update }) => {
        if (setting && where.key === setting.key) {
          setting = { ...setting, ...update };
        } else {
          setting = { key: where.key, ...create };
        }
        return setting;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditLogEntries.push(data);
        return { id: `audit-${auditLogEntries.length}`, createdAt: new Date(), ...data };
      },
    },
  };

  return { prismaMock, auditLogEntries, getSetting: () => setting };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
}

function loadService() {
  const servicePath = require.resolve('../../src/services/personalizationKillSwitch.service.ts');
  delete require.cache[servicePath];
  return require('../../src/services/personalizationKillSwitch.service.ts');
}

test('defaults to not-paused when no SystemSetting row exists', async () => {
  const { prismaMock } = createPrismaMock(null);
  installPrismaMock(prismaMock);
  const { getKillSwitchState, isPersonalizationPaused } = loadService();

  const state = await getKillSwitchState();
  assert.deepEqual(state, { paused: false, reason: null, pausedBy: null, pausedAt: null });
  assert.equal(await isPersonalizationPaused(), false);
});

test('pausePersonalization sets state and writes an audit log entry, is idempotent', async () => {
  const { prismaMock, auditLogEntries } = createPrismaMock(null);
  installPrismaMock(prismaMock);
  const { pausePersonalization, getKillSwitchState, isPersonalizationPaused } = loadService();

  const state = await pausePersonalization('admin-1', 'bad recommendation content');
  assert.equal(state.paused, true);
  assert.equal(state.reason, 'bad recommendation content');
  assert.equal(state.pausedBy, 'admin-1');
  assert.ok(state.pausedAt);

  assert.equal(await isPersonalizationPaused(), true);
  assert.equal(auditLogEntries.length, 1);
  assert.equal(auditLogEntries[0].action, 'PERSONALIZATION_KILL_SWITCH_PAUSED');
  assert.equal(auditLogEntries[0].userId, 'admin-1');

  // Idempotent: pausing again while already paused just updates and still succeeds.
  const state2 = await pausePersonalization('admin-2', 'still bad');
  assert.equal(state2.paused, true);
  assert.equal(state2.reason, 'still bad');
  assert.equal(auditLogEntries.length, 2);

  const readBack = await getKillSwitchState();
  assert.deepEqual(readBack, state2);
});

test('resumePersonalization clears state and writes an audit log entry, is idempotent', async () => {
  const { prismaMock, auditLogEntries } = createPrismaMock(null);
  installPrismaMock(prismaMock);
  const { pausePersonalization, resumePersonalization, isPersonalizationPaused } = loadService();

  await pausePersonalization('admin-1', 'incident');
  assert.equal(await isPersonalizationPaused(), true);

  const resumed = await resumePersonalization('admin-1');
  assert.deepEqual(resumed, { paused: false, reason: null, pausedBy: null, pausedAt: null });
  assert.equal(await isPersonalizationPaused(), false);
  assert.equal(auditLogEntries.at(-1).action, 'PERSONALIZATION_KILL_SWITCH_RESUMED');

  // Idempotent: resuming again while already resumed still succeeds.
  const resumedAgain = await resumePersonalization('admin-1');
  assert.deepEqual(resumedAgain, { paused: false, reason: null, pausedBy: null, pausedAt: null });
});
