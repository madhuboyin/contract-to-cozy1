// apps/workers/tests/unit/pollerGracefulStop.test.js
//
// W5 item 7: homeReportExport.poller.ts / reportExport.cleanup.ts /
// materialSpecExport.poller.ts / materialSpecExport.cleanup.ts previously
// ran `while (true)` with no way to stop them — a SIGTERM would abandon
// the loop mid-iteration rather than letting the process exit cleanly.
// Added a `stopped` flag + exported `stop*()` setter, checked at the top
// of each loop iteration. This test proves the new stop function actually
// terminates the loop within a bounded time (the loop's own poll
// interval, set very low here) rather than just existing as an inert flag
// that's never actually checked correctly.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    process.env[key] = overrides[key];
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

function mockPrismaEmpty(models) {
  const prismaMock = {};
  for (const model of models) {
    prismaMock[model] = { findMany: async () => [] };
  }
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };
}

test('stopHomeReportExportPoller causes runHomeReportExportPoller to actually exit its loop', async () => {
  await withEnv({ REPORT_EXPORT_POLL_MS: '10' }, async () => {
    mockPrismaEmpty(['homeReportExport']);
    const modPath = require.resolve('../../src/runners/homeReportExport.poller.ts');
    delete require.cache[modPath];
    const { runHomeReportExportPoller, stopHomeReportExportPoller } = require(modPath);

    const runPromise = runHomeReportExportPoller();
    await new Promise((resolve) => setTimeout(resolve, 30)); // let a couple ticks happen
    stopHomeReportExportPoller();

    // If the stop flag weren't actually checked, this would hang forever
    // and the test would time out instead of resolving.
    await runPromise;
    assert.ok(true, 'runHomeReportExportPoller resolved after stop() was called');
  });
});

test('stopReportExportCleanup causes runReportExportCleanup to actually exit its loop', async () => {
  await withEnv({ REPORT_EXPORT_CLEAN_MS: '10' }, async () => {
    mockPrismaEmpty(['homeReportExport']);
    const modPath = require.resolve('../../src/runners/reportExport.cleanup.ts');
    delete require.cache[modPath];
    const { runReportExportCleanup, stopReportExportCleanup } = require(modPath);

    const runPromise = runReportExportCleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
    stopReportExportCleanup();

    await runPromise;
    assert.ok(true, 'runReportExportCleanup resolved after stop() was called');
  });
});

test('stopMaterialSpecExportPoller causes runMaterialSpecExportPoller to actually exit its loop', async () => {
  await withEnv({ MATERIAL_SPEC_EXPORT_POLL_MS: '10' }, async () => {
    mockPrismaEmpty(['materialSpecExport']);
    const modPath = require.resolve('../../src/runners/materialSpecExport.poller.ts');
    delete require.cache[modPath];
    const { runMaterialSpecExportPoller, stopMaterialSpecExportPoller } = require(modPath);

    const runPromise = runMaterialSpecExportPoller();
    await new Promise((resolve) => setTimeout(resolve, 30));
    stopMaterialSpecExportPoller();

    await runPromise;
    assert.ok(true, 'runMaterialSpecExportPoller resolved after stop() was called');
  });
});

test('stopMaterialSpecExportCleanup causes runMaterialSpecExportCleanup to actually exit its loop', async () => {
  await withEnv({ MATERIAL_SPEC_EXPORT_CLEAN_MS: '10' }, async () => {
    mockPrismaEmpty(['materialSpecExport']);
    const modPath = require.resolve('../../src/runners/materialSpecExport.cleanup.ts');
    delete require.cache[modPath];
    const { runMaterialSpecExportCleanup, stopMaterialSpecExportCleanup } = require(modPath);

    const runPromise = runMaterialSpecExportCleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
    stopMaterialSpecExportCleanup();

    await runPromise;
    assert.ok(true, 'runMaterialSpecExportCleanup resolved after stop() was called');
  });
});
