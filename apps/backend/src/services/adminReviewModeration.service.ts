// apps/backend/src/services/adminReviewModeration.service.ts
//
// Review Moderation Queue backend (ADMIN_MODULE_FRD.md §10.5, Phase 2 slice).
// Queue/detail reads plus one governed action: a moderation decision
// (approve/reject/flag/restore) with required reason and moderator
// attribution. Public provider-review reads (provider.service.ts) only ever
// surface APPROVED reviews and compute rating stats live from them, so a
// moderation transition propagates to the marketplace with no denormalized
// aggregates to maintain here.

import { Request } from 'express';
import { AdminCaseSeverity, Prisma, ReviewStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { createCase } from './adminCase.service';

export class AdminReviewModerationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminReviewModerationError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

export type ModerationAction = 'APPROVE' | 'REJECT' | 'FLAG' | 'RESTORE';

/**
 * Governed transitions (FRD §10.5: "approve, reject, flag/escalate, restore").
 * FLAG on an APPROVED review pulls it out of public view for re-review;
 * RESTORE sends a rejected/flagged review back to PENDING for a fresh
 * decision rather than silently re-publishing it.
 */
const TRANSITIONS: Record<ModerationAction, { from: ReviewStatus[]; to: ReviewStatus }> = {
  APPROVE: { from: ['PENDING', 'FLAGGED'], to: 'APPROVED' },
  REJECT: { from: ['PENDING', 'FLAGGED'], to: 'REJECTED' },
  FLAG: { from: ['PENDING', 'APPROVED'], to: 'FLAGGED' },
  RESTORE: { from: ['REJECTED', 'FLAGGED'], to: 'PENDING' },
};

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true } as const;
const PROVIDER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  providerProfile: { select: { businessName: true } },
} as const;

export interface ListReviewsInput {
  status?: ReviewStatus;
  page?: number;
  limit?: number;
}

/**
 * Moderation queue. Without an explicit status filter it shows the actionable
 * queue (PENDING + FLAGGED), oldest first so the longest-waiting review is
 * handled next.
 */
export async function listReviews(input: ListReviewsInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);
  const where: Prisma.ReviewWhereInput = input.status
    ? { status: input.status }
    : { status: { in: ['PENDING', 'FLAGGED'] } };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        rating: true,
        title: true,
        content: true,
        status: true,
        createdAt: true,
        moderatedAt: true,
        author: { select: AUTHOR_SELECT },
        provider: { select: PROVIDER_SELECT },
      },
    }),
    prisma.review.count({ where }),
  ]);

  return { reviews, total, page, limit };
}

/** Reviews-by-status counts for one user (as author or as provider). */
async function statusCounts(field: 'authorId' | 'providerId', userId: string) {
  const grouped = await prisma.review.groupBy({
    by: ['status'],
    where: { [field]: userId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, FLAGGED: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;
  return counts;
}

/**
 * Moderation detail (FRD §10.5: "Show review, booking context, author/provider
 * history ... without exposing unrelated private data"). History is counts
 * only — a moderator sees whether an author's reviews are habitually rejected,
 * not the other reviews' content. No emails, payment, or property data.
 */
export async function getReviewDetail(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      rating: true,
      title: true,
      content: true,
      qualityRating: true,
      communicationRating: true,
      valueRating: true,
      professionalismRating: true,
      status: true,
      moderatedAt: true,
      moderatedBy: true,
      response: true,
      respondedAt: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      provider: { select: PROVIDER_SELECT },
      booking: {
        select: {
          id: true,
          bookingNumber: true,
          category: true,
          status: true,
          scheduledDate: true,
          completedAt: true,
          service: { select: { name: true, category: true } },
        },
      },
    },
  });

  if (!review) {
    throw new AdminReviewModerationError('REVIEW_NOT_FOUND', `No review with id "${reviewId}".`);
  }

  const [authorReviewCounts, providerReviewCounts, providerApprovedStats] = await Promise.all([
    statusCounts('authorId', review.author.id),
    statusCounts('providerId', review.provider.id),
    prisma.review.aggregate({
      where: { providerId: review.provider.id, status: 'APPROVED' },
      _avg: { rating: true },
    }),
  ]);

  return {
    ...review,
    authorHistory: { reviewCounts: authorReviewCounts },
    providerHistory: {
      reviewCounts: providerReviewCounts,
      approvedAverageRating: providerApprovedStats._avg.rating,
    },
  };
}

export interface ModerateReviewInput {
  reviewId: string;
  actorId: string;
  action: ModerationAction;
  reason: string;
  /** Policy version the decision was made under (FRD §10.5) — recorded in the audit trail. */
  policyVersion?: string;
}

/**
 * Governed moderation decision. Requires reason (enforced by validator) and
 * records moderator attribution on the review itself (moderatedAt/moderatedBy)
 * plus a full audit entry. An admin who is a party to the review (its author
 * or the reviewed provider) cannot moderate it.
 */
export async function moderateReview(input: ModerateReviewInput, ctx: ActionContext = {}) {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: { id: true, status: true, authorId: true, providerId: true, bookingId: true },
  });
  if (!review) {
    throw new AdminReviewModerationError('REVIEW_NOT_FOUND', `No review with id "${input.reviewId}".`);
  }

  if (input.actorId === review.authorId || input.actorId === review.providerId) {
    throw new AdminReviewModerationError(
      'SELF_MODERATION_FORBIDDEN',
      'An administrator cannot moderate a review they wrote or received.'
    );
  }

  const transition = TRANSITIONS[input.action];
  if (!transition) {
    throw new AdminReviewModerationError('INVALID_ACTION', `"${input.action}" is not a moderation action.`);
  }
  if (!transition.from.includes(review.status)) {
    throw new AdminReviewModerationError(
      'INVALID_TRANSITION',
      `Cannot ${input.action} a ${review.status} review.`
    );
  }

  await prisma.review.update({
    where: { id: input.reviewId },
    data: {
      status: transition.to,
      moderatedAt: new Date(),
      moderatedBy: input.actorId,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_MODERATE_REVIEW',
    entityType: 'REVIEW',
    entityId: input.reviewId,
    capability: 'REVIEW_MODERATE',
    reason: input.reason,
    disposition: input.action,
    oldValues: { status: review.status } as Prisma.InputJsonValue,
    newValues: { status: transition.to } as Prisma.InputJsonValue,
    relatedRefs: {
      policyVersion: input.policyVersion ?? null,
      bookingId: review.bookingId,
      authorId: review.authorId,
      providerId: review.providerId,
    },
    req: ctx.req,
  });

  return { previousStatus: review.status, status: transition.to, action: input.action };
}

export interface RequestInvestigationInput {
  reviewId: string;
  actorId: string;
  reason: string;
  severity?: AdminCaseSeverity;
}

/**
 * FRD §10.5's fifth moderation action, "request investigation": opens a
 * REVIEW_INVESTIGATION case linked to the review instead of changing the
 * review's status — the review stays wherever it is in the moderation flow
 * while the case is worked. Authorized under REVIEW_MODERATE (the moderator
 * asking) even though working the case afterwards needs SUPPORT_CASE_MANAGE.
 */
export async function requestReviewInvestigation(input: RequestInvestigationInput, ctx: ActionContext = {}) {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: { id: true, status: true, authorId: true, providerId: true, title: true },
  });
  if (!review) {
    throw new AdminReviewModerationError('REVIEW_NOT_FOUND', `No review with id "${input.reviewId}".`);
  }

  if (input.actorId === review.authorId || input.actorId === review.providerId) {
    throw new AdminReviewModerationError(
      'SELF_MODERATION_FORBIDDEN',
      'An administrator cannot request an investigation of a review they wrote or received.'
    );
  }

  return createCase(
    {
      actorId: input.actorId,
      type: 'REVIEW_INVESTIGATION',
      severity: input.severity ?? 'MEDIUM',
      title: `Investigate review "${review.title ?? review.id}" (${review.status})`,
      description: input.reason,
      entityType: 'REVIEW',
      entityId: review.id,
      capability: 'REVIEW_MODERATE',
      auditAction: 'ADMIN_REQUEST_REVIEW_INVESTIGATION',
    },
    ctx
  );
}
