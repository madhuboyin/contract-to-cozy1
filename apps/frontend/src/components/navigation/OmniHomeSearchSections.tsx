'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Command } from 'cmdk';
import { GROUP_ORDER, formatSearchDate } from '@/components/ask/search/searchPresentation';
import { useAskSearch } from '@/components/ask/search/useAskSearch';
import type { AskSearchResult } from '@/features/ask/types';

const GROUP_HEADINGS = { RECORD: 'Home record', WORK: 'Work', SAVED: 'Saved', HISTORY: 'Conversations', CAPABILITY: 'Things Ask can do' } as const;

/** Prefix on every server-result item value so the palette's own fuzzy filter never hides or re-ranks them: the server already ranked them. */
export const HOME_SEARCH_VALUE_PREFIX = 'home-search:';

/**
 * Phase 6 (D-04): the home-search half of the single Cmd/Ctrl+K dialog. It renders the federated search groups (home record, work, saved,
 * conversations, what Ask can do) in a fixed order above the page and command groups. The provider fan-out, authorization and ranking stay
 * entirely in the server's federated search; this component only displays them and says plainly when a place could not be searched. The query
 * text stays in the palette's state and the request body: it is never put in a URL, storage, or an analytics event.
 */
export function OmniHomeSearchSections({ propertyId, query, enabled, onChoose, onTopResult }: { propertyId: string | undefined; query: string; enabled: boolean; onChoose: (result: AskSearchResult) => void; /** Told the item value of the first home result (or null) so the palette can highlight it: Enter then opens the best home match, not whichever page item the text filter ranked first. */ onTopResult: (value: string | null) => void }) {
  const { response, status, retry, tooShort } = useAskSearch(propertyId, query, enabled);
  const groups = GROUP_ORDER.flatMap((id) => (status === 'READY' ? response?.groups.filter((group) => group.group === id && group.results.length > 0) : undefined) ?? []);
  const topKey = groups[0]?.results[0]?.resultKey ?? null;
  useEffect(() => { onTopResult(topKey ? `${HOME_SEARCH_VALUE_PREFIX}${topKey}` : null); }, [topKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled || !propertyId) return null;
  const gaps = (response?.providers ?? []).filter((provider) => provider.state !== 'AVAILABLE' && provider.state !== 'NOT_APPLICABLE');

  return (
    <div data-omni-home-search aria-live="polite">
      {tooShort && <p className="px-2 pt-2 text-xs text-gray-500" role="status">Keep typing to search your home: it needs at least 2 characters.</p>}
      {status === 'LOADING' && <p className="flex items-center gap-2 px-2 pt-2 text-xs text-gray-500" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Searching your home…</p>}
      {status === 'PAUSED' && <p className="px-2 pt-2 text-xs text-amber-900" role="status">Home search is temporarily unavailable. Your saved data is unchanged.</p>}
      {status === 'ERROR' && <p className="px-2 pt-2 text-xs text-amber-900" role="alert">Home search could not be completed. <button type="button" onClick={retry} className="font-semibold underline">Try again</button></p>}
      {status === 'READY' && response && (
        <>
          {response.partial && gaps.length > 0 && (
            <div className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="note" data-search-partial>
              <p className="font-semibold">Some places could not be searched, so home results may be incomplete.</p>
              <details className="mt-1">
                <summary className="cursor-pointer font-semibold">Which ones</summary>
                <ul className="mt-1 list-disc pl-4">{gaps.map((provider) => <li key={provider.providerId}><span className="font-semibold">{provider.label}:</span> {provider.reason ?? 'Not available right now.'}</li>)}</ul>
              </details>
            </div>
          )}
          {groups.length === 0 && (
            <p className="px-2 pt-2 text-xs text-gray-600" role="status">{response.partial ? 'Nothing was found in the places that could be searched, but this is not a confirmed empty home search.' : 'No home matches.'}</p>
          )}
          {groups.map((group) => (
            <Command.Group key={group.group} forceMount heading={GROUP_HEADINGS[group.group]} className="pt-2" data-search-group={group.group}>
              {group.results.map((result) => {
                const detail = [result.typeLabel, result.status, result.freshness, formatSearchDate(result.asOf)].filter(Boolean).join(' · ');
                return (
                  <Command.Item key={result.resultKey} forceMount value={`${HOME_SEARCH_VALUE_PREFIX}${result.resultKey}`} onSelect={() => onChoose(result)}
                    className="flex cursor-pointer flex-col rounded-md px-2 py-2 text-sm text-gray-700 outline-none transition-colors data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700">
                    <span className="break-words font-semibold">{result.title}</span>
                    {detail && <span className="text-xs text-gray-500">{detail}</span>}
                    {result.snippet && <span className="text-xs text-gray-500">{result.snippet}</span>}
                  </Command.Item>
                );
              })}
              {group.more && <p className="px-2 pb-1 text-xs text-gray-500">More matches exist. Narrow your search to see them.</p>}
            </Command.Group>
          ))}
        </>
      )}
    </div>
  );
}
