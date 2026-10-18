'use client';

import { useState } from 'react';
import { ChevronDown, MoreHorizontal, ShieldCheck, Users } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';
import type { AskBlockRenderer } from './blocks/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type OnAction = Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];

function ActionMenu({ item, disabled, onAction }: {
  item: Block['sections'][number]['items'][number]; disabled: boolean; onAction: OnAction;
}) {
  const actions = item.actions ?? [];
  const primary = actions.find((action) => action.style === 'PRIMARY') ?? actions[0];
  const secondary = actions.filter((action) => action !== primary);
  const run = (action: (typeof actions)[number]) => onAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
  return <div className="flex shrink-0 items-center gap-1.5">
    {primary && <button type="button" disabled={disabled} onClick={() => run(primary)} className="min-h-8 rounded-lg bg-teal-700 px-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{primary.label}</button>}
    {secondary.length > 0 && <details className="relative">
      <summary aria-label={`More actions for ${item.title}`} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" /></summary>
      <div className="absolute right-0 z-20 mt-1 min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        {secondary.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => run(action)} className={cn('block min-h-8 w-full rounded-lg px-2.5 text-left text-xs font-semibold hover:bg-slate-50 disabled:opacity-50', action.id.includes('DELETE') ? 'text-red-700' : 'text-slate-700')}>{action.label}</button>)}
      </div>
    </details>}
  </div>;
}

export function HomeContinuityPlanResultList({ block, disabled, onAction }: { block: Block; disabled: boolean; onAction: OnAction }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  return <section data-home-continuity-plan="" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-slate-950">Plan contents</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">Open a section to review its entries or manage it.</p>
      </div>
      <div className="flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>
    </div>
    <div className="divide-y divide-slate-100">
      {block.sections.map((section) => {
        const manager = section.items.find((item) => item.entityType === 'HOME_DIGITAL_WILL_SECTION');
        const entries = section.items.filter((item) => item !== manager);
        const isContactSection = section.id === 'digital-will-contacts';
        const open = Boolean(openSections[section.id]);
        const disabledSection = /disabled/i.test(section.title) || manager?.status === 'DISABLED';
        const label = section.title.replace(/ — Disabled$/i, '');
        return <div key={section.id} className={cn(disabledSection && 'bg-slate-50/60')}>
          <button type="button" aria-expanded={open} aria-controls={`${section.id}-panel`} onClick={() => setOpenSections((current) => ({ ...current, [section.id]: !open }))} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isContactSection ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-800')}>
              {isContactSection ? <Users className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">{label}{disabledSection && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">Disabled</span>}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{entries.length === 0 ? 'No entries yet' : `${entries.length} ${isContactSection ? 'contact' : 'entry'}${entries.length === 1 ? '' : 'ies'}`}</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
          </button>
          {open && <div id={`${section.id}-panel`} className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
            {manager && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">{manager.description || (disabledSection ? 'Enable or edit this section to add entries.' : 'Add or organize entries in this section.')}</p>
              <ActionMenu item={manager} disabled={disabled} onAction={onAction} />
            </div>}
            {entries.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Nothing recorded in this section.</p> : <ul className="space-y-2">{entries.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{item.title}</p>{item.meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{item.meta.join(' · ')}</p>}</div>
              <ActionMenu item={item} disabled={disabled} onAction={onAction} />
            </li>)}</ul>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
