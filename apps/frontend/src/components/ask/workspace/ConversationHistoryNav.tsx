'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Archive, ArrowLeft, Clock3, Plus, Search, Sparkles } from 'lucide-react';
import { askHistoryGroupLabel } from '@/features/ask/historyGrouping';
import { useCalmAnswers } from '@/features/ask/calmAnswers';
import { cn } from '@/lib/utils';
import type { AskPendingWorkItem, AskRecentSessionSummary, AskSessionChange } from '@/features/ask/types';
import { ConversationSessionRow } from '../ConversationSessionRow';

export function PendingWorkInbox({ items, loadingId, dismissingId, onResume, onDismiss }: {
  items: AskPendingWorkItem[];
  loadingId: string | null;
  dismissingId: string | null;
  onResume: (item: AskPendingWorkItem) => void;
  onDismiss: (item: AskPendingWorkItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="mx-auto mb-5 max-w-3xl rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3" aria-labelledby="ask-pending-title">
      <div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-700 text-white"><Clock3 className="h-3.5 w-3.5" /></span><div><h2 id="ask-pending-title" className="text-sm font-semibold text-slate-950">Pending Ask actions</h2><p className="text-xs text-slate-600">Unfinished actions that still need your input.</p></div></div>
      <ul className="mt-3 divide-y divide-indigo-100 overflow-hidden rounded-xl border border-indigo-100 bg-white">{items.slice(0, 3).map((item) => {
        const actionBusy = loadingId === item.execution.executionId || dismissingId === item.execution.executionId;
        const canDismiss = item.pendingKind !== 'COMMAND_RECOVERY';
        return <li key={item.execution.executionId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.execution.question}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.pendingKind.toLowerCase().replace(/_/g, ' ')} · {new Date(item.execution.updatedAt).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-1.5">{canDismiss && <button type="button" disabled={Boolean(loadingId || dismissingId)} onClick={() => onDismiss(item)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{dismissingId === item.execution.executionId ? 'Dismissing…' : item.pendingKind === 'CONFIRMATION' ? 'Cancel' : 'Dismiss'}</button>}<button type="button" disabled={Boolean(loadingId || dismissingId)} onClick={() => onResume(item)} className="min-h-9 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{loadingId === item.execution.executionId ? 'Opening…' : actionBusy ? 'Please wait…' : item.actionLabel}</button></div></li>;
      })}</ul>
    </section>
  );
}

export function recentSessionStatus(status: AskRecentSessionSummary['latestStatus']): string {
  if (['NEEDS_PROPERTY', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT'].includes(status)) return 'Needs input';
  if (status === 'NEEDS_CONFIRMATION') return 'Awaiting confirmation';
  if (status === 'RUNNING') return 'In progress';
  if (['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'].includes(status)) return 'Completed';
  // IW-CALM-008/009 (FRD v1.111): a state the homeowner can act on says so; no raw status name is ever shown.
  if (['FAILED_RETRYABLE', 'UNAVAILABLE'].includes(status)) return 'Needs a retry';
  if (['FAILED_TERMINAL', 'BLOCKED'].includes(status)) return 'Could not finish';
  if (['RECEIVED', 'ROUTING'].includes(status)) return 'In progress';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'EXPIRED') return 'Expired';
  return 'Not available';
}

export function ConversationHistoryNav({ items, pinnedItems = [], view = 'RECENT', onViewChange, onSessionChange, onSessionDelete, busySessionId = null, activeSessionId, loading, loadingMore, hasMore, issue, openingId, query, scope, selectedHomeAvailable, onQueryChange, onScopeChange, onOpen, onNew, onLoadMore, backHref, backLabel }: {
  items: AskRecentSessionSummary[];
  // IW-HIST-003/011 (FRD v1.71): the pinned group (recent view only) and the explicit archived view.
  pinnedItems?: AskRecentSessionSummary[];
  view?: 'RECENT' | 'ARCHIVED';
  onViewChange?: (view: 'RECENT' | 'ARCHIVED') => void;
  // IW-HIST-009..012, IW-HIST-014: the per-conversation session menu. Resolve false to keep the row's editor open.
  onSessionChange?: (session: AskRecentSessionSummary, change: AskSessionChange) => Promise<boolean>;
  onSessionDelete?: (session: AskRecentSessionSummary) => Promise<boolean>;
  busySessionId?: string | null;
  activeSessionId: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  issue: string | null;
  openingId: string | null;
  query: string;
  scope: 'THIS_HOME' | 'ALL_HOMES';
  selectedHomeAvailable: boolean;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: 'THIS_HOME' | 'ALL_HOMES') => void;
  onOpen: (session: AskRecentSessionSummary) => void;
  onNew: () => void;
  onLoadMore: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  // IW-CALM-008 (FRD v1.111): in the calm shell the rail carries no brand block and no explanatory copy.
  const calm = useCalmAnswers();
  const [calendar, setCalendar] = useState({ now: new Date(), locale: 'en-US', timeZone: 'UTC' });
  useEffect(() => {
    const refresh = () => setCalendar({
      now: new Date(),
      locale: navigator.language || 'en-US',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const archivedView = view === 'ARCHIVED';
  const searching = Boolean(query.trim());
  const showPinned = !archivedView && !searching && pinnedItems.length > 0;
  const pinnedIds = new Set(showPinned ? pinnedItems.map((session) => session.sessionId) : []);
  const periodGroups = items.filter((session) => !pinnedIds.has(session.sessionId)).reduce<Array<{ label: string; items: AskRecentSessionSummary[] }>>((groups, session) => {
    const label = askHistoryGroupLabel(session.lastActiveAt, calendar);
    const group = groups.find((candidate) => candidate.label === label);
    if (group) group.items.push(session);
    else groups.push({ label, items: [session] });
    return groups;
  }, []);
  const grouped = [...(showPinned ? [{ label: 'Pinned', items: pinnedItems }] : []), ...periodGroups];
  return (
    <nav className="flex min-h-0 flex-1 flex-col" aria-label="Ask Cozy conversations">
      {!calm && <div className="mb-4 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-700 text-white"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold text-slate-950">Ask Cozy</p><p className="text-[11px] text-slate-500">Your home assistant</p></div>
      </div>}
      <button type="button" aria-label="New Ask Cozy session" onClick={onNew} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white hover:shadow-sm">
        <Plus className="h-4 w-4" aria-hidden="true" />New conversation
      </button>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Conversation home scope">
        <button type="button" aria-pressed={scope === 'THIS_HOME'} disabled={!selectedHomeAvailable} onClick={() => onScopeChange('THIS_HOME')} className={cn('min-h-9 rounded-lg px-2 text-xs font-semibold disabled:opacity-50', scope === 'THIS_HOME' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>This home</button>
        <button type="button" aria-pressed={scope === 'ALL_HOMES'} onClick={() => onScopeChange('ALL_HOMES')} className={cn('min-h-9 rounded-lg px-2 text-xs font-semibold', scope === 'ALL_HOMES' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>All homes</button>
      </div>
      {archivedView ? (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700">Archived conversations</p>
          <button type="button" onClick={() => onViewChange?.('RECENT')} className="min-h-8 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-white">Back to recent</button>
        </div>
      ) : <label className="relative mt-4 block">
        <span className="sr-only">Search conversation titles and questions for {scope === 'ALL_HOMES' ? 'all homes' : 'this home'}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} maxLength={120} placeholder="Search conversations" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
      </label>}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {issue && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">{issue}</p>}
        {loading && <p className="px-2 py-3 text-xs text-slate-400" role="status">{archivedView ? 'Loading archived conversations…' : query.trim() ? 'Searching conversations…' : 'Loading recent conversations…'}</p>}
        {grouped.length === 0 && !loading ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">{archivedView ? issue ? 'Archived conversations are unavailable right now.' : 'No archived conversations.' : query.trim() ? issue ? 'Search results are unavailable right now.' : 'No conversations match this search.' : issue ? 'No conversations are available to show right now.' : 'Your recent conversations will appear here.'}</p>
        ) : grouped.map((group) => (
          <section key={group.label} className="mb-5" aria-labelledby={`ask-history-${group.label.replace(/\s+/g, '-').toLowerCase()}`}>
            <h3 id={`ask-history-${group.label.replace(/\s+/g, '-').toLowerCase()}`} className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.label}</h3>
            <ul className="mt-1 space-y-1">
              {group.items.map((session) => (
                <li key={session.sessionId}>
                  <ConversationSessionRow
                    session={session}
                    active={session.sessionId === activeSessionId}
                    status={openingId === session.sessionId ? 'Opening…' : recentSessionStatus(session.latestStatus)}
                    disabled={Boolean(openingId)}
                    busy={busySessionId === session.sessionId}
                    archivedView={archivedView}
                    onOpen={() => onOpen(session)}
                    onChange={onSessionChange ? (change) => onSessionChange(session, change) : undefined}
                    onDelete={onSessionDelete ? () => onSessionDelete(session) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {hasMore && <button type="button" onClick={onLoadMore} disabled={loading || loadingMore} className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 disabled:opacity-60">{loadingMore ? 'Loading older conversations…' : 'Load older conversations'}</button>}
        {onViewChange && !archivedView && !searching && <button type="button" onClick={() => onViewChange('ARCHIVED')} className="mt-3 flex min-h-9 w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-800"><Archive className="h-3.5 w-3.5" aria-hidden="true" />Archived conversations</button>}
      </div>
      <div className="border-t border-slate-200 pt-3">
        {backHref && <Link href={backHref} className="flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"><ArrowLeft className="h-4 w-4" />{backLabel || 'Back to Home'}</Link>}
        {!calm && <p className="mt-2 px-3 text-[11px] leading-4 text-slate-400">{scope === 'ALL_HOMES' ? 'Conversations across homes you can access.' : 'Recent conversations for the selected home.'} ContractToCozy navigation remains available above.</p>}
      </div>
    </nav>
  );
}
