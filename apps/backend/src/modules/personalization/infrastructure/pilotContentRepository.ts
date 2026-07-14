import { prisma } from '../../../lib/prisma';

export interface ActivePilotContent {
  version: number;
  title: string;
  body: string;
}

export async function loadActivePilotContent(
  definitionId: string,
  locale = 'en-US',
): Promise<ActivePilotContent | null> {
  return prisma.recommendationContentVersion.findFirst({
    where: { definitionId, locale, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { version: true, title: true, body: true },
  });
}
