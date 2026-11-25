'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

export type BuyerLifecycleMode = 'PROSPECTIVE_BUYER' | null | undefined;

// BICC-D42/BUY-009: explicit, per-conversation buyer mode. undefined = never chosen here (the server keeps its stored value);
// null = cleared. Reset per conversation, then restored when reopening one (the server keeps it per session).
export function useBuyerMode(sessionId: string) {
  const state = useState<BuyerLifecycleMode>(undefined);
  const setMode = state[1];
  useEffect(() => {
    setMode(undefined);
    if (!sessionId) return undefined;
    const controller = new AbortController();
    api.getAskSession(sessionId, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted && response.success && response.data?.lifecycleMode === 'PROSPECTIVE_BUYER') setMode('PROSPECTIVE_BUYER'); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [sessionId, setMode]);
  return state;
}
