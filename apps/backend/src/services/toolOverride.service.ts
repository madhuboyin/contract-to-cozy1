// apps/backend/src/services/toolOverride.service.ts
import { prisma } from '../lib/prisma';

export type ToolOverrideDTO = { key: string; value: number };
/** A write: a number saves the override; null clears it (so "leave blank to use the default" is true). */
export type ToolOverrideWrite = { key: string; value: number | null };

export async function listToolOverrides(propertyId: string, toolKey: string) {
  const rows = await prisma.toolOverride.findMany({
    where: { propertyId, toolKey },
    orderBy: { key: 'asc' },
  });
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

export async function upsertToolOverrides(propertyId: string, toolKey: string, overrides: ToolOverrideWrite[]) {
  // small, safe: one-by-one (counts are tiny). Callers validate against toolOverrideContract first.
  for (const o of overrides) {
    if (o.value === null) {
      await prisma.toolOverride.deleteMany({ where: { propertyId, toolKey, key: o.key } });
      continue;
    }
    await prisma.toolOverride.upsert({
      where: { propertyId_toolKey_key: { propertyId, toolKey, key: o.key } },
      create: { propertyId, toolKey, key: o.key, value: o.value },
      update: { value: o.value },
    });
  }
}
