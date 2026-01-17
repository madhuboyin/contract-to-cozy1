// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/MultiLineChart.tsx
'use client';

import React, { useMemo, useState } from 'react';

type Series = {
  key: string;
  label: string;
  values: number[];
  strokeWidth?: number;
  opacity?: number;
  dash?: string;
};

function fmtMoneyShort(v: number) {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function MultiLineChart(props: { xLabels: string[]; series: Series[]; ariaLabel?: string }) {
  const w = 720;
  const h = 200;
  const padL = 60,
    padR = 14,
    padT = 12,
    padB = 34;

  const safe = useMemo(() => {
    const xLabels = props.xLabels.length >= 2 ? props.xLabels : ['—', '—'];
    const series = (props.series || []).map((s, idx) => {
      const values = s.values?.length >= 2 ? s.values : [0, 0];
      const valuesNorm = values.length === xLabels.length ? values : values.slice(0, xLabels.length);
      return {
        key: s.key ?? `s${idx}`,
        label: s.label ?? `Series ${idx + 1}`,
        values: valuesNorm,
        strokeWidth: s.strokeWidth ?? 2.5,
        opacity: s.opacity ?? 0.75,
        dash: s.dash,
      };
    });
    return { xLabels, series };
  }, [props.xLabels, props.series]);

  const { minY, maxY, yTicks } = useMemo(() => {
    const all = safe.series.flatMap((s) => s.values);
    const rawMin = Math.min(...all, 0);
    const rawMax = Math.max(...all, 1);
    const span = Math.max(1e-6, rawMax - rawMin);
    const rel = span / Math.max(1, Math.max(Math.abs(rawMax), Math.abs(rawMin)));

    let min = rawMin,
      max = rawMax;
    if (rel < 0.12) {
      const pad = Math.max(Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.08, 250);
      min = rawMin - pad;
      max = rawMax + pad;
    }

    const ticks = [1, 0.75, 0.5, 0.25, 0].map((t) => min + (max - min) * t);
    return { minY: min, maxY: max, yTicks: ticks };
  }, [safe.series]);

  const spanY = Math.max(1e-6, maxY - minY);
  const xFor = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, safe.xLabels.length - 1);
  const yFor = (v: number) => padT + (h - padT - padB) * (1 - (v - minY) / spanY);

  const xTicks =
    safe.xLabels.length <= 5
      ? safe.xLabels.map((label, idx) => ({ idx, label }))
      : [
          { idx: 0, label: safe.xLabels[0] },
          { idx: Math.floor((safe.xLabels.length - 1) / 2), label: safe.xLabels[Math.floor((safe.xLabels.length - 1) / 2)] },
          { idx: safe.xLabels.length - 1, label: safe.xLabels[safe.xLabels.length - 1] },
        ];

  // ✅ Tooltip state (hovered index + cursor percent for positioning)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverXPct, setHoverXPct] = useState<number>(0);

  function dashFor(s: { dash?: string }, idx: number) {
    return s.dash ?? (idx === 0 ? undefined : idx === 1 ? '6 5' : '2 4');
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, rect.width);
    const xView = (px / Math.max(1, rect.width)) * w;

    // Convert x into nearest series index
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
    const rows = safe.series.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.values[hoverIdx] ?? 0,
    }));
    return { year, rows };
  }, [hoverIdx, safe.xLabels, safe.series]);

  return (
    <div className="w-full">
      {/* Chart area */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-[200px] text-black/70"
          preserveAspectRatio="none"
          role="img"
          aria-label={props.ariaLabel || 'Trend chart'}
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
                  {fmtMoneyShort(v)}
                </text>
              </g>
            );
          })}

          {/* series paths */}
          {safe.series.map((s, idx) => {
            const path = s.values
              .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
              .join(' ');
            const dash = dashFor(s, idx);
            return (
              <path
                key={s.key}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={s.strokeWidth}
                strokeOpacity={s.opacity}
                strokeDasharray={dash}
              >
                {/* ✅ basic browser tooltip fallback */}
                <title>{s.label}</title>
              </path>
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

          {/* ✅ hover marker + dots */}
          {hoverIdx !== null && (
            <g>
              <line
                x1={xFor(hoverIdx)}
                y1={padT}
                x2={xFor(hoverIdx)}
                y2={h - padB}
                stroke="currentColor"
                strokeOpacity="0.12"
              />
              {safe.series.map((s, idx) => {
                const dash = dashFor(s, idx);
                const v = s.values[hoverIdx] ?? 0;
                return (
                  <circle
                    key={`${s.key}-dot`}
                    cx={xFor(hoverIdx)}
                    cy={yFor(v)}
                    r={3.5}
                    fill="white"
                    stroke="currentColor"
                    strokeOpacity={s.opacity ?? 0.75}
                    strokeWidth={2}
                    // keep visual association with the line style (subtle)
                    strokeDasharray={dash}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* ✅ Hover tooltip (top-right-ish, follows cursor, clamps) */}
        {tooltip && (
          <div
            className="absolute top-2 z-10 rounded-xl border border-black/10 bg-white/95 backdrop-blur px-3 py-2 shadow-sm"
            style={{
              left: `calc(${Math.round(hoverXPct * 100)}% - 90px)`,
              width: 180,
              pointerEvents: 'none',
            }}
          >
            <div className="text-xs font-medium text-black/80">{tooltip.year}</div>
            <div className="mt-1 space-y-1">
              {tooltip.rows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 text-xs text-black/70">
                  <span className="truncate">{r.label}</span>
                  <span className="font-medium tabular-nums">{fmtMoneyShort(r.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ✅ Legend — bottom-right is the least visually noisy */}
      <div className="mt-2 flex flex-wrap justify-end gap-3 text-xs text-black/60">
        {safe.series.map((s, idx) => {
          const dash = dashFor(s, idx);
          const opacity = s.opacity ?? 0.75;
          const strokeWidth = s.strokeWidth ?? 2.5;
          return (
            <div key={`legend-${s.key}`} className="flex items-center gap-2">
              <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                <line
                  x1="1"
                  y1="5"
                  x2="25"
                  y2="5"
                  stroke="currentColor"
                  strokeOpacity={opacity}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
              </svg>
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
