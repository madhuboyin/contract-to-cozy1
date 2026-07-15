import { prisma } from '../../../lib/prisma';

export interface ActiveRecommendationContent {
  version: number;
  title: string;
  body: string;
}

export async function loadActiveRecommendationContent(
  definitionId: string,
  locale = 'en-US',
): Promise<ActiveRecommendationContent | null> {
  return prisma.recommendationContentVersion.findFirst({
    where: { definitionId, locale, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { version: true, title: true, body: true },
  });
}
