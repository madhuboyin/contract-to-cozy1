// apps/backend/scripts/restore-appliance-identity-tags.ts
//
// One-time repair for appliance classification tags that older edits erased. (FRD v1.174)
//
// WHY THIS EXISTS:
// A major appliance is classified in two places: the canonical source hash `property_appliance::<TYPE>` (the durable
// record; duplicate prevention keys on it) and two derived tags, `PROPERTY_APPLIANCE` and `APPLIANCE_TYPE:<TYPE>`.
// Until the fix in InventoryService.updateItem, every save from the Inventory drawer sent `tags: []`, which overwrote
// the item's tags while leaving the hash in place. Those items are still classified by their hash, but anything that
// reads the tag (the risk assessment's appliance-type inference is one) falls back to guessing from the item name, and
// that guess is what raises the "names this item as X but classifies its system as Y" conflict.
// The service now heals such an item the next time somebody edits it; this script repairs the ones nobody edits.
//
// SAFE BY DESIGN:
//   - Defaults to DRY RUN. Nothing is written unless you pass --apply.
//   - Only ever ADDS the two tags. It never removes a tag and never touches the name, hash, category, room or any
//     other field.
//   - Only touches items that have a canonical `property_appliance::<TYPE>` hash, the one record that survived.
//   - An item that already carries a type tag naming a DIFFERENT type than its hash is reported as a CONFLICT and left
//     alone: which of the two is right is the homeowner's call, not a repair's.
//   - The write goes through InventoryService.restoreApplianceIdentityTags, which re-reads the row, only applies to the
//     row version it read (a concurrent edit is skipped, not overwritten), and emits the standard property-change
//     signal so derived data is recomputed. It deliberately does not use updateItem (its room requirement would reject
//     a legacy roomless appliance).
//   - Idempotent: re-running after --apply finds nothing left to restore.
//
// Usage (from apps/backend, with DATABASE_URL, and REDIS_* for --apply, pointing at the target environment):
//   npx ts-node scripts/restore-appliance-identity-tags.ts                          (dry run: counts, samples, conflicts)
//   npx ts-node scripts/restore-appliance-identity-tags.ts --property=<propertyId>  (limit to one property)
//   npx ts-node scripts/restore-appliance-identity-tags.ts --apply                  (actually writes)
//
// Verify afterwards (expect only the CONFLICT rows the dry run listed):
//   SELECT count(*) FROM inventory_items
//   WHERE category = 'APPLIANCE' AND "sourceHash" LIKE 'property_appliance::%'
//     AND NOT ('PROPERTY_APPLIANCE' = ANY(tags)
//              AND ('APPLIANCE_TYPE:' || substring("sourceHash" from 21)) = ANY(tags));

import { PrismaClient } from '@prisma/client';
import { PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX, planApplianceIdentityTags } from '../src/services/majorAppliance.util';

const prisma = new PrismaClient();

const SAMPLE_SIZE = 25;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const propertyId = argValue('property');

  console.log('='.repeat(72));
  console.log(`Appliance identity tag repair — ${apply ? 'APPLY MODE' : 'DRY RUN (pass --apply to write)'}`);
  if (propertyId) console.log(`Limited to property ${propertyId}`);
  console.log('='.repeat(72));

  const items = await prisma.inventoryItem.findMany({
    where: {
      category: 'APPLIANCE',
      sourceHash: { startsWith: PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX },
      ...(propertyId ? { propertyId } : {}),
    },
    // `category` must be selected: the plan checks it, and a row without it is skipped as "not an appliance".
    select: { id: true, propertyId: true, name: true, category: true, sourceHash: true, tags: true },
    orderBy: [{ propertyId: 'asc' }, { id: 'asc' }],
  });
  console.log(`\nClassified appliances found (canonical hash present): ${items.length}`);

  const restore: Array<{ id: string; propertyId: string; name: string; type: string; added: string[] }> = [];
  const conflicts: Array<{ id: string; propertyId: string; name: string; type: string; conflictingTypeTags: string[] }> = [];
  let ok = 0;
  let skipped = 0;
  for (const item of items) {
    const plan = planApplianceIdentityTags(item);
    if (plan.action === 'RESTORE') restore.push({ id: item.id, propertyId: item.propertyId, name: item.name, type: plan.type, added: plan.added });
    else if (plan.action === 'CONFLICT') conflicts.push({ id: item.id, propertyId: item.propertyId, name: item.name, type: plan.type, conflictingTypeTags: plan.conflictingTypeTags });
    else if (plan.action === 'OK') ok += 1;
    else skipped += 1;
  }

  console.log(`  already correct : ${ok}`);
  console.log(`  to restore      : ${restore.length}  (across ${new Set(restore.map((row) => row.propertyId)).size} properties)`);
  console.log(`  conflicts       : ${conflicts.length}  (left alone; need a human decision)`);
  if (skipped) console.log(`  skipped         : ${skipped}`);

  if (restore.length) {
    console.log(`\nSample of items to restore (first ${Math.min(SAMPLE_SIZE, restore.length)}):`);
    for (const row of restore.slice(0, SAMPLE_SIZE)) {
      console.log(`  ${row.id}  property=${row.propertyId}  "${row.name}"  type=${row.type}  add: ${row.added.join(', ')}`);
    }
  }
  if (conflicts.length) {
    console.log('\nCONFLICTS — carries a type tag that names a different type than its canonical hash; NOT modified:');
    for (const row of conflicts) {
      console.log(`  ${row.id}  property=${row.propertyId}  "${row.name}"  hash type=${row.type}  conflicting tag(s): ${row.conflictingTypeTags.join(', ')}`);
    }
  }

  if (!apply) {
    console.log('\nDry run complete — no changes written. Re-run with --apply to restore the items above.');
    return;
  }

  // Loaded only now: the service pulls in the job queue, which a dry run has no need to connect to.
  const { InventoryService } = await import('../src/services/inventory.service');
  const service = new InventoryService();
  const outcome: Record<string, number> = {};
  const concurrent: string[] = [];
  let done = 0;
  for (const row of restore) {
    try {
      const result = await service.restoreApplianceIdentityTags(row.propertyId, row.id);
      outcome[result.status] = (outcome[result.status] ?? 0) + 1;
      if (result.status === 'CHANGED_CONCURRENTLY') concurrent.push(row.id);
    } catch (error) {
      outcome.ERROR = (outcome.ERROR ?? 0) + 1;
      console.error(`  ERROR restoring ${row.id}:`, error instanceof Error ? error.message : error);
    }
    done += 1;
    if (done % 50 === 0) console.log(`  ... ${done}/${restore.length}`);
  }

  console.log('\nResult:');
  for (const [status, count] of Object.entries(outcome)) console.log(`  ${status.padEnd(22)} ${count}`);
  if (concurrent.length) {
    console.log(`\n${concurrent.length} item(s) were edited while the script ran and were skipped, not overwritten. Re-run to pick them up.`);
  }
  console.log('\nDone. Run the verification query in this file\'s header; only the conflicts above should remain.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The apply path imports the service, which can leave queue connections open.
    process.exit(process.exitCode ?? 0);
  });
