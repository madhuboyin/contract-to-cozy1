import { prisma } from '../lib/prisma';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { buildInventoryCoveragePresentation } from './inventoryCoverageState.service';

const ACTIVE_COVERAGE_JOURNEY_STATUSES = ['ACTIVE', 'NOT_STARTED'] as const;

/**
 * Archives coverage journeys whose item no longer supports a homeowner
 * coverage workflow. History remains available for audit without surfacing the
 * journey as active guidance or a major moment.
 */
export async function reconcileCoverageGuidanceJourneyApplicability(
  propertyId: string,
): Promise<string[]> {
  const journeys = await prisma.guidanceJourney.findMany({
    where: {
      propertyId,
      journeyTypeKey: 'coverage_gap_resolution',
      status: { in: [...ACTIVE_COVERAGE_JOURNEY_STATUSES] },
    },
    select: {
      id: true,
      inventoryItemId: true,
      primarySignalId: true,
      status: true,
    },
  });
  if (journeys.length === 0) return [];

  const itemIds = journeys
    .map((journey) => journey.inventoryItemId)
    .filter((id): id is string => Boolean(id));
  const [items, responsibilities] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        propertyId,
        id: { in: itemIds },
        ...visibleInventoryItemWhere(),
      },
      include: { warranty: true, insurancePolicy: true },
    }),
    prisma.propertyResponsibility.findMany({
      where: { propertyId },
      select: { scope: true, party: true },
    }),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));

  const ineligible = journeys.filter((journey) => {
    if (!journey.inventoryItemId) return false;
    const item = itemById.get(journey.inventoryItemId);
    if (!item) return true;
    const presentation = buildInventoryCoveragePresentation(item, responsibilities);
    return ['CONFIRMED', 'MANAGED_ELSEWHERE', 'NOT_REQUIRED'].includes(
      presentation.coverageState,
    );
  });
  if (ineligible.length === 0) return [];

  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const journey of ineligible) {
      await tx.guidanceJourney.update({
        where: { id: journey.id },
        data: {
          status: 'ARCHIVED',
          archivedAt,
          lastTransitionAt: archivedAt,
          version: { increment: 1 },
        },
      });
      await tx.guidanceJourneyEvent.create({
        data: {
          propertyId,
          journeyId: journey.id,
          signalId: journey.primarySignalId,
          eventType: 'JOURNEY_STATUS_CHANGED',
          fromJourneyStatus: journey.status,
          toJourneyStatus: 'ARCHIVED',
          actorType: 'SYSTEM',
          reasonCode: 'PROPERTY_CONTEXT_NO_LONGER_ACTIONABLE',
          reasonMessage: 'Current property context no longer supports a homeowner coverage workflow.',
          payloadJson: {
            reconciliation: 'coverage_applicability',
            archivedAt: archivedAt.toISOString(),
          },
        },
      });
    }
  });

  return ineligible.map((journey) => journey.id);
}
