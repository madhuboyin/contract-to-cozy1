import { prisma } from '../../../lib/prisma';
import { repairBookingWhere } from '../work/repairs.reader';

/**
 * Sole Homeowner Interface FR-NOTIF-001/002: every homeowner notification maps to the current canonical place it is about, never to the
 * copy it was written with. A rule reads the live record (so a deleted target is reported as deleted) and names the Ask destination; a
 * stored link is a last resort, allowed only as a same-site dashboard path and always marked legacy.
 */
export type AskNotificationDestination =
  | { kind: 'WORK'; workKey: string }
  | { kind: 'SAVED'; artifactKey: string }
  | { kind: 'CONVERSATION'; sessionId: string; executionId: string }
  | { kind: 'QUESTION'; question: string }
  | { kind: 'LEGACY_LINK'; path: string };

export type AskNotificationDestinationKind = AskNotificationDestination['kind'];

export interface NotificationForContinuation {
  id: string;
  userId: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
}

/** FOUND: the target exists now. MISSING: it was removed. NO_TARGET: this notification has nothing to open, with the reason. */
export type ContinuationResolution =
  | { state: 'FOUND'; destination: AskNotificationDestination; propertyId: string | null }
  | { state: 'MISSING'; propertyId: string | null }
  | { state: 'NO_TARGET'; reason: string; propertyId: string | null };

export interface ContinuationRule {
  id: string;
  /** What the destination kind will be (known without reading anything), so a list can show where it leads. */
  kind: AskNotificationDestinationKind | 'NONE';
  match: (notification: NotificationForContinuation) => boolean;
  resolve: (notification: NotificationForContinuation) => Promise<ContinuationResolution>;
}

const meta = (notification: NotificationForContinuation, key: string): string | null => {
  const value = notification.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const entityIs = (notification: NotificationForContinuation, ...types: string[]) => types.includes((notification.entityType ?? '').trim().toUpperCase());
const typeIs = (notification: NotificationForContinuation, pattern: RegExp) => pattern.test(notification.type.toUpperCase());
const question = (text: string, propertyId: string | null): ContinuationResolution => ({ state: 'FOUND', destination: { kind: 'QUESTION', question: text }, propertyId });

/** Only a same-site dashboard path. Anything with a scheme, host, protocol-relative start or path traversal is refused. */
export function safeDashboardPath(value: string | null | undefined): string | null {
  const path = value?.trim() ?? '';
  if (!path.startsWith('/dashboard') || path.startsWith('//') || /[\\\s]|\.\.|:\/\//.test(path)) return null;
  return path;
}

export const ASK_NOTIFICATION_CONTINUATION_RULES: readonly ContinuationRule[] = Object.freeze<ContinuationRule[]>([
  {
    id: 'ask-conversation', kind: 'CONVERSATION',
    match: (n) => Boolean(meta(n, 'askSessionId') && meta(n, 'askExecutionId')) || entityIs(n, 'ASK_EXECUTION'),
    resolve: async (n) => {
      const executionId = meta(n, 'askExecutionId') ?? n.entityId;
      const execution = executionId ? await prisma.askExecution.findFirst({ where: { id: executionId, userId: n.userId }, select: { id: true, sessionId: true, propertyId: true } }) : null;
      return execution ? { state: 'FOUND', destination: { kind: 'CONVERSATION', sessionId: execution.sessionId, executionId: execution.id }, propertyId: execution.propertyId } : { state: 'MISSING', propertyId: meta(n, 'propertyId') };
    },
  },
  {
    id: 'maintenance-task', kind: 'WORK',
    match: (n) => entityIs(n, 'PROPERTY_MAINTENANCE_TASK'),
    resolve: async (n) => {
      const task = n.entityId ? await prisma.propertyMaintenanceTask.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true } }) : null;
      if (!task) return { state: 'MISSING', propertyId: meta(n, 'propertyId') };
      const item = await prisma.operationalWorkExecution.findFirst({ where: { executionType: 'MAINTENANCE_TASK', executionEntityId: task.id, workItem: { propertyId: task.propertyId, state: { not: 'CANDIDATE' }, supersededByWorkItemId: null } }, select: { workItemId: true } });
      return item ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `workItem:${item.workItemId}` }, propertyId: task.propertyId } : question('What is the status of my home maintenance?', task.propertyId);
    },
  },
  {
    id: 'claim', kind: 'WORK',
    match: (n) => entityIs(n, 'CLAIM'),
    resolve: async (n) => {
      const claim = n.entityId ? await prisma.claim.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true } }) : null;
      return claim ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `claim:${claim.id}` }, propertyId: claim.propertyId } : { state: 'MISSING', propertyId: meta(n, 'propertyId') };
    },
  },
  {
    id: 'guidance-journey', kind: 'WORK',
    match: (n) => entityIs(n, 'GUIDANCE_JOURNEY'),
    resolve: async (n) => {
      const journey = n.entityId ? await prisma.guidanceJourney.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true } }) : null;
      return journey ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `journey:${journey.id}` }, propertyId: journey.propertyId } : { state: 'MISSING', propertyId: meta(n, 'propertyId') };
    },
  },
  {
    id: 'incident', kind: 'WORK',
    match: (n) => entityIs(n, 'INCIDENT'),
    resolve: async (n) => {
      const incident = n.entityId ? await prisma.incident.findFirst({ where: { id: n.entityId, isSuppressed: false }, select: { id: true, propertyId: true } }) : null;
      return incident ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `incident:${incident.id}` }, propertyId: incident.propertyId } : { state: 'MISSING', propertyId: meta(n, 'propertyId') };
    },
  },
  {
    id: 'seasonal-checklist', kind: 'SAVED',
    match: (n) => entityIs(n, 'SEASONAL_CHECKLIST'),
    resolve: async (n) => {
      const checklist = n.entityId ? await prisma.seasonalChecklist.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true } }) : null;
      return checklist ? { state: 'FOUND', destination: { kind: 'SAVED', artifactKey: `seasonal:${checklist.id}` }, propertyId: checklist.propertyId } : { state: 'MISSING', propertyId: meta(n, 'propertyId') };
    },
  },
  {
    id: 'capital-timeline', kind: 'SAVED',
    match: (n) => entityIs(n, 'HOME_CAPITAL_TIMELINE'),
    resolve: async (n) => {
      const propertyId = meta(n, 'propertyId');
      const analysis = n.entityId ? await prisma.homeCapitalTimelineAnalysis.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true } }) : null;
      return analysis ? { state: 'FOUND', destination: { kind: 'SAVED', artifactKey: `capital:${analysis.id}` }, propertyId: analysis.propertyId } : question('Review my capital reserve plan.', propertyId);
    },
  },
  {
    id: 'savings-action', kind: 'WORK',
    match: (n) => entityIs(n, 'SAVINGSBENEFITACTION'),
    resolve: async (n) => {
      const action = n.entityId ? await prisma.savingsBenefitAction.findFirst({ where: { id: n.entityId }, select: { id: true, propertyId: true, state: true, followUpAt: true } }) : null;
      if (!action) return { state: 'MISSING', propertyId: meta(n, 'propertyId') };
      return action.state === 'STARTED' && action.followUpAt && action.followUpAt > new Date()
        ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `followUp:savings:${action.id}` }, propertyId: action.propertyId }
        : question('Show me my savings opportunities.', action.propertyId);
    },
  },
  { id: 'savings-match', kind: 'QUESTION', match: (n) => entityIs(n, 'PROPERTYHIDDENASSETMATCH', 'HIDDEN_ASSET_MATCH_OUTCOME', 'HOME_SAVINGS_OPPORTUNITY_OUTCOME') || typeIs(n, /SAVINGS_BENEFIT/), resolve: async (n) => question('Show me my savings opportunities.', meta(n, 'propertyId')) },
  {
    id: 'booking', kind: 'WORK',
    match: (n) => entityIs(n, 'BOOKING'),
    resolve: async (n) => {
      const booking = n.entityId ? await prisma.booking.findFirst({ where: { id: n.entityId, homeownerId: n.userId }, select: { id: true, propertyId: true } }) : null;
      if (!booking) return { state: 'MISSING', propertyId: meta(n, 'propertyId') };
      const repair = await prisma.booking.findFirst({ where: { AND: [repairBookingWhere(n.userId, booking.propertyId), { id: booking.id }] }, select: { id: true } });
      return repair
        ? { state: 'FOUND', destination: { kind: 'WORK', workKey: `repair:${booking.id}` }, propertyId: booking.propertyId }
        : { state: 'NO_TARGET', reason: 'This service booking is not a repair, and Ask cannot manage bookings yet.', propertyId: booking.propertyId };
    },
  },
  {
    id: 'renovation-requirement', kind: 'WORK',
    match: (n) => entityIs(n, 'RENOVATIONREQUIREMENT'),
    resolve: async (n) => {
      const requirement = n.entityId ? await prisma.renovationRequirement.findFirst({ where: { id: n.entityId }, select: { propertyId: true, renovationCase: { select: { id: true, executionProject: { select: { id: true } } } } } }) : null;
      if (!requirement) return { state: 'MISSING', propertyId: meta(n, 'propertyId') };
      const project = requirement.renovationCase.executionProject;
      return { state: 'FOUND', destination: { kind: 'WORK', workKey: project ? `project:${project.id}` : `renovation:${requirement.renovationCase.id}` }, propertyId: requirement.propertyId };
    },
  },
  { id: 'home-action', kind: 'QUESTION', match: (n) => entityIs(n, 'HOME_ACTION') || typeIs(n, /^HOME_ACTION/), resolve: async (n) => question('Show me what needs attention.', meta(n, 'propertyId')) },
  { id: 'reserve-fund', kind: 'QUESTION', match: (n) => entityIs(n, 'HOMERESERVEFUND') || typeIs(n, /RESERVE_FUND/), resolve: async (n) => question('Review my capital reserve plan.', meta(n, 'propertyId')) },
  { id: 'warranty', kind: 'QUESTION', match: (n) => entityIs(n, 'NEW_HOME_WARRANTY_RIGHT', 'WARRANTY') || typeIs(n, /WARRANTY/), resolve: async (n) => question('Show me my warranties.', meta(n, 'propertyId')) },
  { id: 'coverage', kind: 'QUESTION', match: (n) => entityIs(n, 'INSURANCE_POLICY', 'INSURANCE_POLICY_TERM') || typeIs(n, /COVERAGE|INSURANCE/), resolve: async (n) => question('Review my coverage.', meta(n, 'propertyId')) },
  { id: 'home-briefing', kind: 'QUESTION', match: (n) => entityIs(n, 'HOMEBRIEFINGDELIVERY') || typeIs(n, /HOME_BRIEFING/), resolve: async (n) => question('Show my home briefing.', meta(n, 'propertyId')) },
  { id: 'recall', kind: 'QUESTION', match: (n) => typeIs(n, /RECALL/) || entityIs(n, 'RECALL_MATCH'), resolve: async (n) => question('Show me recalls that affect my home.', meta(n, 'propertyId')) },
  { id: 'permit-milestone', kind: 'QUESTION', match: (n) => entityIs(n, 'PERMITINSPECTIONMILESTONE'), resolve: async (n) => question('What is the status of my permits?', meta(n, 'propertyId')) },
  { id: 'home-habit', kind: 'QUESTION', match: (n) => typeIs(n, /HOME_HABIT/), resolve: async (n) => question('Show me my home habits.', meta(n, 'propertyId')) },
  { id: 'refinance', kind: 'QUESTION', match: (n) => typeIs(n, /REFINANCE|MORTGAGE_RATE/), resolve: async (n) => question('Should I refinance my mortgage?', meta(n, 'propertyId')) },
  { id: 'account', kind: 'LEGACY_LINK', match: (n) => typeIs(n, /EMAIL_VERIFICATION|PASSWORD_RESET|^ACCOUNT|SECURITY/), resolve: async () => ({ state: 'FOUND', destination: { kind: 'LEGACY_LINK', path: '/dashboard/profile' }, propertyId: null }) },
  {
    id: 'provider-only', kind: 'NONE',
    match: (n) => typeIs(n, /^PROVIDER_CREDENTIAL/),
    resolve: async () => ({ state: 'NO_TARGET', reason: 'This notification is for a provider account, not a homeowner.', propertyId: null }),
  },
  {
    // Last resort: a same-site dashboard path the producer stored. Marked legacy so the page says it is not an Ask destination.
    id: 'stored-dashboard-link', kind: 'LEGACY_LINK',
    match: (n) => safeDashboardPath(n.actionUrl) !== null,
    resolve: async (n) => ({ state: 'FOUND', destination: { kind: 'LEGACY_LINK', path: safeDashboardPath(n.actionUrl) as string }, propertyId: meta(n, 'propertyId') }),
  },
]);

const NO_DESTINATION: ContinuationRule = {
  id: 'no-destination', kind: 'NONE', match: () => true,
  resolve: async (n) => ({ state: 'NO_TARGET', reason: 'This notification has nothing to open.', propertyId: meta(n, 'propertyId') }),
};

export function continuationRuleFor(notification: NotificationForContinuation, rules: readonly ContinuationRule[] = ASK_NOTIFICATION_CONTINUATION_RULES): ContinuationRule {
  return rules.find((rule) => rule.match(notification)) ?? NO_DESTINATION;
}

/** Notification types the producers write today. A new producer must be added here (a test scans the source), so none ships without a continuation. */
export const ASK_NOTIFICATION_KNOWN_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ASK_CAPTURE_CANDIDATE_READY: 'ask-conversation',
  EMAIL_VERIFICATION_REQUIRED: 'account',
  PASSWORD_RESET_REQUESTED: 'account',
  BOOKING_CREATED: 'stored-dashboard-link',
  BOOKING_CANCELLED: 'booking',
  HOME_HABIT_GENERATED: 'home-habit',
  HOME_ACTION_PROACTIVE: 'home-action',
  HOME_BRIEFING_DELIVERED: 'home-briefing',
  CAPITAL_TIMELINE_ALERT: 'capital-timeline',
  NEIGHBORHOOD_CHANGE_DETECTED: 'no-destination',
  NEW_HOME_WARRANTY_DEADLINE: 'warranty',
  MAINTENANCE_REMINDER: 'permit-milestone',
  PROVIDER_CREDENTIAL_SUBMITTED: 'provider-only',
  RENOVATION_PERMIT_REQUIREMENT_DUE: 'renovation-requirement',
  RESERVE_FUND_BALANCE_REMINDER: 'reserve-fund',
  RESERVE_FUND_RECONCILIATION_SUGGESTION: 'reserve-fund',
  SAVINGS_BENEFIT_DEADLINE_REMINDER: 'savings-match',
  SAVINGS_BENEFIT_ACTION_FOLLOW_UP: 'savings-action',
  SEASONAL_CHECKLIST_READY: 'seasonal-checklist',
  CLAIM_SUBMITTED: 'claim',
  CLAIM_CLOSED: 'claim',
  FOLLOW_UP_DUE: 'claim',
  GUIDANCE_STEP_REOPENED: 'guidance-journey',
});

export function validateAskNotificationContinuationRegistry(rules: readonly ContinuationRule[] = ASK_NOTIFICATION_CONTINUATION_RULES): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) issues.push(`Duplicate notification continuation rule: ${rule.id}`);
    ids.add(rule.id);
  }
  for (const [type, ruleId] of Object.entries(ASK_NOTIFICATION_KNOWN_TYPES)) {
    if (ruleId !== 'no-destination' && !ids.has(ruleId)) issues.push(`${type} names an unknown continuation rule ${ruleId}`);
  }
  return issues;
}
