import type { GuidanceJourneyStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { journeyTitleFor } from '../handlers/guidanceOverview.handler';
import { afterBoundaryWhere, countViews, workItemIdsByExecution, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'journey:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

/**
 * Journeys the homeowner can see. BRANCHED (handed to a replacement journey, a SUPERSEDED resume), ABORTED and ARCHIVED (system-only
 * states the product never surfaces) have no view. A journey linked to a project is that project's work and is left out here.
 */
export function guidanceLifecycleView(status: GuidanceJourneyStatus): AskWorkLifecycleView | null {
  switch (status) {
    case 'NOT_STARTED': return 'NEEDS_YOU';
    case 'ACTIVE': return 'ACTIVE';
    case 'COMPLETED': return 'COMPLETED';
    case 'DISMISSED': return 'ARCHIVED';
    default: return null;
  }
}

const STATUSES_BY_VIEW: Partial<Record<AskWorkLifecycleView, GuidanceJourneyStatus[]>> = {
  NEEDS_YOU: ['NOT_STARTED'], ACTIVE: ['ACTIVE'], COMPLETED: ['COMPLETED'], ARCHIVED: ['DISMISSED'],
};
const LABELS: Partial<Record<GuidanceJourneyStatus, string>> = { NOT_STARTED: 'Not started', ACTIVE: 'In progress', COMPLETED: 'Complete', DISMISSED: 'Dismissed' };

function viewWhere(view: AskWorkLifecycleView): Prisma.GuidanceJourneyWhereInput {
  const statuses = STATUSES_BY_VIEW[view];
  return statuses ? { status: { in: statuses } } : { id: { in: [] } };
}

interface JourneyRecord {
  id: string;
  propertyId: string;
  status: GuidanceJourneyStatus;
  version: number;
  issueDomain: string;
  primarySignal: { signalIntentFamily: string | null } | null;
  inventoryItem: { name: string | null } | null;
  updatedAt: Date;
}

export function guidanceJourneyRow(journey: JourneyRecord, workItemIds: readonly string[] = []): AskWorkRow | null {
  const lifecycleView = guidanceLifecycleView(journey.status);
  if (!lifecycleView) return null;
  const sortAt = journey.updatedAt.toISOString();
  return {
    workKey: `${KEY_PREFIX}${journey.id}`,
    sourceAliases: workItemIds.map((id) => `workItem:${id}`),
    providerId: 'GUIDANCE_JOURNEYS',
    workType: 'GUIDANCE_JOURNEY',
    propertyId: journey.propertyId,
    entity: { type: 'GUIDANCE_JOURNEY', id: journey.id },
    title: journeyTitleFor(journey),
    summary: null,
    status: { canonical: journey.status, label: LABELS[journey.status] ?? journey.status },
    lifecycleView,
    nextAction: journey.status === 'NOT_STARTED' ? { label: 'Start this guided plan', operationId: null, allowed: true }
      : journey.status === 'ACTIVE' ? { label: 'Continue this guided plan', operationId: null, allowed: true } : null,
    sortAt,
    freshness: { version: String(journey.version), asOf: sortAt },
    sourceOwner: 'guidance',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'GUIDANCE_JOURNEY_CONTINUE', entityType: 'GUIDANCE_JOURNEY', entityId: journey.id, journeyId: journey.id, contextVersion: String(journey.version) }) },
  };
}

/**
 * Guided journeys for the home (FR-WORK-001): the read-only list. Unlike the guidance engine's own active-journey list, this never runs
 * the coverage reconcile or any legacy backfill, so the Work GET stays side-effect free.
 */
export const readGuidanceJourneyWork: AskWorkProviderReader = async (context, query) => {
  const base: Prisma.GuidanceJourneyWhereInput = { propertyId: context.propertyId, projectRecord: { is: null } };
  const statusFilter: Prisma.GuidanceJourneyWhereInput = query.status ? { status: query.status as GuidanceJourneyStatus } : {};
  const inView: Prisma.GuidanceJourneyWhereInput  = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view), statusFilter] };
  const [journeys, total, viewCounts] = await Promise.all([
    prisma.guidanceJourney.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: {
        id: true, propertyId: true, status: true, version: true, issueDomain: true, updatedAt: true,
        primarySignal: { select: { signalIntentFamily: true } }, inventoryItem: { select: { name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.guidanceJourney.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.guidanceJourney.count({ where: { AND: [base, viewWhere(view)] } })),
  ]);
  const workItems = await workItemIdsByExecution('GUIDANCE', journeys.map((journey) => journey.id));
  return { rows: journeys.flatMap((journey) => { const row = guidanceJourneyRow(journey, workItems.get(journey.id) ?? []); return row ? [row] : []; }), total, viewCounts };
};
