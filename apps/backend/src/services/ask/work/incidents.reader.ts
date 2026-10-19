import type { IncidentSeverity, IncidentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { boundaryInstant, truncateTitle, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'incident:';

const STATUS_LABELS: Record<IncidentStatus, string> = {
  DETECTED: 'Detected', EVALUATED: 'Assessed', ACTIVE: 'Active', ACTIONED: 'Being handled', MITIGATED: 'Contained', RESOLVED: 'Resolved', SUPPRESSED: 'Suppressed', EXPIRED: 'Lapsed',
};
const AWAITING_YOU: IncidentStatus[] = ['DETECTED', 'EVALUATED', 'ACTIVE'];
const OPEN: IncidentStatus[] = ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED', 'MITIGATED'];

export interface IncidentViewInput {
  status: IncidentStatus;
  snoozedUntil: Date | null;
  archivedByCaller: boolean;
  now: Date;
}

/**
 * Lifecycle view of an incident for the caller. An incident the caller archived is archived whatever its status, so archiving never
 * orphans it from the list. Otherwise: not yet handled needs the homeowner; being handled is active; contained, or open but snoozed, is
 * waiting; resolved is completed; a lapsed one is archived. A suppressed incident is not work and has no view.
 */
export function incidentLifecycleView(input: IncidentViewInput): AskWorkLifecycleView | null {
  if (input.status === 'SUPPRESSED') return null;
  if (input.archivedByCaller) return 'ARCHIVED';
  if (input.status === 'RESOLVED') return 'COMPLETED';
  if (input.status === 'EXPIRED') return 'ARCHIVED';
  if (input.status === 'MITIGATED') return 'WAITING';
  if (input.snoozedUntil && input.snoozedUntil > input.now) return 'WAITING';
  return AWAITING_YOU.includes(input.status) ? 'NEEDS_YOU' : 'ACTIVE';
}

function viewWhere(view: AskWorkLifecycleView, userId: string, now: Date): Prisma.IncidentWhereInput {
  const archived: Prisma.IncidentWhereInput = { userPreferences: { some: { userId, isArchived: true } } };
  const notArchived: Prisma.IncidentWhereInput = { NOT: archived };
  const awake: Prisma.IncidentWhereInput = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  switch (view) {
    case 'NEEDS_YOU': return { AND: [notArchived, { status: { in: AWAITING_YOU } }, awake] };
    case 'ACTIVE': return { AND: [notArchived, { status: 'ACTIONED' }, awake] };
    case 'WAITING': return { AND: [notArchived, { OR: [{ status: 'MITIGATED' }, { status: { in: OPEN }, snoozedUntil: { gt: now } }] }] };
    case 'COMPLETED': return { AND: [notArchived, { status: 'RESOLVED' }] };
    case 'ARCHIVED': return { OR: [archived, { status: 'EXPIRED' }] };
    default: return { id: { in: [] } };
  }
}

interface IncidentRecord {
  id: string;
  propertyId: string;
  title: string;
  summary: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity | null;
  snoozedUntil: Date | null;
  updatedAt: Date;
  userPreferences: Array<{ isArchived: boolean }>;
}

export function incidentRow(incident: IncidentRecord, now: Date, workItemIds: readonly string[] = []): AskWorkRow | null {
  const lifecycleView = incidentLifecycleView({ status: incident.status, snoozedUntil: incident.snoozedUntil, archivedByCaller: incident.userPreferences.some((entry) => entry.isArchived), now });
  if (!lifecycleView) return null;
  const sortAt = incident.updatedAt.toISOString();
  return {
    workKey: `${KEY_PREFIX}${incident.id}`,
    sourceAliases: workItemIds.map((id) => `workItem:${id}`),
    providerId: 'INCIDENTS',
    workType: 'INCIDENT',
    propertyId: incident.propertyId,
    entity: { type: 'Incident', id: incident.id },
    title: truncateTitle(incident.title) || 'Incident',
    summary: incident.summary ? truncateTitle(incident.summary, 200) : null,
    status: { canonical: incident.status, label: STATUS_LABELS[incident.status] },
    lifecycleView,
    nextAction: lifecycleView === 'NEEDS_YOU' ? { label: 'Review and decide the next step', operationId: null, allowed: true }
      : lifecycleView === 'ACTIVE' || lifecycleView === 'WAITING' ? { label: 'Check on this incident', operationId: null, allowed: true } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'incidents',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'INCIDENT_CONTINUATION', entityType: 'Incident', entityId: incident.id }) },
  };
}

/** Incidents for the home (FR-WORK-001): the same suppressed-hidden set Ask's incident answers read, with the caller's own archive honored. Read-only. */
export const readIncidentWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const base: Prisma.IncidentWhereInput = { propertyId: context.propertyId, isSuppressed: false, status: { not: 'SUPPRESSED' } };
  const statusFilter: Prisma.IncidentWhereInput = query.status ? { status: query.status as IncidentStatus } : {};
  const inView: Prisma.IncidentWhereInput  = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view, context.userId, now), statusFilter] };
  const instant = boundaryInstant(query.after);
  const sameInstant: Prisma.IncidentWhereInput | null = !query.after ? null
    : query.after.workKey.startsWith(KEY_PREFIX) ? { id: { gt: query.after.workKey.slice(KEY_PREFIX.length) } }
      : KEY_PREFIX > query.after.workKey ? {} : { id: { in: [] } };
  const paged: Prisma.IncidentWhereInput = instant && sameInstant
    ? { AND: [inView, { OR: [{ updatedAt: { lt: instant } }, { AND: [{ updatedAt: instant }, sameInstant] }] }] }
    : inView;
  const views = ASK_WORK_LIFECYCLE_VIEWS.filter((view) => view !== 'SCHEDULED');
  const [incidents, total, ...counts] = await Promise.all([
    prisma.incident.findMany({
      where: paged,
      select: {
        id: true, propertyId: true, title: true, summary: true, status: true, severity: true, snoozedUntil: true, updatedAt: true,
        userPreferences: { where: { userId: context.userId }, select: { isArchived: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.incident.count({ where: inView }),
    ...views.map((view) => prisma.incident.count({ where: { AND: [base, viewWhere(view, context.userId, now)] } })),
  ]);
  // One batched lookup for the home work items these incidents back, so each row keeps its workItem alias without a call per row.
  const sources = incidents.length
    ? await prisma.operationalWorkSource.findMany({
      where: { sourceType: 'INCIDENT', sourceEntityId: { in: incidents.map((incident) => incident.id) }, active: true },
      select: { workItemId: true, sourceEntityId: true },
    })
    : [];
  const itemsByIncident = new Map<string, string[]>();
  for (const source of sources) itemsByIncident.set(source.sourceEntityId, [...(itemsByIncident.get(source.sourceEntityId) ?? []), source.workItemId]);
  const viewCounts: Partial<Record<AskWorkLifecycleView, number>> = { SCHEDULED: 0 };
  views.forEach((view, index) => { viewCounts[view] = counts[index] as number; });
  const rows = incidents.flatMap((incident) => {
    const row = incidentRow(incident, now, itemsByIncident.get(incident.id) ?? []);
    return row ? [row] : [];
  });
  return { rows, total, viewCounts };
};
