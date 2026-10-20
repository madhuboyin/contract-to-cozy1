'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import type { AskNotificationItem } from '@/features/ask/types';
import { askServiceIsPaused } from '../workspace/support';
import { AskCollectionState, AskWorkspaceMeasure } from '../presentation/AskLayoutPrimitives';
import { NotificationRow } from './NotificationRow';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { OPEN_OUTCOME_COPY, notificationDestinationHref } from './notificationPresentation';
import { useAskNotifications } from './useAskNotifications';

type Tab = 'INBOX' | 'DISMISSED' | 'SETTINGS';

/**
 * Notifications (FR-NOTIF-001..004): everything that reached you, across your homes, with why it appeared, and each one opens the
 * current state of what it is about, not the words it was written with. A removed target or a home you lost says so plainly.
 */
export function AskNotificationsDestination() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'settings' ? 'SETTINGS' : 'INBOX');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  const listing = tab !== 'SETTINGS';
  const { items, page, status, loadingMore, moreError, loadMore, refresh, patchItem, removeItem } = useAskNotifications(listing, tab === 'DISMISSED' ? 'DISMISSED' : 'INBOX', unreadOnly, category, propertyId);
  const paused = serviceUnavailable || status === 'PAUSED';
  const filtered = unreadOnly || Boolean(category) || Boolean(propertyId);

  const guard = async (id: string, action: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (askServiceIsPaused(caught)) { setServiceUnavailable(true); setError(null); }
      else setError(caught instanceof Error ? caught.message : 'Could not complete that.');
    } finally {
      setBusyId(null);
    }
  };

  // Opening rereads the live record and the home's access first, so the destination is always current or the page says why it is not.
  const open = (item: AskNotificationItem) => guard(item.id, async () => {
    const response = await api.openAskNotification(item.id);
    if (!response.success || !response.data) throw new Error(response.message || 'Could not open this.');
    const result = response.data;
    if (result.outcome !== 'AVAILABLE' || !result.destination) {
      setNotice(`${item.title}: ${result.message || OPEN_OUTCOME_COPY[result.outcome === 'AVAILABLE' ? 'UNAVAILABLE' : result.outcome]}`);
      return;
    }
    const home = result.propertyId ?? item.propertyId ?? selectedPropertyId;
    if (!home && result.destination.kind !== 'LEGACY_LINK') { setNotice(`${item.title}: Select a home to open this.`); return; }
    patchItem(item.id, { isRead: true });
    router.push(notificationDestinationHref(result.destination, home ?? ''));
  });

  const toggleRead = (item: AskNotificationItem) => guard(item.id, async () => {
    const response = await api.setAskNotificationRead(item.id, !item.isRead);
    if (!response.success) throw new Error(response.message || 'Could not change that.');
    patchItem(item.id, { isRead: !item.isRead });
  });

  const toggleDismiss = (item: AskNotificationItem) => guard(item.id, async () => {
    const response = await api.setAskNotificationDismissed(item.id, !item.dismissed);
    if (!response.success) throw new Error(response.message || 'Could not change that.');
    removeItem(item.id);
    refresh();
  });

  return (
    <section className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-10" aria-labelledby="ask-notifications-title">
      <AskWorkspaceMeasure>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy</p>
        <h1 id="ask-notifications-title" className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">Notifications</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">What reached you, why, and where it leads. Opening one shows the current state of what it is about.</p>

        <div role="tablist" aria-label="Notification views" className="mt-6 flex flex-wrap gap-2">
          {([['INBOX', 'Inbox', page && tab === 'INBOX' ? page.unreadCount : null], ['DISMISSED', 'Dismissed', page ? page.dismissedCount : null], ['SETTINGS', 'Settings', null]] as const).map(([id, label, count]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNotice(null); setError(null); }}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${tab === id ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}>
              {label}
              {count !== null && count > 0 && <span className="ml-2 text-xs font-medium opacity-80" aria-label={id === 'INBOX' ? `${count} unread` : `${count} items`}>{count}</span>}
            </button>
          ))}
        </div>

        <section className="mt-5" aria-label={tab === 'SETTINGS' ? 'Notification settings' : tab === 'DISMISSED' ? 'Dismissed notifications' : 'Notification inbox'}>
          {tab === 'SETTINGS' ? <NotificationSettingsPanel propertyId={selectedPropertyId ?? undefined} /> : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  {page && status === 'READY' && <p className="text-sm text-slate-600" role="status" data-notification-count>{page.total === 0 ? (filtered ? 'No matches' : 'None') : `Showing ${items.length} of ${page.total}${filtered ? ' matching' : ''}`} · newest first</p>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900">
                    <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Unread only
                  </label>
                  <label className="flex flex-col text-xs font-semibold text-slate-600">
                    <span className="sr-only">Kind</span>
                    <select aria-label="Kind" value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                      <option value="">All kinds</option>
                      {(page?.filterOptions.categories ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {(page?.filterOptions.properties.length ?? 0) > 1 && (
                    <label className="flex flex-col text-xs font-semibold text-slate-600">
                      <span className="sr-only">Home</span>
                      <select aria-label="Home" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                        <option value="">All homes</option>
                        {(page?.filterOptions.properties ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {notice && <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950" role="status" data-notification-notice>{notice}</p>}
              {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

              <div className="mt-4">
                {paused ? (
                  <AskCollectionState kind="UNAVAILABLE" description="Notifications are temporarily unavailable. Nothing was lost." className="border-amber-200 bg-amber-50 text-amber-950" />
                ) : status === 'ERROR' ? (
                  <AskCollectionState kind="UNAVAILABLE" description="Notifications could not be loaded." action={<button type="button" onClick={refresh} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
                ) : status === 'LOADING' && !page ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading notifications…</div>
                ) : page && items.length === 0 && status === 'READY' ? (
                  <AskCollectionState kind="EMPTY" description={filtered ? 'No notifications match this filter.' : tab === 'DISMISSED' ? 'Nothing is dismissed.' : 'You are all caught up.'} />
                ) : (
                  <>
                    <ul className={`rounded-2xl border border-slate-200 bg-white ${status === 'LOADING' ? 'opacity-60' : ''}`} aria-label={tab === 'DISMISSED' ? 'Dismissed notifications' : 'Notifications'} aria-busy={status === 'LOADING'}>
                      {items.map((item) => <NotificationRow key={item.id} item={item} busy={busyId === item.id} onOpen={(target) => void open(target)} onToggleRead={(target) => void toggleRead(target)} onToggleDismiss={(target) => void toggleDismiss(target)} />)}
                    </ul>
                    {page?.nextCursor && (
                      <div className="mt-3 flex flex-col items-start gap-2">
                        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Show more'}</button>
                        {moreError && <p className="text-sm text-red-800" role="alert">Could not load more. Try again.</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </AskWorkspaceMeasure>
    </section>
  );
}
