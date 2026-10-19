'use client';

import { useId, useState } from 'react';
import type { AskNotificationItem } from '@/features/ask/types';
import { CONTINUATION_LABELS, formatNotificationDate } from './notificationPresentation';

/** One notification: what it is, which home, why it reached you, when, and the one action that reopens the current state. */
export function NotificationRow({ item, busy, onOpen, onToggleRead, onToggleDismiss }: {
  item: AskNotificationItem;
  busy: boolean;
  onOpen: (item: AskNotificationItem) => void;
  onToggleRead: (item: AskNotificationItem) => void;
  onToggleDismiss: (item: AskNotificationItem) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();
  const created = formatNotificationDate(item.createdAt);
  const expires = formatNotificationDate(item.expiresAt);
  const home = item.propertyAccess === 'ACCESSIBLE' ? item.propertyLabel : item.propertyAccess === 'LOST' ? 'A home you no longer have access to' : null;
  const canOpen = item.continuationKind !== 'NONE';

  return (
    <li className={`border-b border-slate-200 px-4 py-3 last:border-b-0 ${item.isRead ? '' : 'bg-emerald-50/30'}`} data-notification-id={item.id} data-notification-read={item.isRead}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {!item.isRead && <span className="rounded-full bg-emerald-800 px-2 py-0.5 normal-case tracking-normal text-white">New</span>}
            <span>{item.categoryLabel}</span>
            {home && <><span aria-hidden="true">·</span><span className="normal-case tracking-normal">{home}</span></>}
            {created && <><span aria-hidden="true">·</span><span className="normal-case tracking-normal">{created}</span></>}
            {item.deliveryPaused && <span className="rounded-full bg-slate-100 px-2 py-0.5 normal-case tracking-normal text-slate-700">{item.deliveryPaused === 'MUTED' ? 'Email muted' : 'Email snoozed'}</span>}
            {item.expired && <span className="rounded-full bg-amber-50 px-2 py-0.5 normal-case tracking-normal text-amber-900">Expired</span>}
          </p>
          <h3 className="mt-1 break-words text-base font-semibold text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.message}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canOpen && <button type="button" disabled={busy} onClick={() => onOpen(item)} className="min-h-11 rounded-xl bg-emerald-900 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">{busy ? 'Opening…' : CONTINUATION_LABELS[item.continuationKind]}</button>}
          <button type="button" disabled={busy} onClick={() => onToggleRead(item)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">{item.isRead ? 'Mark unread' : 'Mark read'}</button>
          <button type="button" disabled={busy} onClick={() => onToggleDismiss(item)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">{item.dismissed ? 'Restore' : 'Dismiss'}</button>
          <button type="button" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen((value) => !value)} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{detailOpen ? 'Hide details' : 'Why this?'}</button>
        </div>
      </div>
      {detailOpen && (
        <dl id={detailId} className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2" data-notification-detail>
          <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why you got this</dt><dd className="text-slate-900">{item.whyItAppeared}</dd></div>
          {created && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</dt><dd className="text-slate-900">{created}</dd></div>}
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</dt><dd className="text-slate-900">{expires ?? 'No expiry'}</dd></div>
          {item.continuationKind === 'LEGACY_LINK' && <div className="sm:col-span-2"><dd className="text-slate-600">This opens a page outside Ask.</dd></div>}
          {!canOpen && <div className="sm:col-span-2"><dd className="text-slate-600">There is nothing to open for this notification.</dd></div>}
        </dl>
      )}
    </li>
  );
}
