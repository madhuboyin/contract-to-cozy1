import { prisma } from '../../../lib/prisma';
import { SuppressionReason } from '../domain/feedbackPolicy';

export type { SuppressionReason };

export async function findActiveSuppression(
  propertyId: string,
  definitionId: string,
): Promise<boolean> {
  const row = await prisma.recommendationSuppression.findUnique({
    where: { propertyId_definitionId: { propertyId, definitionId } },
    select: { until: true },
  });
  return Boolean(row && (!row.until || row.until > new Date()));
}

export interface CreateOrExtendSuppressionParams {
  propertyId: string;
  definitionId: string;
  reason: SuppressionReason;
  /** null = indefinite. */
  until: Date | null;
}

export async function createOrExtendSuppression(params: CreateOrExtendSuppressionParams): Promise<void> {
  const existing = await prisma.recommendationSuppression.findUnique({
    where: {
      propertyId_definitionId: {
        propertyId: params.propertyId,
        definitionId: params.definitionId,
      },
    },
  });
  const extendedUntil =
    existing && existing.until !== null && params.until !== null
      ? (params.until > existing.until ? params.until : existing.until)
      : null;

  await prisma.recommendationSuppression.upsert({
    where: {
      propertyId_definitionId: {
        propertyId: params.propertyId,
        definitionId: params.definitionId,
      },
    },
    create: {
      propertyId: params.propertyId,
      definitionId: params.definitionId,
      reason: params.reason,
      until: params.until,
    },
    update: {
      reason: params.reason,
      until: extendedUntil,
    },
  });
}
