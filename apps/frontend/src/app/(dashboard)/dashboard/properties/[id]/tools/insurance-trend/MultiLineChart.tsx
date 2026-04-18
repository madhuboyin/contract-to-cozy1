'use client';

import React, { useEffect, useMemo, useState } from 'react';

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
  gapFill?: boolean;        // shades area between series[0] and series[1]
  annotation?: string;       // floating label near latest point, e.g. "+$899 above avg"

  // additive marker props
  verticalMarkerIndex?: number | null;
  verticalMarkerLabel?: string;
  eventMarkers?: Array<{ idx: number; label: string }>;
}) {
  const w = 720;
  const h = 260;
  const padL = 64, padR = 32, padT = 24, padB = 42;

  // Subtle load animation — fade + slight opacity reveal
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const safe = useMemo(() => {
    const xLabels = props.xLabels.length >= 2 ? props.xLabels : ['—', '—'];
    const series = (props.series || []).map((s, idx) => {
      const values = s.values?.length >= 2 ? s.values : [0, 0];
      const norm = values.length === xLabels.length ? values : values.slice(0, xLabels.length);
      return {
        key: s.key ?? `s${idx}`,
        label: s.label ?? `Series ${idx + 1}`,
        values: norm,
        strokeWidth: s.strokeWidth ?? (idx === 0 ? 3 : 1.5),
        opacity: s.opacity ?? (idx === 0 ? 1 : 0.4),
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
    } else {
      max += span * 0.1; // headroom for labels
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
    const t = px / rect.width;
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

  // Gap fill path
  const gapFillPath = useMemo(() => {
    if (!props.gapFill || safe.series.length < 2) return null;
    const s0 = safe.series[0];
    const s1 = safe.series[1];
    if (s0.values.length !== s1.values.length) return null;
    const forward = s0.values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
      .join(' ');
    const backward = [...s1.values]
      .reverse()
      .map((v, i, arr) => `L ${xFor(arr.length - 1 - i).toFixed(1)} ${yFor(v).toFixed(1)}`)
      .join(' ');
    return `${forward} ${backward} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gapFill, safe.series, minY, maxY, spanY]);

  // Annotation position — midpoint between s0 and s1 at last index
  const annotationPos = useMemo(() => {
    if (!props.annotation || safe.series.length < 2) return null;
    const lastIdx = safe.series[0].values.length - 1;
    const y0 = yFor(safe.series[0].values[lastIdx]);
    const y1 = yFor(safe.series[1].values[lastIdx]);
    const gap = Math.abs(y0 - y1);
    if (gap < 16) return null; // not enough room
    return { x: xFor(lastIdx) - 14, y: (y0 + y1) / 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.annotation, safe.series, minY, maxY, spanY]);

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-[260px] w-full text-slate-600 dark:text-slate-300"
          preserveAspectRatio="none"
          role="img"
          aria-label={props.ariaLabel || 'Trend chart'}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Axes */}
          <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.2" />
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="currentColor" strokeOpacity="0.2" />

          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={padL} y1={yFor(v)} x2={w - padR} y2={yFor(v)}
                stroke="currentColor" strokeOpacity="0.10"
              />
              <text
                x={padL - 10} y={yFor(v) + 4}
                fontSize="13" textAnchor="end"
                fill="currentColor" opacity="0.70"
              >
                {fmtMoneyShort(v)}
              </text>
            </g>
          ))}

          {/* Vertical marker */}
          {vIdx !== null && (
            <g>
              <line
                x1={xFor(vIdx)} y1={padT} x2={xFor(vIdx)} y2={h - padB}
                stroke="currentColor" strokeOpacity="0.18"
              />
              {props.verticalMarkerLabel && (
                <text
                  x={xFor(vIdx)} y={padT + 10}
                  fontSize="11" textAnchor="middle"
                  fill="currentColor" opacity="0.55"
                >
                  {props.verticalMarkerLabel}
                </text>
              )}
            </g>
          )}

          {/* Gap fill — subtle area between lines */}
          {gapFillPath && (
            <path
              d={gapFillPath}
              fill="currentColor"
              fillOpacity={mounted ? 0.07 : 0}
              stroke="none"
              style={{ transition: 'fill-opacity 500ms ease-out 100ms' }}
            />
          )}

          {/* Series lines — fade in on mount */}
          {safe.series.map((s, idx) => (
            <path
              key={s.key}
              d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={s.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashFor(s, idx)}
              style={{
                opacity: mounted ? s.opacity : 0,
                transition: `opacity ${380 + idx * 120}ms cubic-bezier(0.4,0,0.2,1) ${idx * 60}ms`,
              }}
            />
          ))}

          {/* Endpoint dot + value for premium line */}
          {safe.series.length > 0 && safe.series[0].values.length > 0 && (() => {
            const s = safe.series[0];
            const lastIdx = s.values.length - 1;
            const cx = xFor(lastIdx);
            const cy = yFor(s.values[lastIdx]);
            const labelY = cy - 10 < padT + 14 ? cy + 14 : cy - 10;
            return (
              <g
                style={{
                  opacity: mounted ? 1 : 0,
                  transition: 'opacity 400ms ease-out 350ms',
                }}
              >
                <circle cx={cx} cy={cy} r={5} fill="currentColor" fillOpacity={0.9} stroke="white" strokeWidth={2} />
                <text
                  x={cx - 8} y={labelY}
                  fontSize="11" textAnchor="end"
                  fill="currentColor" opacity={0.75}
                  fontWeight="600"
                >
                  {fmtMoneyShort(s.values[lastIdx])}
                </text>
              </g>
            );
          })()}

          {/* Gap annotation — floating label between endpoints */}
          {annotationPos && props.annotation && (
            <text
              x={annotationPos.x} y={annotationPos.y + 4}
              fontSize="10" textAnchor="end"
              fill="currentColor"
              style={{
                opacity: mounted ? 0.55 : 0,
                transition: 'opacity 500ms ease-out 450ms',
              }}
            >
              {props.annotation}
            </text>
          )}

          {/* Event markers */}
          {events.map((e, i) => (
            <g key={i}>
              <circle cx={xFor(e.idx)} cy={padT + 6} r={3.5} fill="currentColor" opacity="0.25">
                <title>{e.label}</title>
              </circle>
            </g>
          ))}

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <line
              x1={xFor(hoverIdx)} y1={padT}
              x2={xFor(hoverIdx)} y2={h - padB}
              stroke="currentColor" strokeOpacity="0.14"
              strokeDasharray="3 3"
            />
          )}

          {/* X tick labels */}
          {xTicks.map((t, i) => (
            <text
              key={i} x={xFor(t.idx)} y={h - 11}
              fontSize="13" textAnchor="middle"
              fill="currentColor" opacity="0.70"
            >
              {t.label}
            </text>
          ))}
        </svg>

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute top-2 rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95"
            style={{ left: `calc(${hoverXPct * 100}% - 90px)`, width: 188 }}
          >
            <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">{tooltip.year}</div>
            {tooltip.rows.map((r) => (
              <div key={r.key} className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
                <span>{r.label}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtMoneyShort(r.value)}</span>
              </div>
            ))}
            {tooltip.rows.length === 2 && (
              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700/50">
                <div className="flex justify-between gap-3 text-slate-500 dark:text-slate-400">
                  <span>Difference</span>
                  <span className={`font-semibold ${tooltip.rows[0].value > tooltip.rows[1].value ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {fmtMoneyShort(tooltip.rows[0].value - tooltip.rows[1].value)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {safe.series.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <svg width="24" height="10" aria-hidden="true">
              <line
                x1="1" y1="5" x2="23" y2="5"
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
