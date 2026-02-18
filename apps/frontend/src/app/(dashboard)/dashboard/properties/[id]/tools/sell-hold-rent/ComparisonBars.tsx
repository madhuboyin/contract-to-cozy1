// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/ComparisonBars.tsx
'use client';

import React from 'react';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

export default function ComparisonBars(props: {
  sell?: number | null;
  hold?: number | null;
  rent?: number | null;
  winner?: 'SELL' | 'HOLD' | 'RENT';
}) {
  const vals = [
    { k: 'SELL' as const, label: 'Sell', v: props.sell },
    { k: 'HOLD' as const, label: 'Hold', v: props.hold },
    { k: 'RENT' as const, label: 'Rent', v: props.rent },
  ];

  const present = vals.filter((x) => typeof x.v === 'number' && Number.isFinite(x.v as number));
  if (present.length === 0) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/70 p-3 text-xs text-slate-500 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">
        No scenario data yet.
      </div>
    );
  }

  const maxAbs = Math.max(1, ...present.map((x) => Math.abs(x.v as number)));

  return (
    <div className="space-y-2">
      {vals.map((row) => {
        const v = typeof row.v === 'number' && Number.isFinite(row.v) ? row.v : null;
        const pct = v === null ? 0 : Math.round((Math.abs(v) / maxAbs) * 100);
        const positive = v === null ? true : v >= 0;
        const active = props.winner ? props.winner === row.k : false;

        return (
          <div key={row.k} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {row.label}{' '}
                {active && (
                  <span className="ml-2 rounded-full border border-teal-200/70 bg-teal-50/85 px-2 py-0.5 text-xs text-teal-700 dark:border-teal-700/60 dark:bg-teal-900/30 dark:text-teal-200">
                    Best
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{money(v)}</div>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60">
              <div
                className={`h-full ${positive ? 'bg-gradient-to-r from-emerald-400/80 to-teal-500/80' : 'bg-gradient-to-r from-rose-400/80 to-amber-400/80'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              {v === null ? '—' : positive ? 'Net positive' : 'Net negative'} • relative magnitude
            </div>
          </div>
        );
      })}
    </div>
  );
}
