import type { ClaimStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, ASK_WORK_PROVIDER_REGISTRY, workActionAllowed, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { afterBoundaryWhere, countViews, truncateTitle, workItemIdsByExecution, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'claim:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'COMPLETED'];

const LABELS: Record<ClaimStatus, string> = { DRAFT: 'Draft', IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', APPROVED: 'Approved', DENIED: 'Denied', CLOSED: 'Closed' };
const NEXT_STEP: Partial<Record<ClaimStatus, string>> = {
  DRAFT: 'Finish and submit this claim', IN_PROGRESS: 'Keep gathering what the claim needs', SUBMITTED: 'Wait for the provider to respond', UNDER_REVIEW: 'Wait for the review',
  APPROVED: 'Record the settlement and close', DENIED: 'Decide whether to appeal or close',
};

/**
 * A draft, an approved or a denied claim needs the homeowner, and so does any open claim whose follow-up date has passed. A claim being
 * assembled is active; one with the provider (submitted or under review) is waiting; a closed claim is completed. Claims have no archive.
 */
export function claimLifecycleView(status: ClaimStatus, nextFollowUpAt: Date | null, now: Date): AskWorkLifecycleView {
  if (status === 'CLOSED') return 'COMPLETED';
  if (status === 'DRAFT' || status === 'APPROVED' || status === 'DENIED') return 'NEEDS_YOU';
  if (nextFollowUpAt && nextFollowUpAt <= now) return 'NEEDS_YOU';
  return status === 'IN_PROGRESS' ? 'ACTIVE' : 'WAITING';
}

function viewWhere(view: AskWorkLifecycleView, now: Date): Prisma.ClaimWhereInput {
  const overdue: Prisma.ClaimWhereInput = { nextFollowUpAt: { lte: now } };
  const notOverdue: Prisma.ClaimWhereInput = { OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { gt: now } }] };
  switch (view) {
    case 'NEEDS_YOU': return { OR: [{ status: { in: ['DRAFT', 'APPROVED', 'DENIED'] } }, { status: { in: ['IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'] }, ...overdue }] };
    case 'ACTIVE': return { status: 'IN_PROGRESS', ...notOverdue };
    case 'WAITING': return { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, ...notOverdue };
    case 'COMPLETED': return { status: 'CLOSED' };
    default: return { id: { in: [] } };
  }
}

interface ClaimRecord {
  id: string;
  propertyId: string;
  title: string;
  status: ClaimStatus;
  providerName: string | null;
  nextFollowUpAt: Date | null;
  updatedAt: Date;
}

export function claimRow(claim: ClaimRecord, role: Parameters<typeof workActionAllowed>[2], now: Date, workItemIds: readonly string[] = []): AskWorkRow {
  const sortAt = claim.updatedAt.toISOString();
  const definition = ASK_WORK_PROVIDER_REGISTRY.find((entry) => entry.id === 'CLAIMS')!;
  const next = NEXT_STEP[claim.status];
  const overdue = claim.status !== 'CLOSED' && claim.nextFollowUpAt !== null && claim.nextFollowUpAt <= now;
  return {
    workKey: `${KEY_PREFIX}${claim.id}`,
    sourceAliases: workItemIds.map((id) => `workItem:${id}`),
    providerId: 'CLAIMS',
    workType: 'CLAIM',
    propertyId: claim.propertyId,
    entity: { type: 'CLAIM', id: claim.id },
    title: truncateTitle(claim.title) || 'Claim',
    summary: claim.providerName,
    status: { canonical: claim.status, label: LABELS[claim.status] },
    lifecycleView: claimLifecycleView(claim.status, claim.nextFollowUpAt, now),
    nextAction: overdue ? { label: 'Follow up on this claim', operationId: 'CLAIM_ACTIVITY_COMMAND', allowed: workActionAllowed(definition, 'CLAIM_ACTIVITY_COMMAND', role) }
      : next ? { label: next, operationId: next.startsWith('Wait') ? null : 'CLAIM_TRANSITION', allowed: next.startsWith('Wait') ? true : workActionAllowed(definition, 'CLAIM_TRANSITION', role) } : null,
    sortAt,
    freshness: { version: sortAt, asOf: sortAt },
    sourceOwner: 'incidents-claims',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'CLAIM_CHECKLIST_VIEW', entityType: 'CLAIM', entityId: claim.id, contextVersion: sortAt }) },
  };
}

/** Claims for the home (FR-WORK-001): a new canonical read-only paged reader, because claims had none in the service layer. */
export const readClaimWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const base: Prisma.ClaimWhereInput = { propertyId: context.propertyId };
  const statusFilter: Prisma.ClaimWhereInput = query.status ? { status: query.status as ClaimStatus } : {};
  const inView: Prisma.ClaimWhereInput = { AND: [base, viewWhere(query.view, now), statusFilter] };
  const [claims, total, viewCounts] = await Promise.all([
    prisma.claim.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, title: true, status: true, providerName: true, nextFollowUpAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.claim.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.claim.count({ where: { AND: [base, viewWhere(view, now)] } })),
  ]);
  const workItems = await workItemIdsByExecution('CLAIM', claims.map((claim) => claim.id));
  return { rows: claims.map((claim) => claimRow(claim, context.role, now, workItems.get(claim.id) ?? [])), total, viewCounts };
};
