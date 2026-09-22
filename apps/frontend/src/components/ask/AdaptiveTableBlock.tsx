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

export function AdaptiveTableBlock({ block, renderAction, rowDetail }: { block: TableBlock; renderAction: (action: AskAction) => ReactNode; rowDetail?: TableRowDetailControls }) {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.presentationModes?.[block.id] ?? 'AUTO';
  const decision = resolveAdaptiveTablePresentation(block, preference);
  const setPreference = (mode: TablePresentationPreference) => controls?.change((view) => ({
    ...view,
    presentationModes: { ...(view.presentationModes ?? {}), [block.id]: mode },
  }));
  const shownCount = block.rows.length;
  const totalCount = Math.max(block.totalCount ?? shownCount, shownCount);
  const renderedViewLabel = decision.mode === 'RESPONSIVE' ? 'automatically adapted to available width' : decision.mode.toLowerCase();

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
      {' '}View: {renderedViewLabel}.
    </p>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
  </section>;
}
