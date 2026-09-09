// apps/backend/tests/unit/pushSubscriptionService.test.js
//
// C6 (PWA audit): feature-agnostic Web Push subscription management, extracted
// from the mortgage refinance radar tool so any feature (and the notifications
// settings toggle) shares one implementation.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ env = {}, findUnique, upsert, updateMany, count } = {}) {
  const calls = { upsert: [], updateMany: [], count: [] };
  const prismaMock = {
    pushSubscription: {
      findUnique: async (args) => (findUnique ? findUnique(args) : null),
      upsert: async (args) => {
        calls.upsert.push(args);
        return upsert ? upsert(args) : { id: 'sub-1' };
      },
      updateMany: async (args) => {
        calls.updateMany.push(args);
        return updateMany ? updateMany(args) : { count: 1 };
      },
      count: async (args) => {
        calls.count.push(args);
        return count ? count(args) : 0;
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  delete require.cache[require.resolve('../../src/services/pushSubscription.service.ts')];
  return { service: require('../../src/services/pushSubscription.service.ts'), calls };
}

const SUB = { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } };

test('getWebPushPublicKey / isWebPushConfigured reflect the env', () => {
  const { service } = loadService({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: '' } });
  assert.equal(service.getWebPushPublicKey({}), null);
  assert.equal(service.isWebPushConfigured({}), false);
  assert.equal(service.getWebPushPublicKey({ WEB_PUSH_VAPID_PUBLIC_KEY: ' BKxyz ' }), 'BKxyz');
  assert.equal(service.isWebPushConfigured({ WEB_PUSH_VAPID_PUBLIC_KEY: 'BKxyz' }), true);
});

test('upsertPushSubscription refuses when Web Push is not configured', async () => {
  const { service } = loadService({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: '' } });
  await assert.rejects(() => service.upsertPushSubscription('user-1', SUB), /not configured/i);
});

test('upsertPushSubscription writes the subscription for the caller', async () => {
  const { service, calls } = loadService({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: 'BK' } });

  await service.upsertPushSubscription('user-1', SUB, 'jest-UA');

  const args = calls.upsert[0];
  assert.equal(args.where.endpoint, SUB.endpoint);
  assert.equal(args.create.userId, 'user-1');
  assert.equal(args.create.p256dh, 'p');
  assert.equal(args.update.revokedAt, null);
  assert.equal(args.update.userAgent, 'jest-UA');
});

test('upsertPushSubscription rejects an endpoint owned by another account', async () => {
  const { service } = loadService({
    env: { WEB_PUSH_VAPID_PUBLIC_KEY: 'BK' },
    findUnique: () => ({ userId: 'someone-else' }),
  });
  await assert.rejects(
    () => service.upsertPushSubscription('user-1', SUB),
    /already registered to another account/i,
  );
});

test('revokePushSubscription only touches the caller\'s live rows', async () => {
  const { service, calls } = loadService({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: 'BK' } });

  await service.revokePushSubscription('user-1', SUB.endpoint);

  assert.deepEqual(calls.updateMany[0].where, {
    userId: 'user-1',
    endpoint: SUB.endpoint,
    revokedAt: null,
  });
  assert.ok(calls.updateMany[0].data.revokedAt instanceof Date);
});

test('hasActivePushSubscription is true when a live row exists', async () => {
  const { service } = loadService({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: 'BK' }, count: () => 2 });
  assert.equal(await service.hasActivePushSubscription('user-1'), true);
});
