// apps/frontend/src/hooks/useAdminReviewModeration.ts
//
// React Query hooks for the Admin Review Moderation Queue.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminReviewDetail,
  fetchAdminReviewQueue,
  moderateAdminReview,
  ModerationAction,
  ReviewStatus,
} from '@/lib/api/adminReviewModeration';

export function useAdminReviewQueue(status: ReviewStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['admin-review-queue', status ?? 'QUEUE', page],
    queryFn: () => fetchAdminReviewQueue(status, page),
    staleTime: 15_000,
  });
}

export function useAdminReviewDetail(reviewId: string | null) {
  return useQuery({
    queryKey: ['admin-review-detail', reviewId],
    queryFn: () => fetchAdminReviewDetail(reviewId as string),
    enabled: !!reviewId,
    staleTime: 5_000,
  });
}

export function useModerateAdminReview(reviewId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: ModerationAction; reason: string }) =>
      moderateAdminReview(reviewId as string, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-review-detail', reviewId] });
      qc.invalidateQueries({ queryKey: ['admin-review-queue'] });
    },
  });
}
