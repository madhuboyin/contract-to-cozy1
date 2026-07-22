// apps/backend/scripts/smoke-test-cleanup.ts
//
// W6 item 3: removes exactly the records a single smoke-test run created,
// identified by its correlation ID — never by a date/status range (see
// apps/workers/src/jobs/cleanupInventoryDrafts.job.ts for the broad-sweep
// pattern this deliberately avoids). Always previews the exact IDs first;
// only deletes with --confirm.
//
// Usage:
//   npx ts-node scripts/smoke-test-cleanup.ts --correlation-id smoke:mortgage-rate-ingest:1732200000000:ab12cd34
//   npx ts-node scripts/smoke-test-cleanup.ts --correlation-id <id> --confirm

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { correlationId?: string; confirm: boolean } {
  const correlationIdIndex = argv.indexOf('--correlation-id');
  const correlationId = correlationIdIndex >= 0 ? argv[correlationIdIndex + 1] : undefined;
  return { correlationId, confirm: argv.includes('--confirm') };
}

async function main() {
  const { correlationId, confirm } = parseArgs(process.argv.slice(2));

  if (!correlationId || !correlationId.startsWith('smoke:')) {
    console.error('Usage: npx ts-node scripts/smoke-test-cleanup.ts --correlation-id smoke:<jobKey>:<...> [--confirm]');
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  const [notifications, snapshots] = await Promise.all([
    prisma.notification.findMany({
      where: { metadata: { path: ['smokeCorrelationId'], equals: correlationId } },
      select: { id: true, type: true, userId: true, createdAt: true },
    }),
    prisma.mortgageRateSnapshot.findMany({
      where: { metadataJson: { path: ['smokeCorrelationId'], equals: correlationId } },
      select: { id: true, source: true, date: true },
    }),
  ]);

  console.log('='.repeat(72));
  console.log(`Smoke-test cleanup preview — correlation ID: ${correlationId}`);
  console.log('='.repeat(72));
  console.log(`\nNotification rows (${notifications.length}):`);
  notifications.forEach((n) => console.log(`  ${n.id}  ${n.type}  user=${n.userId}  ${n.createdAt.toISOString()}`));
  console.log(`\nMortgageRateSnapshot rows (${snapshots.length}):`);
  snapshots.forEach((s) => console.log(`  ${s.id}  ${s.source}  ${s.date.toISOString().slice(0, 10)}`));

  const total = notifications.length + snapshots.length;
  if (total === 0) {
    console.log('\nNo records found for this correlation ID — nothing to clean up.');
    await prisma.$disconnect();
    return;
  }

  if (!confirm) {
    console.log(`\n${total} record(s) would be deleted. Re-run with --confirm to actually delete them.`);
    await prisma.$disconnect();
    return;
  }

  await Promise.all([
    notifications.length
      ? prisma.notification.deleteMany({ where: { id: { in: notifications.map((n) => n.id) } } })
      : Promise.resolve(),
    snapshots.length
      ? prisma.mortgageRateSnapshot.deleteMany({ where: { id: { in: snapshots.map((s) => s.id) } } })
      : Promise.resolve(),
  ]);

  console.log(`\nDeleted ${notifications.length} notification(s) and ${snapshots.length} mortgage rate snapshot(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
