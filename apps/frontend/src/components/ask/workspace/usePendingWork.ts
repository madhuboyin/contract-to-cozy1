import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskPendingWorkItem } from '@/features/ask/types';
import { askServiceIsPaused } from './support';

// Pending work (requests waiting on the person, across conversations): the load for the selected home, and dismissing
// one. Moved out of AskWorkspace unchanged (P2, FRD v1.105). Resuming stays in the workspace because it switches the
// open conversation.
export function usePendingWork({ selectedPropertyId, propertyMismatch, availabilityEpoch, loading, setError, setServiceUnavailable, onDismissed }: {
  selectedPropertyId: string | undefined;
  propertyMismatch: boolean;
  availabilityEpoch: number;
  loading: boolean;
  setError: (value: string | null) => void;
  setServiceUnavailable: (value: boolean) => void;
  onDismissed: () => void;
}) {
  const [pendingWork, setPendingWork] = useState<AskPendingWorkItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [dismissingPendingId, setDismissingPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (propertyMismatch) return;
    const controller = new AbortController();
    setPendingLoading(true);
    api.getAskPendingWork(selectedPropertyId, { signal: controller.signal })
      .then((response) => setPendingWork(response.success && response.data ? response.data.items : []))
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setPendingWork([]);
          if (askServiceIsPaused(caught)) setServiceUnavailable(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setPendingLoading(false); });
    return () => controller.abort();
  }, [selectedPropertyId, propertyMismatch, availabilityEpoch, setServiceUnavailable]);

  const dismissPendingWork = async (item: AskPendingWorkItem) => {
    if (continuingId || dismissingPendingId || loading || item.pendingKind === 'COMMAND_RECOVERY') return;
    setDismissingPendingId(item.execution.executionId);
    setError(null);
    try {
      const response = await api.cancelAskExecution(item.execution.executionId);
      if (!response.success || !response.data || response.data.status !== 'CANCELLED') throw new Error(response.message || 'Could not dismiss this pending action.');
      setPendingWork((current) => current.filter((pending) => pending.execution.executionId !== item.execution.executionId));
      onDismissed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss this pending action.');
    } finally {
      setDismissingPendingId(null);
    }
  };

  return { pendingWork, setPendingWork, pendingLoading, continuingId, setContinuingId, dismissingPendingId, dismissPendingWork };
}
