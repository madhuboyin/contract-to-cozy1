// apps/frontend/src/lib/api/adminContentGovernance.ts
//
// API client for the Admin knowledge editorial governance workspace
// (ADMIN_MODULE_FRD.md §10.6, Phase 4 slice).

import { api } from '@/lib/api/client';

export type KnowledgeLifecycleStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type AuthorAction = 'SUBMIT_FOR_REVIEW' | 'REVIVE_TO_DRAFT';
export type ReviewDecision = 'APPROVE' | 'RETURN_TO_DRAFT';
export type PublishAction = 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE';
export type LifecycleAction = AuthorAction | ReviewDecision | PublishAction;

export interface EditorialQueueItem {
  id: string;
  slug: string;
  title: string;
  status: KnowledgeLifecycleStatus;
  articleType: string;
  readingMinutes: number | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface EditorialQueues {
  reviewQueue: EditorialQueueItem[];
  approvedQueue: EditorialQueueItem[];
}

export interface TransitionResult {
  previousStatus: KnowledgeLifecycleStatus;
  status: KnowledgeLifecycleStatus;
  action: LifecycleAction;
}

const ENDPOINT_FOR_ACTION: Record<LifecycleAction, string> = {
  SUBMIT_FOR_REVIEW: 'author-action',
  REVIVE_TO_DRAFT: 'author-action',
  APPROVE: 'review-decision',
  RETURN_TO_DRAFT: 'review-decision',
  PUBLISH: 'publish-action',
  UNPUBLISH: 'publish-action',
  ARCHIVE: 'publish-action',
};

export async function fetchEditorialQueues(): Promise<EditorialQueues> {
  const res = await api.get<EditorialQueues>('/api/admin/content/knowledge/queues');
  return res.data;
}

export async function transitionKnowledgeArticle(
  articleId: string,
  action: LifecycleAction,
  reason: string,
): Promise<TransitionResult> {
  const res = await api.post<TransitionResult>(
    `/api/admin/content/knowledge/${articleId}/${ENDPOINT_FOR_ACTION[action]}`,
    { action, reason },
  );
  return res.data;
}
