import type { FeedbackSurface, FeedbackTargetType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { FEEDBACK_REASON_CODES, type FeedbackReasonCode } from './feedbackContract';

/**
 * Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-001) — the
 * one canonical write path onto the typed `Feedback` contract. Before this
 * existed, every feedback writer (Home Action usefulness, Ask execution
 * UP/DOWN, the generic app feedback widget, seller-prep feedback) wrote raw
 * `rating`/`comment`/`page` rows directly and left `targetType`, `targetId`,
 * `surface`, `reasonCodes`, and `contextVersion` — all already present on
 * the schema — permanently null. This does not remove `page`/`rating`:
 * existing readers (`getSuppressedHomeActionIds`'s cooldown query) still key
 * off `page`, so both are populated together rather than migrating reads in
 * the same pass.
 */
export interface RecordTypedFeedbackInput {
  userId: string;
  propertyId: string | null;
  /** Legacy per-target key existing readers (e.g. the suppression cooldown query) still query by. */
  page: string;
  /** Legacy free-text sentiment field kept for existing readers/exports. */
  rating: string;
  comment?: string | null;
  targetType: FeedbackTargetType;
  targetId: string;
  surface: FeedbackSurface;
  reasonCodes?: readonly FeedbackReasonCode[];
  contextVersion?: string | null;
  recommendationSnapshotId?: string | null;
  outcomeObservationId?: string | null;
  capabilityId?: string | null;
  capabilityVersion?: string | null;
}

export function buildTypedFeedbackData(input: RecordTypedFeedbackInput) {
  const reasonCodes = input.reasonCodes ?? [];
  for (const code of reasonCodes) {
    if (!FEEDBACK_REASON_CODES.includes(code)) {
      throw new Error(`Unknown feedback reason code "${code}". Register it in FEEDBACK_REASON_CODES first.`);
    }
  }
  return {
    userId: input.userId,
    propertyId: input.propertyId,
    rating: input.rating,
    comment: input.comment ?? null,
    page: input.page,
    targetType: input.targetType,
    targetId: input.targetId,
    surface: input.surface,
    reasonCodes: [...reasonCodes],
    contextVersion: input.contextVersion ?? null,
    recommendationSnapshotId: input.recommendationSnapshotId ?? null,
    outcomeObservationId: input.outcomeObservationId ?? null,
    capabilityId: input.capabilityId ?? null,
    capabilityVersion: input.capabilityVersion ?? null,
  };
}

type FeedbackWriteClient = Pick<Prisma.TransactionClient, 'feedback'>;

export async function recordTypedFeedback(
  input: RecordTypedFeedbackInput,
  db: FeedbackWriteClient = prisma,
): Promise<{ id: string }> {
  const data = buildTypedFeedbackData(input);
  const existing = await db.feedback.findFirst({
    where: { userId: input.userId, page: input.page },
    orderBy: { createdAt: 'desc' },
  });
  const saved = existing
    ? await db.feedback.update({ where: { id: existing.id }, data })
    : await db.feedback.create({ data });
  return { id: saved.id };
}
