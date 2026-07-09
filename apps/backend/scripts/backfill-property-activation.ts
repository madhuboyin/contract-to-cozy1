// apps/backend/scripts/backfill-property-activation.ts
//
// One-time backfill for Property.activationStatus.
//
// WHY THIS EXISTS:
// analyticsEmitter's maybeActivateProperty() side effect (which marks a
// property ACTIVATED the first time it generates a real, userId-backed
// analytics event) has gone through several fixes across two sessions:
// originally only wired to the Digital Twin tool, then centralized into
// track()/featureOpened()/decisionGuided()/toolUsed() — but that fix sat in
// a stale, undeployed build for a while, and was only just deployed for
// real. Real events kept recording the whole time; activation often didn't
// fire when they happened. Going forward, new events correctly activate
// their property. This script catches up the properties that SHOULD
// already be ACTIVATED based on real historical engagement, but never got
// flagged because the activation logic wasn't reliably running at the time.
//
// This is why Feature Adoption still showed >100% for Home Pulse/Gazette
// even after the userId-null system-event fix landed: those events already
// have real userIds (so the system-event filter didn't touch them), but
// their properties were never marked ACTIVATED.
//
// SAFE BY DESIGN:
//   - Only ever sets activationStatus: NOT_STARTED/IN_PROGRESS -> ACTIVATED.
//     Never touches an already-ACTIVATED property, never reverts one.
//   - activatedAt is backfilled to the EARLIEST real (userId-backed) event
//     for that property, not "now" — so it doesn't create a false spike in
//     "new activations this period" for whatever week you happen to run it.
//   - Defaults to DRY RUN. Nothing is written unless you pass --apply.
//
// Usage:
//   npx ts-node scripts/backfill-property-activation.ts            (dry run, prints what would change)
//   npx ts-node scripts/backfill-property-activation.ts --apply    (actually writes)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('='.repeat(72));
  console.log(`Property Activation Backfill — ${apply ? 'APPLY MODE' : 'DRY RUN (pass --apply to write)'}`);
  console.log('='.repeat(72));

  // Earliest real (userId-backed) event per property.
  const firstRealEventByProperty = await prisma.productAnalyticsEvent.groupBy({
    by: ['propertyId'],
    where: { propertyId: { not: null }, userId: { not: null } },
    _min: { occurredAt: true },
  });

  console.log(`\nProperties with at least one real (userId-backed) event: ${firstRealEventByProperty.length}`);

  const propertyIds = firstRealEventByProperty
    .map((r) => r.propertyId)
    .filter((id): id is string => id != null);

  const candidates = await prisma.property.findMany({
    where: {
      id: { in: propertyIds },
      activationStatus: { not: 'ACTIVATED' },
    },
    select: { id: true, activationStatus: true },
  });

  if (candidates.length === 0) {
    console.log('\nNo properties need backfilling — every property with real engagement is already ACTIVATED.');
    await prisma.$disconnect();
    return;
  }

  const firstEventMap = new Map(
    firstRealEventByProperty.map((r) => [r.propertyId as string, r._min.occurredAt as Date])
  );

  console.log(`\nProperties to activate: ${candidates.length}`);
  console.log('-'.repeat(72));
  for (const c of candidates) {
    const activatedAt = firstEventMap.get(c.id);
    console.log(
      `  ${c.id}  ${c.activationStatus.padEnd(12)} -> ACTIVATED  (activatedAt: ${activatedAt?.toISOString()})`
    );
  }
  console.log('-'.repeat(72));

  if (!apply) {
    console.log(`\nDry run only — no changes written. Re-run with --apply to write ${candidates.length} update(s).`);
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const c of candidates) {
    const activatedAt = firstEventMap.get(c.id);
    if (!activatedAt) continue;
    await prisma.property.update({
      where: { id: c.id },
      data: { activationStatus: 'ACTIVATED', activatedAt },
    });
    updated += 1;
  }

  console.log(`\nDone. ${updated} propert${updated === 1 ? 'y' : 'ies'} marked ACTIVATED.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
