'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api/client';
import { CandidatePromotionPanel } from './CandidatePromotionPanel';
import { CandidateComparisonPicker } from './CandidateComparisonPicker';
import { CANDIDATE_FIELDS, changedFields, homeSummaryLine, parseCandidateForm, toForm, type CandidateForm, type CandidateHome, type FormIssues } from '@/features/ask/candidateHomes';

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50';
const PRIMARY = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50';
const GROUP_TITLES: Record<string, string> = { HOME: 'The home', LISTING: 'What the listing says', COSTS: 'Costs you know or expect', FINANCING: 'Your financing for this home' };

type View = { kind: 'LIST' } | { kind: 'FORM'; home: CandidateHome | null } | { kind: 'REMOVE'; home: CandidateHome } | { kind: 'PROMOTE'; home: CandidateHome } | { kind: 'DELETE_RECORD'; home: CandidateHome };

/**
 * The buyer's own candidate homes (BICC-4.1), kept inside Ask. Add a home, change what you entered, or remove it; nothing is saved until Save, a blank field means
 * "not entered" (never zero), and the comparison and cost answers use exactly what is here. These are the buyer's own numbers, not a lender's.
 */
export function CandidateHomesDialog({ open, onOpenChange, onCompare, returnFocusRef }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCompare?: () => void; returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [homes, setHomes] = useState<CandidateHome[] | null>(null);
  const [moved, setMoved] = useState<CandidateHome[]>([]);
  const [dimensions, setDimensions] = useState<Array<{ key: string; label: string }>>([]);
  const [view, setView] = useState<View>({ kind: 'LIST' });
  const [form, setForm] = useState<CandidateForm>({});
  const [issues, setIssues] = useState<FormIssues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await api.listAskCandidates();
      if (!response.success || !response.data) throw new Error(response.message || 'Your homes could not be loaded.');
      setHomes(response.data.candidates);
      setDimensions(response.data.dimensions ?? []);
      // Homes already moved stay visible (audit); a failure here must not hide the active list.
      api.listAskCandidates({ status: 'PROMOTED' }).then((r) => setMoved(r.success && r.data ? r.data.candidates : [])).catch(() => setMoved([]));
    } catch (caught) { setHomes([]); setError(caught instanceof Error ? caught.message : 'Your homes could not be loaded.'); }
  }, []);

  useEffect(() => {
    if (!open) { setHomes(null); setMoved([]); setView({ kind: 'LIST' }); setForm({}); setIssues({}); setError(null); setStatus(null); setBusy(false); return; }
    void load();
  }, [open, load]);

  const startForm = (home: CandidateHome | null) => { setForm(toForm(home)); setIssues({}); setError(null); setStatus(null); setView({ kind: 'FORM', home }); };
  const backToList = (message: string | null = null) => { setView({ kind: 'LIST' }); setIssues({}); setError(null); setStatus(message); };

  const save = async () => {
    if (view.kind !== 'FORM' || busy) return;
    const parsed = parseCandidateForm(form);
    if (!parsed.ok) { setIssues(parsed.issues); setError('Check the highlighted fields.'); return; }
    setIssues({}); setError(null);
    const stored = view.home;
    // An edit sends only what changed, so a fact you did not touch keeps its original source and date.
    const payload = stored ? changedFields(stored, parsed.payload) : parsed.payload;
    if (stored && !Object.keys(payload).length) { backToList('Nothing changed.'); return; }
    setBusy(true);
    try {
      const response = stored ? await api.updateAskCandidate(stored.id, payload) : await api.createAskCandidate(payload);
      if (!response.success) throw new Error(response.message || 'That home could not be saved.');
      await load();
      backToList(stored ? 'Saved your changes.' : 'Added the home.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That home could not be saved.'); }
    finally { setBusy(false); }
  };

  const remove = async (home: CandidateHome) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await api.deleteAskCandidate(home.id);
      if (!response.success) throw new Error(response.message || 'That home could not be removed.');
      await load();
      backToList(`Removed ${home.label}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That home could not be removed.'); }
    finally { setBusy(false); }
  };

  const deleteRecord = async (home: CandidateHome) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await api.deleteAskPromotedCandidateRecord(home.id);
      if (!response.success) throw new Error(response.message || 'That record could not be deleted.');
      await load();
      backToList(`Deleted the candidate record for ${home.label}. The home itself was not changed.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That record could not be deleted.'); }
    finally { setBusy(false); }
  };

  const groups = ['HOME', 'LISTING', 'COSTS', 'FINANCING'] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto"
        onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }}
      >
        <DialogTitle ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-slate-950 focus:outline-none">
          {view.kind === 'FORM' ? (view.home ? 'Change this home' : 'Add a home you are considering') : 'Homes I’m considering'}
        </DialogTitle>
        <DialogDescription className="text-sm text-slate-600">
          Your own list, kept apart from your home records. Leave a field blank if you do not know it: it is shown as “not entered”, never as zero. Nothing is saved until you choose Save.
        </DialogDescription>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-900">{status}</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {view.kind === 'LIST' && (
          <div className="space-y-3">
            {homes === null && <p className="text-sm text-slate-600">Loading your homes…</p>}
            {homes !== null && !homes.length && <p className="text-sm text-slate-700">You have not added a home yet. Add two or more and Cozy can compare them side by side and show what each would cost to buy and own.</p>}
            {homes !== null && homes.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200" aria-label="Your homes">
                {homes.map((home) => (
                  <li key={home.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{homeSummaryLine(home)}</span>
                    <span className="flex gap-2">
                      <button type="button" className={BUTTON} onClick={() => { setStatus(null); setView({ kind: 'PROMOTE', home }); }} aria-label={`Under contract on ${home.label}`}>Under contract?</button>
                      <button type="button" className={BUTTON} onClick={() => startForm(home)} aria-label={`Change ${home.label}`}>Change</button>
                      <button type="button" className={BUTTON} onClick={() => { setStatus(null); setView({ kind: 'REMOVE', home }); }} aria-label={`Remove ${home.label}`}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {homes !== null && homes.length >= 2 && <CandidateComparisonPicker homes={homes} dimensions={dimensions} onStatus={setStatus} />}
            {moved.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Moved to your homes</h3>
                <ul className="mt-1 divide-y divide-slate-200 rounded-xl border border-slate-200" aria-label="Homes already moved to your homes">
                  {moved.map((home) => (
                    <li key={home.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700">
                      <span>{home.label} · now in your homes as under contract</span>
                      <button type="button" className={BUTTON} onClick={() => { setStatus(null); setView({ kind: 'DELETE_RECORD', home }); }} aria-label={`Delete candidate record for ${home.label}`}>Delete candidate record</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={PRIMARY} onClick={() => startForm(null)}>Add a home</button>
              {onCompare && homes !== null && homes.length >= 2 && <button type="button" className={BUTTON} onClick={() => { onOpenChange(false); onCompare(); }}>Compare my homes</button>}
              <button type="button" className={BUTTON} onClick={() => onOpenChange(false)}>Close</button>
            </div>
          </div>
        )}

        {view.kind === 'PROMOTE' && (
          <CandidatePromotionPanel
            candidateId={view.home.id} label={view.home.label} onCancel={() => backToList()}
            onDone={(result) => { void load(); backToList(result.linkedExisting ? `Linked ${view.home.label} to your existing home.` : `${view.home.label} is now in your homes as under contract.`); }}
          />
        )}

        {view.kind === 'DELETE_RECORD' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800">Delete the candidate record for <strong>{view.home.label}</strong>?</p>
            <p className="text-sm text-slate-700">This permanently removes the candidate details and the link to the home it became. It does not delete or change the home in your account, and it cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => void deleteRecord(view.home)}>{busy ? 'Deleting…' : 'Delete candidate record'}</button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => backToList()}>Keep it</button>
            </div>
          </div>
        )}

        {view.kind === 'REMOVE' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800">Remove <strong>{view.home.label}</strong> from your list? This cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => void remove(view.home)}>{busy ? 'Removing…' : 'Remove it'}</button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => backToList()}>Keep it</button>
            </div>
          </div>
        )}

        {view.kind === 'FORM' && (
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4" noValidate>
            {groups.map((group) => (
              <fieldset key={group} className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">{GROUP_TITLES[group]}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CANDIDATE_FIELDS.filter((field) => field.group === group).map((field) => {
                    const id = `candidate-${field.key}`; const problem = issues[field.key];
                    return (
                      <div key={field.key} className={field.key === 'notes' || field.key === 'label' ? 'sm:col-span-2' : undefined}>
                        <label htmlFor={id} className="block text-xs font-medium text-slate-700">{field.label}{field.required ? ' (required)' : ''}</label>
                        <input
                          id={id} value={form[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                          inputMode={field.kind === 'text' ? 'text' : 'decimal'} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-problem` : field.help ? `${id}-help` : undefined}
                          className={`mt-1 min-h-11 w-full rounded-xl border px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${problem ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {problem ? <p id={`${id}-problem`} className="mt-1 text-xs text-red-700">{problem}</p> : field.help ? <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{field.help}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => backToList()}>Cancel</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
