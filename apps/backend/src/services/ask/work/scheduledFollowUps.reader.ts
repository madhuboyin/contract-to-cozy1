import type { ClaimStatus, Prisma, SavingsBenefitActionType } from '@prisma/client';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { prisma } from '../../../lib/prisma';
import { compareAskWorkRows, type AskWorkProviderReader, type AskWorkRow } from '../askWork.contract';
import { PROJECT_STATUS_LABELS } from '../handlers/projectTracker.handler';
import { afterBoundaryWhere, truncateTitle, workLaunch } from './askWorkRowSupport';

const CLAIM_PREFIX = 'followUp:claim:';
const PROJECT_PREFIX = 'followUp:project:';
const SAVINGS_PREFIX = 'followUp:savings:';
/** A follow-up is scheduled while its date is ahead; once it passes, the owning claim or project row moves to Needs you in its own provider. */
const OPEN_CLAIM_STATUSES: ClaimStatus[] = ['IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'];

interface ClaimFollowUp { id: string; propertyId: string; title: string; status: ClaimStatus; nextFollowUpAt: Date | null; updatedAt: Date }
interface ProjectFollowUp { id: string; propertyId: string; name: string; status: string; followUpDueAt: Date | null; updatedAt: Date }

export function claimFollowUpRow(claim: ClaimFollowUp): AskWorkRow {
  const sortAt = claim.updatedAt.toISOString();
  return {
    workKey: `${CLAIM_PREFIX}${claim.id}`,
    sourceAliases: [],
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
    sourceAliases: [],
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

const humanize = (value: string) => { const text = value.toLowerCase().replace(/_/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1); };

interface SavingsFollowUp { id: string; propertyId: string; actionType: SavingsBenefitActionType; followUpAt: Date | null; updatedAt: Date }

export function savingsFollowUpRow(action: SavingsFollowUp): AskWorkRow {
  const sortAt = action.updatedAt.toISOString();
  return {
    workKey: `${SAVINGS_PREFIX}${action.id}`,
    sourceAliases: [],
    providerId: 'SCHEDULED_FOLLOW_UPS',
    workType: 'SCHEDULED_FOLLOW_UP',
    propertyId: action.propertyId,
    entity: { type: 'SAVINGS_BENEFIT_ACTION', id: action.id },
    title: `Follow up: savings or benefit (${humanize(action.actionType)})`,
    summary: null,
    status: { canonical: 'SCHEDULED', label: 'Scheduled' },
    lifecycleView: 'SCHEDULED',
    nextAction: null,
    sortAt,
    dueAt: action.followUpAt?.toISOString() ?? null,
    freshness: { version: action.followUpAt?.toISOString() ?? sortAt, asOf: sortAt },
    sourceOwner: 'savings',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'SAVINGS_OPPORTUNITIES', entityType: 'SAVINGS_BENEFIT_ACTION', entityId: action.id, contextVersion: sortAt }) },
  };
}

/**
 * Whether the caller may see savings-benefit follow-ups. This reuses the savings workflow's own gate: a household member who can change
 * records (not a VIEWER), who is the home's primary owner (savings actions are kept for the primary account holder), in an operating mode
 * the savings command's audience policy allows. Anyone else simply has no savings follow-ups here; the claim and project sources are unaffected.
 */
export async function savingsFollowUpsApplicable(context: { userId: string; propertyId: string; role: string; operatingMode?: Parameters<typeof evaluateAskAudienceApplicability>[0]['operatingMode'] }): Promise<boolean> {
  if (context.role === 'VIEWER') return false;
  const policy = getAskAudiencePolicy('SAVINGS_BENEFIT_COMMAND');
  if (policy && context.operatingMode) {
    const decision = evaluateAskAudienceApplicability({ policy, accountRole: 'HOMEOWNER', householdRole: context.role as 'OWNER' | 'CONTRIBUTOR', operatingMode: context.operatingMode, purpose: 'EXECUTION' });
    if (!decision.allowed) return false;
  }
  return Boolean(await prisma.property.findFirst({ where: { id: context.propertyId, homeownerProfile: { userId: context.userId } }, select: { id: true } }));
}

/**
 * Follow-ups with a future date on a claim or a project (FR-WORK-001 scheduled follow-ups), read from each owner's own date field. The row
 * is its own work (`followUp:*`), not a duplicate of its claim or project: it keeps its own due date and identity, and its resume target is the
 * owner, so opening it lands on the claim or project without hiding either row. Savings-benefit follow-ups are read only
 * where `savingsFollowUpsApplicable` allows. Read-only.
 */
export const readScheduledFollowUpWork: AskWorkProviderReader = async (context, query) => {
  if (query.view !== 'SCHEDULED' && !query.entityId && !query.allViews) return { rows: [], total: 0, viewCounts: null };
  const now = new Date();
  const claimInView: Prisma.ClaimWhereInput = { propertyId: context.propertyId, status: { in: OPEN_CLAIM_STATUSES }, nextFollowUpAt: { gt: now }, ...(query.entityId ? { id: query.entityId } : {}), ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}) };
  const projectInView: Prisma.ProjectRecordWhereInput = { propertyId: context.propertyId, status: { notIn: ['CANCELLED'] }, followUpDueAt: { gt: now }, followUpCompletedAt: null, ...(query.entityId ? { id: query.entityId } : {}), ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}) };
  const needle = (query.search ?? '').toLowerCase();
  // A savings action has no title of its own, so text finds it only by the words that name it.
  const savingsNamed = !needle || ['savings', 'benefit', 'follow up', 'follow-up'].some((word) => word.includes(needle) || needle.includes(word));
  const savingsOn = savingsNamed && await savingsFollowUpsApplicable(context);
  const savingsInView: Prisma.SavingsBenefitActionWhereInput = { propertyId: context.propertyId, state: 'STARTED', followUpAt: { gt: now }, ...(query.entityId ? { id: query.entityId } : {}) };
  const [claims, projects, savings, claimTotal, projectTotal, savingsTotal] = await Promise.all([
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
    savingsOn
      ? prisma.savingsBenefitAction.findMany({
        where: afterBoundaryWhere(savingsInView, query.after, SAVINGS_PREFIX),
        select: { id: true, propertyId: true, actionType: true, followUpAt: true, updatedAt: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: query.limit,
      })
      : Promise.resolve([]),
    prisma.claim.count({ where: claimInView }),
    prisma.projectRecord.count({ where: projectInView }),
    savingsOn ? prisma.savingsBenefitAction.count({ where: savingsInView }) : Promise.resolve(0),
  ]);
  const rows = [...claims.map(claimFollowUpRow), ...projects.map(projectFollowUpRow), ...savings.map(savingsFollowUpRow)].sort(compareAskWorkRows).slice(0, query.limit);
  const total = claimTotal + projectTotal + savingsTotal;
  return { rows, total, viewCounts: { SCHEDULED: total } };
};
