'use client';

import type { FollowUpItem } from '@/features/ask/followUps';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-006 (FRD v1.111): follow-up chips docked above the composer. Choosing one asks
// it; the row scrolls sideways on a narrow screen and is empty while an answer is pending. SUGGESTED_NEXT_ACTIONS plan §10:
// a typed action renders its concise `label`, while its transcript `message` is what gets submitted (via the picked item).
export function FollowUpRow({ items, disabled, onPick }: { items: FollowUpItem[]; disabled: boolean; onPick: (item: FollowUpItem) => void }) {
  if (disabled || items.length === 0) return null;
  return (
    <div role="group" aria-label="Suggested follow-ups" data-follow-up-row="" className="mx-auto mb-2 flex w-full max-w-[1140px] gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map((item) => (
        <button key={item.key} type="button" onClick={() => onPick(item)} className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-teal-300 hover:text-teal-900">{item.label}</button>
      ))}
    </div>
  );
}
