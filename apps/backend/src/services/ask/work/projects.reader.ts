import type { Prisma, ProjectRecordStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, ASK_WORK_PROVIDER_REGISTRY, workActionAllowed, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../handlers/projectTracker.handler';
import { afterBoundaryWhere, countViews, truncateTitle, workItemIdsByExecution, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'project:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'SCHEDULED', 'COMPLETED', 'ARCHIVED'];

const NEXT_STEP: Partial<Record<ProjectRecordStatus, string>> = {
  DRAFT: 'Finish setting up this project', PLANNING: 'Get this project started', IN_PROGRESS: 'Check on progress', PAUSED: 'Decide when to resume', DISPUTED: 'Resolve the dispute',
};

/**
 * A project needs the homeowner while it is a draft or in dispute, is scheduled while planned for a future start, active while planning
 * toward a start or under way, waiting while paused, completed when done, and archived when cancelled.
 */
export function projectLifecycleView(status: ProjectRecordStatus, startDate: Date, now: Date): AskWorkLifecycleView {
  switch (status) {
    case 'DRAFT': case 'DISPUTED': return 'NEEDS_YOU';
    case 'PLANNING': return startDate > now ? 'SCHEDULED' : 'ACTIVE';
    case 'IN_PROGRESS': return 'ACTIVE';
    case 'PAUSED': return 'WAITING';
    case 'COMPLETED': return 'COMPLETED';
    default: return 'ARCHIVED';
  }
}

function viewWhere(view: AskWorkLifecycleView, now: Date): Prisma.ProjectRecordWhereInput {
  switch (view) {
    case 'NEEDS_YOU': return { status: { in: ['DRAFT', 'DISPUTED'] } };
    case 'ACTIVE': return { OR: [{ status: 'IN_PROGRESS' }, { status: 'PLANNING', startDate: { lte: now } }] };
    case 'WAITING': return { status: 'PAUSED' };
    case 'SCHEDULED': return { status: 'PLANNING', startDate: { gt: now } };
    case 'COMPLETED': return { status: 'COMPLETED' };
    case 'ARCHIVED': return { status: 'CANCELLED' };
  }
}

interface ProjectRecord {
  id: string;
  propertyId: string;
  name: string;
  projectType: string;
  status: ProjectRecordStatus;
  startDate: Date;
  contractorName: string | null;
  guidanceJourneyId: string | null;
  renovationCaseId: string | null;
  updatedAt: Date;
}

export function projectRow(project: ProjectRecord, role: Parameters<typeof workActionAllowed>[2], now: Date, workItemIds: readonly string[] = []): AskWorkRow {
  const sortAt = project.updatedAt.toISOString();
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'PROJECTS')!;
  const nextStep = NEXT_STEP[project.status];
  const typeLabel = PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType;
  return {
    workKey: `${KEY_PREFIX}${project.id}`,
    // The linked journey, renovation case and home work items are the same work seen from another owner; the project is the one to open.
    sourceAliases: [
      ...(project.guidanceJourneyId ? [`journey:${project.guidanceJourneyId}`] : []),
      ...(project.renovationCaseId ? [`renovation:${project.renovationCaseId}`] : []),
      ...workItemIds.map((id) => `workItem:${id}`),
    ],
    providerId: 'PROJECTS',
    workType: 'PROJECT',
    propertyId: project.propertyId,
    entity: { type: 'PROJECT_RECORD', id: project.id },
    title: truncateTitle(project.name) || typeLabel,
    summary: [typeLabel, project.contractorName].filter(Boolean).join(' · ') || null,
    status: { canonical: project.status, label: PROJECT_STATUS_LABELS[project.status] ?? project.status },
    lifecycleView: projectLifecycleView(project.status, project.startDate, now),
    nextAction: nextStep ? { label: nextStep, operationId: 'PROJECT_TRACKER_COMMAND', allowed: workActionAllowed(definition, 'PROJECT_TRACKER_COMMAND', role) } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'projects',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: project.id, journeyId: project.guidanceJourneyId }) },
  };
}

/** Tracked projects for the home (FR-WORK-001). Read-only; the same ProjectRecord rows Ask's project answers and the Record list. */
export const readProjectWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const base: Prisma.ProjectRecordWhereInput = { propertyId: context.propertyId };
  const statusFilter: Prisma.ProjectRecordWhereInput = query.status ? { status: query.status as ProjectRecordStatus } : {};
  const inView: Prisma.ProjectRecordWhereInput = { AND: [base, viewWhere(query.view, now), statusFilter] };
  const [projects, total, viewCounts] = await Promise.all([
    prisma.projectRecord.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, name: true, projectType: true, status: true, startDate: true, contractorName: true, guidanceJourneyId: true, renovationCaseId: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.projectRecord.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.projectRecord.count({ where: { AND: [base, viewWhere(view, now)] } })),
  ]);
  // Two batched lookups (never one per row): work items backed by the project itself, and by the guidance journey it was started from.
  const journeyIds = projects.flatMap((project) => project.guidanceJourneyId ? [project.guidanceJourneyId] : []);
  const [byProject, byJourney] = await Promise.all([workItemIdsByExecution('PROJECT', projects.map((project) => project.id)), workItemIdsByExecution('GUIDANCE', journeyIds)]);
  return {
    rows: projects.map((project) => projectRow(project, context.role, now, [...new Set([...(byProject.get(project.id) ?? []), ...(project.guidanceJourneyId ? byJourney.get(project.guidanceJourneyId) ?? [] : [])])])),
    total,
    viewCounts,
  };
};
