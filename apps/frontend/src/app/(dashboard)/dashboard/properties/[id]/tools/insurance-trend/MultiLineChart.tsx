// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/MultiLineChart.tsx
'use client';
import React, { useMemo } from 'react';

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

export default function MultiLineChart(props: { xLabels: string[]; series: Series[]; ariaLabel?: string }) {
  const w = 720;
  const h = 200;
  const padL = 60, padR = 14, padT = 12, padB = 34;

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

    let min = rawMin, max = rawMax;
    if (rel < 0.12) {
      const pad = Math.max(Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.08, 250);
      min = rawMin - pad; max = rawMax + pad;
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

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px] text-black/70" preserveAspectRatio="none" role="img" aria-label={props.ariaLabel || 'Insurance trend chart'}>
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />
      <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />

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

      {safe.series.map((s, idx) => {
        const path = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`).join(' ');
        const dash = s.dash ?? (idx === 0 ? undefined : idx === 1 ? '6 5' : '2 4');
        return (
          <path key={s.key} d={path} fill="none" stroke="currentColor" strokeWidth={s.strokeWidth} strokeOpacity={s.opacity} strokeDasharray={dash} />
        );
      })}

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
    </svg>
  );
}
