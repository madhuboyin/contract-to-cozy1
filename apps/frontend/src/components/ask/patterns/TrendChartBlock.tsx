'use client';

import { cn } from '@/lib/utils';
import { ActionLink } from '../blocks/context';
import type { AskBlockRenderer } from '../blocks/types';

// FRD v1.386. Draws the producer's series on one shared x axis (the Break-Even cost-vs-appreciation chart). Values, line styles,
// markers and the range-switch actions are declared by the server; this renderer only scales and draws them.

const WIDTH = 320;
const HEIGHT = 160;
const PAD = { left: 46, right: 10, top: 14, bottom: 22 };

const STROKE = {
  DEFAULT: 'stroke-slate-600',
  POSITIVE: 'stroke-emerald-600',
  CAUTION: 'stroke-amber-600',
  CRITICAL: 'stroke-red-600',
} as const;
const SWATCH = {
  DEFAULT: 'bg-slate-600',
  POSITIVE: 'bg-emerald-600',
  CAUTION: 'bg-amber-600',
  CRITICAL: 'bg-red-600',
} as const;

const compactMoney = (value: number) => {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fullMoney = (value: number) => `${value < 0 ? '-' : ''}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;

export const TrendChartBlock: AskBlockRenderer<'TREND_CHART'> = ({ block }) => {
  const all = block.series.flatMap((series) => series.values);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 1;
  const last = block.categories.length - 1;
  const x = (index: number) => PAD.left + (last === 0 ? 0 : (index / last) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => PAD.top + (1 - (value - min) / span) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks = [min, min + span / 2, max];
  const labelEvery = Math.ceil(block.categories.length / 6);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="trend-chart">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-950">{block.title}</h3>
          {block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
        </div>
        {block.actions.length > 0 && <div className="flex shrink-0 gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </div>
      <figure className="mt-3">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img"
          aria-label={`${block.title}. ${block.series.map((series) => `${series.label} ends at ${fullMoney(series.values[last])}`).join('; ')}.`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-100" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500" fontSize="9">{compactMoney(tick)}</text>
            </g>
          ))}
          {min < 0 && <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} className="stroke-slate-300" strokeWidth="1" />}
          {block.categories.map((category, index) => (index % labelEvery === 0 || index === last) && (
            <text key={category} x={x(index)} y={HEIGHT - 6} textAnchor="middle" className="fill-slate-500" fontSize="9">{category}</text>
          ))}
          {block.markers.map((marker) => (
            <g key={marker.id}>
              <line x1={x(marker.categoryIndex)} x2={x(marker.categoryIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-teal-600" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx={x(marker.categoryIndex)} cy={y(block.series[0].values[marker.categoryIndex])} r="3.5" className="fill-teal-600 stroke-white" strokeWidth="1.5" />
            </g>
          ))}
          {block.series.map((series) => (
            <polyline key={series.id} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={series.style === 'DASHED' ? '5 4' : undefined} className={STROKE[series.tone]}
              points={series.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')} />
          ))}
        </svg>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {block.series.map((series) => (
            <span key={series.id} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-block h-0.5 w-5', SWATCH[series.tone], series.style === 'DASHED' && 'opacity-60')} aria-hidden="true" />{series.label}
            </span>
          ))}
          {block.markers.map((marker) => (
            <span key={marker.id} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />{marker.label}</span>
          ))}
        </figcaption>
      </figure>
      <p className="mt-2 text-xs text-slate-500">{block.basis}</p>
      <table className="sr-only">
        <caption>{block.title}</caption>
        <thead><tr><th>Year</th>{block.series.map((series) => <th key={series.id}>{series.label}</th>)}</tr></thead>
        <tbody>{block.categories.map((category, index) => <tr key={category}><td>{category}</td>{block.series.map((series) => <td key={series.id}>{fullMoney(series.values[index])}</td>)}</tr>)}</tbody>
      </table>
    </section>
  );
};
