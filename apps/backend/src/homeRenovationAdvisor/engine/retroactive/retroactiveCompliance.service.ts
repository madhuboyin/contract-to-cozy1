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
import {
  createRenovationCase,
  transitionRenovationCase,
} from '../../../services/renovationCase.service';

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
  existingRenovationCaseId: string | null;
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

  // 2. Keep the legacy advisor linkage signal, but use canonical renovation
  // cases as the durable/idempotent record for historical review.
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
  const existingCases = await prisma.renovationCase.findMany({
    where: {
      propertyId,
      sourceType: 'HOME_EVENT',
      sourceId: { in: events.map(event => event.id) },
      archivedAt: null,
    },
    select: { id: true, sourceId: true },
  });
  const caseByEventId = new Map(
    existingCases
      .filter(item => item.sourceId)
      .map(item => [item.sourceId as string, item.id]),
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
      existingRenovationCaseId: caseByEventId.get(event.id) ?? null,
    });
  }

  return candidates;
}

const CASE_TYPE_BY_RENOVATION_TYPE: Partial<Record<HomeRenovationType, string>> = {
  ROOM_ADDITION: 'ADDITION',
  BATHROOM_ADDITION: 'ADDITION',
  ADU_CONSTRUCTION: 'ADDITION',
  DECK_ADDITION: 'ADDITION',
  PATIO_MAJOR_ADDITION: 'ADDITION',
  GARAGE_CONVERSION: 'CONVERSION',
  BASEMENT_FINISHING: 'CONVERSION',
  ROOF_REPLACEMENT: 'REPLACEMENT',
  STRUCTURAL_REPAIR_MAJOR: 'REPAIR',
};

export async function createRetroactiveRenovationCase(
  propertyId: string,
  timelineEventId: string,
  actorUserId: string,
) {
  const event = await prisma.homeEvent.findFirst({
    where: {
      id: timelineEventId,
      propertyId,
      type: 'IMPROVEMENT' as any,
    },
    select: {
      id: true,
      title: true,
      subtype: true,
      occurredAt: true,
      amount: true,
      meta: true,
    },
  });
  if (!event) {
    const error = new Error('Historical renovation candidate not found.') as Error & {
      statusCode?: number;
      code?: string;
    };
    error.statusCode = 404;
    error.code = 'RETROACTIVE_CANDIDATE_NOT_FOUND';
    throw error;
  }

  const subtypeKey = event.subtype?.toUpperCase().replace(/ /g, '_');
  const meta = event.meta as Record<string, unknown> | null;
  const metaType = typeof meta?.renovationType === 'string'
    ? meta.renovationType.toUpperCase()
    : null;
  const renovationType = (
    (subtypeKey && RENOVATION_SUBTYPE_MAP[subtypeKey])
    || (metaType && RENOVATION_SUBTYPE_MAP[metaType])
    || null
  );
  const caseType = renovationType
    ? CASE_TYPE_BY_RENOVATION_TYPE[renovationType] ?? 'REMODEL'
    : 'HISTORICAL_RESEARCH';
  const idempotencyKey = `retroactive-home-event:${event.id}`;
  const created = await createRenovationCase(propertyId, actorUserId, {
    name: event.title,
    objective: 'Review historical work for permit, tax, licensing, zoning, and closeout gaps.',
    caseType,
    governanceTier: 'COMPLIANCE_SENSITIVE',
    responsibilityContext: 'HOMEOWNER',
    spacesAffected: [],
    systemsAffected: [],
    entryPoint: 'RENOVATION_WORKSPACE_RETROACTIVE_REVIEW',
    sourceType: 'HOME_EVENT',
    sourceId: event.id,
    idempotencyKey,
    initialScope: {
      summary: `${event.title} completed ${event.occurredAt.toISOString().slice(0, 10)}.`,
      workItems: [{
        title: event.title,
        status: 'COMPLETED_REPORTED',
        occurredAt: event.occurredAt.toISOString(),
        amount: event.amount ? Number(event.amount) : null,
        renovationType,
      }],
      spacesAffected: [],
      systemsAffected: [],
      structuralEffects: false,
      exteriorEffects: false,
      drawingDocumentIds: [],
      specificationDocumentIds: [],
      approvalStatus: 'DRAFT',
    },
  });

  if (created.lifecycle === 'IDEA') {
    return transitionRenovationCase(propertyId, created.id, actorUserId, {
      lifecycle: 'HISTORICAL_RESEARCH',
      reason: 'Homeowner started a guided retroactive compliance review.',
      idempotencyKey: `retroactive-start:${event.id}`,
    });
  }
  return created;
}
