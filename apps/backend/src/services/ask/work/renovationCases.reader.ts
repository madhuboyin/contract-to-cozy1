import type { Prisma, RenovationCaseLifecycle } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, ASK_WORK_PROVIDER_REGISTRY, workActionAllowed, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { RENOVATION_CASE_TYPE_LABELS } from '../support/renovationCaseStart';
import { afterBoundaryWhere, countViews, truncateTitle, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'renovation:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'COMPLETED', 'ARCHIVED'];

const NEEDS_YOU: RenovationCaseLifecycle[] = ['READY_TO_START', 'COMPLETED_WITH_OPEN_ITEMS'];
const WAITING: RenovationCaseLifecycle[] = ['APPROVALS_IN_PROGRESS', 'ON_HOLD'];
const ACTIVE: RenovationCaseLifecycle[] = ['IDEA', 'FEASIBILITY', 'SCOPE_DEFINITION', 'REQUIREMENTS_RESEARCH', 'PREPARING_TO_START', 'IN_EXECUTION', 'INSPECTION_AND_CLOSEOUT'];
const ARCHIVED_LIFECYCLES: RenovationCaseLifecycle[] = ['CANCELLED', 'HISTORICAL_RESEARCH'];

const LABELS: Record<RenovationCaseLifecycle, string> = {
  IDEA: 'An idea', FEASIBILITY: 'Checking feasibility', SCOPE_DEFINITION: 'Defining the scope', REQUIREMENTS_RESEARCH: 'Researching requirements',
  APPROVALS_IN_PROGRESS: 'Waiting on approvals', PREPARING_TO_START: 'Preparing to start', READY_TO_START: 'Ready to start', IN_EXECUTION: 'Under way',
  INSPECTION_AND_CLOSEOUT: 'Inspection and closeout', VERIFIED_COMPLETE: 'Complete', ON_HOLD: 'On hold', CANCELLED: 'Cancelled',
  COMPLETED_WITH_OPEN_ITEMS: 'Complete, with open items', HISTORICAL_RESEARCH: 'Historical research',
};
const NEXT_STEP: Partial<Record<RenovationCaseLifecycle, string>> = {
  READY_TO_START: 'Start this renovation', COMPLETED_WITH_OPEN_ITEMS: 'Close the open items', IDEA: 'Define what you want', FEASIBILITY: 'Review feasibility',
  SCOPE_DEFINITION: 'Define the scope', REQUIREMENTS_RESEARCH: 'Review the requirements', PREPARING_TO_START: 'Finish getting ready', IN_EXECUTION: 'Check on progress',
  INSPECTION_AND_CLOSEOUT: 'Finish inspection and closeout', APPROVALS_IN_PROGRESS: 'Check on approvals', ON_HOLD: 'Decide when to resume',
};

/** A case the homeowner archived, cancelled, or kept only as research is archived; otherwise its lifecycle decides. */
export function renovationLifecycleView(lifecycle: RenovationCaseLifecycle, archivedAt: Date | null): AskWorkLifecycleView {
  if (archivedAt || ARCHIVED_LIFECYCLES.includes(lifecycle)) return 'ARCHIVED';
  if (lifecycle === 'VERIFIED_COMPLETE') return 'COMPLETED';
  if (NEEDS_YOU.includes(lifecycle)) return 'NEEDS_YOU';
  if (WAITING.includes(lifecycle)) return 'WAITING';
  return 'ACTIVE';
}

function viewWhere(view: AskWorkLifecycleView): Prisma.RenovationCaseWhereInput {
  const live: Prisma.RenovationCaseWhereInput = { archivedAt: null };
  switch (view) {
    case 'NEEDS_YOU': return { ...live, lifecycle: { in: NEEDS_YOU } };
    case 'ACTIVE': return { ...live, lifecycle: { in: ACTIVE } };
    case 'WAITING': return { ...live, lifecycle: { in: WAITING } };
    case 'COMPLETED': return { ...live, lifecycle: 'VERIFIED_COMPLETE' };
    case 'ARCHIVED': return { OR: [{ archivedAt: { not: null } }, { lifecycle: { in: ARCHIVED_LIFECYCLES } }] };
    default: return { id: { in: [] } };
  }
}

interface RenovationRecord {
  id: string;
  propertyId: string;
  name: string;
  caseType: string;
  lifecycle: RenovationCaseLifecycle;
  archivedAt: Date | null;
  updatedAt: Date;
}

export function renovationCaseRow(record: RenovationRecord, role: Parameters<typeof workActionAllowed>[2]): AskWorkRow {
  const sortAt = record.updatedAt.toISOString();
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'RENOVATION_CASES')!;
  const next = NEXT_STEP[record.lifecycle];
  return {
    workKey: `${KEY_PREFIX}${record.id}`,
    sourceAliases: [],
    providerId: 'RENOVATION_CASES',
    workType: 'RENOVATION_CASE',
    propertyId: record.propertyId,
    entity: { type: 'RENOVATION_CASE', id: record.id },
    title: truncateTitle(record.name) || 'Renovation',
    summary: RENOVATION_CASE_TYPE_LABELS[record.caseType] ?? null,
    status: { canonical: record.lifecycle, label: LABELS[record.lifecycle] },
    lifecycleView: renovationLifecycleView(record.lifecycle, record.archivedAt),
    nextAction: next && !record.archivedAt ? { label: next, operationId: 'RENOVATION_READINESS_COMMAND', allowed: workActionAllowed(definition, 'RENOVATION_READINESS_COMMAND', role) } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'renovation',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'RENOVATION_CASE', entityId: record.id }) },
  };
}

/**
 * Renovation cases for the home (FR-WORK-001). A case that has been handed off to an execution project is that project's work: the
 * project row carries a `renovation:` alias and this reader leaves the case out, so a page boundary never splits the pair.
 */
export const readRenovationCaseWork: AskWorkProviderReader = async (context, query) => {
  const base: Prisma.RenovationCaseWhereInput = { propertyId: context.propertyId, executionProject: { is: null } };
  const statusFilter: Prisma.RenovationCaseWhereInput = query.status ? { lifecycle: query.status as RenovationCaseLifecycle } : {};
  const searchTerm = query.search;
  const inView: Prisma.RenovationCaseWhereInput = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, query.allViews ? {} : viewWhere(query.view), statusFilter, ...(searchTerm ? [{ OR: ((s: string) => [{ name: { contains: s, mode: 'insensitive' } }, { objective: { contains: s, mode: 'insensitive' } }])(searchTerm) as never }] : [])] };
  const [cases, total, viewCounts] = await Promise.all([
    prisma.renovationCase.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, name: true, caseType: true, lifecycle: true, archivedAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.renovationCase.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.renovationCase.count({ where: { AND: [base, viewWhere(view)] } })),
  ]);
  return { rows: cases.map((record) => renovationCaseRow(record, context.role)), total, viewCounts };
};
