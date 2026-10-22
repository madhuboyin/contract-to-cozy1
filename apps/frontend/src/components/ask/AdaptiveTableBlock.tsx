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

const numericMoney = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function SellHoldRentProjection({ block }: { block: TableBlock }) {
  const points = block.rows.map((row) => ({
    year: row.values.year,
    hold: numericMoney(row.values.hold),
    rent: numericMoney(row.values.rent),
  })).filter((point): point is { year: string; hold: number; rent: number } => point.hold !== null && point.rent !== null);
  const width = 720;
  const height = 220;
  const inset = { left: 48, right: 18, top: 18, bottom: 34 };
  const values = points.flatMap((point) => [point.hold, point.rent, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (index: number) => inset.left + (points.length <= 1 ? 0 : index * ((width - inset.left - inset.right) / (points.length - 1)));
  const y = (value: number) => inset.top + ((max - value) / span) * (height - inset.top - inset.bottom);
  const path = (key: 'hold' | 'rent') => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point[key])}`).join(' ');
  const moneyLabel = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(value);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`ask-table-${block.id}`} data-sell-hold-rent-projection="">
    <h3 id={`ask-table-${block.id}`} className="font-semibold text-slate-950">{block.title}</h3>
    {block.description && <p className="mt-1 text-xs leading-5 text-slate-500">{block.description}</p>}
    {points.length > 1 ? <>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-slate-700" />Hold change</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-teal-600" />Rent change</span>
      </div>
      <svg className="mt-2 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Annual modeled changes. Hold moves from ${moneyLabel(points[0].hold)} to ${moneyLabel(points.at(-1)!.hold)}; rent moves from ${moneyLabel(points[0].rent)} to ${moneyLabel(points.at(-1)!.rent)}.`}>
        <line x1={inset.left} x2={width - inset.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeDasharray="5 5" />
        <path d={path('hold')} fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path('rent')} fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={point.year}>
          <circle cx={x(index)} cy={y(point.hold)} r="3.5" fill="#334155" />
          <circle cx={x(index)} cy={y(point.rent)} r="3.5" fill="#0d9488" />
          <text x={x(index)} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[11px]">{point.year}</text>
        </g>)}
        <text x={inset.left} y={12} className="fill-slate-500 text-[11px]">{moneyLabel(max)}</text>
        <text x={inset.left} y={height - inset.bottom + 14} className="fill-slate-500 text-[11px]">{moneyLabel(min)}</text>
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-teal-800">View annual values</summary>
        <DataTable block={block} className="mt-3" />
      </details>
    </> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Not enough annual data is available to draw the projection.</p>}
  </section>;
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
