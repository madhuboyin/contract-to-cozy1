'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { fieldLabel, fieldSourceText, promotionHeadline, type PromotionResult, type PromotionReview } from '@/features/ask/candidatePromotion';

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50';
const PRIMARY = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50';

/** BICC-4.3: review, then explicitly confirm, moving a candidate home to your homes as under contract. Nothing is created until the confirm button. */
export function CandidatePromotionPanel({ candidateId, label, onDone, onCancel }: { candidateId: string; label: string; onDone: (result: PromotionResult) => void; onCancel: () => void }) {
  const [review, setReview] = useState<PromotionReview | null>(null);
  const [closeDate, setCloseDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await api.reviewAskCandidatePromotion(candidateId);
        if (!response.success || !response.data) throw new Error(response.message || 'That home could not be reviewed.');
        if (live) setReview(response.data);
      } catch (caught) { if (live) setError(caught instanceof Error ? caught.message : 'That home could not be reviewed.'); }
    })();
    return () => { live = false; };
  }, [candidateId]);

  const confirm = async (linkToExistingHome: boolean) => {
    if (!review || busy) return;
    if (closeDate && Number.isNaN(Date.parse(closeDate))) { setError('Enter a valid closing date.'); return; }
    setBusy(true); setError(null);
    try {
      const response = await api.confirmAskCandidatePromotion(candidateId, { token: review.token, linkToExistingHome, targetCloseDate: closeDate && !linkToExistingHome ? new Date(closeDate).toISOString() : null });
      if (!response.success || !response.data) throw new Error(response.message || 'That home could not be moved.');
      onDone(response.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That home could not be moved.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-800">Moving <strong>{label}</strong> to your homes.</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {!review && !error && <p className="text-sm text-slate-600">Checking this home…</p>}
      {review && (
        <>
          <p className="text-sm text-slate-700">{promotionHeadline(review)}</p>
          {review.proposal.fields.length > 0 && (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm" aria-label="What will be carried over">
              {review.proposal.fields.map((field) => (
                <li key={field.field} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="font-medium text-slate-900">{fieldLabel(field.field)}: {String(field.value)}</span><span className="text-xs text-slate-500">{fieldSourceText(field)}</span></li>
              ))}
            </ul>
          )}
          <details className="text-xs text-slate-600"><summary className="cursor-pointer">Not carried over</summary><ul className="mt-1 list-disc pl-5">{review.proposal.notCarriedOver.map((item) => <li key={item}>{item}</li>)}</ul></details>
          {review.canPromote && !review.existingHome && (
            <div>
              <label htmlFor="promotion-close-date" className="block text-xs font-medium text-slate-700">Expected closing date (optional)</label>
              <input id="promotion-close-date" type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} className="mt-1 min-h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" />
            </div>
          )}
          <p className="text-xs text-slate-500">Your candidate stays in your list, marked as moved, so you can see where it went.</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {review?.canPromote && !review.existingHome && <button type="button" className={PRIMARY} disabled={busy} onClick={() => void confirm(false)}>{busy ? 'Moving…' : 'Create it as under contract'}</button>}
        {review?.canPromote && review.existingHome && <button type="button" className={PRIMARY} disabled={busy} onClick={() => void confirm(true)}>{busy ? 'Linking…' : 'Link to my existing home'}</button>}
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>Not now</button>
      </div>
    </div>
  );
}
