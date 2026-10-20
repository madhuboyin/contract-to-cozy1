const test = require('node:test');
const assert = require('node:assert/strict');
const { enabled, unique, seedHouseholds } = require('./realDb');

// Sole Homeowner Interface Phase 9, deliverable 6: measures every destination read against the proposed budgets (governance/askPerformanceBudgets.ts)
// on a realistic home, against a REAL database. Run it on the hardware that matters (the Raspberry Pi) with the production-sized database copy
// by setting ASK_CERT_DATABASE_URL; ASK_CERT_BUDGET_FACTOR scales the latency budgets for slower hardware. Skipped without a scratch database.
const skip = enabled ? false : 'ASK_CERT_DATABASE_URL is not set: the performance checks run only against a scratch database';
const RUNS = Number(process.env.ASK_CERT_RUNS || 25);
const FACTOR = Number(process.env.ASK_CERT_BUDGET_FACTOR || 1);

let prisma; let world; let budgets; let percentile;
const measured = [];

test.before(async () => {
  if (!enabled) return;
  ({ prisma } = require('../../src/lib/prisma.ts'));
  ({ ASK_PERFORMANCE_BUDGETS: budgets, percentile } = require('../../src/services/ask/governance/askPerformanceBudgets.ts'));
  world = await seedHouseholds(prisma);
  const { owner, p1 } = world;
  // A realistic busy home: hundreds of rooms and items, records, work, saved results and notifications.
  await prisma.inventoryRoom.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ propertyId: p1.id, name: `Perf room ${i}`, sortOrder: i % 7 })) });
  await prisma.inventoryItem.createMany({ data: Array.from({ length: 400 }, (_, i) => ({ propertyId: p1.id, name: `Perf appliance ${i}` })) });
  for (let i = 0; i < 120; i += 1) {
    await prisma.propertyRecord.create({ data: { propertyId: p1.id, title: `Perf document ${i}`, recordType: 'OTHER', createdByUserId: owner.id, versions: { create: { versionNumber: 1, storageKey: unique('k'), originalFileName: `d${i}.pdf`, mimeType: 'application/pdf', fileSizeBytes: 10, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } } } });
  }
  await prisma.operationalWorkItem.createMany({ data: Array.from({ length: 150 }, (_, i) => ({ propertyId: p1.id, workKey: `perf-${i}`, subjectType: 'PROPERTY', subjectId: p1.id, obligationType: 'MAINTENANCE_TASK', state: 'ACCEPTED', title: `Perf work ${i}`, homeownerReason: 'r', expectedOutcome: 'o' })) });
  await prisma.propertyBrief.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ propertyId: p1.id, createdByUserId: owner.id, purpose: 'HOMEOWNER_REFERENCE', title: `Perf brief ${i}`, limitationStatement: 'x', asOf: new Date() })) });
  await prisma.notification.createMany({ data: Array.from({ length: 150 }, (_, i) => ({ userId: owner.id, type: 'CLAIM_SUBMITTED', title: `Perf notice ${i}`, message: 'm', metadata: { propertyId: p1.id } })) });
});
test.after(async () => {
  if (measured.length) {
    // eslint-disable-next-line no-console
    console.log('\nASK PERFORMANCE (ms, this run)\n' + measured.map((m) => `${m.id.padEnd(22)} p50 ${String(m.p50).padStart(5)} / ${m.budget.p50Ms * FACTOR}   p95 ${String(m.p95).padStart(5)} / ${m.budget.p95Ms * FACTOR}   payload ${String(m.bytes).padStart(7)} / ${m.budget.maxPayloadBytes}`).join('\n'));
  }
  if (prisma) await prisma.$disconnect();
});

async function measure(id, read) {
  const budget = budgets.find((b) => b.id === id);
  await read(); // warm the connection and the query plans
  const times = []; let bytes = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const started = process.hrtime.bigint();
    const result = await read();
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
    bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(result)));
  }
  times.sort((a, b) => a - b);
  const row = { id, budget, p50: Math.round(percentile(times, 0.5)), p95: Math.round(percentile(times, 0.95)), bytes };
  measured.push(row);
  assert.ok(row.p50 <= budget.p50Ms * FACTOR, `${id} p50 ${row.p50}ms exceeds ${budget.p50Ms * FACTOR}ms`);
  assert.ok(row.p95 <= budget.p95Ms * FACTOR, `${id} p95 ${row.p95}ms exceeds ${budget.p95Ms * FACTOR}ms`);
  assert.ok(bytes <= budget.maxPayloadBytes, `${id} payload ${bytes} bytes exceeds ${budget.maxPayloadBytes}`);
}

test('PERF: Record index', { skip }, async () => {
  const { getAskRecordIndex } = require('../../src/services/ask/askRecordIndex.service.ts');
  await measure('RECORD_INDEX', () => getAskRecordIndex(world.owner.id, world.p1.id));
});
test('PERF: Record section page', { skip }, async () => {
  const { getAskRecordCollectionPage } = require('../../src/services/ask/askRecordCollections.service.ts');
  await measure('RECORD_SECTION_PAGE', () => getAskRecordCollectionPage(world.owner.id, world.p1.id, 'rooms', { limit: 50 }));
});
test('PERF: Work page', { skip }, async () => {
  const { getAskWorkPage } = require('../../src/services/ask/askWork.service.ts');
  await measure('WORK_PAGE', () => getAskWorkPage(world.owner.id, world.p1.id, { view: 'NEEDS_YOU', limit: 25 }));
});
test('PERF: Saved page', { skip }, async () => {
  const { getAskSavedPage } = require('../../src/services/ask/askSaved.service.ts');
  await measure('SAVED_PAGE', () => getAskSavedPage(world.owner.id, world.p1.id, { limit: 25 }));
});
test('PERF: Search', { skip }, async () => {
  const { searchAsk } = require('../../src/services/ask/askSearch.service.ts');
  await measure('SEARCH', () => searchAsk(world.owner.id, world.p1.id, 'perf'));
});
test('PERF: Notifications inbox', { skip }, async () => {
  const { listAskNotifications } = require('../../src/services/ask/askNotificationInbox.service.ts');
  await measure('NOTIFICATIONS_PAGE', () => listAskNotifications(world.owner.id, { limit: 25 }));
});
test('PERF: Add a file, state of one file', { skip }, async () => {
  const { getAskIntake } = require('../../src/services/ask/askIntake.service.ts');
  const record = await prisma.propertyRecord.findFirst({ where: { propertyId: world.p1.id, title: 'Perf document 0' } });
  const version = await prisma.propertyRecordVersion.findFirst({ where: { recordId: record.id } });
  await prisma.propertyRecord.update({ where: { id: record.id }, data: { currentVersionId: version.id } });
  await measure('INTAKE_STATE', () => getAskIntake({ propertyId: world.p1.id, userId: world.owner.id, role: 'OWNER' }, record.id));
});
