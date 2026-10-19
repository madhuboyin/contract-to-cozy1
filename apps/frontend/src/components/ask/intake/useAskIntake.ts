import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import type { AskIntakeConfig, AskIntakeKind, AskIntakeView } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';
import { intakeFailureMessage } from './intakePresentation';

export type AskIntakeBusy = 'UPLOADING' | 'READING' | 'SAVING' | null;

/**
 * The file intake for one home. The server owns every state (the view it returns after each step); this only sequences the calls and holds
 * the latest view. Nothing is read until `read` is called with the person's acknowledgement, and no step writes to the home except
 * `addToHome` and `confirmLabel`.
 */
export function useAskIntake(propertyId: string | undefined, enabled: boolean) {
  const [config, setConfig] = useState<AskIntakeConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [view, setView] = useState<AskIntakeView | null>(null);
  const [busy, setBusy] = useState<AskIntakeBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!enabled || config) return;
    let cancelled = false;
    setConfigFailed(false);
    api.getAskIntakeConfig()
      .then((response) => { if (cancelled) return; if (!response.success || !response.data) throw new Error('config'); setConfig(response.data); })
      .catch((caught) => { if (cancelled) return; if (askServiceIsPaused(caught)) setPaused(true); else setConfigFailed(true); });
    return () => { cancelled = true; };
  }, [enabled, config]);

  const run = useCallback(async (kind: Exclude<AskIntakeBusy, null>, fallback: string, work: () => Promise<{ success: boolean; data?: AskIntakeView; message?: string }>): Promise<AskIntakeView | null> => {
    setBusy(kind);
    setError(null);
    try {
      const response = await work();
      if (!response.success || !response.data) throw new Error(response.message || fallback);
      if (mounted.current) setView(response.data);
      return response.data;
    } catch (caught) {
      if (askServiceIsPaused(caught)) { if (mounted.current) setPaused(true); } else if (mounted.current) setError(intakeFailureMessage(caught, fallback));
      return null;
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, []);

  const upload = useCallback((file: File, sensitivity: string) => propertyId
    ? run('UPLOADING', 'The file could not be added. Try again.', () => api.uploadAskIntakeFile(propertyId, file, sensitivity))
    : Promise.resolve(null), [propertyId, run]);

  const read = useCallback((kind: AskIntakeKind | 'AUTO', acknowledgedProcessing: boolean, inspection?: { reportType: string; inspectionDate: string }) => (propertyId && view)
    ? run('READING', 'The file could not be read. Try again, or keep it without reading.', () => api.analyzeAskIntake(propertyId, view.recordId, { kind, acknowledgedProcessing, inspection }))
    : Promise.resolve(null), [propertyId, view, run]);

  const reviewCandidate = useCallback((candidateId: string, action: 'CONFIRM' | 'CORRECT' | 'REJECT', value?: string) => (propertyId && view)
    ? run('SAVING', 'That decision could not be saved. Try again.', () => api.reviewAskIntakeCandidate(propertyId, view.recordId, candidateId, { action, value }))
    : Promise.resolve(null), [propertyId, view, run]);

  const addToHome = useCallback(() => (propertyId && view)
    ? run('SAVING', 'It could not be added. Nothing was changed.', () => api.promoteAskIntake(propertyId, view.recordId))
    : Promise.resolve(null), [propertyId, view, run]);

  const saveLabel = useCallback((patch: Record<string, string | null>) => (propertyId && view)
    ? run('SAVING', 'The label details could not be saved. Try again.', () => api.updateAskIntakeLabel(propertyId, view.recordId, patch))
    : Promise.resolve(null), [propertyId, view, run]);

  const confirmLabel = useCallback(() => (propertyId && view)
    ? run('SAVING', 'It could not be added. Nothing was changed.', () => api.confirmAskIntakeLabel(propertyId, view.recordId))
    : Promise.resolve(null), [propertyId, view, run]);

  const rejectLabel = useCallback(() => (propertyId && view)
    ? run('SAVING', 'That could not be saved. Try again.', () => api.dismissAskIntakeLabel(propertyId, view.recordId))
    : Promise.resolve(null), [propertyId, view, run]);

  const discard = useCallback(() => (propertyId && view)
    ? run('SAVING', 'The file could not be removed. Try again.', () => api.discardAskIntake(propertyId, view.recordId))
    : Promise.resolve(null), [propertyId, view, run]);

  const reset = useCallback(() => { setView(null); setError(null); setBusy(null); }, []);

  return { config, configFailed, view, busy, error, paused, upload, read, reviewCandidate, addToHome, saveLabel, confirmLabel, rejectLabel, discard, reset, clearError: () => setError(null), setError };
}
