'use client';

import { cn } from '@/lib/utils';
import { lifespanOrder, lifespanScaleMax } from '@/features/ask/displayPatterns';
import type { AskBlockRenderer } from '../blocks/types';
import { ItemActionButtons } from './PatternParts';

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
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
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
                <span className="absolute inset-x-0 top-2 h-1 rounded-full bg-slate-100" />
                <span className="absolute top-2 h-1 rounded-full bg-slate-300" style={{ width: pct(item.ageYears) }} />
                <span className="absolute top-1 h-3 rounded-full border border-dashed border-teal-600 bg-teal-50"
                  style={{ left: pct(item.typicalLifeYears.min), width: `calc(${pct(item.typicalLifeYears.max)} - ${pct(item.typicalLifeYears.min)})` }} />
                <span className="absolute top-0 h-5 w-1 -translate-x-1/2 rounded-full bg-slate-900" style={{ left: pct(item.ageYears) }} />
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
    </section>
  );
};
