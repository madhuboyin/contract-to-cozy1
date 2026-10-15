'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';
import type { ItemActionHandler } from './PatternParts';

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedListBlock['sections'][number];

const tabLabel = (title: string) => title === 'In good shape' ? 'Good' : title === 'Missing information' ? 'Missing info' : title;

function itemSummary(item: AskGroupedListItem): string | null {
  return [item.timingLabel, item.description].filter(Boolean).join(' · ') || null;
}

export function StatusAccordionView({ sections, onItemAction, disabled }: {
  sections: Section[];
  onItemAction: ItemActionHandler;
  disabled: boolean;
}) {
  const firstSection = sections.find((section) => section.items.length > 0) ?? sections[0];
  const [activeKey, setActiveKey] = useState(firstSection?.id ?? '');
  const [expandedId, setExpandedId] = useState<string | null>(firstSection?.items[0]?.id ?? null);
  const activeSection = sections.find((section) => section.id === activeKey) ?? firstSection;
  const activeItems = activeSection?.items ?? [];
  const activeLabel = tabLabel(activeSection?.title ?? 'Status');

  const select = (key: string, items: AskGroupedListItem[]) => {
    setActiveKey(key);
    setExpandedId(items[0]?.id ?? null);
  };

  return (
    <div data-status-accordion="">
      <div className="grid grid-cols-1 border-b border-slate-100 sm:grid-flow-col sm:auto-cols-fr" role="tablist" aria-label="Home status condition">
        {sections.map((section) => {
          const selected = section.id === activeSection?.id;
          return <button key={section.id} type="button" role="tab" aria-selected={selected} aria-controls="status-accordion-panel" onClick={() => select(section.id, section.items)}
            className={cn('min-h-11 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600', selected ? 'border-teal-700 bg-teal-50/50 text-slate-950' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800')}>
            {tabLabel(section.title)} <span className="tabular-nums">({section.count})</span>
          </button>;
        })}
      </div>
      <ul id="status-accordion-panel" role="tabpanel" aria-label={`${activeLabel} items`} className="space-y-2 p-3">
        {activeItems.map((item) => {
          const expanded = expandedId === item.id;
          const detailsId = `status-accordion-${item.id}-details`;
          return <li key={item.id} data-status-accordion-item={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedId(expanded ? null : item.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600">
              <span className="min-w-0">
                <span className="block font-semibold text-slate-950">{item.title}</span>
                {itemSummary(item) && <span className="mt-0.5 block truncate text-xs text-slate-500">{itemSummary(item)}</span>}
              </span>
              {expanded ? <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />}
            </button>
            {expanded && <div id={detailsId} className="border-t border-slate-100 px-3 py-3">
              {item.description && <p className="text-sm leading-5 text-slate-700">{item.description}</p>}
              {item.meta.length > 0 && <p className={cn('text-xs leading-5 text-slate-500', item.description && 'mt-1.5')}>{item.meta.join(' · ')}</p>}
              {item.actions && item.actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
                {item.actions.map((action) => <button key={action.id} type="button" disabled={disabled}
                  onClick={() => onItemAction(item.entityType, item.id, action.message, action.operationId, action.interactionType)}
                  className={cn('min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-50', action.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                  {action.label}
                </button>)}
              </div>}
            </div>}
          </li>;
        })}
      </ul>
    </div>
  );
}
