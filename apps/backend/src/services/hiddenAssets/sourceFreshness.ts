import {
  HiddenAssetFundingStatus,
  HiddenAssetProgramReviewStatus,
  HiddenAssetSourceStatus,
} from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewedSourceFreshness {
  status: HiddenAssetSourceStatus;
  officialUrl: string | null;
  lastReviewedAt: Date | null;
  reviewSlaDays: number;
  version: number;
  reviewedVersion: number | null;
}

export interface ReviewedProgramFreshness {
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
}

export interface ActionableReviewedProgram extends ReviewedProgramFreshness {
  isActive: boolean;
  reviewStatus: HiddenAssetProgramReviewStatus;
  expiresAt: Date | null;
  fundingStatus: HiddenAssetFundingStatus;
  applicationWindowOpensAt: Date | null;
  applicationWindowClosesAt: Date | null;
}

export function sourceReviewDueAt(source: ReviewedSourceFreshness): Date | null {
  if (!source.lastReviewedAt || source.reviewSlaDays <= 0) return null;
  return new Date(source.lastReviewedAt.getTime() + source.reviewSlaDays * DAY_MS);
}

export function isSourceReviewCurrent(
  source: ReviewedSourceFreshness,
  now = new Date(),
): boolean {
  const dueAt = sourceReviewDueAt(source);
  return (
    source.status === 'ACTIVE'
    && Boolean(source.officialUrl?.trim())
    && source.reviewedVersion === source.version
    && dueAt !== null
    && dueAt.getTime() >= now.getTime()
  );
}

export function isReviewedProgramCurrent(
  program: ReviewedProgramFreshness,
  source: ReviewedSourceFreshness,
  now = new Date(),
): boolean {
  if (!isSourceReviewCurrent(source, now)) return false;
  if (!program.sourceUrl?.trim() || !program.lastVerifiedAt) return false;
  const programDueAt = new Date(
    program.lastVerifiedAt.getTime() + source.reviewSlaDays * DAY_MS,
  );
  return programDueAt.getTime() >= now.getTime();
}

/**
 * Complete homeowner-actionability contract for a reviewed benefit program.
 *
 * Review freshness alone is deliberately insufficient: an otherwise fresh
 * program may have been unpublished, deactivated, expired, closed for
 * funding, or moved outside its current application window. Every
 * homeowner-facing read, action, promotion, and reminder must use this
 * predicate rather than treating isReviewedProgramCurrent as availability.
 */
export function isProgramActionableNow(
  program: ActionableReviewedProgram,
  source: ReviewedSourceFreshness,
  now = new Date(),
): boolean {
  if (!isReviewedProgramCurrent(program, source, now)) return false;
  if (!program.isActive || program.reviewStatus !== 'PUBLISHED') return false;
  if (program.expiresAt && program.expiresAt.getTime() <= now.getTime()) return false;
  if (program.fundingStatus === 'CLOSED') return false;
  if (
    program.applicationWindowOpensAt
    && program.applicationWindowOpensAt.getTime() > now.getTime()
  ) {
    return false;
  }
  if (
    program.applicationWindowClosesAt
    && program.applicationWindowClosesAt.getTime() < now.getTime()
  ) {
    return false;
  }
  return true;
}
