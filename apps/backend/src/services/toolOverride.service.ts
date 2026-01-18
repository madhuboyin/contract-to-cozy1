// apps/backend/src/services/toolOverride.service.ts
import { prisma } from '../lib/prisma';

export type ToolOverrideDTO = { key: string; value: number };

export async function listToolOverrides(propertyId: string, toolKey: string) {
  const rows = await prisma.toolOverride.findMany({
    where: { propertyId, toolKey },
    orderBy: { key: 'asc' },
  });
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

export async function upsertToolOverrides(propertyId: string, toolKey: string, overrides: ToolOverrideDTO[]) {
  // small, safe: upsert one-by-one (counts are tiny)
  for (const o of overrides) {
    await prisma.toolOverride.upsert({
      where: { propertyId_toolKey_key: { propertyId, toolKey, key: o.key } },
      create: { propertyId, toolKey, key: o.key, value: o.value },
      update: { value: o.value },
    });
  }
}
