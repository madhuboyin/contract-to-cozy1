// apps/backend/tests/unit/permitUnpermittedWorkIdempotency.test.js
//
// W3 (permits): detectUnpermittedWork() emitted a "Potential unpermitted
// work detected" HomeEvent via a raw prisma.homeEvent.create() with no
// idempotency key, gated only on `created > 0` — but `created` counts every
// successful upsert, including a no-op `update: {}` against an
// already-existing flag. A homeowner who re-triggered a permit fetch (or
// hit the daily re-detection sweep) while any HIGH flag remained open got a
// brand-new "potential unpermitted work" HomeEvent every single run, for
// the exact same unresolved issue. The fix derives a deterministic
// idempotency key from the actual set of currently-open HIGH flag ids, so a
// new event only fires when that set genuinely changes.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ inventoryItems, permits, highFlags, existingHomeEvent = null }) {
  const flagUpserts = [];
  const homeEventCreates = [];

  const prismaMock = {
    inventoryItem: { findMany: async () => inventoryItems },
    propertyPermitRecord: { findMany: async () => permits },
    permitUnpermittedFlag: {
      upsert: async (args) => {
        flagUpserts.push(args);
        return {};
      },
      findMany: async () => highFlags,
    },
    homeEvent: {
      findFirst: async (args) => (existingHomeEvent && existingHomeEvent.idempotencyKey === args.where.idempotencyKey ? existingHomeEvent : null),
      create: async (args) => {
        homeEventCreates.push(args);
        return { id: `event-${homeEventCreates.length}` };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const contextServicePath = require.resolve('../../src/services/projectCompliance/permitWorkerContext.service.ts');
  require.cache[contextServicePath] = {
    id: contextServicePath,
    filename: contextServicePath,
    loaded: true,
    exports: {
      checkPermitWorkerContext: async () => ({ allowed: true, contextVersion: 'v1', userId: 'user-1', reasonCodes: [] }),
    },
  };

  const servicePath = require.resolve('../../src/services/permitDetection.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), getHomeEventCreates: () => homeEventCreates };
}

function inventoryItem(overrides = {}) {
  return {
    id: 'item-1',
    category: 'ELECTRICAL',
    assetType: 'ELECTRICAL_PANEL',
    installedOn: new Date('2022-01-01'),
    name: 'Electrical panel',
    ...overrides,
  };
}

function highFlag(id) {
  return { id };
}

test('emits exactly one HomeEvent the first time a HIGH flag set appears', async () => {
  const { permitDetectionService, getHomeEventCreates } = loadService({
    inventoryItems: [inventoryItem()],
    permits: [],
    highFlags: [highFlag('flag-a')],
  });

  await permitDetectionService.detectUnpermittedWork('property-1');

  const creates = getHomeEventCreates();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].data.idempotencyKey, 'permit-unpermitted:flag-a');
});

test('does NOT re-emit a HomeEvent when the same open HIGH flag set persists across runs (regression guard)', async () => {
  const { permitDetectionService, getHomeEventCreates } = loadService({
    inventoryItems: [inventoryItem()],
    permits: [],
    highFlags: [highFlag('flag-a')],
    existingHomeEvent: { id: 'event-existing', idempotencyKey: 'permit-unpermitted:flag-a' },
  });

  await permitDetectionService.detectUnpermittedWork('property-1');

  assert.equal(getHomeEventCreates().length, 0, 'must not duplicate the HomeEvent for an unchanged open-flag set');
});

test('emits a new HomeEvent when the open HIGH flag set changes (a new flag appears)', async () => {
  const { permitDetectionService, getHomeEventCreates } = loadService({
    inventoryItems: [inventoryItem()],
    permits: [],
    highFlags: [highFlag('flag-a'), highFlag('flag-b')],
    existingHomeEvent: { id: 'event-existing', idempotencyKey: 'permit-unpermitted:flag-a' },
  });

  await permitDetectionService.detectUnpermittedWork('property-1');

  const creates = getHomeEventCreates();
  assert.equal(creates.length, 1);
  assert.equal(creates[0].data.idempotencyKey, 'permit-unpermitted:flag-a,flag-b');
});

test('flagReason acknowledges jurisdiction variability instead of asserting unpermitted work as fact', async () => {
  const { permitDetectionService } = loadService({
    inventoryItems: [inventoryItem()],
    permits: [],
    highFlags: [],
  });

  let capturedReason = null;
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  const originalUpsert = require.cache[prismaPath].exports.prisma.permitUnpermittedFlag.upsert;
  require.cache[prismaPath].exports.prisma.permitUnpermittedFlag.upsert = async (args) => {
    capturedReason = args.create.flagReason;
    return originalUpsert(args);
  };

  await permitDetectionService.detectUnpermittedWork('property-1');

  assert.match(capturedReason, /vary by municipality/i);
});
