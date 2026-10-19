'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GROUP_ORDER, formatSearchDate, searchResultHref } from './searchPresentation';
import { useAskSearch } from './useAskSearch';

const GROUP_HEADINGS = { RECORD: 'Home record', WORK: 'Work', SAVED: 'Saved', HISTORY: 'Conversations', CAPABILITY: 'Things Ask can do' } as const;

/**
 * Search your home (FR-SEARCH-001..004): one box over the home record, work, saved results, conversations and what Ask can do. Results
 * are grouped by kind with their home, status and date, and open the exact place they live. A kind that could not be searched is named,
 * never silently left out. The text stays in this dialog and is cleared when it closes.
 */
export function AskSearchDialog({ open, onOpenChange, propertyId }: { open: boolean; onOpenChange: (open: boolean) => void; propertyId: string | undefined }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { response, status, retry, tooShort } = useAskSearch(propertyId, query, open);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const go = (href: string) => { onOpenChange(false); router.push(href); };
  const gaps = (response?.providers ?? []).filter((provider) => provider.state !== 'AVAILABLE' && provider.state !== 'NOT_APPLICABLE');
  const groups = GROUP_ORDER.flatMap((id) => response?.groups.filter((group) => group.group === id && group.results.length > 0) ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto p-0 sm:rounded-2xl" aria-describedby="ask-search-description">
        <div className="border-b border-slate-200 px-4 pb-3 pt-4">
          <DialogTitle className="text-lg font-semibold text-slate-950">Search your home</DialogTitle>
          <DialogDescription id="ask-search-description" className="mt-1 text-sm text-slate-600">Your home record, work, saved results, conversations, and what Ask can do for the selected home.</DialogDescription>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-700">
            <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="sr-only">Search your home</span>
            <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="Search your home" aria-label="Search your home" className="min-h-11 w-full bg-transparent text-sm text-slate-900 outline-none" />
          </label>
        </div>

        <div className="px-4 py-3" aria-live="polite">
          {!propertyId ? (
            <p className="text-sm text-slate-600" role="status">Select a home to search it.</p>
          ) : tooShort ? (
            <p className="text-sm text-slate-600" role="status">Keep typing: search needs at least 2 characters.</p>
          ) : status === 'IDLE' ? (
            <p className="text-sm text-slate-600" role="status">Search by name, provider, or what you are looking for.</p>
          ) : status === 'LOADING' ? (
            <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Searching…</p>
          ) : status === 'PAUSED' ? (
            <p className="text-sm text-amber-950" role="status">Search is temporarily unavailable. Your saved data is unchanged.</p>
          ) : status === 'ERROR' ? (
            <p className="text-sm text-amber-950" role="alert">Search could not be completed. <button type="button" onClick={retry} className="font-semibold underline">Try again</button></p>
          ) : response && (
            <>
              {response.partial && gaps.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="note" data-search-partial>
                  <p className="font-semibold">Some places could not be searched, so these results may be incomplete.</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer font-semibold">Which ones</summary>
                    <ul className="mt-1 list-disc pl-5">{gaps.map((provider) => <li key={provider.providerId}><span className="font-semibold">{provider.label}:</span> {provider.reason ?? 'Not available right now.'}</li>)}</ul>
                  </details>
                </div>
              )}
              {groups.length === 0 ? (
                <p className="text-sm text-slate-700" role="status">{response.partial ? 'Nothing was found in the places that could be searched, but this is not a confirmed empty result.' : 'No matches.'}</p>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <section key={group.group} aria-labelledby={`ask-search-group-${group.group}`} data-search-group={group.group}>
                      <h3 id={`ask-search-group-${group.group}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{GROUP_HEADINGS[group.group]}</h3>
                      <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {group.results.map((result) => {
                          const date = formatSearchDate(result.asOf);
                          return (
                            <li key={result.resultKey}>
                              <button type="button" onClick={() => go(searchResultHref(result, propertyId))} className="block min-h-11 w-full px-3 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700">
                                <span className="block break-words text-sm font-semibold text-slate-950">{result.title}</span>
                                <span className="mt-0.5 block text-xs text-slate-600">
                                  {[result.typeLabel, result.status, result.freshness, date].filter(Boolean).join(' · ')}
                                </span>
                                {result.snippet && <span className="mt-0.5 block text-xs text-slate-500">{result.snippet}</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {group.more && <p className="mt-1 text-xs text-slate-500">More matches exist. Narrow your search to see them.</p>}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-2">
          <button type="button" onClick={() => { onOpenChange(false); window.dispatchEvent(new CustomEvent('ctc-command-palette-open')); }} className="min-h-11 text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Search pages, actions, and tools instead</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
