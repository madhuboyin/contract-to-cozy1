// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/ComparisonBars.tsx
'use client';

import React from 'react';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

export default function ComparisonBars(props: {
  sell: number;
  hold: number;
  rent: number;
  winner: 'SELL'|'HOLD'|'RENT';
}) {
  const vals = [
    { k: 'SELL' as const, label: 'Sell', v: props.sell ?? 0 },
    { k: 'HOLD' as const, label: 'Hold', v: props.hold ?? 0 },
    { k: 'RENT' as const, label: 'Rent', v: props.rent ?? 0 },
  ];

  const maxAbs = Math.max(1, ...vals.map((x) => Math.abs(x.v)));

  return (
    <div className="space-y-2">
      {vals.map((row) => {
        const pct = Math.round((Math.abs(row.v) / maxAbs) * 100);
        const positive = row.v >= 0;
        const active = props.winner === row.k;

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
              <div className="text-sm font-semibold">{money(row.v)}</div>
            </div>

            <div className="mt-2 h-2 rounded-full bg-black/5 overflow-hidden">
              <div
                className={`h-full ${positive ? 'bg-emerald-500/40' : 'bg-rose-500/35'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-1 text-xs text-black/60">
              {positive ? 'Net positive' : 'Net negative'} • relative magnitude
            </div>
          </div>
        );
      })}
    </div>
  );
}
