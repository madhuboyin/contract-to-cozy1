import {
  HiddenAssetSourceStatus,
} from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewedSourceFreshness {
  status: HiddenAssetSourceStatus;
  officialUrl: string | null;
  lastReviewedAt: Date | null;
  reviewSlaDays: number;
}

export interface ReviewedProgramFreshness {
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
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
