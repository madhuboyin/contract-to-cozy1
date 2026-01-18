// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/MiniLineChartPct.tsx
'use client';

import React, { useMemo, useState } from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type ChartEvent = {
  year: string; // must match xLabels entries
  type: 'INSURANCE_SHOCK' | 'TAX_RESET' | 'CLIMATE_EVENT' | string;
  description: string;
};

export default function MiniLineChartPct(props: {
  xLabels: string[];
  yValues: Array<number | null>;
  ariaLabel?: string;

  // ✅ Phase-2 additive
  events?: ChartEvent[];
}) {
  const w = 720;
  const h = 200;
  const padL = 60, padR = 14, padT = 12, padB = 34;

  const safe = useMemo(() => {
    const xLabels = props.xLabels.length >= 2 ? props.xLabels : ['—', '—'];
    const yRaw = props.yValues.length >= 2 ? props.yValues : [0, 0];
    const y = yRaw.length === xLabels.length ? yRaw : yRaw.slice(0, xLabels.length);
    return { xLabels, y };
  }, [props.xLabels, props.yValues]);

  const numeric = safe.y.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const rawMin = Math.min(...numeric, 0);
  const rawMax = Math.max(...numeric, 1);

  // Small padding so flat lines still look readable
  const span = Math.max(1e-6, rawMax - rawMin);
  const rel = span / Math.max(1, Math.max(Math.abs(rawMax), Math.abs(rawMin)));
  const pad = rel < 0.2 ? Math.max(Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.12, 2.5) : 0;

  const minY = rawMin - pad;
  const maxY = rawMax + pad;
  const spanY = Math.max(1e-6, maxY - minY);

  const xFor = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, safe.xLabels.length - 1);
  const yFor = (v: number) => padT + (h - padT - padB) * (1 - (v - minY) / spanY);

  const path = numeric
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
    .join(' ');

  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((t) => minY + (maxY - minY) * t);

  // X ticks: show all if <=5 else first/mid/last (same intent as your other charts)
  const xTicks =
    safe.xLabels.length <= 5
      ? safe.xLabels.map((lbl, idx) => ({ idx, label: lbl }))
      : [
          { idx: 0, label: safe.xLabels[0] },
          { idx: Math.floor((safe.xLabels.length - 1) / 2), label: safe.xLabels[Math.floor((safe.xLabels.length - 1) / 2)] },
          { idx: safe.xLabels.length - 1, label: safe.xLabels[safe.xLabels.length - 1] },
        ];

  // ✅ Phase-2: map events by year label for fast lookup
  const eventByYear = useMemo(() => {
    const m = new Map<string, ChartEvent[]>();
    for (const e of props.events || []) {
      const k = String(e.year);
      const arr = m.get(k) || [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [props.events]);

  // Hover tooltip (lightweight)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverXPct, setHoverXPct] = useState<number>(0);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, rect.width);
    const xView = (px / Math.max(1, rect.width)) * w;
    const t = (xView - padL) / Math.max(1, w - padL - padR);
    const idx = clamp(Math.round(t * (safe.xLabels.length - 1)), 0, safe.xLabels.length - 1);
    setHoverIdx(idx);
    setHoverXPct(clamp(px / Math.max(1, rect.width), 0, 1));
  }

  function onLeave() {
    setHoverIdx(null);
  }

  const tooltip = useMemo(() => {
    if (hoverIdx === null) return null;
    const year = safe.xLabels[hoverIdx] ?? '—';
    const v = numeric[hoverIdx] ?? 0;
    const evs = eventByYear.get(year) || [];
    return { year, v, evs };
  }, [hoverIdx, safe.xLabels, numeric, eventByYear]);

  function badgeLabel(type: string) {
    if (type === 'INSURANCE_SHOCK') return 'Insurance repricing';
    if (type === 'TAX_RESET') return 'Reassessment reset';
    if (type === 'CLIMATE_EVENT') return 'Regional sensitivity';
    return 'Event';
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[200px] text-black/70"
        preserveAspectRatio="none"
        role="img"
        aria-label={props.ariaLabel || 'Volatility YoY percent chart'}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* axes */}
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />

        {/* y ticks + grid */}
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="currentColor" strokeOpacity="0.06" />
              <text x={padL - 10} y={y + 4} fontSize="11" textAnchor="end" fill="currentColor" opacity="0.45">
                {`${Math.round(v)}%`}
              </text>
            </g>
          );
        })}

        {/* line */}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.75" />

        {/* ✅ Phase-2: event markers (anchored to datapoints) */}
        {safe.xLabels.map((lbl, idx) => {
          const evs = eventByYear.get(lbl);
          if (!evs || !evs.length) return null;

          const v = numeric[idx];
          if (!Number.isFinite(v)) return null;

          const x = xFor(idx);
          const y = yFor(v);

          // Subtle color hint by dominant event type (still calm)
          const type = evs[0]?.type;
          let stroke = 'currentColor';
          let strokeOpacity = 0.55;

          if (type === 'INSURANCE_SHOCK') strokeOpacity = 0.75;
          if (type === 'TAX_RESET') strokeOpacity = 0.65;
          if (type === 'CLIMATE_EVENT') strokeOpacity = 0.6;

          return (
            <g key={`ev-${lbl}`}>
              <circle
                cx={x}
                cy={y}
                r={3.5}
                fill="white"
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={2}
              />
            </g>
          );
        })}

        {/* x ticks */}
        {xTicks.map((t, i) => {
          const x = xFor(t.idx);
          return (
            <g key={i}>
              <line x1={x} y1={h - padB} x2={x} y2={h - padB + 5} stroke="currentColor" strokeOpacity="0.22" />
              <text x={x} y={h - 8} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.45">
                {t.label}
              </text>
            </g>
          );
        })}

        {/* hover marker */}
        {hoverIdx !== null && (
          <g>
            <line x1={xFor(hoverIdx)} y1={padT} x2={xFor(hoverIdx)} y2={h - padB} stroke="currentColor" strokeOpacity="0.12" />
            <circle cx={xFor(hoverIdx)} cy={yFor(numeric[hoverIdx] ?? 0)} r={3.5} fill="white" stroke="currentColor" strokeWidth={2} />
          </g>
        )}
      </svg>

      {tooltip && (
        <div
          className="absolute top-2 z-10 rounded-xl border border-black/10 bg-white/95 backdrop-blur px-3 py-2 shadow-sm"
          style={{ left: `calc(${Math.round(hoverXPct * 100)}% - 90px)`, width: 180, pointerEvents: 'none' }}
        >
          <div className="text-xs font-medium text-black/80">{tooltip.year}</div>
          <div className="mt-1 text-xs text-black/70 flex items-center justify-between">
            <span>Total YoY</span>
            <span className="font-medium tabular-nums">{tooltip.v.toFixed(1)}%</span>
          </div>

          {!!tooltip.evs.length && (
            <div className="mt-2 space-y-1">
              {tooltip.evs.slice(0, 2).map((e, i) => (
                <div key={i} className="text-[11px] text-black/60 leading-4">
                  <span className="inline-block mr-1 rounded border border-black/10 bg-white px-1.5 py-0.5">
                    {badgeLabel(e.type)}
                  </span>
                  {e.description}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
