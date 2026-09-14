'use client';
import { ReactNode, useContext } from 'react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
export function MaintenanceResultList({ block, disabled, onFilter, onAction, link }: {
  block: Block; disabled: boolean;
  onFilter: (message: string) => void;
  onAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const select = (id: string) => controls?.change((view) => ({ ...view, selectedTaskId: view.selectedTaskId === id ? null : id }));
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Maintenance filters">
        {block.filters.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>
    </div>
    {block.sections.map((section) => {
      const visible = controls?.view.visibleCounts[section.id] ?? 5;
      return <div key={section.id} className="border-b border-slate-100 p-4">
        <h4 className="font-semibold">{section.title} · {section.count}</h4>
        {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No matching tasks.</p>}
        <ul className="mt-3 space-y-3">
          {section.items.slice(0, controls ? visible : section.items.length).map((item) => {
            const selected = controls?.view.selectedTaskId === item.id;
            const expanded = !controls || controls.view.expandedRows.includes(item.id);
            return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.href ? link(item.href, item.title) : item.title}</span>
                {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
              </div>
              {/* Dates and priority remain visible even with details collapsed. */}
              <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>
              {controls && <div className="mt-2 flex gap-2">
                <button type="button" disabled={disabled} aria-pressed={selected} onClick={() => select(item.id)} className="min-h-10 rounded border px-2 text-xs">{selected ? 'Selected' : 'Select task'}<span className="sr-only"> {item.title}</span></button>
                <button type="button" disabled={disabled} aria-expanded={expanded} onClick={() => controls.change((view) => ({ ...view, expandedRows: expanded ? view.expandedRows.filter((id) => id !== item.id) : [...view.expandedRows, item.id] }))} className="min-h-10 rounded border px-2 text-xs">{expanded ? 'Hide details' : 'Show details'}<span className="sr-only"> {item.title}</span></button>
              </div>}
              {expanded && item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {item.actions?.map((action) => <button key={action.id} type="button" disabled={disabled} className="min-h-10 rounded border bg-white px-2 text-xs disabled:opacity-50" onClick={() => {
                  controls?.change((view) => ({ ...view, selectedTaskId: item.id }));
                  onAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
                }}>{action.label}</button>)}
              </div>
            </li>;
          })}
        </ul>
        {controls && visible < section.items.length && <button type="button" disabled={disabled} className="mt-3 min-h-10 text-sm font-semibold text-teal-800" onClick={() => controls.change((view) => ({ ...view, visibleCounts: { ...view.visibleCounts, [section.id]: Math.min(section.items.length, visible + 5) } }))}>Show more {section.title.toLowerCase()} tasks ({Math.min(visible, section.items.length)} of {section.count} shown)</button>}
        {section.count > section.items.length && block.actions[0]?.href && <p className="mt-3 text-sm">{link(block.actions[0].href, `View all ${section.count} in Maintenance`)}</p>}
      </div>;
    })}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, action.label)}</span>)}</div>
  </section>;
}
