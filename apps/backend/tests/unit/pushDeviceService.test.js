// apps/backend/tests/unit/pushDeviceService.test.js
//
// B4 (PWA audit): native push device registration. Stores APNs / FCM tokens so
// the workers push pipeline can reach a native app alongside browser Web Push.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ upsert, updateMany, findMany } = {}) {
  const calls = { upsert: [], updateMany: [], findMany: [] };
  const prismaMock = {
    pushDevice: {
      upsert: async (args) => {
        calls.upsert.push(args);
        return (upsert ? upsert(args) : {
          id: 'dev-1',
          platform: args.create?.platform ?? args.update?.platform ?? 'IOS',
          bundleId: args.create?.bundleId ?? null,
          appVersion: args.create?.appVersion ?? null,
          deviceName: args.create?.deviceName ?? null,
          lastSeenAt: new Date('2026-06-01T00:00:00Z'),
          createdAt: new Date('2026-05-01T00:00:00Z'),
        });
      },
      updateMany: async (args) => {
        calls.updateMany.push(args);
        return updateMany ? updateMany(args) : { count: 1 };
      },
      findMany: async (args) => {
        calls.findMany.push(args);
        return findMany ? findMany(args) : [];
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  delete require.cache[require.resolve('../../src/services/pushDevice.service.ts')];
  return { service: require('../../src/services/pushDevice.service.ts'), calls };
}

test('registerDevice upserts on (platform, token) and re-enables the row', async () => {
  const { service, calls } = loadService();

  const view = await service.registerDevice('user-1', {
    token: 'apns-token-abc',
    platform: 'IOS',
    bundleId: 'com.contracttocozy.app',
    appVersion: '1.0.0',
    deviceName: "Sam's iPhone",
  });

  const args = calls.upsert[0];
  assert.deepEqual(args.where, { platform_token: { platform: 'IOS', token: 'apns-token-abc' } });
  assert.equal(args.create.userId, 'user-1');
  assert.equal(args.update.userId, 'user-1');
  assert.equal(args.update.disabledAt, null);
  assert.equal(args.update.disabledReason, null);
  assert.ok(args.update.lastSeenAt instanceof Date);
  assert.equal(view.platform, 'IOS');
  assert.equal(view.bundleId, 'com.contracttocozy.app');
});

test('unregisterDevice soft-disables only the caller\'s active row', async () => {
  const { service, calls } = loadService();

  await service.unregisterDevice('user-1', { token: 'apns-token-abc', platform: 'IOS' });

  const args = calls.updateMany[0];
  assert.deepEqual(args.where, {
    platform: 'IOS',
    token: 'apns-token-abc',
    userId: 'user-1',
    disabledAt: null,
  });
  assert.ok(args.data.disabledAt instanceof Date);
  assert.equal(args.data.disabledReason, 'unregistered_by_user');
});

test('listDevices returns only active devices as views', async () => {
  const { service, calls } = loadService({
    findMany: () => [
      {
        id: 'dev-1', platform: 'IOS', bundleId: null, appVersion: null, deviceName: null,
        lastSeenAt: new Date('2026-06-02T00:00:00Z'), createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    ],
  });

  const devices = await service.listDevices('user-1');

  assert.equal(calls.findMany[0].where.userId, 'user-1');
  assert.equal(calls.findMany[0].where.disabledAt, null);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].id, 'dev-1');
  assert.equal(typeof devices[0].lastSeenAt, 'string');
});
