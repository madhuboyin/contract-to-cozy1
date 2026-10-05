'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api/client';
import type { FollowUpItem } from '@/features/ask/followUps';

// "Not now" / "Not relevant" on a curated starter (exact-four). The server resolves the action from its own stored offer and decides what is
// dismissible; the chip is hidden only once the server accepts the dismissal (it then stays out of later answers). A refusal or a failure leaves it.
export function useStarterDismissal(latestExecutionId: string | undefined) {
  const [dismissedActionIds, setDismissedActionIds] = useState<ReadonlySet<string>>(new Set());
  const dismiss = useCallback(async (item: Extract<FollowUpItem, { kind: 'ACTION' }>, reason: 'NOT_NOW' | 'NOT_RELEVANT') => {
    if (!latestExecutionId) return;
    try {
      const response = await api.dismissSuggestedAction(latestExecutionId, item.action.id, reason);
      if (response.success) setDismissedActionIds((prior) => new Set([...prior, item.action.id]));
    } catch { /* the chip stays; nothing else changes */ }
  }, [latestExecutionId]);
  const visible = useCallback((items: FollowUpItem[]) => items.filter((item) => item.kind !== 'ACTION' || !dismissedActionIds.has(item.action.id)), [dismissedActionIds]);
  return { dismiss, visible };
}
