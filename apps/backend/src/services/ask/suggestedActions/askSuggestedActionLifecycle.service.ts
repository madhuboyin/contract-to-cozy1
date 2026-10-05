// Plan C.15.4 step 5 / Ask Redo FRD §27.7a: durable lifecycle of offered Suggested Next Action outcomes. NOT wired into the finalizer
// (exact-four activates atomically at the end). Identity is user + property + operation + outcome + entity scope; the reason code is
// metadata. Persisting an answer is an OFFER, so cooldown starts at offer time. EVERY offered typed action is recorded (cooldown-exempt
// classes and curated starters included) so selection, completion and starter rotation have a row; only a class with an offer
// cooldown also gets `suppressedUntil`. `contextFingerprint` is the DISMISSAL fingerprint: only a dismissal writes it, offers never do.
// Nothing here stores a label, message or homeowner text.
//
// Writes are best effort and fail open: a failed write is logged and counted by the caller's report, and never changes or blocks the
// answer. Every "extend suppression" write is a single conditional update (raise-only), so concurrent offers can only lengthen a
// cooldown, never shorten a longer "Not now".
import { logger } from '../../../lib/logger';
import { askSuggestedActionsLifecycleMissingRowTotal } from '../../../lib/metrics';
import { prisma } from '../../../lib/prisma';
import { COOLDOWN_MS, lifecycleKey, offerCooldownMs, type LifecycleIdentity, type SuggestedNextActionSlotClass } from './suggestedNextActionExactFourRegistry';
import type { ExactFourEvaluation } from './suggestedNextActionExactFourPolicy';
import type { SelectedCandidate } from './suggestedNextActionPolicy';
import { isRepeatableOutcome } from './suggestedNextActionRegistry';

export type LifecycleDismissalReason = 'NOT_NOW' | 'NOT_RELEVANT';

export interface LifecycleRow {
  operationId: string;
  outcomeKey: string;
  entityType: string;
  entityId: string;
  lastOfferedAt?: Date;
  completedAt: Date | null;
  dismissalReason: LifecycleDismissalReason | null;
  suppressedUntil: Date | null;
  contextFingerprint: string | null;
}

/**
 * Offer cooldown or explicit dismissal (pure). Cooldown-exempt slot classes ignore this; completion is separate (below).
 *  - a time suppression (an offer cooldown or "Not now") holds until `suppressedUntil`;
 *  - "Not relevant" holds while the dismissal fingerprint matches the current material state. A dismissal without a fingerprint has no
 *    meaningful state boundary, so it never suppresses (the write path refuses to create one). When the caller cannot supply the
 *    current fingerprint, the dismissal is respected (the state change cannot be shown).
 */
export function isCooldownOrDismissalActive(row: LifecycleRow, now: Date, currentFingerprint: string | null = null): boolean {
  if (row.suppressedUntil && row.suppressedUntil.getTime() > now.getTime()) return true;
  if (row.dismissalReason === 'NOT_RELEVANT' && row.contextFingerprint !== null) {
    return currentFingerprint === null || row.contextFingerprint === currentFingerprint;
  }
  return false;
}

/** A completed outcome is suppressed in every slot class unless the operation registry declares it repeatable (pure). */
export function isCompletionSuppressing(row: LifecycleRow): boolean {
  return row.completedAt !== null && !isRepeatableOutcome(row.operationId, row.outcomeKey);
}

/** Either reason (pure). */
export function isLifecycleRowSuppressed(row: LifecycleRow, now: Date, currentFingerprint: string | null = null): boolean {
  return isCooldownOrDismissalActive(row, now, currentFingerprint) || isCompletionSuppressing(row);
}

export interface OfferedAction extends LifecycleIdentity {
  /** The GRANTED slot class the action occupied (never a producer's claim). */
  slotClass: SuggestedNextActionSlotClass;
  /** The EVALUATED ownership (after the producer grant), never the raw candidate claim. */
  currentResultOwnership: boolean;
  /** One bounded reason token, metadata only. */
  reasonCode?: string | null;
}

/** Builds offers from the exact-four policy's evaluated output; the raw candidate claims are never read for governance. */
export function offersFromExactFour(
  selected: readonly Pick<SelectedCandidate, 'candidate'>[],
  evaluated: readonly ExactFourEvaluation[],
  reasonCodeOf: (candidate: SelectedCandidate['candidate']) => string | null = (candidate) => candidate.reasonCodes[0] ?? null,
): OfferedAction[] {
  return selected.map((entry, index) => ({
    operationId: entry.candidate.operationId, outcomeKey: entry.candidate.outcomeKey,
    entityType: entry.candidate.entityContext.entityType, entityId: entry.candidate.entityContext.entityId,
    slotClass: evaluated[index]!.slotClass, currentResultOwnership: evaluated[index]!.currentResultOwnership,
    reasonCode: reasonCodeOf(entry.candidate),
  }));
}

/** The narrow slice of the Prisma delegate this service uses, so tests can inject a fake and no local database is needed. */
export interface LifecycleDb {
  askSuggestedActionLifecycle: {
    upsert(args: any): Promise<unknown>;
    updateMany(args: any): Promise<{ count: number }>;
    findMany(args: any): Promise<LifecycleRow[]>;
  };
}

const defaultDb = (): LifecycleDb => prisma as unknown as LifecycleDb;
const scope = (identity: LifecycleIdentity) => ({ operationId: identity.operationId, outcomeKey: identity.outcomeKey, entityType: identity.entityType ?? '', entityId: identity.entityId ?? '' });
const where = (userId: string, propertyId: string, identity: LifecycleIdentity) => ({ userId, propertyId, ...scope(identity) });

/** Raise-only: sets `suppressedUntil` only when it is empty or earlier, in one conditional statement. */
async function raiseSuppression(db: LifecycleDb, userId: string, propertyId: string, identity: LifecycleIdentity, until: Date): Promise<void> {
  await db.askSuggestedActionLifecycle.updateMany({
    where: { ...where(userId, propertyId, identity), OR: [{ suppressedUntil: null }, { suppressedUntil: { lt: until } }] },
    data: { suppressedUntil: until },
  });
}

export interface RecordOffersInput { userId: string; propertyId: string; offers: readonly OfferedAction[]; now: Date }

/**
 * Records that these actions were offered on a persisted answer. EVERY offer is recorded; only a class with an offer cooldown also
 * gets `suppressedUntil`. Fails open; returns whether every write succeeded.
 */
export async function recordSuggestedActionOffers(input: RecordOffersInput, db: LifecycleDb = defaultDb()): Promise<{ attempted: number; ok: boolean }> {
  try {
    await Promise.all(input.offers.map(async (offer) => {
      const cooldown = offerCooldownMs(offer.slotClass, offer.currentResultOwnership);
      const until = cooldown === null ? null : new Date(input.now.getTime() + cooldown);
      await db.askSuggestedActionLifecycle.upsert({
        where: { userId_propertyId_operationId_outcomeKey_entityType_entityId: where(input.userId, input.propertyId, offer) },
        create: {
          ...where(input.userId, input.propertyId, offer), firstOfferedAt: input.now, lastOfferedAt: input.now, offerCount: 1,
          lastReasonCode: offer.reasonCode ?? null, suppressedUntil: until,
        },
        // Offers never touch `contextFingerprint` (the dismissal fingerprint) or the dismissal fields.
        update: { lastOfferedAt: input.now, offerCount: { increment: 1 }, lastReasonCode: offer.reasonCode ?? null },
      });
      if (until) await raiseSuppression(db, input.userId, input.propertyId, offer, until);
    }));
    return { attempted: input.offers.length, ok: true };
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle offer write failed; answer unaffected');
    return { attempted: input.offers.length, ok: false };
  }
}

/**
 * Selection and completion are state markers on an existing row; a missing row (never recorded) is not created here. They return true
 * only when exactly one row was updated. A zero-row update (a failed offer write, or a wrong lifecycle identity) is counted and logged
 * separately from a thrown write failure, and still fails open: the caller's flow is never blocked.
 */
async function markLifecycleState(
  event: 'SELECTED' | 'COMPLETED', userId: string, propertyId: string, identity: LifecycleIdentity, data: Record<string, Date>, db: LifecycleDb,
): Promise<boolean> {
  try {
    const result = await db.askSuggestedActionLifecycle.updateMany({ where: where(userId, propertyId, identity), data });
    if (result.count === 1) return true;
    if (result.count === 0) {
      askSuggestedActionsLifecycleMissingRowTotal.inc({ event });
      logger.warn({ userId, propertyId, event, operationId: identity.operationId, outcomeKey: identity.outcomeKey }, '[ask-suggested-actions] lifecycle update matched no row');
    } else {
      logger.warn({ userId, propertyId, event, matched: result.count }, '[ask-suggested-actions] lifecycle update matched more than one row');
    }
    return false;
  } catch (error) {
    logger.warn({ err: error, userId, propertyId, event }, '[ask-suggested-actions] lifecycle write failed');
    return false;
  }
}

export function recordSuggestedActionSelected(userId: string, propertyId: string, identity: LifecycleIdentity, now: Date, db: LifecycleDb = defaultDb()): Promise<boolean> {
  return markLifecycleState('SELECTED', userId, propertyId, identity, { selectedAt: now }, db);
}

export function recordSuggestedActionCompleted(userId: string, propertyId: string, identity: LifecycleIdentity, now: Date, db: LifecycleDb = defaultDb()): Promise<boolean> {
  return markLifecycleState('COMPLETED', userId, propertyId, identity, { completedAt: now }, db);
}

export interface RecordDismissalInput {
  userId: string; propertyId: string; identity: LifecycleIdentity; reason: LifecycleDismissalReason; now: Date;
  /**
   * The server-computed material-state fingerprint at dismissal. REQUIRED (non-empty) for NOT_RELEVANT: without a meaningful state
   * boundary the dismissal would suppress indefinitely, so the write is refused. Ignored for NOT_NOW.
   */
  contextFingerprint?: string | null;
}

/**
 * Explicit dismissal only (never inferred from ignoring a chip). Upserts so a dismissal is durable even if no offer row exists.
 * "Not now" raises suppression to now + 30 days; "Not relevant" suppresses while the dismissal fingerprint matches the current state.
 * The caller (the dismissal endpoint, not built yet) owns authorization, resolving identity from the persisted action, restricting
 * NOT_RELEVANT to opportunity and starter outcomes, and routing "Doesn't apply".
 */
export async function recordSuggestedActionDismissal(input: RecordDismissalInput, db: LifecycleDb = defaultDb()): Promise<boolean> {
  const fingerprint = input.contextFingerprint?.trim() || null;
  if (input.reason === 'NOT_RELEVANT' && !fingerprint) {
    logger.warn({ userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] NOT_RELEVANT refused: no material-state fingerprint');
    return false;
  }
  try {
    const base = where(input.userId, input.propertyId, input.identity);
    const notNowUntil = new Date(input.now.getTime() + COOLDOWN_MS.notNow);
    await db.askSuggestedActionLifecycle.upsert({
      where: { userId_propertyId_operationId_outcomeKey_entityType_entityId: base },
      create: {
        ...base, firstOfferedAt: input.now, lastOfferedAt: input.now, offerCount: 0, dismissedAt: input.now, dismissalReason: input.reason,
        contextFingerprint: input.reason === 'NOT_RELEVANT' ? fingerprint : null, suppressedUntil: input.reason === 'NOT_NOW' ? notNowUntil : null,
      },
      update: {
        dismissedAt: input.now, dismissalReason: input.reason,
        // The fingerprint belongs to the dismissal: set for NOT_RELEVANT, cleared for NOT_NOW so a stale one cannot linger.
        contextFingerprint: input.reason === 'NOT_RELEVANT' ? fingerprint : null,
      },
    });
    if (input.reason === 'NOT_NOW') await raiseSuppression(db, input.userId, input.propertyId, input.identity, notNowUntil);
    return true;
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle dismissal write failed');
    return false;
  }
}

export interface LoadLifecycleStateInput {
  userId: string; propertyId: string; now: Date;
  /** Current material-state fingerprint per lifecycle key, for "Not relevant" lapse checks; absent means unknown (dismissal respected). */
  currentFingerprints?: ReadonlyMap<string, string>;
  /** Curated starter candidates in this evaluation: their rows are returned even when nothing suppresses them, for rotation. */
  rotationIdentities?: readonly LifecycleIdentity[];
}

export interface LifecycleState {
  /** Offer cooldown or explicit dismissal in force. The policy ignores these for cooldown-exempt granted classes. */
  cooldownKeys: Set<string>;
  /** Completed, non-repeatable outcomes. The policy applies these to EVERY class. */
  completedKeys: Set<string>;
  /** Last offer time (ms) for each returned row, for starter rotation. */
  lastOfferedAtMs: Map<string, number>;
  ok: boolean;
}

/**
 * The lifecycle state for this user and property in one query. A read failure fails OPEN: empty state and `ok: false`, so a lifecycle
 * outage can never strip the row of actions; the caller records the failure as a diagnostic.
 */
export async function loadLifecycleState(input: LoadLifecycleStateInput, db: LifecycleDb = defaultDb()): Promise<LifecycleState> {
  const empty: LifecycleState = { cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: false };
  try {
    const rotation = (input.rotationIdentities ?? []).map((identity) => scope(identity));
    const rows = await db.askSuggestedActionLifecycle.findMany({
      where: {
        userId: input.userId, propertyId: input.propertyId,
        OR: [{ suppressedUntil: { gt: input.now } }, { dismissalReason: 'NOT_RELEVANT' }, { completedAt: { not: null } }, ...rotation],
      },
      select: {
        operationId: true, outcomeKey: true, entityType: true, entityId: true, lastOfferedAt: true, completedAt: true, dismissalReason: true,
        suppressedUntil: true, contextFingerprint: true,
      },
    });
    const state: LifecycleState = { cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true };
    for (const row of rows) {
      const key = lifecycleKey({ operationId: row.operationId, outcomeKey: row.outcomeKey, entityType: row.entityType, entityId: row.entityId });
      if (row.lastOfferedAt) state.lastOfferedAtMs.set(key, row.lastOfferedAt.getTime());
      if (isCooldownOrDismissalActive(row, input.now, input.currentFingerprints?.get(key) ?? null)) state.cooldownKeys.add(key);
      if (isCompletionSuppressing(row)) state.completedKeys.add(key);
    }
    return state;
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle read failed; no cooldown applied');
    return empty;
  }
}
