import { useCallback, useEffect, useState } from 'react';

// ACUI-006 (FRD v1.116): on a fresh calm landing the desktop history rail is a narrow strip with a labeled History control, so
// unfinished work and the composer lead. An explicit choice is remembered and wins; a search in progress always keeps it open.
export const HISTORY_RAIL_STORAGE_KEY = 'askHistoryRail';
export type HistoryRailPreference = 'expanded' | 'collapsed' | null;

export function resolveHistoryRailExpanded({ calm, landingVisible, preference, searching }: { calm: boolean; landingVisible: boolean; preference: HistoryRailPreference; searching: boolean }): boolean {
  if (!calm) return true;
  if (searching) return true;
  if (preference) return preference === 'expanded';
  return !landingVisible;
}

const read = (): HistoryRailPreference => {
  try {
    const value = window.localStorage.getItem(HISTORY_RAIL_STORAGE_KEY);
    return value === 'expanded' || value === 'collapsed' ? value : null;
  } catch { return null; }
};

export function useHistoryRailPreference(): [HistoryRailPreference, (next: Exclude<HistoryRailPreference, null>) => void] {
  // Read after mount so the server render and the first client render agree.
  const [preference, setPreference] = useState<HistoryRailPreference>(null);
  useEffect(() => { setPreference(read()); }, []);
  const choose = useCallback((next: Exclude<HistoryRailPreference, null>) => {
    setPreference(next);
    try { window.localStorage.setItem(HISTORY_RAIL_STORAGE_KEY, next); } catch { /* unavailable storage: the choice lasts for this visit */ }
  }, []);
  return [preference, choose];
}
