'use client';

import { cn } from '@/lib/utils';
import { lifespanOrder, lifespanScaleMax } from '@/features/ask/displayPatterns';
import type { AskBlockRenderer } from '../blocks/types';
import { ItemActionButtons } from './PatternParts';
import { CollectionStatusNote } from './CollectionStatusNote';

// IW-PRES-018 (FRD v1.72). One bar per item: the typical-life band and an age marker on one shared year scale.
// The status label is the server's; this renderer never derives it from the numbers. Items with no recorded age
// are not drawn and are listed with their declared "add the year" actions instead.

const STATUS_CHIP = {
  PAST_RANGE: 'bg-red-50 text-red-800',
  PLAN_AHEAD: 'bg-amber-50 text-amber-900',
  WITHIN_RANGE: 'bg-emerald-50 text-emerald-800',
} as const;

const years = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} yr${value === 1 ? '' : 's'}`;

export const LifespanBlock: AskBlockRenderer<'LIFESPAN'> = ({ block, onItemAction, itemActionsDisabled }) => {
  const items = lifespanOrder(block.items);
  const scale = lifespanScaleMax(block.items);
  const pct = (value: number) => Math.min(100, (value / scale) * 100);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="lifespan">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
      <p className="mt-1 text-xs text-slate-500">{block.basis}</p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[9rem_1fr_auto]" data-ask-lifespan-item={item.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="text-xs tabular-nums text-slate-500">{years(item.ageYears)} old · usually lasts {item.typicalLifeYears.min}–{item.typicalLifeYears.max}</p>
              </div>
              <div className="relative order-3 col-span-2 h-5 sm:order-none sm:col-span-1" role="img"
                aria-label={`${item.label}: ${years(item.ageYears)} old; typical life ${item.typicalLifeYears.min} to ${item.typicalLifeYears.max} years`}>
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
                  <rect x="0" y="8" width="100" height="4" rx="2" className="fill-slate-100" />
                  <rect x="0" y="8" width={pct(item.ageYears)} height="4" rx="2" className="fill-slate-300" />
                  <rect x={pct(item.typicalLifeYears.min)} y="4" width={Math.max(0, pct(item.typicalLifeYears.max) - pct(item.typicalLifeYears.min))} height="12" rx="2" className="fill-teal-50 stroke-teal-600 [stroke-dasharray:2_2]" />
                  <rect x={Math.max(0, pct(item.ageYears) - 0.5)} y="0" width="1" height="20" rx="0.5" className="fill-slate-900" />
                </svg>
              </div>
              <span className={cn('justify-self-end whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold', STATUS_CHIP[item.status])}>{item.statusLabel}</span>
              {(item.meta?.length ?? 0) > 0 && <p className="order-4 col-span-2 text-xs text-slate-600 sm:col-span-3" data-ask-lifespan-meta>{item.meta!.join(' · ')}</p>}
              {(item.actions?.length ?? 0) > 0 && <ItemActionButtons className="order-5 col-span-2 sm:col-span-3" item={item} actions={item.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && <div className="flex justify-between text-[11px] tabular-nums text-slate-400" aria-hidden="true"><span>0</span><span>{scale / 2} yrs</span><span>{scale} yrs</span></div>}
      {block.missingAge.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border border-dashed border-teal-500 bg-teal-50/60 p-3">
          <p className="text-sm font-semibold text-teal-900">{block.missingAgeTitle ?? `No age recorded yet for ${block.missingAge.length === 1 ? 'this item' : `these ${block.missingAge.length} items`}`}</p>
          <ul className="space-y-2">
            {block.missingAge.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2" data-ask-lifespan-missing={item.id}>
                <span className="text-sm text-slate-800">{item.label}</span>
                <ItemActionButtons item={item} actions={item.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <CollectionStatusNote collection={block.collection} className="mt-3 text-xs text-slate-500" />
    </section>
  );
};
