'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import type { AskBatchDecision, AskDeckBatch, AskGroupedListItem, AskGroupedListItemAction } from '@/features/ask/types';
import { TONE_CHIP, type ItemActionHandler } from './PatternParts';

// IW-PRES-015 (FRD v1.72, v1.75). One card at a time, and every decision is the item's own declared action.
// Without a declared batch, each action is sent immediately, exactly as the list sends it, and its confirmation and
// receipt appear in the conversation. With a declared batch, decisions made with the batch's actions are only recorded
// here; at the end the homeowner reviews them and sends them together, which returns ONE confirmation. Nothing is
// written until that confirmation. Other declared actions are still sent on their own. A sent action cannot be undone
// from the deck: Back only shows the previous card again. Skip for now records nothing.

const SWIPE_DISTANCE = 90;
export const DECK_MAX_BUTTONS = 3;

type Decision = { itemId: string; actionId: string | null; label: string | null; sent: boolean };

export function CardDeckView({ items, swipeRightActionId, swipeLeftActionId, onItemAction, disabled, batch = null, onBatch, onOpenDetail }: {
  items: AskGroupedListItem[];
  swipeRightActionId: string | null;
  swipeLeftActionId: string | null;
  onItemAction: ItemActionHandler;
  disabled: boolean;
  batch?: AskDeckBatch | null;
  onBatch?: (decisions: AskBatchDecision[]) => void;
  onOpenDetail?: (item: AskGroupedListItem) => void;
}) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [batchSent, setBatchSent] = useState(false);
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ startX: number; active: boolean }>({ startX: 0, active: false });
  const cardRef = useRef<HTMLDivElement>(null);
  const itemKey = items.map((entry) => entry.id).join('|');
  // A refreshed result (for example after the batch was confirmed) starts a fresh deck over what is still open.
  useEffect(() => {
    setIndex(0);
    setDecisions({});
    setBatchSent(false);
  }, [itemKey]);
  const item = items[index];
  const batchMode = Boolean(batch && onBatch);
  const isBatched = (action: AskGroupedListItemAction) => batchMode && Boolean(batch?.actionIds.includes(action.id));

  const record = (decision: Decision) => {
    setDecisions((previous) => ({ ...previous, [decision.itemId]: decision }));
    setIndex((current) => current + 1);
    setDragX(0);
    window.setTimeout(() => cardRef.current?.focus(), 0);
  };
  const actionById = (id: string | null) => (id && item?.actions?.find((action) => action.id === id)) || null;
  const choose = (action: AskGroupedListItemAction | null) => {
    if (!item || !action || disabled) return;
    if (isBatched(action)) {
      setBatchSent(false);
      record({ itemId: item.id, actionId: action.id, label: action.label, sent: false });
      return;
    }
    onItemAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
    record({ itemId: item.id, actionId: action.id, label: action.label, sent: true });
  };
  const skip = () => { if (item) record({ itemId: item.id, actionId: null, label: null, sent: false }); };
  const back = () => {
    setIndex((current) => Math.max(0, current - 1));
    setDragX(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' && swipeRightActionId) { event.preventDefault(); choose(actionById(swipeRightActionId)); }
    if (event.key === 'ArrowLeft' && swipeLeftActionId) { event.preventDefault(); choose(actionById(swipeLeftActionId)); }
  };
  const swipeEnabled = Boolean(swipeRightActionId || swipeLeftActionId) && !disabled;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || (event.target as HTMLElement).closest('button')) return;
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
    if (dragX > SWIPE_DISTANCE) choose(actionById(swipeRightActionId));
    else if (dragX < -SWIPE_DISTANCE) choose(actionById(swipeLeftActionId));
    else setDragX(0);
  };

  if (!item) {
    const all = items.map((entry) => ({ entry, decision: decisions[entry.id] }));
    const pending = all.filter(({ decision }) => decision?.actionId && !decision.sent);
    const sent = all.filter(({ decision }) => decision?.sent);
    const skipped = all.filter(({ decision }) => !decision?.actionId);
    const byLabel = pending.reduce<Record<string, AskGroupedListItem[]>>((groups, { entry, decision }) => ({ ...groups, [decision!.label!]: [...(groups[decision!.label!] ?? []), entry] }), {});
    const counts = all.reduce<Record<string, number>>((totals, { decision }) => {
      const key = decision?.label ?? 'Skipped for now';
      return { ...totals, [key]: (totals[key] ?? 0) + 1 };
    }, {});
    return (
      <div className="space-y-3 p-4" data-ask-deck-complete="">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-950">You went through all {items.length}.</p>
          {batchMode ? <>
            {Object.entries(byLabel).map(([label, entries]) => (
              <div key={label} data-ask-deck-review={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label} · {entries.length}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-800">{entries.map((entry) => <li key={entry.id}>{entry.title}</li>)}</ul>
              </div>
            ))}
            {sent.length > 0 && <p className="text-xs text-slate-600">{sent.length} sent on {sent.length === 1 ? 'its' : 'their'} own for confirmation: {sent.map(({ entry }) => entry.title).join('; ')}.</p>}
            {skipped.length > 0 && <p className="text-xs text-slate-600">{skipped.length} skipped for now.</p>}
            {batchSent
              ? <p className="text-sm font-semibold text-teal-800" role="status">Sent for your confirmation below. Nothing changes until you confirm.</p>
              : <p className="text-xs text-slate-500">{pending.length ? 'Nothing has been saved yet. You will see one confirmation for all of these.' : 'No changes to review.'}</p>}
          </> : <>
            <ul className="flex flex-wrap gap-2 text-xs">
              {Object.entries(counts).map(([label, count]) => <li key={label} className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">{count} · {label}</li>)}
            </ul>
            <p className="text-xs text-slate-500">Each choice was sent as its own request. Its result appears in the conversation.</p>
          </>}
          <div className="flex flex-wrap gap-2">
            {batchMode && <button type="button" disabled={disabled || batchSent || pending.length === 0}
              onClick={() => { onBatch?.(pending.map(({ entry, decision }) => ({ entityId: entry.id, actionId: decision!.actionId! }))); setBatchSent(true); }}
              className="min-h-9 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white disabled:opacity-50">
              Review and confirm {pending.length} change{pending.length === 1 ? '' : 's'}
            </button>}
            <button type="button" onClick={back} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Back to the cards</button>
            <button type="button" onClick={() => { setIndex(0); setDecisions({}); setBatchSent(false); }} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Start again</button>
          </div>
        </div>
      </div>
    );
  }

  const shown = (item.actions ?? []).slice(0, DECK_MAX_BUTTONS);
  const rightLabel = actionById(swipeRightActionId)?.label;
  const leftLabel = actionById(swipeLeftActionId)?.label;
  const decided = decisions[item.id];
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
        {(item.badgeLabel || item.status) && <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', TONE_CHIP[item.tone ?? 'DEFAULT'])}>{item.badgeLabel ?? item.status!.replace(/_/g, ' ')}</span>}
        <p className="text-base font-semibold leading-6 text-slate-950">{item.title}</p>
        {item.description && <p className="text-sm leading-6 text-slate-600">{item.description}</p>}
        {(item.timingLabel || item.amountLabel) && <p className="text-xs text-slate-500">{[item.timingLabel, item.amountLabel].filter(Boolean).join(' · ')}</p>}
        {item.meta.length > 0 && <p className="text-xs text-slate-500">{item.meta.join(' · ')}</p>}
        {onOpenDetail && <button type="button" onClick={() => onOpenDetail(item)} className="text-xs font-semibold text-teal-700 underline-offset-4 hover:underline">Details</button>}
        {decided && <p className="text-xs font-semibold text-teal-800">{decided.sent ? `Already sent: ${decided.label}` : decided.label ? `Your choice: ${decided.label} (not sent yet)` : 'Skipped for now'}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {shown.map((action) => (
          <button key={action.id} type="button" disabled={disabled} onClick={() => choose(action)}
            className={cn('min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
              action.id === swipeRightActionId ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
            {action.label}{batchMode && !isBatched(action) ? ' …' : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={back} disabled={index === 0} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40">Back</button>
        <button type="button" onClick={skip} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">Skip for now</button>
        {swipeEnabled && <span className="text-xs text-slate-500">You can also swipe the card or use the arrow keys.</span>}
      </div>
      {batchMode && <p className="text-xs text-slate-500">Nothing is saved until you review and confirm at the end.{shown.some((action) => !isBatched(action)) ? ' Actions marked … open their own confirmation.' : ''}</p>}
    </div>
  );
}
