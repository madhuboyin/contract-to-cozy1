'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { isDismissibleStarterAction, type FollowUpItem } from '@/features/ask/followUps';

export type FollowUpDismissReason = 'NOT_NOW' | 'NOT_RELEVANT';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-006 (FRD v1.111): follow-up chips docked above the composer. Choosing one asks
// it; the row scrolls sideways on a narrow screen. SUGGESTED_NEXT_ACTIONS plan §10: a typed action renders its concise `label`,
// while its transcript `message` is what gets submitted (via the picked item).
//
// While a request is running the row stays put (no layout jump, no vanishing choices). The chip that started the request is
// disabled and shows it is pending; the others stay visible but inert (`aria-disabled`), because the workspace runs one request
// at a time and a click on them would otherwise be a silent no-op. The row remembers which chip was picked; the key is dropped
// as soon as no request is running, so a pick that never started one cannot mark a later, unrelated request.
export function FollowUpRow({ items, busy, onPick, onDismiss }: {
  items: FollowUpItem[]; busy: boolean; onPick: (item: FollowUpItem) => void;
  /** Optional. When given, a curated starter shows a small control to put it off or mark it not relevant; the caller reports the outcome. */
  onDismiss?: (item: Extract<FollowUpItem, { kind: 'ACTION' }>, reason: FollowUpDismissReason) => void;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  useEffect(() => { if (!busy && pendingKey) setPendingKey(null); }, [busy, pendingKey]);
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label="Suggested follow-ups" data-follow-up-row="" className="mx-auto mb-2 flex w-full max-w-[1140px] gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map((item) => {
        const pending = busy && pendingKey === item.key;
        const inert = busy && !pending;
        const canDismiss = Boolean(onDismiss) && item.kind === 'ACTION' && isDismissibleStarterAction(item.action);
        const menuOpen = canDismiss && menuKey === item.key;
        return (
          <span key={item.key} className="inline-flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            aria-disabled={inert || undefined}
            onClick={() => { if (busy) return; setPendingKey(item.key); onPick(item); }}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition ${inert || pending ? 'cursor-not-allowed opacity-60' : 'hover:border-teal-300 hover:text-teal-900'}`}
          >
            {pending && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {item.label}
          </button>
          {canDismiss && !menuOpen && (
            <button type="button" aria-label={`Dismiss ${item.label}`} disabled={busy} onClick={() => setMenuKey(item.key)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
          {menuOpen && item.kind === 'ACTION' && (
            <span role="group" aria-label={`Dismiss ${item.label}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
              <button type="button" onClick={() => { setMenuKey(null); onDismiss?.(item, 'NOT_NOW'); }} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 hover:border-teal-300">Not now</button>
              <button type="button" onClick={() => { setMenuKey(null); onDismiss?.(item, 'NOT_RELEVANT'); }} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 hover:border-teal-300">Not relevant</button>
              <button type="button" aria-label="Cancel" onClick={() => setMenuKey(null)} className="px-1 text-slate-400 hover:text-slate-700">Cancel</button>
            </span>
          )}
          </span>
        );
      })}
    </div>
  );
}
