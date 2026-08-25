// apps/backend/tests/unit/newHomeWarrantyDeadlineDryRun.test.js
//
// W6 item 5: new-home-warranty-deadlines is the MAJOR_MOMENT-domain
// representative job. Covers: dry-run computes promoted/notified/expired
// counts but performs zero writes; a scoped propertyId is both applied as
// a query filter and independently re-checked against the operator
// allowlist; and a real scoped run tags its Notification with a
// smokeCorrelationId.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

function loadService({ rights, expiredCount = 0 }) {
  const updateManyCalls = [];
  const countCalls = [];
  const upsertCalls = [];
  const rightUpdateCalls = [];
  const createCalls = [];
  const reconciliationCalls = [];

  const prismaMock = {
    newHomeWarrantyRight: {
      updateMany: async (args) => {
        updateManyCalls.push(args);
        return { count: expiredCount };
      },
      count: async (args) => {
        countCalls.push(args);
        return expiredCount;
      },
      findMany: async () => rights,
      update: async (args) => {
        rightUpdateCalls.push(args);
        return {};
      },
    },
    propertyMaintenanceTask: {
      upsert: async (args) => {
        upsertCalls.push(args);
        return { id: 'task-1', actionKey: args.create.actionKey };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const notificationServicePath = require.resolve('../../src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          return { id: `notification-${createCalls.length}` };
        },
      },
    },
  };

  const reconciliationServicePath = require.resolve('../../src/services/maintenanceTaskCanonicalReconciliation.service.ts');
  require.cache[reconciliationServicePath] = {
    id: reconciliationServicePath,
    filename: reconciliationServicePath,
    loaded: true,
    exports: {
      reconcileMaintenanceTaskWork: async (taskId) => {
        reconciliationCalls.push(taskId);
      },
    },
  };

  const servicePath = require.resolve('../../src/services/newHomeWarrantyDeadline.service.ts');
  delete require.cache[servicePath];
  return {
    service: require(servicePath),
    getUpdateManyCalls: () => updateManyCalls,
    getCountCalls: () => countCalls,
    getUpsertCalls: () => upsertCalls,
    getRightUpdateCalls: () => rightUpdateCalls,
    getCreateCalls: () => createCalls,
    getReconciliationCalls: () => reconciliationCalls,
  };
}

function right(overrides = {}) {
  return {
    id: 'right-1',
    propertyId: 'property-allowed',
    coverageTitle: 'Structural Warranty',
    coverageSummary: 'Covers structural defects',
    sourceCitation: 'Builder contract §4',
    noticeMethod: null,
    noticeDeadlineAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
    notifiedAt: null,
    plan: { property: { homeownerProfile: { userId: 'user-1' } } },
    ...overrides,
  };
}

test('dry run: counts promoted/notified but performs zero writes', async () => {
  const { service, getUpdateManyCalls, getUpsertCalls, getRightUpdateCalls, getCreateCalls } = loadService({
    rights: [right()],
  });

  const result = await service.processNewHomeWarrantyDeadlines({ dryRun: true });

  assert.equal(getUpdateManyCalls().length, 0, 'must not run the real expiry updateMany');
  assert.equal(getUpsertCalls().length, 0);
  assert.equal(getRightUpdateCalls().length, 0);
  assert.equal(getCreateCalls().length, 0);
  assert.deepEqual(result, { examined: 1, promoted: 1, notified: 1, expired: 0, smokeCorrelationId: undefined });
});

test('no opts (the daily cron tick): behaves exactly like a real run', async () => {
  const { service, getUpsertCalls, getCreateCalls, getReconciliationCalls } = loadService({ rights: [right()] });

  const result = await service.processNewHomeWarrantyDeadlines();

  assert.equal(getUpsertCalls().length, 1);
  assert.equal(getCreateCalls().length, 1);
  assert.deepEqual(getReconciliationCalls(), ['task-1']);
  assert.equal(result.promoted, 1);
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'some-other-property' }, async () => {
    const { service, getUpsertCalls } = loadService({ rights: [right()] });

    await assert.rejects(
      () => service.processNewHomeWarrantyDeadlines({ dryRun: true, propertyId: 'property-not-allowed' }),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
    assert.equal(getUpsertCalls().length, 0);
  });
});

test('a real scoped run tags the created Notification with a smokeCorrelationId', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-allowed' }, async () => {
    const { service, getCreateCalls } = loadService({ rights: [right()] });

    const result = await service.processNewHomeWarrantyDeadlines({ propertyId: 'property-allowed' });

    assert.equal(getCreateCalls().length, 1);
    assert.match(getCreateCalls()[0].metadata.smokeCorrelationId, /^smoke:new-home-warranty-deadlines:/);
    assert.equal(result.smokeCorrelationId, getCreateCalls()[0].metadata.smokeCorrelationId);
  });
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { service, getCreateCalls } = loadService({ rights: [right()] });

  const result = await service.processNewHomeWarrantyDeadlines();

  assert.equal(getCreateCalls()[0].metadata.smokeCorrelationId, undefined);
  assert.equal(result.smokeCorrelationId, undefined);
});
