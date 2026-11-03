'use client';

import { useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Clock3, Layers3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { AskBlockRenderer } from './blocks/types';

type WorkBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type WorkItem = WorkBlock['sections'][number]['items'][number];

const INITIAL_VISIBLE_ROWS = 8;
const LIFECYCLE_FILTER_IDS = new Set([
  'view-needs_you',
  'view-active',
  'view-waiting',
  'view-scheduled',
  'view-completed',
  'view-archived',
]);

function metadata(item: WorkItem) {
  const kind = item.meta[0] ?? null;
  const due = item.meta.find((value) => /^Due\s/i.test(value)) ?? null;
  const next = item.meta.find((value) => /^Next:\s/i.test(value))?.replace(/^Next:\s*/i, '') ?? null;
  const note = item.meta.find((value) => value !== kind && value !== due && !/^Next:\s/i.test(value)) ?? null;
  return { kind, due, next, note };
}

function WorkRow({ item, disabled, onItemAction }: {
  item: WorkItem;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const { kind, due, next, note } = metadata(item);
  const actions = item.actions ?? [];
  const primary = actions.find((action) => action.style === 'PRIMARY') ?? actions[0];
  const secondary = actions.filter((action) => action !== primary);
  const status = item.status && !/^accepted$/i.test(item.status) ? item.status.replace(/_/g, ' ') : null;
  const invoke = (action: (typeof actions)[number]) => onItemAction(
    action.entityType ?? item.entityType,
    action.entityId ?? item.id,
    action.message,
    action.operationId,
    action.interactionType,
  );

  return (
    <li className="group px-4 py-4 transition-colors hover:bg-slate-50/70 sm:px-5" data-work-overview-row={item.id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-5 text-slate-950">{item.title}</p>
            {status && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{status}</span>}
          </div>
          {item.description && <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{item.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {kind && <span className="inline-flex items-center gap-1.5 font-medium text-slate-600"><Layers3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{kind}</span>}
            {due && <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{due}</span>}
            {next && <span>Next: {next}</span>}
          </div>
          {note && <p className="mt-1.5 text-xs leading-5 text-slate-500">{note}</p>}
        </div>
        {actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {secondary.map((action) => (
              <button key={action.id} type="button" disabled={disabled} onClick={() => invoke(action)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50">{action.label}</button>
            ))}
            {primary && <button type="button" disabled={disabled} onClick={() => invoke(primary)} className="min-h-10 rounded-xl bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-50">{primary.label}</button>}
          </div>
        )}
      </div>
    </li>
  );
}

export const WorkOverviewResultList: AskBlockRenderer<'GROUPED_LIST'> = ({ block, itemActionsDisabled, onFilterClick, onItemAction }) => {
  const [showAllFetched, setShowAllFetched] = useState(false);
  const section = block.sections[0];
  const lifecycleFilters = block.filters.filter((filter) => LIFECYCLE_FILTER_IDS.has(filter.id));
  const kindFilters = block.filters.filter((filter) => filter.id.startsWith('kind-'));
  const clearFilter = block.filters.find((filter) => filter.id === 'clear-all');
  const moreFilter = block.filters.find((filter) => filter.id === 'show-more');
  const activeKind = kindFilters.find((filter) => filter.active);
  const visibleItems = showAllFetched ? section.items : section.items.slice(0, INITIAL_VISIBLE_ROWS);
  const locallyHidden = section.items.length - visibleItems.length;

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs" data-work-overview-list="">
      <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/45 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-teal-700">
              <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" /> Work
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <h3 className="text-lg font-bold tracking-tight text-slate-950">{block.title}</h3>
              <span className="text-sm font-semibold tabular-nums text-slate-500">{section.count}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kindFilters.length > 0 && (
              <details className="group relative">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-900 [&::-webkit-details-marker]:hidden">
                  {activeKind?.label ?? 'All work types'}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {kindFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={filter.active} disabled={itemActionsDisabled || filter.active} onClick={() => onFilterClick(filter.message)} className={cn('block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-medium', filter.active ? 'bg-teal-50 text-teal-900' : 'text-slate-700 hover:bg-slate-50', 'disabled:cursor-default')}>{filter.label}</button>)}
                  {clearFilter && <button type="button" disabled={itemActionsDisabled} onClick={() => onFilterClick(clearFilter.message)} className="mt-1 block min-h-9 w-full border-t border-slate-100 px-3 pt-2 text-left text-sm font-semibold text-teal-800 hover:bg-teal-50/50 disabled:opacity-50">Reset work filters</button>}
                </div>
              </details>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Work lifecycle">
          {lifecycleFilters.map((filter) => (
            <button key={filter.id} type="button" aria-pressed={filter.active} disabled={itemActionsDisabled || filter.active} onClick={() => onFilterClick(filter.message)} className={cn('min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default', filter.active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-950')}>{filter.label}</button>
          ))}
        </div>
      </div>

      {section.items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="font-semibold text-slate-900">Nothing in this view</p>
          <p className="mt-1 text-sm text-slate-500">Choose another lifecycle to review other work.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label={`${block.title} work`}>
          {visibleItems.map((item) => <WorkRow key={item.id} item={item} disabled={itemActionsDisabled} onItemAction={onItemAction} />)}
        </ul>
      )}

      {(locallyHidden > 0 || moreFilter) && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/55 px-4 py-3">
          {locallyHidden > 0 && <button type="button" onClick={() => setShowAllFetched(true)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-900">Show {locallyHidden} more</button>}
          {locallyHidden === 0 && moreFilter && <button type="button" disabled={itemActionsDisabled} onClick={() => onFilterClick(moreFilter.message)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50/50 disabled:opacity-50">Show more work</button>}
        </div>
      )}
    </section>
  );
};
