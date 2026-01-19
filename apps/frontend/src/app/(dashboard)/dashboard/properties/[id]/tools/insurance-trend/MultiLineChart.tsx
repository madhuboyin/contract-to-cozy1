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

export default function MultiLineChart(props: {
  xLabels: string[];
  series: Series[];
  ariaLabel?: string;

  // ✅ NEW (additive)
  verticalMarkerIndex?: number | null; // 0-based index into xLabels
  verticalMarkerLabel?: string;
  eventMarkers?: Array<{ idx: number; label: string }>; // idx is 0-based
}) {
  const w = 720;
  const h = 200;
  const padL = 60, padR = 14, padT = 12, padB = 34;

  const safe = useMemo(() => {
    const xLabels = props.xLabels.length >= 2 ? props.xLabels : ['—', '—'];
    const series = (props.series || []).map((s, idx) => {
      const values = s.values?.length >= 2 ? s.values : [0, 0];
      const norm = values.length === xLabels.length ? values : values.slice(0, xLabels.length);
      return {
        key: s.key ?? `s${idx}`,
        label: s.label ?? `Series ${idx + 1}`,
        values: norm,
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

    let min = rawMin;
    let max = rawMax;

    if (span / Math.max(1, Math.abs(rawMax)) < 0.12) {
      const pad = Math.max(Math.abs(rawMax) * 0.08, 250);
      min -= pad;
      max += pad;
    }

    return {
      minY: min,
      maxY: max,
      yTicks: [1, 0.75, 0.5, 0.25, 0].map((t) => min + (max - min) * t),
    };
  }, [safe.series]);

  const spanY = Math.max(1e-6, maxY - minY);
  const xFor = (i: number) =>
    padL + (i * (w - padL - padR)) / Math.max(1, safe.xLabels.length - 1);
  const yFor = (v: number) =>
    padT + (h - padT - padB) * (1 - (v - minY) / spanY);

  const xTicks =
    safe.xLabels.length <= 5
      ? safe.xLabels.map((label, idx) => ({ idx, label }))
      : [
          { idx: 0, label: safe.xLabels[0] },
          { idx: Math.floor((safe.xLabels.length - 1) / 2), label: safe.xLabels[Math.floor((safe.xLabels.length - 1) / 2)] },
          { idx: safe.xLabels.length - 1, label: safe.xLabels[safe.xLabels.length - 1] },
        ];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverXPct, setHoverXPct] = useState(0);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, rect.width);
    const t = (px / rect.width);
    const idx = clamp(
      Math.round(t * (safe.xLabels.length - 1)),
      0,
      safe.xLabels.length - 1
    );
    setHoverIdx(idx);
    setHoverXPct(px / rect.width);
  }

  function dashFor(s: Series, idx: number) {
    return s.dash ?? (idx === 0 ? undefined : idx === 1 ? '6 5' : '2 4');
  }

  const tooltip =
    hoverIdx === null
      ? null
      : {
          year: safe.xLabels[hoverIdx],
          rows: safe.series.map((s) => ({
            key: s.key,
            label: s.label,
            value: s.values[hoverIdx] ?? 0,
          })),
        };

  const vIdx =
    props.verticalMarkerIndex === null || props.verticalMarkerIndex === undefined
      ? null
      : clamp(props.verticalMarkerIndex, 0, safe.xLabels.length - 1);

  const events = (props.eventMarkers || []).filter((e) => e.idx >= 0 && e.idx < safe.xLabels.length);

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full h-[200px] text-black/70"
          preserveAspectRatio="none"
          role="img"
          aria-label={props.ariaLabel || 'Trend chart'}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* axes */}
          <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />

          {/* y grid */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={yFor(v)} x2={w - padR} y2={yFor(v)} stroke="currentColor" strokeOpacity="0.06" />
              <text x={padL - 10} y={yFor(v) + 4} fontSize="11" textAnchor="end" fill="currentColor" opacity="0.45">
                {fmtMoneyShort(v)}
              </text>
            </g>
          ))}

          {/* ✅ vertical marker (break-even) */}
          {vIdx !== null && (
            <g>
              <line
                x1={xFor(vIdx)}
                y1={padT}
                x2={xFor(vIdx)}
                y2={h - padB}
                stroke="currentColor"
                strokeOpacity="0.18"
              />
              {props.verticalMarkerLabel && (
                <text
                  x={xFor(vIdx)}
                  y={padT + 10}
                  fontSize="11"
                  textAnchor="middle"
                  fill="currentColor"
                  opacity="0.55"
                >
                  {props.verticalMarkerLabel}
                </text>
              )}
            </g>
          )}

          {/* lines */}
          {safe.series.map((s, idx) => (
            <path
              key={s.key}
              d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={s.strokeWidth}
              strokeOpacity={s.opacity}
              strokeDasharray={dashFor(s, idx)}
            />
          ))}

          {/* ✅ event markers (dots near top, calm) */}
          {events.map((e, i) => (
            <g key={i}>
              <circle
                cx={xFor(e.idx)}
                cy={padT + 6}
                r={3.5}
                fill="currentColor"
                opacity="0.25"
              >
                <title>{e.label}</title>
              </circle>
            </g>
          ))}

          {/* hover */}
          {hoverIdx !== null && (
            <line
              x1={xFor(hoverIdx)}
              y1={padT}
              x2={xFor(hoverIdx)}
              y2={h - padB}
              stroke="currentColor"
              strokeOpacity="0.12"
            />
          )}

          {/* x ticks */}
          {xTicks.map((t, i) => (
            <text key={i} x={xFor(t.idx)} y={h - 8} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.45">
              {t.label}
            </text>
          ))}
        </svg>

        {/* tooltip */}
        {tooltip && (
          <div
            className="absolute top-2 rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-xs shadow-sm"
            style={{ left: `calc(${hoverXPct * 100}% - 90px)`, width: 180, pointerEvents: 'none' }}
          >
            <div className="font-medium mb-1">{tooltip.year}</div>
            {tooltip.rows.map((r) => (
              <div key={r.key} className="flex justify-between gap-3 text-black/70">
                <span>{r.label}</span>
                <span className="font-medium">{fmtMoneyShort(r.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-2 flex justify-end gap-3 text-xs text-black/60">
        {safe.series.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-2">
            <svg width="26" height="10">
              <line
                x1="1"
                y1="5"
                x2="25"
                y2="5"
                stroke="currentColor"
                strokeOpacity={s.opacity ?? 0.75}
                strokeWidth={s.strokeWidth ?? 2.5}
                strokeDasharray={dashFor(s, idx)}
                strokeLinecap="round"
              />
            </svg>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
