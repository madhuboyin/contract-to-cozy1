import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId } from './askOperationRegistry';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { NotificationService } from '../notification.service';
import type { NotificationCategory, NotificationUrgency } from '../../productFramework/notificationPolicy.contract';

// Ask Cozy Stage 3, Phase 5 (implementation plan §11; FRD §29). Widened
// from the original 2-member union (REFINANCE_ANALYSIS/MAINTENANCE_STATUS)
// to the full AskOperationId per this phase's own explicit requirement --
// a proactive continuation is not structurally limited to those two
// producers (Home Event Radar's own continuation targets a different
// operation, §31/Phase 7's query-envelope capability).
export type AskNotificationContinuationInput = {
  userId: string;
  propertyId: string;
  triggerKey: string;
  operationId: AskOperationId;
  question: string;
  reasonCode: string;
  title: string;
  body: string;
  tone: 'DEFAULT' | 'CAUTION' | 'POSITIVE' | 'CRITICAL';
  // Which background producer created this turn -- surfaced on the
  // PROACTIVE_INSIGHT block (FRD §28) so the frontend can render "Cozy
  // noticed via X" distinctly per producer, e.g. 'REFINANCE_RATE_MONITOR',
  // 'MAINTENANCE_DEADLINE_MONITOR', 'HOME_EVENT_RADAR'.
  triggerSource: string;
  details: Array<{ label: string; value: string }>;
  domainAction: { id: string; label: string; href: string };
  parameters: Record<string, unknown>;
  suggestions: string[];
};

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export async function createAskNotificationContinuation(input: AskNotificationContinuationInput): Promise<{
  executionId: string;
  sessionId: string;
  actionUrl: string;
}> {
  const controls = readAskOperationalControls();
  if (!controls.askProactiveContinuationEnabled) {
    throw new Error('Ask proactive continuation is disabled (ASK_PROACTIVE_CONTINUATION_ENABLED / kill switch).');
  }

  const access = await resolvePropertyAccess(input.userId, input.propertyId);
  if (!access) throw new Error('Property access is unavailable for this Ask notification continuation.');

  const expiresAt = new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000);
  const definition = getAskOperationDefinition(input.operationId);
  const identity = `${input.userId}:${input.propertyId}:${input.triggerKey}`;
  const sessionId = stableId('ask-notification-session', identity);
  const clientRequestId = stableId('ask-notification-execution', identity);
  const domainAction = { ...input.domainAction, style: 'SECONDARY' as const };
  const blocks: AskPresentationBlock[] = [
    // Ask Cozy Stage 3, Phase 5 (implementation plan §11; FRD §28): PROACTIVE_INSIGHT
    // replaces the plain SUMMARY block every proactive turn used to open
    // with, so a Cozy-initiated turn is structurally distinguishable, not
    // just conventionally recognizable by reasonCode.
    {
      type: 'PROACTIVE_INSIGHT',
      id: 'monitor-trigger-summary',
      title: input.title,
      body: input.body,
      tone: input.tone,
      triggerSource: input.triggerSource,
      actions: [domainAction],
    },
    {
      type: 'WORKFLOW_PROGRESS',
      id: 'monitor-trigger-details',
      title: 'What changed and what to do next',
      status: 'PENDING',
      description: 'This result was created from a governed monitor signal. Review the recorded details before taking action.',
      details: input.details,
      actions: [domainAction],
    },
  ];

  const execution = await prisma.$transaction(async (tx) => {
    await tx.askSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userId: input.userId, propertyId: input.propertyId, title: input.title.slice(0, 120), expiresAt },
      update: { lastActiveAt: new Date(), expiresAt },
    });
    // A true atomic upsert, not findUnique-then-create: two callers racing
    // on the same trigger (e.g. concurrent monitor-evaluation runs hitting
    // the same clientRequestId) previously both read "no existing row" and
    // then both attempted create(), so the loser hit the unique-constraint
    // violation as an unhandled error inside this transaction. Both
    // callers already catch and fall back to the plain domain URL on any
    // failure here, so no notification was actually lost -- but the
    // Ask-continuation link was, for no real reason, since "ensure exactly
    // one execution exists for this trigger" is precisely what upsert
    // already guarantees atomically at the database level.
    const created = await tx.askExecution.upsert({
      where: { userId_clientRequestId: { userId: input.userId, clientRequestId } },
      create: {
        sessionId,
        userId: input.userId,
        propertyId: input.propertyId,
        clientRequestId,
        message: input.question,
        launchContextJson: {
          surface: 'MONITOR_NOTIFICATION',
          entityType: 'MONITOR_SIGNAL',
          actionId: input.triggerKey,
          returnTo: input.domainAction.href,
        } as Prisma.InputJsonValue,
        operationId: definition.operationId,
        operationVersion: definition.version,
        intentFamily: definition.family,
        intentConfidence: 1,
        status: 'ANSWERED',
        reasonCode: input.reasonCode,
        parametersJson: input.parameters as Prisma.InputJsonValue,
        resultJson: {
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks,
          captureRequests: [],
          confirmation: null,
          clarification: null,
          suggestions: input.suggestions.slice(0, 5),
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
        expiresAt,
      },
      // Idempotent replay of an already-created continuation for this
      // exact trigger: leave the existing durable execution untouched.
      update: {},
    });
    // Best-effort audit trail; a duplicate event under the same rare race
    // this upsert now tolerates is harmless (append-only, informational),
    // unlike the crash the previous find-then-create pattern risked.
    await tx.askExecutionEvent.create({
      data: {
        executionId: created.id,
        eventType: 'MONITOR_NOTIFICATION_CREATED',
        metadataJson: { triggerKey: input.triggerKey, operationId: input.operationId } as Prisma.InputJsonValue,
      },
    });
    return created;
  });

  const actionUrl = `/dashboard/ask?propertyId=${encodeURIComponent(input.propertyId)}&sessionId=${encodeURIComponent(sessionId)}&executionId=${encodeURIComponent(execution.id)}&from=notification`;
  return { executionId: execution.id, sessionId, actionUrl };
}

// Ask Cozy Stage 3, Phase 5 (implementation plan §11; FRD §29's own
// requirement for "a new, small wrapper eliminating the confirmed
// copy-pasted duplication between the two existing callers"). Verified
// against source before building: `refinanceRateMonitor.service.ts` and
// `maintenanceReminder.service.ts` both independently repeat the exact same
// shape -- try/catch `createAskNotificationContinuation`, then
// `NotificationService.create` with `actionUrl: continuation?.actionUrl ??
// domainActionUrl` and `metadata: {..., askExecutionId, askSessionId,
// domainActionUrl}`. This wrapper is that shape, once.
//
// `deduplicationKey` is REQUIRED here, not optional the way
// `NotificationService.create`'s own field is -- a real gap found while
// consolidating: `maintenanceReminder.service.ts`'s existing caller never
// passed one at all, so `NotificationService.create` fell through to a
// plain `create()` (verified: `notification.service.ts`'s own
// `input.deduplicationKey ? upsert(...) : create(...)` branch) -- meaning
// every reminder-job run could create a brand-new Notification row for the
// same still-overdue task, with no dedup whatsoever. Requiring it here
// closes that gap as a side effect of migrating onto this wrapper, for
// every producer from now on.
//
// Dismissal / already-resolved (FRD §29's own explicitly flagged [OPEN]
// item -- "Stage 3's implementation plan should scope this as its own small
// vertical slice within Phase 5, reusing whatever dismissal/preference
// mechanism NotificationService already has"): `Notification` has no
// dedicated `dismissedAt` -- its actual existing mechanism is
// `isRead`/`readAt`. Scoped narrowly here: if a notification already exists
// under this exact `deduplicationKey` and the homeowner has already read it,
// this is a repeat evaluation of a condition already surfaced and seen --
// skip creating a duplicate/refreshed Ask continuation and return the
// existing notification untouched, rather than silently re-surfacing
// something already acknowledged. "Repeat reminders" and "user preferences"
// (the other two concepts FRD §29 bundled into this same open item) are
// NOT attempted here -- left explicit, tracked follow-up, not silently
// dropped.
export interface NotifyWithAskContinuationInput {
  userId: string;
  propertyId: string;
  triggerKey: string;
  operationId: AskOperationId;
  question: string;
  reasonCode: string;
  title: string;
  body: string;
  tone: 'DEFAULT' | 'CAUTION' | 'POSITIVE' | 'CRITICAL';
  triggerSource: string;
  details: Array<{ label: string; value: string }>;
  domainAction: { id: string; label: string; href: string };
  parameters: Record<string, unknown>;
  suggestions: string[];
  deduplicationKey: string;
  notificationType: string;
  notificationMessage: string;
  entityType?: string;
  entityId?: string;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  transportEnabled?: boolean;
  metadata?: Record<string, unknown>;
}

export async function notifyWithAskContinuation(input: NotifyWithAskContinuationInput) {
  const alreadySurfaced = await prisma.notification.findUnique({
    where: { deduplicationKey: input.deduplicationKey },
    select: { id: true, isRead: true },
  });
  if (alreadySurfaced?.isRead) return alreadySurfaced;

  let continuation: Awaited<ReturnType<typeof createAskNotificationContinuation>> | null = null;
  try {
    continuation = await createAskNotificationContinuation({
      userId: input.userId,
      propertyId: input.propertyId,
      triggerKey: input.triggerKey,
      operationId: input.operationId,
      question: input.question,
      reasonCode: input.reasonCode,
      title: input.title,
      body: input.body,
      tone: input.tone,
      triggerSource: input.triggerSource,
      details: input.details,
      domainAction: input.domainAction,
      parameters: input.parameters,
      suggestions: input.suggestions,
    });
  } catch (error) {
    logger.error({ err: error, triggerKey: input.triggerKey, operationId: input.operationId }, '[notifyWithAskContinuation] Failed to create Ask continuation');
  }

  return NotificationService.create({
    userId: input.userId,
    deduplicationKey: input.deduplicationKey,
    type: input.notificationType,
    title: input.title,
    message: input.notificationMessage,
    actionUrl: continuation?.actionUrl ?? input.domainAction.href,
    entityType: input.entityType,
    entityId: input.entityId,
    category: input.category,
    urgency: input.urgency,
    transportEnabled: input.transportEnabled,
    metadata: {
      ...input.metadata,
      propertyId: input.propertyId,
      askExecutionId: continuation?.executionId,
      askSessionId: continuation?.sessionId,
      domainActionUrl: input.domainAction.href,
    },
  });
}

// External review, 2026-09-13 (FRD §10/§29; implementation plan §9's own
// explicit dependency note: "Phase 3's async-fallback delivery... [is]
// generalized in Phase 5" -- Phase 5 shipped notifyWithAskContinuation and
// migrated the two pre-existing monitor producers plus Radar onto it, but
// never actually closed this specific dependency: conversationalCapture.ts's
// async-fallback tail (a slow extraction attempt that missed the ~1.5s
// inline budget, or a worker-driven crash-recovery retry) persisted its
// capture candidates and returned a bare count, with no caller anywhere
// invoking any notification mechanism -- confirmed by grep before writing
// this.
//
// Deliberately NOT built on `notifyWithAskContinuation`/
// `createAskNotificationContinuation` above: those synthesize a brand-new
// AskExecution from a template for a background producer that has no
// natural Ask turn of its own (a rate-monitor tick, a maintenance
// scheduler run). Here, the opposite is true -- persistCandidates has
// already built a real, fully-formed NEEDS_CONFIRMATION AskExecution (with
// its own confirmation card) inside the homeowner's own existing session.
// Synthesizing a second, separate execution to announce the first would
// create a confusing duplicate "turn" and point the homeowner at the wrong
// place. This just points a Notification at the real session/execution
// that already exists.
export async function notifyDelayedCaptureCandidatesReady(input: {
  userId: string;
  propertyId: string;
  sessionId: string;
  // The triggering ASK_EXTRACTION_REQUESTED DomainEvent's own id -- already
  // the natural per-attempt idempotency key conversationalCapture.ts uses
  // for candidate persistence itself, reused here as the notification's
  // deduplicationKey so a retried worker attempt for the same event can
  // never double-notify (NotificationService.create's own upsert-on-
  // deduplicationKey is a no-op update, never resurfacing an already-read
  // notification).
  triggerKey: string;
  executions: readonly { id: string }[];
}): Promise<void> {
  if (input.executions.length === 0) return;
  // Same redeploy-free kill switch every other proactive-continuation
  // producer already respects (Phase 5) -- this is the same class of
  // background-triggered delivery, not a fourth independent mechanism.
  if (!readAskOperationalControls().askProactiveContinuationEnabled) return;
  const firstExecutionId = input.executions[0].id;
  const count = input.executions.length;
  const actionUrl = `/dashboard/ask?propertyId=${encodeURIComponent(input.propertyId)}&sessionId=${encodeURIComponent(input.sessionId)}&executionId=${encodeURIComponent(firstExecutionId)}&from=notification`;
  try {
    await NotificationService.create({
      userId: input.userId,
      deduplicationKey: `ask-capture-notify:${input.triggerKey}`,
      type: 'ASK_CAPTURE_CANDIDATE_READY',
      title: count === 1 ? 'Cozy saved something from your message' : `Cozy saved ${count} details from your message`,
      message: 'Review and confirm to add it to your home record.',
      actionUrl,
      entityType: 'ASK_EXECUTION',
      entityId: firstExecutionId,
      category: 'WORKFLOW',
      urgency: 'ROUTINE',
      metadata: {
        propertyId: input.propertyId,
        askSessionId: input.sessionId,
        askExecutionIds: input.executions.map((execution) => execution.id),
      },
    });
  } catch (error) {
    // Never let this delivery signal turn an already-durable, already-
    // idempotent capture into a failure -- the fact/event/warranty/evidence
    // row this points at is safe and correctly persisted regardless; only
    // the homeowner's proactive nudge toward it is at risk here.
    logger.error({ err: error, triggerKey: input.triggerKey }, '[notifyDelayedCaptureCandidatesReady] Failed to create capture-ready notification');
  }
}
