'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ConfirmQuoteReviewRequest, QuoteReview, QuoteReviewValueState } from '../service-price-radar/servicePriceRadarApi';

// The review step of the Quote Comparison confirmation contract (design §3.4, FRD v1.360). It shows every value a confirmation would affirm, with its
// state, lets the person remove a line item or term they do not recognise, and sends a request that names exactly what was shown. Nothing is
// confirmed that is not on this screen.

const STATE_LABEL: Record<QuoteReviewValueState, string> = {
  EXTRACTED_UNCONFIRMED: 'As extracted',
  HOMEOWNER_CONFIRMED: 'Already confirmed',
  HOMEOWNER_CORRECTED: 'Corrected by you',
  NOT_APPLICABLE: 'Not applicable',
};
const STATE_CLASS: Record<QuoteReviewValueState, string> = {
  EXTRACTED_UNCONFIRMED: 'bg-amber-100 text-amber-900',
  HOMEOWNER_CONFIRMED: 'bg-emerald-100 text-emerald-900',
  HOMEOWNER_CORRECTED: 'bg-sky-100 text-sky-900',
  NOT_APPLICABLE: 'bg-slate-100 text-slate-700',
};
const money = (value: number | null) => (value === null ? null : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const shown = (value: string | number | boolean | null) => (value === null || value === '' ? 'Not recorded' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value));

function StateChip({ state }: { state: QuoteReviewValueState }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>;
}

export function buildConfirmRequest(review: QuoteReview, removedLineItems: ReadonlySet<string>, removedTerms: ReadonlySet<string>): ConfirmQuoteReviewRequest {
  return {
    reviewFingerprint: review.fingerprint,
    lineItemIds: review.lineItems.map((item) => item.id),
    termIds: review.terms.map((term) => term.id),
    factKeys: review.facts.map((fact) => fact.fieldKey),
    rejectedLineItemIds: review.lineItems.filter((item) => removedLineItems.has(item.id)).map((item) => item.id),
    rejectedTermIds: review.terms.filter((term) => removedTerms.has(term.id)).map((term) => term.id),
  };
}

export function QuoteReviewDialog({
  open, vendorName, review, loading, busy, error, onCancel, onConfirm,
}: {
  open: boolean;
  vendorName: string;
  review: QuoteReview | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (request: ConfirmQuoteReviewRequest) => void;
}) {
  const [removedLineItems, setRemovedLineItems] = React.useState<Set<string>>(new Set());
  const [removedTerms, setRemovedTerms] = React.useState<Set<string>>(new Set());
  // A different fingerprint is a different set of values: earlier removals do not carry over to values the person has not seen.
  React.useEffect(() => { setRemovedLineItems(new Set()); setRemovedTerms(new Set()); }, [review?.fingerprint]);
  const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };
  const keptLineItems = review ? review.lineItems.length - removedLineItems.size : 0;
  const keptTerms = review ? review.terms.length - removedTerms.size : 0;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review {vendorName}&rsquo;s quote</DialogTitle>
          <DialogDescription>
            Confirming says that everything listed here matches the quote you were given. Nothing that is not listed is confirmed. Remove anything you do not recognise.
          </DialogDescription>
        </DialogHeader>
        {loading || !review ? (
          <p className="py-6 text-sm text-slate-600" role="status">{error ?? 'Loading what will be confirmed…'}</p>
        ) : (
          <div className="space-y-5">
            <section aria-label="Headline facts">
              <h3 className="text-sm font-semibold text-slate-900">The quote</h3>
              <dl className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {review.headline.map((fact) => {
                  const state = review.facts.find((entry) => entry.fieldKey === fact.key)?.state;
                  return (
                    <div key={fact.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <dt className="text-slate-600">{fact.label}</dt>
                      <dd className="flex items-center gap-2 text-right font-medium text-slate-900">
                        <span>{fact.key === 'quoteAmount' && typeof fact.value === 'number' ? money(fact.value) : shown(fact.value)}</span>
                        {state ? <StateChip state={state} /> : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
            <section aria-label="Line items">
              <h3 className="text-sm font-semibold text-slate-900">Line items ({keptLineItems} of {review.lineItems.length} kept)</h3>
              {review.lineItems.length === 0 ? <p className="mt-2 text-sm text-slate-600">This quote has no line items recorded.</p> : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {review.lineItems.map((item) => {
                    const removed = removedLineItems.has(item.id);
                    const figures = [item.quantity !== null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : null, item.unitPrice !== null ? `at ${money(item.unitPrice)}` : null, item.total !== null ? `total ${money(item.total)}` : null].filter(Boolean).join(' · ');
                    return (
                      <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className={removed ? 'line-through opacity-60' : ''}>
                          <p className="font-medium text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-600">{item.kind.toLowerCase()}{figures ? ` · ${figures}` : ''}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StateChip state={item.state} />
                          <Button type="button" variant="outline" className="min-h-[32px] px-2 text-xs" disabled={busy} onClick={() => toggle(removedLineItems, item.id, setRemovedLineItems)}>
                            {removed ? 'Keep' : 'Remove'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-label="Terms">
              <h3 className="text-sm font-semibold text-slate-900">Terms ({keptTerms} of {review.terms.length} kept)</h3>
              {review.terms.length === 0 ? <p className="mt-2 text-sm text-slate-600">This quote has no terms recorded.</p> : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {review.terms.map((term) => {
                    const removed = removedTerms.has(term.id);
                    return (
                      <li key={term.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className={removed ? 'line-through opacity-60' : ''}>
                          <p className="font-medium text-slate-900">{term.label ?? term.type.toLowerCase().replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-600">{term.value}{term.included === false ? ' (not included)' : ''}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StateChip state={term.state} />
                          <Button type="button" variant="outline" className="min-h-[32px] px-2 text-xs" disabled={busy} onClick={() => toggle(removedTerms, term.id, setRemovedTerms)}>
                            {removed ? 'Keep' : 'Remove'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <p className="text-xs text-slate-600">
              To correct the provider, total, dates or scope, close this and use Edit, then confirm again. An edit clears earlier confirmations so you affirm the corrected values.
            </p>
          </div>
        )}
        {error && review ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            disabled={busy || loading || !review}
            onClick={() => review && onConfirm(buildConfirmRequest(review, removedLineItems, removedTerms))}
          >
            {busy ? 'Confirming…' : review ? `Confirm ${keptLineItems} line item${keptLineItems === 1 ? '' : 's'} and ${keptTerms} term${keptTerms === 1 ? '' : 's'}` : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
