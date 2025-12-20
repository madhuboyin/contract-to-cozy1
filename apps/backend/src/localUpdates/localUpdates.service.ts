// apps/backend/src/localUpdates/localUpdates.service.ts
import { prisma } from "../lib/prisma";
import { LocalUpdateDTO } from "./localUpdates.types";

export async function getOwnerLocalUpdates(params: {
  userId: string;
  zip: string;
  city: string;
  state?: string;
  propertyType?: string;
}): Promise<LocalUpdateDTO[]> {
  const now = new Date();

  const updates = await prisma.localUpdate.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
      NOT: {
        dismissals: {
          some: { userId: params.userId },
        },
      },
      OR: [
        { zipCodes: { has: params.zip } },
        { cities: { has: params.city } },
        params.state ? { state: params.state } : undefined,
      ].filter(Boolean) as any,
    },
  });

  // ranking (kept simple + deterministic)
  const ranked = updates
    .map((u) => {
      let score = 0;

      if (u.zipCodes?.includes(params.zip)) score += 40;
      if (u.cities?.includes(params.city)) score += 25;
      if (params.propertyType && u.propertyTypes?.includes(params.propertyType as any))
        score += 15;

      score += 10; // owner baseline

      const ageDays =
        (Date.now() - u.startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 7) score += 20;
      else if (ageDays <= 14) score += 14;
      else if (ageDays <= 30) score += 8;

      if (u.isSponsored) score -= 15;
      score += u.priority * 2;

      return { u, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.u);

  // max 1 sponsored
  const result = [];
  let sponsoredSeen = false;

  for (const u of ranked) {
    if (result.length >= 3) break;
    if (u.isSponsored && sponsoredSeen) continue;
    if (u.isSponsored) sponsoredSeen = true;
    result.push(u);
  }

  return result.map((u) => ({
    id: u.id,
    title: u.title,
    shortDescription: u.shortDescription,
    category: u.category as any,
    sourceName: u.sourceName,
    isSponsored: u.isSponsored,
    ctaText: u.ctaText,
    ctaUrl: u.ctaUrl,
  }));
}

export async function dismissLocalUpdate(userId: string, updateId: string) {
  await prisma.userLocalUpdateDismissal.upsert({
    where: {
      userId_localUpdateId: { userId, localUpdateId: updateId },
    },
    update: {},
    create: { userId, localUpdateId: updateId },
  });
}
