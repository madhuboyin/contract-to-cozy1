'use client';

import { useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import { resolveAdaptiveTablePresentation, type TablePresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';

type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;

// Platform capability (FRD Appendix D / capability-card audit): optional
// row-click-to-detail for TABLE blocks, the TABLE-side counterpart of
// GROUPED_LIST's own detail-click convention (see GroupedListBlock.tsx).
// Absent for every TABLE block except the ones a dispatcher (./blocks/TableBlock.tsx)
// opts in by block id -- unlike GROUPED_LIST, no TABLE block wires this by
// default, since most TABLE blocks (e.g. comparison-style summaries) have no
// canonical per-row entity to fetch detail for.
export type TableRowDetailControls = {
  activeRowId: string | null;
  onRowClick: (rowId: string) => void;
  renderDetail: (rowId: string) => ReactNode;
};

function rowPrimaryCell(value: string, rowId: string, blockId: string, active: boolean, onClick: () => void) {
  return <button
    type="button"
    data-ask-detail-trigger={rowId}
    data-ask-detail-block={blockId}
    aria-expanded={active}
    aria-controls={`ask-table-row-detail-${rowId}`}
    onClick={onClick}
    className="min-h-8 text-left font-medium text-slate-900 underline-offset-4 hover:text-teal-800 hover:underline"
  >
    {value}
  </button>;
}

function LabeledCards({ block, className, rowDetail }: { block: TableBlock; className?: string; rowDetail?: TableRowDetailControls }) {
  return <div className={cn('space-y-3', className)} data-table-presentation="cards">
    {block.rows.map((row) => {
      const active = rowDetail?.activeRowId === row.id;
      return <dl key={row.id} data-table-row-id={row.id} className={cn('divide-y divide-slate-100 rounded-xl border px-3', active ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-slate-50')}>
        {block.columns.map((column, index) => {
          const value = row.values[column.key] || 'Not recorded';
          return <div key={column.key} className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.5fr)] gap-3 py-2 text-sm">
            <dt className="font-medium text-slate-500">{column.label}</dt>
            <dd className="break-words text-slate-800">
              {index === 0 && rowDetail ? rowPrimaryCell(value, row.id, block.id, active, () => rowDetail.onRowClick(row.id)) : value}
            </dd>
          </div>;
        })}
      </dl>;
    })}
  </div>;
}

function DataTable({ block, className, rowDetail }: { block: TableBlock; className?: string; rowDetail?: TableRowDetailControls }) {
  return <div className={cn('overflow-x-auto', className)} data-table-presentation="table">
    <table className="min-w-full text-left text-sm">
      <caption className="sr-only">{block.title}</caption>
      <thead><tr>{block.columns.map((column) => <th key={column.key} scope="col" className="border-b px-2 py-2 text-xs font-semibold text-slate-500">{column.label}</th>)}</tr></thead>
      <tbody>{block.rows.map((row) => {
        const active = rowDetail?.activeRowId === row.id;
        return <tr key={row.id} data-table-row-id={row.id} className={active ? 'bg-teal-50' : undefined}>
          {block.columns.map((column, index) => {
            const value = row.values[column.key] || 'Not recorded';
            return <td key={column.key} className="border-b border-slate-100 px-2 py-2 align-top text-slate-700">
              {index === 0 && rowDetail ? rowPrimaryCell(value, row.id, block.id, active, () => rowDetail.onRowClick(row.id)) : value}
            </td>;
          })}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

// A short list of label/value facts (the home record summary) reads better as a grid of tiles than as a two-column table with a view switch:
// three across on a wide screen, two on a tablet, one on a phone. The rows keep the table's data shape (`detail`, `recordedValue`).
export const FACT_GRID_TABLE_IDS: ReadonlySet<string> = new Set(['property-summary-facts']);
const SELL_HOLD_RENT_PROJECTION_ID = 'sell-hold-rent-projection';
const SELL_HOLD_RENT_ASSUMPTIONS_ID = 'sell-hold-rent-assumptions';
const BREAK_EVEN_SENSITIVITY_ID = 'break-even-sensitivity';
const BREAK_EVEN_ASSUMPTIONS_ID = 'break-even-assumptions';
const BREAK_EVEN_WHAT_IF_ASSUMPTIONS_ID = 'break-even-what-if-assumptions';
const BREAK_EVEN_WHAT_IF_COMPARISON_ID = 'break-even-what-if-comparison';
const OWNERSHIP_COST_CATEGORIES_ID = 'ownership-cost-categories';
const OWNERSHIP_COST_FORECAST_PERIODS_ID = 'ownership-cost-forecast-periods';
const OWNERSHIP_COST_OBSERVED_VARIABILITY_ID = 'ownership-cost-observed-variability';

const numericMoney = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function SellHoldRentProjection({ block }: { block: TableBlock }) {
  const points = block.rows.map((row) => ({
    year: row.values.year,
    homeValue: numericMoney(row.values.homeValue),
    hold: numericMoney(row.values.hold),
    rent: numericMoney(row.values.rent),
  })).filter((point): point is { year: string; homeValue: number | null; hold: number; rent: number } => point.hold !== null && point.rent !== null);
  const width = 720;
  const height = 228;
  const inset = { left: 52, right: 20, top: 20, bottom: 34 };
  const values = points.flatMap((point) => [point.hold, point.rent, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (index: number) => inset.left + (points.length <= 1 ? 0 : index * ((width - inset.left - inset.right) / (points.length - 1)));
  const y = (value: number) => inset.top + ((max - value) / span) * (height - inset.top - inset.bottom);
  const path = (key: 'hold' | 'rent') => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point[key])}`).join(' ');
  const areaPath = (key: 'hold' | 'rent') => {
    if (points.length <= 1) return '';
    const line = path(key);
    const baselineY = y(Math.max(0, min));
    return `${line} L ${x(points.length - 1)} ${baselineY} L ${x(0)} ${baselineY} Z`;
  };
  const moneyLabel = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(value);

  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const holdDelta = firstPoint && lastPoint ? lastPoint.hold - firstPoint.hold : null;
  const rentDelta = firstPoint && lastPoint ? lastPoint.rent - firstPoint.rent : null;

  return <section className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs" aria-labelledby={`ask-table-${block.id}`} data-sell-hold-rent-projection="">
    <div className="rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Multi-Year Trajectory</span>
          <h3 id={`ask-table-${block.id}`} className="text-base font-bold tracking-tight text-slate-950">{block.title}</h3>
        </div>
        {points.length > 1 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
              Hold change
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
              Rent change
            </span>
          </div>
        )}
      </div>
      {block.description && <p className="mt-1 text-xs leading-5 text-slate-500">{block.description}</p>}
    </div>

    <div className="p-4 sm:p-5">
      {points.length > 1 && firstPoint && lastPoint ? <>
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-hidden="true">
          {firstPoint.homeValue !== null && lastPoint.homeValue !== null && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Projected Home Value</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-sm font-bold tabular-nums text-slate-900">{moneyLabel(firstPoint.homeValue)}</span>
                <span className="text-xs font-semibold text-slate-400">→</span>
                <span className="text-base font-bold tabular-nums text-teal-800">{moneyLabel(lastPoint.homeValue)}</span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Year 1 to Year {points.length}</p>
            </div>
          )}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hold Annual Trajectory</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-sm font-bold tabular-nums text-slate-700">{moneyLabel(firstPoint.hold)}</span>
              <span className="text-xs font-semibold text-slate-400">→</span>
              <span className="text-base font-bold tabular-nums text-slate-950">{moneyLabel(lastPoint.hold)}</span>
            </div>
            {holdDelta !== null && (
              <p className={cn('mt-0.5 text-[11px] font-semibold', holdDelta >= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                {holdDelta >= 0 ? `+${moneyLabel(holdDelta)}` : moneyLabel(holdDelta)} annual shift
              </p>
            )}
          </div>
          <div className="rounded-xl border border-teal-200/70 bg-teal-50/40 px-3.5 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Rent Annual Trajectory</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-sm font-bold tabular-nums text-teal-800">{moneyLabel(firstPoint.rent)}</span>
              <span className="text-xs font-semibold text-teal-500">→</span>
              <span className="text-base font-bold tabular-nums text-teal-950">{moneyLabel(lastPoint.rent)}</span>
            </div>
            {rentDelta !== null && (
              <p className={cn('mt-0.5 text-[11px] font-semibold', rentDelta >= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                {rentDelta >= 0 ? `+${moneyLabel(rentDelta)}` : moneyLabel(rentDelta)} annual shift
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2 sm:p-3">
          <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Annual modeled changes. Hold moves from ${moneyLabel(points[0].hold)} to ${moneyLabel(points.at(-1)!.hold)}; rent moves from ${moneyLabel(points[0].rent)} to ${moneyLabel(points.at(-1)!.rent)}.`}>
            <defs>
              <linearGradient id={`rent-grad-${block.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id={`hold-grad-${block.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#334155" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#334155" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <line x1={inset.left} x2={width - inset.right} y1={inset.top} y2={inset.top} stroke="#f1f5f9" strokeWidth="1" />
            <line x1={inset.left} x2={width - inset.right} y1={(inset.top + height - inset.bottom) / 2} y2={(inset.top + height - inset.bottom) / 2} stroke="#f1f5f9" strokeWidth="1" />
            <line x1={inset.left} x2={width - inset.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeDasharray="5 5" strokeWidth="1.5" />
            <path d={areaPath('hold')} fill={`url(#hold-grad-${block.id})`} />
            <path d={areaPath('rent')} fill={`url(#rent-grad-${block.id})`} />
            <path d={path('hold')} fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={path('rent')} fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => <g key={point.year}>
              <circle cx={x(index)} cy={y(point.hold)} r="4" fill="#ffffff" stroke="#334155" strokeWidth="2.5" />
              <circle cx={x(index)} cy={y(point.rent)} r="4" fill="#ffffff" stroke="#0d9488" strokeWidth="2.5" />
              <text x={x(index)} y={height - 10} textAnchor="middle" className="fill-slate-600 text-[11px] font-medium">{point.year}</text>
            </g>)}
            <text x={inset.left - 6} y={inset.top + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-medium">{moneyLabel(max)}</text>
            <text x={inset.left - 6} y={height - inset.bottom + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-medium">{moneyLabel(min)}</text>
          </svg>
        </div>
        <details className="group mt-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-semibold text-teal-800 hover:text-teal-900">View annual values</summary>
          <DataTable block={block} className="mt-3 rounded-lg bg-white p-2" />
        </details>
      </> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Not enough annual data is available to draw the projection.</p>}
    </div>
  </section>;
}

function SellHoldRentAssumptionsBlock({
  block,
  preference,
  offersChoice,
  hasControls,
  setPreference,
  decisionMode,
  shownCount,
  totalCount,
  renderAction,
  rowDetail,
}: {
  block: TableBlock;
  preference: TablePresentationPreference;
  offersChoice: boolean;
  hasControls: boolean;
  setPreference: (mode: TablePresentationPreference) => void;
  decisionMode: 'RESPONSIVE' | 'CARDS' | 'TABLE';
  shownCount: number;
  totalCount: number;
  renderAction: (action: AskAction) => ReactNode;
  rowDetail?: TableRowDetailControls;
}) {
  return (
    <section
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      aria-labelledby={`ask-table-${block.id}`}
      data-sell-hold-rent-assumptions={block.id === SELL_HOLD_RENT_ASSUMPTIONS_ID ? '' : undefined}
      data-break-even-assumptions={block.id === BREAK_EVEN_ASSUMPTIONS_ID ? '' : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 id={`ask-table-${block.id}`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Scenario Parameters</span>
          </div>
          {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{block.description}</p>}
        </div>
        {offersChoice && hasControls && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={`View ${block.title}`}>
            {(['AUTO', 'CARDS', 'TABLE'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={preference === mode}
                onClick={() => setPreference(mode)}
                className={cn(
                  'min-h-7 rounded-lg px-2 text-xs font-semibold transition-colors',
                  preference === mode ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:bg-white',
                )}
              >
                {mode === 'AUTO' ? 'Auto' : mode === 'CARDS' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 sm:px-4 sm:py-3">
        {shownCount === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No records are available for this result.</p>
        ) : (
          <>
            {decisionMode === 'RESPONSIVE' && (
              <>
                <LabeledCards block={block} className="sm:hidden" rowDetail={rowDetail} />
                <div className="hidden sm:block">
                  <dl className={cn('grid grid-cols-2 gap-2', block.rows.length === 5 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')} aria-hidden="true">
                    {block.rows.map((row) => {
                      const isOverridden = /what-if|scenario override|used from this request/i.test(row.values.source || '');
                      return (
                        <div
                          key={row.id}
                          className={cn(
                            'flex flex-col justify-start rounded-xl border px-3 py-2',
                            isOverridden
                              ? 'border-teal-300/90 bg-teal-50/50'
                              : 'border-slate-200/80 bg-slate-50/70',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <dt className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              {row.values.input}
                            </dt>
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                isOverridden
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-white text-slate-500 border border-slate-200/70',
                              )}
                            >
                              {isOverridden ? 'Override' : 'Baseline'}
                            </span>
                          </div>
                          <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-950 sm:text-base">
                            {row.values.value || 'Not recorded'}
                          </dd>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500" title={row.values.source}>
                            {row.values.source}
                          </p>
                        </div>
                      );
                    })}
                  </dl>
                  <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
                </div>
              </>
            )}
            {decisionMode === 'CARDS' && <LabeledCards block={block} rowDetail={rowDetail} />}
            {decisionMode === 'TABLE' && <DataTable block={block} rowDetail={rowDetail} />}
          </>
        )}

        {rowDetail?.activeRowId && <div id={`ask-table-row-detail-${rowDetail.activeRowId}`}>{rowDetail.renderDetail(rowDetail.activeRowId)}</div>}

        <div className={block.actions.length > 0 ? 'mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5' : 'sr-only'}>
          <p className="text-xs text-slate-500" aria-live="polite">
            {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
          </p>
          {block.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {block.actions.map((action) => (
                <span key={action.id}>{renderAction(action)}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BreakEvenSensitivityBlock({
  block,
  preference,
  offersChoice,
  hasControls,
  setPreference,
  decisionMode,
  shownCount,
  totalCount,
  rowDetail,
}: {
  block: TableBlock;
  preference: TablePresentationPreference;
  offersChoice: boolean;
  hasControls: boolean;
  setPreference: (mode: TablePresentationPreference) => void;
  decisionMode: 'RESPONSIVE' | 'CARDS' | 'TABLE';
  shownCount: number;
  totalCount: number;
  rowDetail?: TableRowDetailControls;
}) {
  const netLabel = block.columns[2]?.label || 'Net at horizon';
  return (
    <section
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      aria-labelledby={`ask-table-${block.id}`}
      data-break-even-sensitivity=""
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 id={`ask-table-${block.id}`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Scenario Stress-Test</span>
          </div>
          {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{block.description}</p>}
        </div>
        {offersChoice && hasControls && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label={`View ${block.title}`}>
            {(['AUTO', 'CARDS', 'TABLE'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={preference === mode}
                onClick={() => setPreference(mode)}
                className={cn(
                  'min-h-7 rounded-lg px-2 text-xs font-semibold transition-colors',
                  preference === mode ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:bg-white',
                )}
              >
                {mode === 'AUTO' ? 'Auto' : mode === 'CARDS' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 sm:px-4 sm:py-3">
        {decisionMode === 'RESPONSIVE' && (
          <>
            <LabeledCards block={block} className="sm:hidden" rowDetail={rowDetail} />
            <div className="hidden sm:block">
              <div className="grid grid-cols-1 gap-2 sm:max-w-[520px] sm:grid-cols-3" aria-hidden="true">
                {block.rows.map((row) => {
                  const isBase = /base/i.test(row.id);
                  const isOptimistic = /optimistic/i.test(row.id);
                  const reached = !/not within/i.test(row.values.breakEven || '');
                  const netNumber = numericMoney(row.values.net);
                  const isPositiveNet = netNumber !== null && netNumber >= 0;

                  return (
                    <div
                      key={row.id}
                      className={cn(
                        'relative flex flex-col justify-start rounded-xl border px-3 py-2 transition-all',
                        isBase
                          ? 'border-teal-300/90 bg-gradient-to-b from-teal-50/50 via-white to-white shadow-2xs ring-1 ring-teal-500/15'
                          : isOptimistic
                            ? 'border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-white'
                            : 'border-slate-200/80 bg-slate-50/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          {row.values.scenario}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                            reached
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900',
                          )}
                        >
                          {reached ? 'Reached' : 'Unreached'}
                        </span>
                      </div>
                      <p className="mt-1 text-base font-bold tabular-nums leading-tight text-slate-950">
                        {row.values.breakEven}
                      </p>
                      <div className="mt-1.5 flex items-baseline justify-between gap-1.5 border-t border-slate-100 pt-1.5">
                        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{netLabel}</span>
                        <span
                          className={cn(
                            'shrink-0 text-xs font-bold tabular-nums',
                            isPositiveNet ? 'text-emerald-800' : 'text-rose-700',
                          )}
                        >
                          {row.values.net}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
            </div>
          </>
        )}
        {decisionMode === 'CARDS' && <LabeledCards block={block} rowDetail={rowDetail} />}
        {decisionMode === 'TABLE' && <DataTable block={block} rowDetail={rowDetail} />}

        <p className="sr-only" aria-live="polite">
          {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
        </p>
      </div>
    </section>
  );
}

function BreakEvenWhatIfBlock({
  block,
  shownCount,
  totalCount,
  rowDetail,
}: {
  block: TableBlock;
  shownCount: number;
  totalCount: number;
  rowDetail?: TableRowDetailControls;
}) {
  const isComparison = block.id === BREAK_EVEN_WHAT_IF_COMPARISON_ID;
  return (
    <section
      className="w-full rounded-2xl border border-teal-200/80 bg-white shadow-2xs"
      aria-labelledby={`ask-table-${block.id}`}
      data-break-even-what-if={block.id}
    >
      <div className="rounded-t-2xl border-b border-teal-100/80 bg-gradient-to-r from-teal-50/70 via-white to-emerald-50/30 px-4 py-2.5 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h3 id={`ask-table-${block.id}`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
            {isComparison ? 'Standard vs. What-If Delta' : 'Hypothetical Overrides'}
          </span>
        </div>
        {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.description}</p>}
      </div>
      <div className="p-3 sm:px-4 sm:py-3">
        {isComparison ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden="true">
              {block.rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{row.values.measure}</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200/70">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Standard</span>
                      <span className="mt-0.5 block text-xs font-bold tabular-nums text-slate-700 sm:text-sm">{row.values.standard}</span>
                    </div>
                    <div className="rounded-lg bg-teal-50/80 px-2.5 py-1.5 ring-1 ring-teal-200/80">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-teal-700">Your what-if</span>
                      <span className="mt-0.5 block text-xs font-bold tabular-nums text-teal-950 sm:text-sm">{row.values.whatIf}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              {block.rows.map((row) => (
                <div key={row.id} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/50 px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-700">{row.values.assumption}:</span>
                  <span className="rounded-lg bg-teal-700 px-2 py-0.5 text-xs font-bold tabular-nums text-white">{row.values.value}</span>
                </div>
              ))}
            </div>
            <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
          </>
        )}
        <p className="sr-only" aria-live="polite">
          {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
        </p>
      </div>
    </section>
  );
}

function FactGridTable({ block, renderAction }: { block: TableBlock; renderAction: (action: AskAction) => ReactNode }) {
  const [labelKey, valueKey] = [block.columns[0]?.key, block.columns[1]?.key];
  return <section data-fact-grid={block.id} className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`ask-table-${block.id}`}>
    <h3 id={`ask-table-${block.id}`} className="font-semibold text-slate-950">{block.title}</h3>
    {block.description && <p className="mt-1 text-xs leading-5 text-slate-500">{block.description}</p>}
    <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {block.rows.map((row) => (
        <div key={row.id} data-fact-tile={row.id} className="rounded-xl bg-slate-50 px-3.5 py-3">
          <dt className="text-xs font-medium text-slate-500">{row.values[labelKey]}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{row.values[valueKey] || 'Not recorded'}</dd>
        </div>
      ))}
    </dl>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
  </section>;
}

function OwnershipCostCategoriesBlock({
  block,
  preference,
  offersChoice,
  hasControls,
  setPreference,
  decisionMode,
  shownCount,
  totalCount,
  renderAction,
  rowDetail,
}: {
  block: TableBlock;
  preference: TablePresentationPreference;
  offersChoice: boolean;
  hasControls: boolean;
  setPreference: (mode: TablePresentationPreference) => void;
  decisionMode: 'RESPONSIVE' | 'CARDS' | 'TABLE';
  shownCount: number;
  totalCount: number;
  renderAction: (action: AskAction) => ReactNode;
  rowDetail?: TableRowDetailControls;
}) {
  const parsedRows = block.rows.map((row) => {
    const monthlyStr = row.values.monthly ?? row.values.amount ?? '';
    const annualStr = row.values.annual ?? '';
    const evidenceStr = row.values.evidence ?? row.values.source ?? '';
    const annualVal = Math.max(0, numericMoney(annualStr) ?? (numericMoney(monthlyStr) ?? 0) * 12);
    const isEstimated = /estimat/i.test(evidenceStr);
    const isStale = /stale/i.test(evidenceStr);
    return {
      row,
      category: row.values.category || 'Category',
      monthlyStr,
      annualStr,
      evidenceStr,
      annualVal,
      isEstimated,
      isStale,
    };
  });

  const totalAnnual = parsedRows.reduce((sum, item) => sum + item.annualVal, 0);

  return (
    <section
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      aria-labelledby={`ask-table-${block.id}`}
      data-ownership-cost-categories=""
    >
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 id={`ask-table-${block.id}`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Category Breakdown</span>
          </div>
          {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{block.description}</p>}
        </div>
        {offersChoice && hasControls && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs" role="group" aria-label={`View ${block.title}`}>
            {(['AUTO', 'CARDS', 'TABLE'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={preference === mode}
                onClick={() => setPreference(mode)}
                className={cn(
                  'min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                  preference === mode ? 'bg-teal-700 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {mode === 'AUTO' ? 'Auto' : mode === 'CARDS' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 sm:px-4 sm:py-3">
        {shownCount === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No records are available for this result.</p>
        ) : (
          <>
            {(decisionMode === 'RESPONSIVE' || decisionMode === 'TABLE') && (
              <>
                <div className="space-y-1.5" aria-hidden="true">
                  {parsedRows.map(({ row, category, monthlyStr, annualStr, evidenceStr, annualVal, isEstimated, isStale }) => {
                    const sharePct = totalAnnual > 0 ? Math.min(100, Math.max(4, Math.round((annualVal / totalAnnual) * 100))) : 0;
                    const exactSharePct = totalAnnual > 0 ? Math.round((annualVal / totalAnnual) * 100) : null;
                    return (
                      <div
                        key={row.id}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/55 px-3 py-2 transition-colors hover:border-teal-200 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 sm:text-sm">{category}</span>
                            {exactSharePct !== null && (
                              <span className="rounded-md bg-slate-200/75 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">
                                {exactSharePct}%
                              </span>
                            )}
                            {evidenceStr && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                  isStale
                                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                                    : isEstimated
                                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                                )}
                              >
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-full',
                                    isStale ? 'bg-rose-500' : isEstimated ? 'bg-amber-500' : 'bg-emerald-600',
                                  )}
                                />
                                {evidenceStr}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-baseline gap-2.5">
                            {monthlyStr && (
                              <span className="text-sm font-extrabold tabular-nums text-slate-950">
                                {monthlyStr}
                                <span className="ml-0.5 text-[11px] font-medium text-slate-500">/mo</span>
                              </span>
                            )}
                            {annualStr && (
                              <span className="text-xs font-semibold tabular-nums text-slate-500">
                                {annualStr}
                                <span className="ml-0.5 text-[10px] font-normal text-slate-400">/yr</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {totalAnnual > 0 && (
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/75">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                isStale ? 'bg-rose-500' : isEstimated ? 'bg-amber-500' : 'bg-teal-600',
                              )}
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
              </>
            )}
            {decisionMode === 'CARDS' && <LabeledCards block={block} rowDetail={rowDetail} />}
          </>
        )}

        <p className="sr-only" aria-live="polite">
          {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
        </p>

        {block.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
            {block.actions.map((action) => (
              <span key={action.id}>{renderAction(action)}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OwnershipCostPeriodsBlock({
  block,
  preference,
  offersChoice,
  hasControls,
  setPreference,
  decisionMode,
  shownCount,
  totalCount,
  rowDetail,
}: {
  block: TableBlock;
  preference: TablePresentationPreference;
  offersChoice: boolean;
  hasControls: boolean;
  setPreference: (mode: TablePresentationPreference) => void;
  decisionMode: 'RESPONSIVE' | 'CARDS' | 'TABLE';
  shownCount: number;
  totalCount: number;
  rowDetail?: TableRowDetailControls;
}) {
  const isForecast = block.id === OWNERSHIP_COST_FORECAST_PERIODS_ID;
  return (
    <section
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      aria-labelledby={`ask-table-${block.id}`}
      data-ownership-cost-periods={block.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 id={`ask-table-${block.id}`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              {isForecast ? 'Forward Range' : 'Observed History'}
            </span>
          </div>
          {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{block.description}</p>}
        </div>
        {offersChoice && hasControls && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs" role="group" aria-label={`View ${block.title}`}>
            {(['AUTO', 'CARDS', 'TABLE'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={preference === mode}
                onClick={() => setPreference(mode)}
                className={cn(
                  'min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                  preference === mode ? 'bg-teal-700 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {mode === 'AUTO' ? 'Auto' : mode === 'CARDS' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 sm:px-4 sm:py-3">
        {shownCount === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No records are available for this result.</p>
        ) : (
          <>
            {(decisionMode === 'RESPONSIVE' || decisionMode === 'TABLE') && (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden="true">
                  {block.rows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200/80 bg-slate-50/55 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">{row.values.period}</span>
                        {isForecast && row.values.confidence && (
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            {row.values.confidence} confidence
                          </span>
                        )}
                      </div>
                      {isForecast ? (
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/70">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Low</span>
                            <span className="mt-0.5 block text-xs font-bold tabular-nums text-slate-700">{row.values.low}</span>
                          </div>
                          <div className="rounded-lg bg-teal-50/80 px-2 py-1 ring-1 ring-teal-200/80">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-teal-700">Base</span>
                            <span className="mt-0.5 block text-xs font-extrabold tabular-nums text-teal-950">{row.values.base}</span>
                          </div>
                          <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/70">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">High</span>
                            <span className="mt-0.5 block text-xs font-bold tabular-nums text-slate-700">{row.values.high}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          <div className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-slate-200/70">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recurring</span>
                            <span className="mt-0.5 block text-xs font-bold tabular-nums text-slate-900">{row.values.recurring}</span>
                          </div>
                          <div className="rounded-lg bg-amber-50/60 px-2.5 py-1 ring-1 ring-amber-200/70">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-800">One-time / capital</span>
                            <span className="mt-0.5 block text-xs font-bold tabular-nums text-amber-950">{row.values.oneTime}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <DataTable block={block} className="sr-only" rowDetail={rowDetail} />
              </>
            )}
            {decisionMode === 'CARDS' && <LabeledCards block={block} rowDetail={rowDetail} />}
          </>
        )}

        <p className="sr-only" aria-live="polite">
          {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
        </p>
      </div>
    </section>
  );
}

export function AdaptiveTableBlock({ block, renderAction, rowDetail }: { block: TableBlock; renderAction: (action: AskAction) => ReactNode; rowDetail?: TableRowDetailControls }) {
  const controls = useContext(ResultViewContext);
  if (block.id === SELL_HOLD_RENT_PROJECTION_ID && !rowDetail) return <SellHoldRentProjection block={block} />;
  if (FACT_GRID_TABLE_IDS.has(block.id) && block.columns.length === 2 && block.rows.length > 0 && !rowDetail) return <FactGridTable block={block} renderAction={renderAction} />;
  const preference = controls?.view.presentationModes?.[block.id] ?? 'AUTO';
  const decision = resolveAdaptiveTablePresentation(block, preference);
  const setPreference = (mode: TablePresentationPreference) => controls?.change((view) => ({
    ...view,
    presentationModes: { ...(view.presentationModes ?? {}), [block.id]: mode },
  }));
  const shownCount = block.rows.length;
  const totalCount = Math.max(block.totalCount ?? shownCount, shownCount);

  if ((block.id === SELL_HOLD_RENT_ASSUMPTIONS_ID || block.id === BREAK_EVEN_ASSUMPTIONS_ID) && !rowDetail) {
    return (
      <SellHoldRentAssumptionsBlock
        block={block}
        preference={preference}
        offersChoice={decision.offersChoice}
        hasControls={Boolean(controls)}
        setPreference={setPreference}
        decisionMode={decision.mode}
        shownCount={shownCount}
        totalCount={totalCount}
        renderAction={renderAction}
        rowDetail={rowDetail}
      />
    );
  }

  if (block.id === BREAK_EVEN_SENSITIVITY_ID && !rowDetail) {
    return (
      <BreakEvenSensitivityBlock
        block={block}
        preference={preference}
        offersChoice={decision.offersChoice}
        hasControls={Boolean(controls)}
        setPreference={setPreference}
        decisionMode={decision.mode}
        shownCount={shownCount}
        totalCount={totalCount}
        rowDetail={rowDetail}
      />
    );
  }

  if ((block.id === BREAK_EVEN_WHAT_IF_ASSUMPTIONS_ID || block.id === BREAK_EVEN_WHAT_IF_COMPARISON_ID) && !rowDetail) {
    return (
      <BreakEvenWhatIfBlock
        block={block}
        shownCount={shownCount}
        totalCount={totalCount}
        rowDetail={rowDetail}
      />
    );
  }

  if (block.id === OWNERSHIP_COST_CATEGORIES_ID && !rowDetail) {
    return (
      <OwnershipCostCategoriesBlock
        block={block}
        preference={preference}
        offersChoice={decision.offersChoice}
        hasControls={Boolean(controls)}
        setPreference={setPreference}
        decisionMode={decision.mode}
        shownCount={shownCount}
        totalCount={totalCount}
        renderAction={renderAction}
        rowDetail={rowDetail}
      />
    );
  }

  if ((block.id === OWNERSHIP_COST_FORECAST_PERIODS_ID || block.id === OWNERSHIP_COST_OBSERVED_VARIABILITY_ID) && !rowDetail) {
    return (
      <OwnershipCostPeriodsBlock
        block={block}
        preference={preference}
        offersChoice={decision.offersChoice}
        hasControls={Boolean(controls)}
        setPreference={setPreference}
        decisionMode={decision.mode}
        shownCount={shownCount}
        totalCount={totalCount}
        rowDetail={rowDetail}
      />
    );
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`ask-table-${block.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id={`ask-table-${block.id}`} className="font-semibold text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-1 text-xs leading-5 text-slate-500">{block.description}</p>}
      </div>
      {decision.offersChoice && controls && <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${block.title}`}>
        {(['AUTO', 'CARDS', 'TABLE'] as const).map((mode) => <button key={mode} type="button" aria-pressed={preference === mode} onClick={() => setPreference(mode)} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', preference === mode ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>{mode === 'AUTO' ? 'Auto' : mode === 'CARDS' ? 'Cards' : 'Table'}</button>)}
      </div>}
    </div>

    {shownCount === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No records are available for this result.</p> : <>
      {decision.mode === 'RESPONSIVE' && <>
        <LabeledCards block={block} className="mt-3 sm:hidden" rowDetail={rowDetail} />
        <DataTable block={block} className="mt-3 hidden sm:block" rowDetail={rowDetail} />
      </>}
      {decision.mode === 'CARDS' && <LabeledCards block={block} className="mt-3" rowDetail={rowDetail} />}
      {decision.mode === 'TABLE' && <DataTable block={block} className="mt-3" rowDetail={rowDetail} />}
    </>}

    {rowDetail?.activeRowId && <div id={`ask-table-row-detail-${rowDetail.activeRowId}`}>{rowDetail.renderDetail(rowDetail.activeRowId)}</div>}

    <p className="mt-3 text-xs text-slate-500" aria-live="polite">
      {totalCount > shownCount ? `Showing ${shownCount} of ${totalCount} records.` : `${shownCount} ${shownCount === 1 ? 'record' : 'records'}.`}
    </p>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
  </section>;
}
