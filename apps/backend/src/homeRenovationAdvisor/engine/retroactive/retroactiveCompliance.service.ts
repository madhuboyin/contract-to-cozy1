// apps/backend/src/homeRenovationAdvisor/engine/retroactive/retroactiveCompliance.service.ts
//
// Detects Home Timeline events that could benefit from a retroactive compliance
// review via the Renovation Risk Advisor.
//
// Strategy:
//   - Look for HomeEvent records of type IMPROVEMENT for the property
//   - Exclude events already created by the advisor (subtype = HOME_RENOVATION_RISK_CHECK)
//   - Exclude events already linked to an advisor session
//   - Return metadata useful for the frontend to surface a "check compliance" prompt

import { prisma } from '../../../lib/prisma';
import { HomeRenovationType } from '@prisma/client';
import { getRenovationLabel } from '../summary/summaryBuilder.service';

// Subtypes that may indicate completed renovation work eligible for retroactive review
const RENOVATION_SUBTYPE_MAP: Record<string, HomeRenovationType> = {
  ROOM_ADDITION: 'ROOM_ADDITION',
  BATHROOM_ADDITION: 'BATHROOM_ADDITION',
  BATHROOM_FULL_REMODEL: 'BATHROOM_FULL_REMODEL',
  GARAGE_CONVERSION: 'GARAGE_CONVERSION',
  BASEMENT_FINISHING: 'BASEMENT_FINISHING',
  ADU_CONSTRUCTION: 'ADU_CONSTRUCTION',
  DECK_ADDITION: 'DECK_ADDITION',
  PATIO_MAJOR_ADDITION: 'PATIO_MAJOR_ADDITION',
  STRUCTURAL_WALL_REMOVAL: 'STRUCTURAL_WALL_REMOVAL',
  STRUCTURAL_WALL_ADDITION: 'STRUCTURAL_WALL_ADDITION',
  ROOF_REPLACEMENT: 'ROOF_REPLACEMENT',
  STRUCTURAL_REPAIR_MAJOR: 'STRUCTURAL_REPAIR_MAJOR',
};

export interface RetroactiveCandidate {
  timelineEventId: string;
  propertyId: string;
  eventTitle: string;
  occurredAt: string;
  amount: number | null;
  suggestedRenovationType: HomeRenovationType | null;
  suggestedRenovationLabel: string | null;
  hasLinkedAdvisorSession: boolean;
}

/**
 * Finds completed renovation events on the property's timeline that do not
 * yet have a linked Renovation Risk Advisor session.
 *
 * Returns up to `limit` candidates, ordered by most recent first.
 */
export async function detectRetroactiveCandidates(
  propertyId: string,
  limit = 10,
): Promise<RetroactiveCandidate[]> {
  // 1. Find improvement events not created by the advisor
  const events = await prisma.homeEvent.findMany({
    where: {
      propertyId,
      type: 'IMPROVEMENT' as any,
      subtype: {
        not: 'HOME_RENOVATION_RISK_CHECK',
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: limit * 2, // over-fetch to allow filtering
    select: {
      id: true,
      propertyId: true,
      title: true,
      subtype: true,
      occurredAt: true,
      amount: true,
      meta: true,
    },
  });

  if (events.length === 0) return [];

  // 2. Check which properties have advisor sessions (check by property for efficiency)
  const existingSessions = await prisma.homeRenovationAdvisorSession.findMany({
    where: {
      propertyId,
      archivedAt: null,
    },
    select: {
      id: true,
      linkedTimelineItemId: true,
    },
  });

  const linkedTimelineIds = new Set(
    existingSessions
      .map((s) => s.linkedTimelineItemId)
      .filter(Boolean) as string[],
  );

  // 3. Build candidates list
  const candidates: RetroactiveCandidate[] = [];

  for (const event of events) {
    if (candidates.length >= limit) break;

    const hasLinked = linkedTimelineIds.has(event.id);

    // Try to infer renovation type from subtype
    const subtypeKey = event.subtype?.toUpperCase().replace(/ /g, '_');
    const suggestedType = subtypeKey ? RENOVATION_SUBTYPE_MAP[subtypeKey] ?? null : null;

    // Also check meta.renovationType if available
    const meta = event.meta as Record<string, unknown> | null;
    const metaRenovationType =
      meta?.renovationType &&
      typeof meta.renovationType === 'string' &&
      RENOVATION_SUBTYPE_MAP[meta.renovationType.toUpperCase()]
        ? RENOVATION_SUBTYPE_MAP[meta.renovationType.toUpperCase()]
        : null;

    const finalType = suggestedType ?? metaRenovationType;

    candidates.push({
      timelineEventId: event.id,
      propertyId: event.propertyId,
      eventTitle: event.title,
      occurredAt: event.occurredAt.toISOString(),
      amount: event.amount ? Number(event.amount) : null,
      suggestedRenovationType: finalType,
      suggestedRenovationLabel: finalType ? getRenovationLabel(finalType) : null,
      hasLinkedAdvisorSession: hasLinked,
    });
  }

  return candidates;
}
