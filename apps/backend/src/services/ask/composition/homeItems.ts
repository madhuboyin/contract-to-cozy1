// Composition FRD FR-SLT-3: does a carried item still exist on this home? Read-only.
import { prisma } from '../../../lib/prisma';

export async function homeHasItem(propertyId: string, item: string): Promise<boolean> {
  if (item === 'roof' || item === 'roofing') {
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { roofReplacementYear: true } });
    if (property?.roofReplacementYear) return true;
  }
  const names = item === 'hvac' ? ['hvac', 'furnace', 'heat pump', 'air conditioner'] : item === 'refrigerator' ? ['refrigerator', 'fridge'] : [item];
  const found = await prisma.inventoryItem.findFirst({
    where: { propertyId, OR: names.map((name) => ({ name: { contains: name, mode: 'insensitive' as const } })) },
    select: { id: true },
  });
  return found != null;
}
