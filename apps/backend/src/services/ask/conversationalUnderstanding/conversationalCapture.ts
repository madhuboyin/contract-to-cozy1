// Ask Cozy Stage 3, Phase 3 (implementation plan §9/§14 vertical-slice
// template; FRD §10 Turn Processing Contract, §14, §22).
//
// Orchestrates one turn's conversational-capture attempt: pre-filter →
// persist-first DomainEvent → bounded synchronous extraction attempt →
// claim-token-guarded candidate persistence → child AskExecution rows in
// NEEDS_CONFIRMATION. Deliberately imports nothing from
// askOrchestrator.service.ts (that file imports this module, one
// directionally, matching Phase 1's own CommonJS-circular-import
// precedent) -- it returns plain AskExecution rows; askOrchestrator.service.ts
// maps them to AskExecutionResponse with its own existing mapPersistedExecution.
//
// The "persist-first, then claim, then verify-before-commit" shape mirrors
// domainEventClaimToken.ts (apps/workers/src/lib/), which this module cannot
// import directly (that file lives in the workers app, not the shared
// backend code workers pulls in via @worker-shared) -- verifyClaimStillOwned
// below is a small, deliberate duplicate of that same one function, not a
// reimplementation of the whole claim/lease loop.
import { AskExecutionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { evaluateExtractionPreFilter } from './extractionPreFilter';
import { runStructuredExtraction } from './extractionContract';
import type { EventExtractionCandidate, ExtractionCandidate, FactExtractionCandidate } from './extractionCandidateSchema';

const DOMAIN_EVENT_LEASE_MS = 15 * 60_000;
// FRD §10: "Step 8's synchronous portion has a strict timeout (~1.5s...)".
const INLINE_EXTRACTION_BUDGET_MS = 1_500;
const CONFIRMATION_WINDOW_MS = 30 * 60_000;
const CAPTURE_CHANNEL = 'ASK_CONVERSATIONAL_CAPTURE';

export type PersistedCaptureExecution = Awaited<ReturnType<typeof prisma.askExecution.create>>;

export interface ConversationalCaptureInput {
  userId: string;
  sessionId: string;
  propertyId: string;
  parentExecutionId: string;
  message: string;
  contextVersion: string | null;
  // Stage 2's dedup rule (implementation plan §9's Work list; FRD §8.3),
  // narrowed for this slice: the caller passes true when the turn's own
  // routed operation already performed a material write this same turn
  // (e.g. MAINTENANCE_TASK_COMPLETE capturing its own cost field) -- full
  // per-field dedup across all 69 operations is not attempted here; see the
  // implementation plan's Phase 3 status section for what this narrower
  // rule deliberately does not cover.
  skipDueToRoutedCapture: boolean;
}

function confirmationExpiry(now: Date): Date {
  return new Date(now.getTime() + CONFIRMATION_WINDOW_MS);
}

function factConfirmationBlocksAndCard(candidate: FactExtractionCandidate, expiresAt: Date, index: number) {
  const confirmationId = `capture-fact-${candidate.factKey}-${index}-${expiresAt.getTime()}`;
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-fact-preview-${index}`,
      title: 'Save this to your property record?',
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version: 1,
      title: 'Save this to your property record?',
      description: `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields: [
        { label: 'Fact', value: candidate.factKey },
        { label: 'Value', value: String(candidate.value) },
      ],
      confirmLabel: 'Save to property record',
      consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my property record.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function eventConfirmationBlocksAndCard(candidate: EventExtractionCandidate, expiresAt: Date, index: number) {
  const confirmationId = `capture-event-${index}-${expiresAt.getTime()}`;
  const fields = [{ label: 'Event', value: candidate.title }];
  if (candidate.amount != null) fields.push({ label: 'Amount', value: `$${candidate.amount.toLocaleString()}` });
  if (candidate.providerName) fields.push({ label: 'Provider', value: candidate.providerName });
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-event-preview-${index}`,
      title: 'Add this to your home timeline?',
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version: 1,
      title: 'Add this to your home timeline?',
      description: `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: 'Add to timeline',
      consentText: 'I confirm this is accurate and authorize ContractToCozy to add it to my home timeline.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function buildChildExecutionData(
  candidate: ExtractionCandidate,
  index: number,
  input: ConversationalCaptureInput,
  now: Date,
): Prisma.AskExecutionCreateInput {
  const expiresAt = confirmationExpiry(now);
  const confirmationVersion = 1;
  const operationId = candidate.category === 'FACT' ? 'CAPTURE_FACT_CONFIRM' : 'CAPTURE_EVENT_CONFIRM';
  const { blocks, confirmation } = candidate.category === 'FACT'
    ? factConfirmationBlocksAndCard(candidate, expiresAt, index)
    : eventConfirmationBlocksAndCard(candidate, expiresAt, index);

  const parameters: Record<string, unknown> = candidate.category === 'FACT'
    ? {
      factKey: candidate.factKey,
      value: candidate.value,
      sourceType: 'USER_REPORTED',
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    }
    : {
      type: candidate.eventType,
      title: candidate.title,
      summary: candidate.summary ?? null,
      // HomeEvent.occurredAt is a required, non-nullable column -- even a
      // RANGE/UNKNOWN-precision candidate needs a best-guess anchor.
      // datePrecision is what tells a reader not to trust this to the day.
      occurredAt: candidate.occurredAt ?? candidate.dateRangeStart ?? now.toISOString(),
      datePrecision: candidate.datePrecision,
      dateRangeStart: candidate.dateRangeStart ?? null,
      dateRangeEnd: candidate.dateRangeEnd ?? null,
      amount: candidate.amount ?? null,
      currency: candidate.amount != null ? (candidate.currency ?? 'USD') : null,
      providerName: candidate.providerName ?? null,
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    };

  return {
    session: { connect: { id: input.sessionId } },
    user: { connect: { id: input.userId } },
    property: { connect: { id: input.propertyId } },
    // Deterministic per (parent execution, candidate index): a retried
    // extraction attempt for the same parent turn resolves to the same
    // child row via the existing @@unique([userId, clientRequestId])
    // constraint, rather than creating a duplicate proposal (FRD §14's "no
    // duplicate candidate proposals reach the user").
    clientRequestId: `ask-extraction:${input.parentExecutionId}:${index}`,
    message: candidate.sourceSentence,
    parentExecution: { connect: { id: input.parentExecutionId } },
    operationId,
    operationVersion: '1.0',
    intentFamily: 'COMMAND',
    status: 'NEEDS_CONFIRMATION' as AskExecutionStatus,
    reasonCode: candidate.category === 'FACT' ? 'FACT_CAPTURE_CONFIRMATION_REQUIRED' : 'EVENT_CAPTURE_CONFIRMATION_REQUIRED',
    contextVersion: input.contextVersion,
    parametersJson: parameters as Prisma.InputJsonValue,
    resultJson: {
      schemaVersion: '1.0',
      blocks,
      captureRequests: [],
      confirmation,
      clarification: null,
      suggestions: [],
    } as unknown as Prisma.InputJsonValue,
    expiresAt,
  };
}

/**
 * Re-verifies, inside the same transaction that persists what this attempt
 * produced, that this attempt's claim token still matches the DomainEvent
 * row's current attempts value -- mirroring
 * apps/workers/src/lib/domainEventClaimToken.ts's verifyDomainEventClaimToken
 * exactly (see this file's header for why that utility can't be imported
 * directly from here). Throws (rolling back the whole transaction, per
 * Prisma's standard uncaught-error behavior) if a later attempt has since
 * reclaimed the lease.
 */
async function verifyClaimStillOwned(tx: Prisma.TransactionClient, domainEventId: string, claimedAttempts: number): Promise<void> {
  const stillOwned = await tx.domainEvent.updateMany({
    where: { id: domainEventId, attempts: claimedAttempts },
    data: { processingStartedAt: new Date() },
  });
  if (stillOwned.count !== 1) {
    throw new Error(`ASK_EXTRACTION_REQUESTED ${domainEventId}'s claim (attempts=${claimedAttempts}) was reclaimed by a later attempt`);
  }
}

async function persistCandidates(
  domainEventId: string,
  claimedAttempts: number,
  candidates: ExtractionCandidate[],
  input: ConversationalCaptureInput,
): Promise<PersistedCaptureExecution[]> {
  if (candidates.length === 0) {
    await prisma.domainEvent.update({
      where: { id: domainEventId },
      data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null, leaseExpiresAt: null },
    });
    return [];
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await verifyClaimStillOwned(tx, domainEventId, claimedAttempts);
    const created: PersistedCaptureExecution[] = [];
    for (const [index, candidate] of candidates.entries()) {
      const data = buildChildExecutionData(candidate, index, input, now);
      // A retried attempt for the same parent turn resolves to the
      // already-created child via clientRequestId's own uniqueness rather
      // than erroring the whole batch.
      const existing = await tx.askExecution.findUnique({
        where: { userId_clientRequestId: { userId: input.userId, clientRequestId: data.clientRequestId as string } },
      });
      created.push(existing ?? await tx.askExecution.create({ data }));
    }
    await tx.domainEvent.update({
      where: { id: domainEventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingStartedAt: null,
        leaseExpiresAt: null,
        payload: { processingOutcome: { candidateCount: created.length } },
      },
    });
    return created;
  });
}

/**
 * The extraction-trigger call site's one entry point, called inline from
 * createAskExecution's success path (askOrchestrator.service.ts). Never
 * throws -- any failure here must never affect the routed answer that
 * already succeeded this turn (FRD §10: "Steps 6 and 8 are independent").
 * Returns the child AskExecution rows created within the synchronous
 * ~1.5s budget; an empty array covers three cases indistinguishable to the
 * caller (flag off, pre-filter didn't fire, or extraction is still running
 * past budget) -- distinguishing them is diagnostic, not behavioral, so
 * callers should not infer anything from an empty result beyond "nothing to
 * show inline this turn."
 */
export async function runConversationalCaptureForTurn(input: ConversationalCaptureInput): Promise<PersistedCaptureExecution[]> {
  const controls = readAskOperationalControls();
  if (!controls.askConversationalCaptureEnabled) return [];
  if (input.skipDueToRoutedCapture) return [];

  const preFilter = evaluateExtractionPreFilter(input.message);
  if (!preFilter.shouldExtract) return [];

  const idempotencyKey = `ask-extraction:${input.parentExecutionId}`;
  const now = new Date();
  let domainEventId: string;
  try {
    const event = await prisma.domainEvent.upsert({
      where: { idempotencyKey },
      create: {
        type: 'ASK_EXTRACTION_REQUESTED',
        status: 'PENDING',
        propertyId: input.propertyId,
        userId: input.userId,
        idempotencyKey,
        payload: { executionId: input.parentExecutionId, message: input.message },
        availableAt: now,
      },
      update: {},
    });
    domainEventId = event.id;
  } catch (error) {
    logger.warn({ error, parentExecutionId: input.parentExecutionId }, '[ask-conversational-capture] failed to persist durable extraction intent; skipping this turn');
    return [];
  }

  // Claim it inline, same predicate the worker's own poller uses -- this is
  // the "attempt," not a separate bookkeeping step. A lost race (someone
  // else claimed it first) is vanishingly unlikely for a row just created
  // in this same call, but handled the same safe way either way: skip
  // silently, since whoever claimed it owns completing it.
  const claimed = await prisma.domainEvent.updateMany({
    where: { id: domainEventId, status: 'PENDING', availableAt: { lte: now } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_LEASE_MS) },
  });
  if (claimed.count !== 1) return [];
  const claimedRow = await prisma.domainEvent.findUnique({ where: { id: domainEventId }, select: { attempts: true } });
  const claimedAttempts = claimedRow?.attempts ?? 1;

  // The attempt itself: extraction, then claim-verified persistence. Not
  // cancelled on timeout below -- JS has no true promise cancellation, so
  // this keeps running in the background and will still commit (or
  // correctly no-op via verifyClaimStillOwned) once it finishes. Its own
  // rejection is always caught here so a slow-then-failing attempt never
  // becomes an unhandled rejection.
  const attempt = (async () => {
    try {
      const { candidates } = await runStructuredExtraction(input.message);
      return await persistCandidates(domainEventId, claimedAttempts, candidates, input);
    } catch (error) {
      logger.warn({ error, parentExecutionId: input.parentExecutionId }, '[ask-conversational-capture] extraction attempt failed');
      // Release the claim promptly (rather than holding a 15-minute lease
      // uselessly) so the worker's own poller can retry per its existing
      // backoff convention.
      await prisma.domainEvent.updateMany({
        where: { id: domainEventId, attempts: claimedAttempts },
        data: { status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error', availableAt: new Date(Date.now() + 60_000), processingStartedAt: null, leaseExpiresAt: null },
      }).catch(() => undefined);
      return [] as PersistedCaptureExecution[];
    }
  })();

  const timeout = new Promise<PersistedCaptureExecution[]>((resolve) => {
    setTimeout(() => resolve([]), INLINE_EXTRACTION_BUDGET_MS);
  });
  return Promise.race([attempt, timeout]);
}

/**
 * The async-fallback path: called by the workers app's ASK_EXTRACTION_REQUESTED
 * consumer (processDomainEvents.job.ts) after its own generic claim loop has
 * already claimed the event (crash recovery / cold retry -- the inline
 * attempt above either finished, is still running past this event's lease,
 * or the whole backend process restarted before it could finish).
 * claimedAttempts is the event's own post-claim attempts value, matching
 * domainEventClaimToken.ts's documented contract.
 */
export async function processAskExtractionRequestedEvent(
  event: { id: string; propertyId: string | null; userId: string | null; payload: unknown },
  claimedAttempts: number,
): Promise<{ candidateCount: number }> {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
  const parentExecutionId = typeof payload.executionId === 'string' ? payload.executionId : null;
  const message = typeof payload.message === 'string' ? payload.message : null;
  if (!parentExecutionId || !message || !event.propertyId || !event.userId) {
    throw new Error('ASK_EXTRACTION_REQUESTED event missing executionId/message/propertyId/userId');
  }
  const parent = await prisma.askExecution.findUnique({ where: { id: parentExecutionId }, select: { sessionId: true, contextVersion: true } });
  if (!parent) throw new Error(`ASK_EXTRACTION_REQUESTED event's parent execution ${parentExecutionId} no longer exists`);

  const { candidates } = await runStructuredExtraction(message);
  const created = await persistCandidates(event.id, claimedAttempts, candidates, {
    userId: event.userId,
    sessionId: parent.sessionId,
    propertyId: event.propertyId,
    parentExecutionId,
    message,
    contextVersion: parent.contextVersion,
    skipDueToRoutedCapture: false,
  });
  return { candidateCount: created.length };
}
