// Plan C.15.4 step 5 / Ask Redo FRD §27.7a: durable lifecycle of offered Suggested Next Action outcomes. NOT wired into the finalizer
// (exact-four activates atomically at the end). Identity is user + property + operation + outcome + entity scope; the reason code is
// metadata. Persisting an answer is an OFFER, so cooldown starts at offer time. Nothing here stores a label, message or homeowner text.
//
// Writes are best effort and fail open: a failed write is logged and counted by the caller's report, and never changes or blocks the
// answer. Every "extend suppression" write is a single conditional update (raise-only), so concurrent offers can only lengthen a
// cooldown, never shorten a longer "Not now".
import { logger } from '../../../lib/logger';
import { prisma } from '../../../lib/prisma';
import { COOLDOWN_MS, lifecycleKey, offerCooldownMs, type LifecycleIdentity, type SuggestedNextActionSlotClass } from './suggestedNextActionExactFourRegistry';
import { isRepeatableOutcome } from './suggestedNextActionRegistry';

export type LifecycleDismissalReason = 'NOT_NOW' | 'NOT_RELEVANT';

export interface LifecycleRow {
  operationId: string;
  outcomeKey: string;
  entityType: string;
  entityId: string;
  completedAt: Date | null;
  dismissalReason: LifecycleDismissalReason | null;
  suppressedUntil: Date | null;
  contextFingerprint: string | null;
}

/**
 * Whether a lifecycle row suppresses its outcome now (pure).
 *  - a time cooldown suppresses until `suppressedUntil`;
 *  - "Not relevant" suppresses while the material-state fingerprint is unchanged (equal, including both absent);
 *  - a completed outcome is suppressed unless the operation registry declares it repeatable.
 */
export function isLifecycleRowSuppressed(row: LifecycleRow, now: Date, currentFingerprint: string | null = null): boolean {
  if (row.suppressedUntil && row.suppressedUntil.getTime() > now.getTime()) return true;
  if (row.dismissalReason === 'NOT_RELEVANT' && (row.contextFingerprint ?? null) === (currentFingerprint ?? null)) return true;
  if (row.completedAt && !isRepeatableOutcome(row.operationId, row.outcomeKey)) return true;
  return false;
}

export interface OfferedAction extends LifecycleIdentity {
  /** The granted slot class the action occupied (never a producer's claim). */
  slotClass: SuggestedNextActionSlotClass;
  currentResultOwnership: boolean;
  /** One bounded reason token, metadata only. */
  reasonCode?: string | null;
  contextFingerprint?: string | null;
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

/** Records that these actions were offered on a persisted answer. Fails open; returns whether every write succeeded. */
export async function recordSuggestedActionOffers(input: RecordOffersInput, db: LifecycleDb = defaultDb()): Promise<{ attempted: number; ok: boolean }> {
  const governed = input.offers.filter((offer) => offerCooldownMs(offer.slotClass, offer.currentResultOwnership) !== null);
  try {
    await Promise.all(governed.map(async (offer) => {
      const until = new Date(input.now.getTime() + offerCooldownMs(offer.slotClass, offer.currentResultOwnership)!);
      await db.askSuggestedActionLifecycle.upsert({
        where: { userId_propertyId_operationId_outcomeKey_entityType_entityId: where(input.userId, input.propertyId, offer) },
        create: {
          ...where(input.userId, input.propertyId, offer), firstOfferedAt: input.now, lastOfferedAt: input.now, offerCount: 1,
          lastReasonCode: offer.reasonCode ?? null, contextFingerprint: offer.contextFingerprint ?? null, suppressedUntil: until,
        },
        update: {
          lastOfferedAt: input.now, offerCount: { increment: 1 }, lastReasonCode: offer.reasonCode ?? null,
          ...(offer.contextFingerprint !== undefined ? { contextFingerprint: offer.contextFingerprint } : {}),
        },
      });
      await raiseSuppression(db, input.userId, input.propertyId, offer, until);
    }));
    return { attempted: governed.length, ok: true };
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle offer write failed; answer unaffected');
    return { attempted: governed.length, ok: false };
  }
}

/** Selection and completion are state markers on an existing row; a missing row (never recorded) is not created here. */
export async function recordSuggestedActionSelected(userId: string, propertyId: string, identity: LifecycleIdentity, now: Date, db: LifecycleDb = defaultDb()): Promise<boolean> {
  try {
    await db.askSuggestedActionLifecycle.updateMany({ where: where(userId, propertyId, identity), data: { selectedAt: now } });
    return true;
  } catch (error) {
    logger.warn({ err: error, userId, propertyId }, '[ask-suggested-actions] lifecycle selection write failed');
    return false;
  }
}

export async function recordSuggestedActionCompleted(userId: string, propertyId: string, identity: LifecycleIdentity, now: Date, db: LifecycleDb = defaultDb()): Promise<boolean> {
  try {
    await db.askSuggestedActionLifecycle.updateMany({ where: where(userId, propertyId, identity), data: { completedAt: now } });
    return true;
  } catch (error) {
    logger.warn({ err: error, userId, propertyId }, '[ask-suggested-actions] lifecycle completion write failed');
    return false;
  }
}

export interface RecordDismissalInput {
  userId: string; propertyId: string; identity: LifecycleIdentity; reason: LifecycleDismissalReason; now: Date;
  /** Material-state fingerprint at dismissal; a NOT_RELEVANT dismissal lapses when the current fingerprint differs. */
  contextFingerprint?: string | null;
}

/**
 * Explicit dismissal only (never inferred from ignoring a chip). Upserts so a dismissal is durable even if no offer row exists.
 * "Not now" raises suppression to now + 30 days; "Not relevant" suppresses until the fingerprint changes. Authorization and the
 * "Doesn't apply" routing (applicability flow vs "Not now") belong to the caller.
 */
export async function recordSuggestedActionDismissal(input: RecordDismissalInput, db: LifecycleDb = defaultDb()): Promise<boolean> {
  try {
    const base = where(input.userId, input.propertyId, input.identity);
    await db.askSuggestedActionLifecycle.upsert({
      where: { userId_propertyId_operationId_outcomeKey_entityType_entityId: base },
      create: {
        ...base, firstOfferedAt: input.now, lastOfferedAt: input.now, offerCount: 0, dismissedAt: input.now, dismissalReason: input.reason,
        contextFingerprint: input.contextFingerprint ?? null,
        suppressedUntil: input.reason === 'NOT_NOW' ? new Date(input.now.getTime() + COOLDOWN_MS.notNow) : null,
      },
      update: {
        dismissedAt: input.now, dismissalReason: input.reason,
        ...(input.reason === 'NOT_RELEVANT' ? { contextFingerprint: input.contextFingerprint ?? null } : {}),
      },
    });
    if (input.reason === 'NOT_NOW') await raiseSuppression(db, input.userId, input.propertyId, input.identity, new Date(input.now.getTime() + COOLDOWN_MS.notNow));
    return true;
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle dismissal write failed');
    return false;
  }
}

export interface LoadSuppressedInput {
  userId: string; propertyId: string; now: Date;
  /** Current material-state fingerprint per lifecycle key, for "Not relevant" lapse checks; absent means no fingerprint. */
  currentFingerprints?: ReadonlyMap<string, string>;
}

/**
 * The lifecycle keys currently suppressed for this user and property, in one query. A read failure fails OPEN: it returns an empty
 * set and `ok: false`, so a lifecycle outage can never strip the row of actions; the caller records the failure as a diagnostic.
 */
export async function loadSuppressedLifecycleKeys(input: LoadSuppressedInput, db: LifecycleDb = defaultDb()): Promise<{ keys: Set<string>; ok: boolean }> {
  try {
    const rows = await db.askSuggestedActionLifecycle.findMany({
      where: {
        userId: input.userId, propertyId: input.propertyId,
        OR: [{ suppressedUntil: { gt: input.now } }, { dismissalReason: 'NOT_RELEVANT' }, { completedAt: { not: null } }],
      },
      select: { operationId: true, outcomeKey: true, entityType: true, entityId: true, completedAt: true, dismissalReason: true, suppressedUntil: true, contextFingerprint: true },
    });
    const keys = new Set<string>();
    for (const row of rows) {
      const key = lifecycleKey({ operationId: row.operationId, outcomeKey: row.outcomeKey, entityType: row.entityType, entityId: row.entityId });
      if (isLifecycleRowSuppressed(row, input.now, input.currentFingerprints?.get(key) ?? null)) keys.add(key);
    }
    return { keys, ok: true };
  } catch (error) {
    logger.warn({ err: error, userId: input.userId, propertyId: input.propertyId }, '[ask-suggested-actions] lifecycle read failed; no cooldown applied');
    return { keys: new Set(), ok: false };
  }
}
