import { prisma } from '../src/lib/prisma';
import { inferMajorApplianceType, PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX } from '../src/services/majorAppliance.util';
import { recordDuplicateDecision } from '../src/modules/homeOperations/application/recordDuplicateDecision.usecase';

const apply = process.argv.includes('--apply');
const propertyArg = process.argv.find((arg) => arg.startsWith('--property='))?.slice('--property='.length);

async function main() {
  const items = await prisma.inventoryItem.findMany({
    where: { category: 'APPLIANCE', ...(propertyArg ? { propertyId: propertyArg } : {}) },
    select: { id: true, propertyId: true, name: true, sourceHash: true, isVerified: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const groups = new Map<string, { type: string; items: typeof items }>();
  for (const item of items) {
    const type = inferMajorApplianceType(item.name);
    if (!type) continue;
    const key = `${item.propertyId}:${type}`;
    const group = groups.get(key) ?? { type, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  let duplicateGroups = 0;
  let duplicateWorkItems = 0;
  for (const group of groups.values()) {
    if (group.items.length < 2) continue;
    duplicateGroups += 1;
    const canonicalHash = `${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}${group.type}`;
    const ranked = [...group.items].sort((a, b) =>
      Number(b.sourceHash === canonicalHash) - Number(a.sourceHash === canonicalHash)
      || Number(b.isVerified) - Number(a.isVerified)
      || a.createdAt.getTime() - b.createdAt.getTime()
      || a.id.localeCompare(b.id));
    const canonicalItem = ranked[0];
    const workItems = await prisma.operationalWorkItem.findMany({
      where: {
        propertyId: canonicalItem.propertyId,
        subjectType: 'INVENTORY_ITEM',
        subjectId: { in: ranked.map((item) => item.id) },
        state: 'CANDIDATE',
        supersededByWorkItemId: null,
      },
      select: { id: true, subjectId: true, title: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const canonicalWork = workItems.find((item) => item.subjectId === canonicalItem.id) ?? workItems[0] ?? null;
    const duplicateWork = canonicalWork ? workItems.filter((item) => item.id !== canonicalWork.id) : [];
    duplicateWorkItems += duplicateWork.length;
    console.log(JSON.stringify({
      propertyId: canonicalItem.propertyId,
      applianceType: group.type,
      canonicalInventoryItemId: canonicalItem.id,
      duplicateInventoryItemIds: ranked.slice(1).map((item) => item.id),
      canonicalWorkItemId: canonicalWork?.id ?? null,
      duplicateWorkItemIds: duplicateWork.map((item) => item.id),
    }));
    if (!apply) continue;

    if (canonicalItem.sourceHash !== canonicalHash) {
      await prisma.inventoryItem.update({ where: { id: canonicalItem.id }, data: { sourceHash: canonicalHash } });
    }
    for (const duplicate of duplicateWork) {
      await recordDuplicateDecision({
        workItemId: duplicate.id,
        supersededByWorkItemId: canonicalWork!.id,
        idempotencyKey: `repair-major-appliance-duplicate:${canonicalWork!.id}`,
      });
    }
  }

  console.log(`${apply ? 'Applied' : 'Dry run'}: ${duplicateGroups} duplicate appliance group(s), ${duplicateWorkItems} candidate work item(s) to supersede.`);
  if (!apply) console.log('No writes performed. Re-run with --apply after reviewing the JSON lines above.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
