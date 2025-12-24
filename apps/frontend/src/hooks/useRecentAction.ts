// apps/frontend/src/components/orchestration/hooks/useRecentAction.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestratedActionDTO } from '@/types';

type RecentActionState = {
  actionId: string;
  actionTitle: string;
  createdAt: number; // epoch ms
  dismissed: boolean;
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useRecentAction(storageKey: string) {
  const [recent, setRecent] = useState<RecentActionState | null>(null);

  // Load once
  useEffect(() => {
    const parsed = safeJsonParse<RecentActionState>(
      typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    );
    if (parsed) setRecent(parsed);
  }, [storageKey]);

  const persist = useCallback(
    (next: RecentActionState | null) => {
      setRecent(next);
      if (typeof window === 'undefined') return;

      if (!next) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
    },
    [storageKey]
  );

  const setScheduled = useCallback(
    (action: OrchestratedActionDTO) => {
      if (!action?.id) return;

      persist({
        actionId: action.id,
        actionTitle: action.title || 'Task',
        createdAt: Date.now(),
        dismissed: false,
      });
    },
    [persist]
  );

  const dismiss = useCallback(() => {
    if (!recent) return;
    persist({ ...recent, dismissed: true });
  }, [recent, persist]);

  const clear = useCallback(() => persist(null), [persist]);

  const visible = useMemo(() => {
    if (!recent) return false;
    return !recent.dismissed;
  }, [recent]);

  return {
    recent,
    visible,
    setScheduled,
    dismiss,
    clear,
  };
}
