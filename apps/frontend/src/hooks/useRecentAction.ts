// apps/frontend/src/hooks/useRecentAction.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { OrchestratedActionDTO } from '@/types';

const STORAGE_KEY = 'recentScheduledAction';

type StoredAction = {
  actionId: string;
  title: string;
  ts: number;
};

export function useRecentAction(actions: OrchestratedActionDTO[]) {
  const [recentAction, setRecentAction] =
    useState<OrchestratedActionDTO | null>(null);

  // Restore on load / refresh
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed: StoredAction = JSON.parse(raw);
      const found = actions.find(a => a.id === parsed.actionId);
      if (found) {
        setRecentAction(found);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [actions]);

  const persist = useCallback((action: OrchestratedActionDTO) => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        actionId: action.id,
        title: action.title,
        ts: Date.now(),
      })
    );
    setRecentAction(action);
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setRecentAction(null);
  }, []);

  return {
    recentAction,
    persistRecentAction: persist,
    clearRecentAction: clear,
  };
}
