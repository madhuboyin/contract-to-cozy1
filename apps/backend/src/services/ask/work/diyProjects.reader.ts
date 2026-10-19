import type { DiyProjectStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, ASK_WORK_PROVIDER_REGISTRY, workActionAllowed, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { afterBoundaryWhere, countViews, truncateTitle, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'diyProject:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

const LABELS: Record<DiyProjectStatus, string> = { PLANNING: 'Planning', IN_PROGRESS: 'In progress', COMPLETED: 'Complete', ABANDONED: 'Set aside', HIRED_OUT: 'Hired out' };

/** A planned project waits on the homeowner to start it; one under way is active; done is completed; set aside or hired out is archived. */
export function diyLifecycleView(status: DiyProjectStatus): AskWorkLifecycleView {
  switch (status) {
    case 'PLANNING': return 'NEEDS_YOU';
    case 'IN_PROGRESS': return 'ACTIVE';
    case 'COMPLETED': return 'COMPLETED';
    default: return 'ARCHIVED';
  }
}

const STATUSES_BY_VIEW: Partial<Record<AskWorkLifecycleView, DiyProjectStatus[]>> = {
  NEEDS_YOU: ['PLANNING'], ACTIVE: ['IN_PROGRESS'], COMPLETED: ['COMPLETED'], ARCHIVED: ['ABANDONED', 'HIRED_OUT'],
};
function viewWhere(view: AskWorkLifecycleView): Prisma.DiyProjectWhereInput {
  const statuses = STATUSES_BY_VIEW[view];
  return statuses ? { status: { in: statuses } } : { id: { in: [] } };
}

interface DiyRecord {
  id: string;
  propertyId: string;
  title: string;
  status: DiyProjectStatus;
  updatedAt: Date;
  steps: Array<{ isOptional: boolean; status: string }>;
}

export function diyProjectRow(project: DiyRecord, role: Parameters<typeof workActionAllowed>[2]): AskWorkRow {
  const sortAt = project.updatedAt.toISOString();
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'DIY_PROJECTS')!;
  const required = project.steps.filter((step) => !step.isOptional);
  const done = required.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length;
  return {
    workKey: `${KEY_PREFIX}${project.id}`,
    sourceAliases: [],
    providerId: 'DIY_PROJECTS',
    workType: 'DIY_PROJECT',
    propertyId: project.propertyId,
    entity: { type: 'DIY_PROJECT', id: project.id },
    title: truncateTitle(project.title) || 'DIY project',
    summary: required.length ? `${done} of ${required.length} steps done` : null,
    status: { canonical: project.status, label: LABELS[project.status] },
    lifecycleView: diyLifecycleView(project.status),
    nextAction: project.status === 'PLANNING' ? { label: 'Start the first step', operationId: 'DIY_STEP_UPDATE', allowed: workActionAllowed(definition, 'DIY_STEP_UPDATE', role) }
      : project.status === 'IN_PROGRESS' ? { label: done === required.length && required.length > 0 ? 'Finish this project' : 'Continue with the next step', operationId: done === required.length && required.length > 0 ? 'DIY_PROJECT_COMPLETE' : 'DIY_STEP_UPDATE', allowed: workActionAllowed(definition, done === required.length && required.length > 0 ? 'DIY_PROJECT_COMPLETE' : 'DIY_STEP_UPDATE', role) } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'diy',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: project.id, contextVersion: sortAt }) },
  };
}

/** DIY guides for the home (FR-WORK-001): the same property-scoped projects Ask's DIY list reads, with step progress from one joined read. */
export const readDiyProjectWork: AskWorkProviderReader = async (context, query) => {
  const base: Prisma.DiyProjectWhereInput = { propertyId: context.propertyId };
  const statusFilter: Prisma.DiyProjectWhereInput = query.status ? { status: query.status as DiyProjectStatus } : {};
  const inView: Prisma.DiyProjectWhereInput = { AND: [base, viewWhere(query.view), statusFilter] };
  const [projects, total, viewCounts] = await Promise.all([
    prisma.diyProject.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, title: true, status: true, updatedAt: true, steps: { select: { isOptional: true, status: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.diyProject.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.diyProject.count({ where: { AND: [base, viewWhere(view)] } })),
  ]);
  return { rows: projects.map((project) => diyProjectRow(project, context.role)), total, viewCounts };
};
