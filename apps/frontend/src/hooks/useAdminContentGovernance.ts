// apps/frontend/src/hooks/useAdminContentGovernance.ts
//
// React Query hooks for the Admin knowledge editorial governance workspace.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchEditorialQueues,
  LifecycleAction,
  transitionKnowledgeArticle,
} from '@/lib/api/adminContentGovernance';

export function useEditorialQueues() {
  return useQuery({
    queryKey: ['admin-editorial-queues'],
    queryFn: fetchEditorialQueues,
    staleTime: 15_000,
  });
}

export function useTransitionKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, action, reason }: { articleId: string; action: LifecycleAction; reason: string }) =>
      transitionKnowledgeArticle(articleId, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-editorial-queues'] });
      qc.invalidateQueries({ queryKey: ['admin-work-queues'] });
    },
  });
}
