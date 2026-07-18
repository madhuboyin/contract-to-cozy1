// apps/frontend/src/lib/api/adminReviewModeration.ts
//
// API client for the Admin Review Moderation Queue
// (ADMIN_MODULE_FRD.md §10.5, Phase 2 slice). Admin-only — never used by
// the public provider-review views.

import { api } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
export type ModerationAction = 'APPROVE' | 'REJECT' | 'FLAG' | 'RESTORE';

export interface ReviewPartySummary {
  id: string;
  firstName: string;
  lastName: string;
  providerProfile?: { businessName: string } | null;
}

export interface ReviewQueueItem {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  status: ReviewStatus;
  createdAt: string;
  moderatedAt: string | null;
  author: ReviewPartySummary;
  provider: ReviewPartySummary;
}

export interface ReviewQueueResult {
  reviews: ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ReviewDetail extends ReviewQueueItem {
  qualityRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  professionalismRating: number | null;
  moderatedBy: string | null;
  response: string | null;
  respondedAt: string | null;
  booking: {
    id: string;
    bookingNumber: string;
    category: string;
    status: string;
    scheduledDate: string | null;
    completedAt: string | null;
    service: { name: string; category: string };
  };
  authorHistory: { reviewCounts: Record<ReviewStatus, number> };
  providerHistory: {
    reviewCounts: Record<ReviewStatus, number>;
    approvedAverageRating: number | null;
  };
}

export interface ModerationResult {
  previousStatus: ReviewStatus;
  status: ReviewStatus;
  action: ModerationAction;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchAdminReviewQueue(
  status?: ReviewStatus,
  page = 1,
): Promise<ReviewQueueResult> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set('status', status);
  const res = await api.get<ReviewQueueResult>(`/api/admin/reviews?${params.toString()}`);
  return res.data;
}

export async function fetchAdminReviewDetail(reviewId: string): Promise<ReviewDetail> {
  const res = await api.get<ReviewDetail>(`/api/admin/reviews/${reviewId}`);
  return res.data;
}

export async function moderateAdminReview(
  reviewId: string,
  action: ModerationAction,
  reason: string,
): Promise<ModerationResult> {
  const res = await api.post<ModerationResult>(`/api/admin/reviews/${reviewId}/moderate`, {
    action,
    reason,
  });
  return res.data;
}
