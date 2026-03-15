'use client';

// apps/frontend/src/components/admin-analytics/AdminAnalyticsLineChart.tsx
//
// Lightweight SVG line chart for admin analytics.
// Follows the same custom-SVG pattern used in MultiLineChart.tsx.

import React, { useMemo, useState } from 'react';

interface ChartSeries {
  key: string;
  label: string;
  values: number[];
  color?: string;
  dash?: string;
}

interface Props {
  xLabels: string[];
  series: ChartSeries[];
  ariaLabel?: string;
  formatY?: (v: number) => string;
  height?: number;
}

const COLORS = ['#0f172a', '#64748b', '#94a3b8'];

function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

export default function AdminAnalyticsLineChart({
  xLabels,
  series,
  ariaLabel,
  formatY = fmt,
  height = 180,
}: Props) {
  const W = 720;
  const H = height;
  const padL = 52;
  const padR = 16;
  const padT = 10;
  const padB = 32;

  const safe = useMemo(() => {
    const labels = xLabels.length >= 2 ? xLabels : ['—', '—'];
    const ss = series.map((s, i) => ({
      ...s,
      values: s.values.length >= 2 ? s.values : [0, 0],
      color: s.color ?? COLORS[i % COLORS.length],
    }));
    return { labels, ss };
  }, [xLabels, series]);

  const { minY, maxY, yTicks } = useMemo(() => {
    const all = safe.ss.flatMap((s) => s.values);
    const rawMin = Math.min(...all, 0);
    const rawMax = Math.max(...all, 1);
    const span = Math.max(1e-6, rawMax - rawMin);
    let min = rawMin;
    let max = rawMax;
    if (span / Math.max(1, Math.abs(rawMax)) < 0.12) {
      const pad = Math.max(Math.abs(rawMax) * 0.1, 1);
      min -= pad;
      max += pad;
    }
    const ticks = [1, 0.75, 0.5, 0.25, 0].map((t) => min + (max - min) * t);
    return { minY: min, maxY: max, yTicks: ticks };
  }, [safe.ss]);

  const spanY = Math.max(1e-6, maxY - minY);
  const xFor = (i: number) =>
    padL + (i * (W - padL - padR)) / Math.max(1, safe.labels.length - 1);
  const yFor = (v: number) => padT + (H - padT - padB) * (1 - (v - minY) / spanY);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    safe.labels.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - xRel);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setHoverIdx(closest);
  }

  const tooltip =
    hoverIdx !== null
      ? {
          label: safe.labels[hoverIdx],
          rows: safe.ss.map((s) => ({ key: s.key, label: s.label, value: s.values[hoverIdx] ?? 0, color: s.color! })),
          x: xFor(hoverIdx),
        }
      : null;

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full text-slate-600"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel ?? 'Analytics chart'}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid lines + Y labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={yFor(v)}
                x2={W - padR}
                y2={yFor(v)}
                stroke="currentColor"
                strokeOpacity="0.07"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={yFor(v) + 4}
                fontSize="10"
                textAnchor="end"
                fill="currentColor"
                opacity="0.45"
              >
                {formatY(v)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {safe.labels.map((lbl, i) => {
            // Only show every Nth label to avoid crowding
            const step = Math.ceil(safe.labels.length / 8);
            if (i % step !== 0 && i !== safe.labels.length - 1) return null;
            return (
              <text
                key={i}
                x={xFor(i)}
                y={H - 6}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.4"
              >
                {lbl.length > 5 ? lbl.slice(5) : lbl} {/* show MM-DD for YYYY-MM-DD */}
              </text>
            );
          })}

          {/* Series lines */}
          {safe.ss.map((s) => (
            <path
              key={s.key}
              d={s.values
                .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeOpacity="0.85"
              strokeDasharray={s.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <line
              x1={xFor(hoverIdx)}
              y1={padT}
              x2={xFor(hoverIdx)}
              y2={H - padB}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Hover dots */}
          {hoverIdx !== null &&
            safe.ss.map((s) => (
              <circle
                key={s.key}
                cx={xFor(hoverIdx)}
                cy={yFor(s.values[hoverIdx] ?? 0)}
                r="3"
                fill={s.color}
                fillOpacity="0.9"
              />
            ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: Math.min(tooltip.x / 720 * 100, 80) + '%',
              transform: tooltip.x / 720 > 0.7 ? 'translateX(-100%)' : 'none',
            }}
          >
            <div className="mb-1.5 font-medium text-slate-700">{tooltip.label}</div>
            {tooltip.rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span
                    className="inline-block h-1.5 w-3 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  {r.label}
                </span>
                <span className="font-semibold text-slate-800">{fmt(r.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      {safe.ss.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          {safe.ss.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5 rounded-full"
                style={{ backgroundColor: s.color, opacity: 0.85 }}
              />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
