import type { ClaimStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { compareAskWorkRows, type AskWorkProviderReader, type AskWorkRow } from '../askWork.contract';
import { PROJECT_STATUS_LABELS } from '../handlers/projectTracker.handler';
import { afterBoundaryWhere, truncateTitle, workLaunch } from './askWorkRowSupport';

const CLAIM_PREFIX = 'followUp:claim:';
const PROJECT_PREFIX = 'followUp:project:';
/** A follow-up is scheduled while its date is ahead; once it passes, the owning claim or project row moves to Needs you in its own provider. */
const OPEN_CLAIM_STATUSES: ClaimStatus[] = ['IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'];

interface ClaimFollowUp { id: string; propertyId: string; title: string; status: ClaimStatus; nextFollowUpAt: Date | null; updatedAt: Date }
interface ProjectFollowUp { id: string; propertyId: string; name: string; status: string; followUpDueAt: Date | null; updatedAt: Date }

export function claimFollowUpRow(claim: ClaimFollowUp): AskWorkRow {
  const sortAt = claim.updatedAt.toISOString();
  return {
    workKey: `${CLAIM_PREFIX}${claim.id}`,
    sourceAliases: [`claim:${claim.id}`],
    providerId: 'SCHEDULED_FOLLOW_UPS',
    workType: 'SCHEDULED_FOLLOW_UP',
    propertyId: claim.propertyId,
    entity: { type: 'CLAIM', id: claim.id },
    title: `Follow up: ${truncateTitle(claim.title) || 'claim'}`,
    summary: null,
    status: { canonical: 'SCHEDULED', label: 'Scheduled' },
    lifecycleView: 'SCHEDULED',
    nextAction: null,
    sortAt,
    dueAt: claim.nextFollowUpAt?.toISOString() ?? null,
    freshness: { version: claim.nextFollowUpAt?.toISOString() ?? sortAt, asOf: sortAt },
    sourceOwner: 'incidents-claims',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'CLAIM_CHECKLIST_VIEW', entityType: 'CLAIM', entityId: claim.id, contextVersion: sortAt }) },
  };
}

export function projectFollowUpRow(project: ProjectFollowUp): AskWorkRow {
  const sortAt = project.updatedAt.toISOString();
  return {
    workKey: `${PROJECT_PREFIX}${project.id}`,
    sourceAliases: [`project:${project.id}`],
    providerId: 'SCHEDULED_FOLLOW_UPS',
    workType: 'SCHEDULED_FOLLOW_UP',
    propertyId: project.propertyId,
    entity: { type: 'PROJECT_RECORD', id: project.id },
    title: `Follow up: ${truncateTitle(project.name) || 'project'}`,
    summary: PROJECT_STATUS_LABELS[project.status] ?? null,
    status: { canonical: 'SCHEDULED', label: 'Scheduled' },
    lifecycleView: 'SCHEDULED',
    nextAction: null,
    sortAt,
    dueAt: project.followUpDueAt?.toISOString() ?? null,
    freshness: { version: project.followUpDueAt?.toISOString() ?? sortAt, asOf: sortAt },
    sourceOwner: 'projects',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: project.id }) },
  };
}

/**
 * Follow-ups with a future date on a claim or a project (FR-WORK-001 scheduled follow-ups), read from each owner's own date field. The row
 * keeps the owner's key as an alias, so the claim or project itself remains the work to open. Savings-benefit follow-ups are not read
 * here: they need their own applicability gate. Read-only.
 */
export const readScheduledFollowUpWork: AskWorkProviderReader = async (context, query) => {
  if (query.view !== 'SCHEDULED') return { rows: [], total: 0, viewCounts: null };
  const now = new Date();
  const claimInView: Prisma.ClaimWhereInput = { propertyId: context.propertyId, status: { in: OPEN_CLAIM_STATUSES }, nextFollowUpAt: { gt: now } };
  const projectInView: Prisma.ProjectRecordWhereInput = { propertyId: context.propertyId, status: { notIn: ['CANCELLED'] }, followUpDueAt: { gt: now }, followUpCompletedAt: null };
  const [claims, projects, claimTotal, projectTotal] = await Promise.all([
    prisma.claim.findMany({
      where: afterBoundaryWhere(claimInView, query.after, CLAIM_PREFIX),
      select: { id: true, propertyId: true, title: true, status: true, nextFollowUpAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.projectRecord.findMany({
      where: afterBoundaryWhere(projectInView, query.after, PROJECT_PREFIX),
      select: { id: true, propertyId: true, name: true, status: true, followUpDueAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.claim.count({ where: claimInView }),
    prisma.projectRecord.count({ where: projectInView }),
  ]);
  const rows = [...claims.map(claimFollowUpRow), ...projects.map(projectFollowUpRow)].sort(compareAskWorkRows).slice(0, query.limit);
  const total = claimTotal + projectTotal;
  return { rows, total, viewCounts: { SCHEDULED: total } };
};
