'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { CandidateHome } from '@/features/ask/candidateHomes';

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50';
const MAX = 6;

/**
 * BUY-002: choose which of your homes to compare, and optionally what to compare, and keep that choice. Cozy then uses it whenever you ask to compare your homes
 * (a question that names something, such as "by price", still wins for that answer). One saved comparison per person; nothing here touches a home record.
 */
export function CandidateComparisonPicker({ homes, dimensions, onStatus }: { homes: CandidateHome[]; dimensions: Array<{ key: string; label: string }>; onStatus: (message: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [things, setThings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const homeIds = homes.map((home) => home.id).join(',');

  useEffect(() => {
    let live = true;
    api.getAskCandidateComparison().then((response) => {
      if (!live || !response.success) return;
      const comparison = response.data?.comparison ?? null;
      setSaved(Boolean(comparison));
      setSelected(comparison ? comparison.candidateIds : homes.slice(0, MAX).map((home) => home.id));
      setThings(comparison ? comparison.dimensions : []);
    }).catch(() => { if (live) setSelected(homes.slice(0, MAX).map((home) => home.id)); });
    return () => { live = false; };
    // homes is read through its ids so an edit to a field does not reset the choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeIds]);

  const toggle = (list: string[], key: string, limit = Infinity): string[] => (list.includes(key) ? list.filter((item) => item !== key) : list.length >= limit ? list : [...list, key]);
  const valid = selected.filter((id) => homes.some((home) => home.id === id));
  const save = async () => {
    if (valid.length < 2 || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await api.saveAskCandidateComparison({ candidateIds: valid, dimensions: things });
      if (!response.success) throw new Error(response.message || 'The comparison could not be saved.');
      setSaved(true); onStatus('Comparison saved. Ask to compare your homes and Cozy will use it.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The comparison could not be saved.'); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await api.clearAskCandidateComparison();
      if (!response.success) throw new Error(response.message || 'The comparison could not be cleared.');
      setSaved(false); setSelected(homes.slice(0, MAX).map((home) => home.id)); setThings([]); onStatus('Saved comparison cleared. Cozy will compare all your homes.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The comparison could not be cleared.'); } finally { setBusy(false); }
  };

  return (
    <details className="rounded-xl border border-slate-200 px-3 py-2" data-candidate-comparison="">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">What to compare{saved ? ' (saved)' : ''}</summary>
      <div className="mt-2 space-y-3">
        <fieldset>
          <legend className="text-sm font-medium text-slate-900">Homes (choose 2 to {MAX})</legend>
          <div className="mt-1 flex flex-col gap-1">
            {homes.map((home) => (
              <label key={home.id} className="flex min-h-9 items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={selected.includes(home.id)} onChange={() => setSelected((current) => toggle(current, home.id, MAX))} />
                <span>{home.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {dimensions.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium text-slate-900">Things to compare (none chosen means the usual set)</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {dimensions.map((dimension) => (
                <label key={dimension.key} className="flex min-h-9 items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={things.includes(dimension.key)} onChange={() => setThings((current) => toggle(current, dimension.key))} />
                  <span>{dimension.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={busy || valid.length < 2} onClick={() => void save()}>Save comparison</button>
          {saved && <button type="button" className={BUTTON} disabled={busy} onClick={() => void clear()}>Clear saved comparison</button>}
        </div>
        {valid.length < 2 && <p className="text-xs text-slate-600">Choose at least two homes to save a comparison.</p>}
      </div>
    </details>
  );
}
