'use client';

import {
  ArrowRight, BedDouble, Boxes, FileText, History, Home, ShieldCheck, Users, type LucideIcon,
} from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { cn } from '@/lib/utils';
import type { AskBlockRenderer } from './blocks/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

const AREA_ICONS: Record<string, LucideIcon> = {
  profile: Home,
  rooms: BedDouble,
  inventory: Boxes,
  documents: FileText,
  warranties: ShieldCheck,
  timeline: History,
  household: Users,
};

const isEmptyArea = (item: Item) => item.meta.some((value) => /^0\s/.test(value.trim()));
const needsReview = (item: Item) => /NEED REVIEW/i.test(item.status ?? '');

/**
 * ACUI-010: the home-record index is one conversational artifact, not a configurable database view.
 * It deliberately owns its responsive composition so it never falls through to Auto/List/Cards.
 */
export const HomeRecordOverviewBlock: AskBlockRenderer<'GROUPED_LIST'> = ({ block, itemActionsDisabled, onItemAction }) => {
  const items = block.sections.flatMap((section) => section.items);
  return (
    <section data-home-record-overview="" aria-labelledby={`${block.id}-title`} className="w-full max-w-[1040px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-teal-50/80 via-white to-white px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Home record</p>
          <h3 id={`${block.id}-title`} className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">{block.title}</h3>
          {block.description && <p className="mt-0.5 text-sm leading-5 text-slate-600">{block.description}</p>}
        </div>
        <p className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{items.length} areas</p>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-600">No record areas are available right now.</div>
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0" aria-label="Home record areas">
          {items.map((item, index) => {
            const Icon = AREA_ICONS[item.id] ?? FileText;
            const action = item.actions?.find((candidate) => candidate.style === 'PRIMARY') ?? item.actions?.[0];
            const empty = isEmptyArea(item);
            const attention = needsReview(item);
            return (
              <li
                key={item.id}
                data-home-record-area={item.id}
                data-record-empty={empty ? '' : undefined}
                data-record-attention={attention ? '' : undefined}
                className={cn(
                  'group relative flex min-h-[6rem] items-center gap-3 px-4 py-3.5 sm:px-5',
                  'md:border-b md:border-slate-100 md:[&:nth-child(odd)]:border-r',
                  index >= items.length - (items.length % 2 || 2) && 'md:border-b-0',
                  attention ? 'bg-amber-50/45' : empty ? 'bg-slate-50/45' : 'bg-white',
                )}
              >
                <span className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl border',
                  attention ? 'border-amber-200 bg-amber-100 text-amber-800' : empty ? 'border-slate-200 bg-white text-slate-400' : 'border-teal-100 bg-teal-50 text-teal-700',
                )}><Icon aria-hidden="true" className="h-4 w-4" /></span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h4 className={cn('text-sm font-semibold', empty ? 'text-slate-700' : 'text-slate-950')}>{item.title}</h4>
                    {item.status && <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      attention ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600',
                    )}>{item.status.replace(/_/g, ' ')}</span>}
                  </div>
                  {item.description && <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-600">{item.description}</p>}
                  {item.meta.length > 0 && <p className={cn('mt-0.5 text-xs font-medium tabular-nums', empty ? 'text-slate-400' : 'text-slate-500')}>{item.meta.join(' · ')}</p>}
                </div>

                {action && <button
                  type="button"
                  aria-label={`${action.label}: ${item.title}`}
                  disabled={itemActionsDisabled}
                  onClick={() => onItemAction(action.entityType ?? item.entityType, action.entityId ?? item.id, action.message, action.operationId, action.interactionType)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50"
                >
                  <span aria-hidden="true" className="hidden sm:inline">{action.label}</span>
                  <span aria-hidden="true" className="sm:hidden">Open</span>
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
