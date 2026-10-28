'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ActionLink } from '../blocks/context';
import type { AskBlockRenderer } from '../blocks/types';

// FRD v1.386. Draws the producer's series on one shared x axis (the Break-Even cost-vs-appreciation chart). Values, line styles,
// markers and the range-switch actions are declared by the server; this renderer only scales and draws them.

const WIDTH = 640;
const HEIGHT = 185;
const PAD = { left: 52, right: 14, top: 14, bottom: 22 };

const STROKE = {
  DEFAULT: 'stroke-slate-600',
  POSITIVE: 'stroke-emerald-600',
  CAUTION: 'stroke-amber-600',
  CRITICAL: 'stroke-red-600',
} as const;
const FILL_HEX = {
  DEFAULT: '#475569',
  POSITIVE: '#059669',
  CAUTION: '#d97706',
  CRITICAL: '#dc2626',
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
const compactPercent = (value: number) => `${value.toFixed(2)}%`;
const fullPercent = (value: number) => `${value.toFixed(3)}%`;

export const TrendChartBlock: AskBlockRenderer<'TREND_CHART'> = ({ block }) => {
  const rateHistory = block.id === 'refinance-rate-history-chart';
  const [rateView, setRateView] = useState<'BOTH' | '30' | '15'>('BOTH');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const visibleSeries = rateHistory && rateView !== 'BOTH'
    ? block.series.filter((series) => rateView === '30' ? series.id === 'rate-30' : series.id === 'rate-15')
    : block.series;
  const visibleSeriesIds = new Set(visibleSeries.map((series) => series.id));
  const visibleReferenceLines = (block.referenceLines ?? []).filter((line) => !line.seriesId || visibleSeriesIds.has(line.seriesId));
  const visibleHighlights = (block.highlights ?? []).filter((highlight) => visibleSeriesIds.has(highlight.seriesId));
  const percent = block.valueFormat === 'PERCENT';
  const compact = percent ? compactPercent : compactMoney;
  const full = percent ? fullPercent : fullMoney;
  const all = visibleSeries.flatMap((series) => series.values);
  const fit = block.scale === 'FIT';
  const lowest = Math.min(...all);
  const highest = Math.max(...all);
  const margin = fit ? ((highest - lowest) || Math.abs(highest) * 0.05 || 1) * 0.12 : 0;
  const min = fit ? lowest - margin : Math.min(0, ...all);
  const max = fit ? highest + margin : Math.max(0, ...all);
  const span = max - min || 1;
  const last = block.categories.length - 1;
  const x = (index: number) => PAD.left + (last === 0 ? 0 : (index / last) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => PAD.top + (1 - (value - min) / span) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks = [min, min + span / 2, max];
  const labelEvery = Math.ceil(block.categories.length / 6);
  const baselineY = y(fit ? min : Math.max(0, min));
  const inRangeReferenceLines = visibleReferenceLines.filter((line) => line.value >= min && line.value <= max);
  const outOfRangeReferenceLines = visibleReferenceLines.filter((line) => line.value < min || line.value > max);
  const areaD = (values: number[]) => {
    if (values.length <= 1) return '';
    const linePoints = values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
    return `${linePoints} L ${x(values.length - 1).toFixed(1)} ${baselineY.toFixed(1)} L ${x(0).toFixed(1)} ${baselineY.toFixed(1)} Z`;
  };
  const activateNearest = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const chartX = ((clientX - rect.left) / Math.max(1, rect.width)) * WIDTH;
    const approximate = Math.round(((chartX - PAD.left) / Math.max(1, WIDTH - PAD.left - PAD.right)) * Math.max(1, last));
    setActiveIndex(Math.min(last, Math.max(0, approximate)));
  };

  return (
    <section className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs" data-display-pattern="trend-chart">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{percent ? 'Rate trend' : 'Cumulative Trajectory'}</span>
          </div>
          {block.description && <p className="mt-0.5 text-xs text-slate-500">{block.description}</p>}
        </div>
        {block.actions.length > 0 && <div className="flex shrink-0 gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </div>
      <div className="p-3 sm:px-4 sm:py-3">
        <figure>
          {rateHistory && <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Mortgage rate series">
            {([['BOTH', 'Both rates'], ['30', '30-year'], ['15', '15-year']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={rateView === value} onClick={() => { setRateView(value); setActiveIndex(null); }} className={cn('min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors', rateView === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300')}>{label}</button>)}
          </div>}
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img"
              aria-label={`${block.title}. ${visibleSeries.map((series) => `${series.label} ends at ${full(series.values[last])}`).join('; ')}.${visibleHighlights.length ? ` ${visibleHighlights.map((item) => item.label).join('; ')}.` : ''}${visibleReferenceLines.length ? ` ${visibleReferenceLines.map((item) => item.label).join('; ')}.` : ''}${(block.ranges ?? []).length ? ` ${(block.ranges ?? []).length} historical opportunity window${(block.ranges ?? []).length === 1 ? '' : 's'}.` : ''}`}
              onMouseMove={rateHistory ? (event) => activateNearest(event.clientX, event.currentTarget) : undefined}
              onMouseLeave={rateHistory ? () => setActiveIndex(null) : undefined}
              onTouchMove={rateHistory ? (event) => { const touch = event.touches[0]; if (touch) activateNearest(touch.clientX, event.currentTarget); } : undefined}>
              <defs>
                {visibleSeries.map((series) => (
                  <linearGradient key={`grad-${series.id}`} id={`trend-grad-${block.id}-${series.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={FILL_HEX[series.tone]} stopOpacity="0.16" />
                    <stop offset="100%" stopColor={FILL_HEX[series.tone]} stopOpacity="0.0" />
                  </linearGradient>
                ))}
              </defs>
              {(block.ranges ?? []).map((range) => {
                const startX = x(range.startIndex);
                const endX = x(range.endIndex);
                return <rect key={range.id} x={Math.max(PAD.left, startX - 3)} y={PAD.top} width={Math.max(6, endX - startX + 6)} height={HEIGHT - PAD.top - PAD.bottom} fill={FILL_HEX[range.tone]} fillOpacity="0.08" aria-hidden="true" />;
              })}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200/70" strokeWidth="1" />
                  <text data-chart-axis-tick="y" x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500 font-medium" fontSize="11">{compact(tick)}</text>
                </g>
              ))}
              {!fit && min < 0 && <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} className="stroke-slate-300" strokeWidth="1" />}
              {inRangeReferenceLines.map((line) => (
                <g key={line.id}>
                  <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(line.value)} y2={y(line.value)} stroke={FILL_HEX[line.tone]} strokeWidth="1.5" strokeDasharray={line.style === 'DASHED' ? '6 4' : undefined} />
                  <text x={WIDTH - PAD.right - 2} y={Math.max(PAD.top + 10, y(line.value) - 5)} textAnchor="end" fill={FILL_HEX[line.tone]} fontSize="9.5" fontWeight="600">{line.label}</text>
                </g>
              ))}
              {block.categories.map((category, index) => (index % labelEvery === 0 || index === last) && (
                <text key={category} x={x(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-600 font-medium" fontSize="11">{category}</text>
              ))}
              {visibleSeries.map((series) => (
                <path key={`area-${series.id}`} d={areaD(series.values)} fill={`url(#trend-grad-${block.id}-${series.id})`} />
              ))}
              {block.markers.map((marker) => (
                <g key={marker.id}>
                  <line x1={x(marker.categoryIndex)} x2={x(marker.categoryIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-teal-600" strokeWidth="1.5" strokeDasharray="3 3" />
                  <circle cx={x(marker.categoryIndex)} cy={y(visibleSeries[0].values[marker.categoryIndex])} r="5" className="fill-teal-600 stroke-white" strokeWidth="2" />
                </g>
              ))}
              {activeIndex != null && rateHistory && <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-slate-500" strokeWidth="1" strokeDasharray="3 3" />}
              {visibleSeries.map((series) => (
                <polyline key={series.id} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={series.style === 'DASHED' ? '6 4' : undefined} className={STROKE[series.tone]}
                  points={series.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')} />
              ))}
              {activeIndex != null && visibleSeries.map((series) => <circle key={`active-${series.id}`} cx={x(activeIndex)} cy={y(series.values[activeIndex])} r="4" fill={FILL_HEX[series.tone]} stroke="white" strokeWidth="2" />)}
              {visibleHighlights.map((highlight) => {
                const series = visibleSeries.find((item) => item.id === highlight.seriesId);
                const value = series?.values[highlight.categoryIndex];
                if (value == null) return null;
                const isHigh = highlight.id.includes('high');
                return <g key={highlight.id}>
                  <circle cx={x(highlight.categoryIndex)} cy={y(value)} r="4.5" fill={FILL_HEX[highlight.tone]} stroke="white" strokeWidth="2" />
                  <text x={x(highlight.categoryIndex)} y={y(value) + (isHigh ? -8 : 13)} textAnchor="middle" fill={FILL_HEX[highlight.tone]} fontSize="9.5" fontWeight="700">{highlight.label}</text>
                </g>;
              })}
            </svg>
          </div>
          <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-700">
              {visibleSeries.map((series) => (
                <span key={series.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-0.5">
                  <span className={cn('inline-block h-0.5 w-3.5', SWATCH[series.tone], series.style === 'DASHED' && 'opacity-70')} aria-hidden="true" />
                  <span>{series.label}</span>
                  {last >= 0 && <strong className="ml-0.5 font-bold tabular-nums text-slate-900" aria-hidden="true">({compact(series.values[last])})</strong>}
                </span>
              ))}
              {block.markers.map((marker) => (
                <span key={marker.id} className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 font-semibold text-teal-900">
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
                  {marker.label}
                </span>
              ))}
              {(block.ranges ?? []).map((range) => (
                <span key={range.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-900">
                  <span className="inline-block h-2 w-3 rounded-sm bg-emerald-200" aria-hidden="true" />
                  {range.label}
                </span>
              ))}
            </div>
          </figcaption>
          {outOfRangeReferenceLines.length > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="Rates outside the displayed benchmark range">
            {outOfRangeReferenceLines.map((line) => <span key={line.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{line.value < min ? '↓' : '↑'} {line.label} — {line.value < min ? 'below' : 'above'} chart range</span>)}
          </div>}
          {rateHistory && activeIndex != null && <div className="mt-2 rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2 text-xs text-slate-700" role="status">
            <strong className="text-slate-950">{block.categories[activeIndex]}</strong>
            {visibleSeries.map((series) => <span key={series.id} className="ml-3">{series.label}: <strong>{full(series.values[activeIndex])}</strong></span>)}
          </div>}
        </figure>
        <p className="mt-1.5 text-xs text-slate-500">{block.basis}</p>
        <table className="sr-only">
          <caption>{block.title}</caption>
          <thead><tr><th>{percent ? 'Date' : 'Year'}</th>{visibleSeries.map((series) => <th key={series.id}>{series.label}</th>)}</tr></thead>
          <tbody>{block.categories.map((category, index) => <tr key={category}><td>{category}</td>{visibleSeries.map((series) => <td key={series.id}>{full(series.values[index])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
};
