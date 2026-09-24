'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import type { AskGroupedListItem, AskGroupedListItemAction } from '@/features/ask/types';
import { ItemActionButtons, TONE_CHIP, type ItemActionHandler } from './PatternParts';

// IW-PRES-015 (FRD v1.72). One card at a time. Every decision is the item's own declared action, sent exactly as
// the list sends it, so its confirmation card and receipt behave as usual; the deck never saves anything itself.
// A sent action cannot be undone from here: "Back" only shows the previous card again. "Skip for now" changes nothing.

const SWIPE_DISTANCE = 90;
export const DECK_MAX_BUTTONS = 3;

type Decision = { itemId: string; label: string | null };

export function CardDeckView({ items, swipeRightActionId, swipeLeftActionId, onItemAction, disabled }: {
  items: AskGroupedListItem[];
  swipeRightActionId: string | null;
  swipeLeftActionId: string | null;
  onItemAction: ItemActionHandler;
  disabled: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ startX: number; active: boolean }>({ startX: 0, active: false });
  const cardRef = useRef<HTMLDivElement>(null);
  const item = items[index];

  const advance = (label: string | null) => {
    if (!item) return;
    setDecisions((previous) => [...previous.slice(0, index), { itemId: item.id, label }]);
    setIndex((current) => current + 1);
    setDragX(0);
    window.setTimeout(() => cardRef.current?.focus(), 0);
  };
  const actionById = (id: string | null) => (id && item?.actions?.find((action) => action.id === id)) || null;
  const send = (action: AskGroupedListItemAction | null) => {
    if (!item || !action || disabled) return;
    onItemAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
    advance(action.label);
  };
  const back = () => {
    setIndex((current) => Math.max(0, current - 1));
    setDragX(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' && swipeRightActionId) { event.preventDefault(); send(actionById(swipeRightActionId)); }
    if (event.key === 'ArrowLeft' && swipeLeftActionId) { event.preventDefault(); send(actionById(swipeLeftActionId)); }
  };
  const swipeEnabled = Boolean(swipeRightActionId || swipeLeftActionId) && !disabled;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled) return;
    drag.current = { startX: event.clientX, active: true };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const next = event.clientX - drag.current.startX;
    setDragX((next > 0 && !swipeRightActionId) || (next < 0 && !swipeLeftActionId) ? 0 : next);
  };
  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dragX > SWIPE_DISTANCE) send(actionById(swipeRightActionId));
    else if (dragX < -SWIPE_DISTANCE) send(actionById(swipeLeftActionId));
    else setDragX(0);
  };

  if (!item) {
    const counts = decisions.reduce<Record<string, number>>((all, decision) => {
      const key = decision.label ?? 'Skipped for now';
      return { ...all, [key]: (all[key] ?? 0) + 1 };
    }, {});
    return (
      <div className="space-y-3 p-4" data-ask-deck-complete="">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-950">You went through all {items.length}.</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {Object.entries(counts).map(([label, count]) => <li key={label} className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">{count} · {label}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Each choice was sent as its own request. Its result appears in the conversation.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={back} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Back</button>
            <button type="button" onClick={() => { setIndex(0); setDecisions([]); }} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Start again</button>
          </div>
        </div>
      </div>
    );
  }

  const shown = (item.actions ?? []).slice(0, DECK_MAX_BUTTONS);
  const rightLabel = actionById(swipeRightActionId)?.label;
  const leftLabel = actionById(swipeLeftActionId)?.label;
  const decided = decisions[index];
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span aria-live="polite">{index + 1} of {items.length}</span>
        <span className="flex gap-1" aria-hidden="true">
          {items.map((entry, position) => <span key={entry.id} className={cn('h-1 w-4 rounded-full', position < index ? 'bg-teal-600' : 'bg-slate-200')} />)}
        </span>
      </div>
      <div
        ref={cardRef}
        tabIndex={0}
        role="group"
        aria-roledescription="card"
        aria-label={`${item.title}, ${index + 1} of ${items.length}.${rightLabel ? ` Right arrow: ${rightLabel}.` : ''}${leftLabel ? ` Left arrow: ${leftLabel}.` : ''}`}
        data-ask-deck-item={item.id}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: dragX ? `translateX(${dragX}px) rotate(${dragX / 24}deg)` : undefined, touchAction: swipeEnabled ? 'pan-y' : undefined }}
        className={cn('relative min-h-[11rem] select-none space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-600', swipeEnabled && 'cursor-grab')}
      >
        {rightLabel && dragX > 20 && <span className="absolute right-3 top-3 rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">{rightLabel}</span>}
        {leftLabel && dragX < -20 && <span className="absolute left-3 top-3 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{leftLabel}</span>}
        {item.status && <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', TONE_CHIP[item.tone ?? 'DEFAULT'])}>{item.status.replace(/_/g, ' ')}</span>}
        <p className="text-base font-semibold leading-6 text-slate-950">{item.title}</p>
        {item.description && <p className="text-sm leading-6 text-slate-600">{item.description}</p>}
        {(item.timingLabel || item.amountLabel) && <p className="text-xs text-slate-500">{[item.timingLabel, item.amountLabel].filter(Boolean).join(' · ')}</p>}
        {item.meta.length > 0 && <p className="text-xs text-slate-500">{item.meta.join(' · ')}</p>}
        {decided && <p className="text-xs font-semibold text-teal-800">Already sent: {decided.label ?? 'skipped for now'}</p>}
      </div>
      <ItemActionButtons item={item} actions={shown} onItemAction={onItemAction} disabled={disabled} onDispatched={(action) => advance(action.label)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={back} disabled={index === 0} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40">Back</button>
        <button type="button" onClick={() => advance(null)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Skip for now</button>
        {swipeEnabled && <span className="text-xs text-slate-500">You can also swipe the card or use the arrow keys.</span>}
      </div>
    </div>
  );
}
