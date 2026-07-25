'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { RateHistoryDTO } from './mortgageRefinanceRadarApi';
import {
  buildMortgageRateChartModel,
  type MortgageRateProduct,
  type MortgageRateRange,
} from './mortgageRateChartModel';

const WIDTH = 760;
const HEIGHT = 280;
const PAD = { left: 54, right: 22, top: 22, bottom: 42 };

function formatDate(value: string, includeYear = false) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function formatIngestedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MortgageRateHistoryChart({
  rateData,
  currentMortgageRatePct,
}: {
  rateData: RateHistoryDTO;
  currentMortgageRatePct?: number | null;
}) {
  const [product, setProduct] = useState<MortgageRateProduct>('30YR');
  const [range, setRange] = useState<MortgageRateRange>('1Y');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const model = useMemo(
    () => buildMortgageRateChartModel({
      snapshots: rateData.snapshots,
      product,
      range,
      currentMortgageRatePct,
    }),
    [currentMortgageRatePct, product, range, rateData.snapshots],
  );

  if (model.points.length === 0) return null;

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const spanY = Math.max(0.001, model.maxY - model.minY);
  const xFor = (index: number) =>
    PAD.left + (index * innerWidth) / Math.max(1, model.points.length - 1);
  const yFor = (value: number) =>
    PAD.top + innerHeight * (1 - (value - model.minY) / spanY);
  const linePath = model.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.value)}`)
    .join(' ');
  const selectedPoint = activeIndex == null ? null : model.points[activeIndex] ?? null;
  const productLabel = product === '30YR' ? '30-year fixed benchmark' : '15-year fixed benchmark';
  const rangeLabel = range === '1Y' ? 'one year' : 'three months';
  const change = model.changePctPoints;
  const summary = change == null
    ? `${productLabel} history contains one observation.`
    : change < 0
      ? `${productLabel} fell ${Math.abs(change).toFixed(3)} percentage points over ${rangeLabel}.`
      : change > 0
        ? `${productLabel} rose ${change.toFixed(3)} percentage points over ${rangeLabel}.`
        : `${productLabel} was unchanged over ${rangeLabel}.`;

  function activateNearestPoint(clientX: number, element: SVGSVGElement) {
    const rect = element.getBoundingClientRect();
    const chartX = ((clientX - rect.left) / rect.width) * WIDTH;
    const approximate = Math.round(
      ((chartX - PAD.left) / innerWidth) * Math.max(1, model.points.length - 1),
    );
    setActiveIndex(Math.min(model.points.length - 1, Math.max(0, approximate)));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-blue-50/40 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              One-year mortgage rate trend
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              National market context—not a personalized lender quote.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Rate chart controls">
            {(['30YR', '15YR'] as MortgageRateProduct[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={product === value}
                onClick={() => {
                  setProduct(value);
                  setActiveIndex(null);
                }}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
                  product === value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                }`}
              >
                {value === '30YR' ? '30-year' : '15-year'}
              </button>
            ))}
            {(['3M', '1Y'] as MortgageRateRange[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={range === value}
                onClick={() => {
                  setRange(value);
                  setActiveIndex(null);
                }}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
                  range === value
                    ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <p id="mortgage-rate-chart-summary" className="mt-4 text-sm text-slate-700 dark:text-slate-300">
          {summary}
        </p>

        {model.isCompactHistory && (
          <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300">
            A longer trend will appear as additional weekly observations are collected.
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[260px] min-w-[620px] w-full text-slate-600 dark:text-slate-300"
            role="img"
            aria-labelledby="mortgage-rate-chart-title mortgage-rate-chart-summary"
            onMouseMove={(event) => activateNearestPoint(event.clientX, event.currentTarget)}
            onMouseLeave={() => setActiveIndex(null)}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) activateNearestPoint(touch.clientX, event.currentTarget);
            }}
          >
            <title id="mortgage-rate-chart-title">
              {productLabel} with the homeowner&apos;s current mortgage rate
            </title>
            {model.yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />
                <text
                  x={PAD.left - 9}
                  y={yFor(tick) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.7"
                >
                  {tick.toFixed(2)}%
                </text>
              </g>
            ))}
            {model.points.map((point, index) => {
              const labelStep = Math.max(1, Math.ceil(model.points.length / 6));
              if (index % labelStep !== 0 && index !== model.points.length - 1) return null;
              return (
                <text
                  key={point.id}
                  x={xFor(index)}
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.7"
                >
                  {formatDate(point.date)}
                </text>
              );
            })}
            {currentMortgageRatePct != null && Number.isFinite(currentMortgageRatePct) && (
              <>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={yFor(currentMortgageRatePct)}
                  y2={yFor(currentMortgageRatePct)}
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeDasharray="7 5"
                />
                <text
                  x={WIDTH - PAD.right}
                  y={Math.max(12, yFor(currentMortgageRatePct) - 7)}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight="600"
                  fill="#7c3aed"
                >
                  Your rate {currentMortgageRatePct.toFixed(3)}%
                </text>
              </>
            )}
            <path
              d={linePath}
              fill="none"
              stroke="#0284c7"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {activeIndex != null && (
              <line
                x1={xFor(activeIndex)}
                x2={xFor(activeIndex)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
              />
            )}
            {model.points.map((point, index) => (
              <circle
                key={`${point.id}-focus`}
                cx={xFor(index)}
                cy={yFor(point.value)}
                r={activeIndex === index ? 5 : 3}
                fill="#0284c7"
                stroke="white"
                strokeWidth="2"
                tabIndex={0}
                aria-label={`${formatDate(point.date, true)}: ${productLabel} ${point.value.toFixed(3)} percent${
                  currentMortgageRatePct != null
                    ? `, your rate ${currentMortgageRatePct.toFixed(3)} percent`
                    : ''
                }`}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
            ))}
          </svg>
        </div>

        <div aria-live="polite" className="min-h-[44px]">
          {selectedPoint && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/70">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(selectedPoint.date, true)}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Benchmark: <strong>{selectedPoint.value.toFixed(3)}%</strong>
              </span>
              {currentMortgageRatePct != null && (
                <span className="text-slate-600 dark:text-slate-300">
                  Difference from your rate:{' '}
                  <strong>{(currentMortgageRatePct - selectedPoint.value).toFixed(3)}pp</strong>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-sky-600" />
            {productLabel}
          </span>
          {currentMortgageRatePct != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-violet-600" />
              Your current note rate
            </span>
          )}
        </div>

        {model.latest && (
          <div className="mt-4 border-t border-slate-200/70 pt-3 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Source: {model.latest.source}{model.latest.sourceRef ? ` · ${model.latest.sourceRef}` : ''}</span>
              <span>Latest observation: {formatDate(model.latest.date, true)}</span>
              <span>Ingested: {formatIngestedAt(model.latest.createdAt)}</span>
            </div>
            {model.isStale && (
              <p className="mt-2 inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Market data is {model.ageDays} days old. Treat this trend as historical context.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setTableOpen((open) => !open)}
          aria-expanded={tableOpen}
          className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          {tableOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {tableOpen ? 'Hide accessible rate table' : 'Show accessible rate table'}
        </button>

        {tableOpen && (
          <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[480px] text-left text-xs">
              <caption className="sr-only">{productLabel} observations for {rangeLabel}</caption>
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Observation date</th>
                  <th scope="col" className="px-3 py-2 font-semibold">30-year</th>
                  <th scope="col" className="px-3 py-2 font-semibold">15-year</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {[...model.points].reverse().map((point) => (
                  <tr key={`${point.id}-row`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{formatDate(point.date, true)}</td>
                    <td className="px-3 py-2 font-medium">{point.rate30yr.toFixed(3)}%</td>
                    <td className="px-3 py-2 font-medium">{point.rate15yr.toFixed(3)}%</td>
                    <td className="px-3 py-2">{point.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
