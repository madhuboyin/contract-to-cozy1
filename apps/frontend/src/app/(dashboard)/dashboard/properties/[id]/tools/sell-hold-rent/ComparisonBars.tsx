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
      <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs text-black/60">
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
          <div key={row.k} className="rounded-xl border border-black/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">
                {row.label}{' '}
                {active && (
                  <span className="ml-2 text-xs rounded-full border border-black/10 bg-black/[0.04] px-2 py-0.5">
                    Best
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold">{money(v)}</div>
            </div>

            <div className="mt-2 h-2 rounded-full bg-black/5 overflow-hidden">
              <div
                className={`h-full ${positive ? 'bg-emerald-500/40' : 'bg-rose-500/35'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-1 text-xs text-black/60">
              {v === null ? '—' : positive ? 'Net positive' : 'Net negative'} • relative magnitude
            </div>
          </div>
        );
      })}
    </div>
  );
}
