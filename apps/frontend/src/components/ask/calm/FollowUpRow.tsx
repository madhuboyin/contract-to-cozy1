'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { FollowUpItem } from '@/features/ask/followUps';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-006 (FRD v1.111): follow-up chips docked above the composer. Choosing one asks
// it; the row scrolls sideways on a narrow screen. SUGGESTED_NEXT_ACTIONS plan §10: a typed action renders its concise `label`,
// while its transcript `message` is what gets submitted (via the picked item).
//
// While a request is running the row stays put (no layout jump, no vanishing choices). The chip that started the request is
// disabled and shows it is pending; the others stay visible but inert (`aria-disabled`), because the workspace runs one request
// at a time and a click on them would otherwise be a silent no-op. The row remembers which chip was picked; the key is dropped
// as soon as no request is running, so a pick that never started one cannot mark a later, unrelated request.
export function FollowUpRow({ items, busy, onPick }: { items: FollowUpItem[]; busy: boolean; onPick: (item: FollowUpItem) => void }) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  useEffect(() => { if (!busy && pendingKey) setPendingKey(null); }, [busy, pendingKey]);
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label="Suggested follow-ups" data-follow-up-row="" className="mx-auto mb-2 flex w-full max-w-[1140px] gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map((item) => {
        const pending = busy && pendingKey === item.key;
        const inert = busy && !pending;
        return (
          <button
            key={item.key}
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
        );
      })}
    </div>
  );
}
