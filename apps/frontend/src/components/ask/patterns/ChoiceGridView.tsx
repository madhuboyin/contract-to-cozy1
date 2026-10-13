'use client';

import { ArrowRight } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { ItemActionHandler } from './PatternParts';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

/** A compact, producer-declared menu of mutually exclusive workflow choices. */
export function ChoiceGridView({ sections, onItemAction, disabled }: {
  sections: GroupedList['sections'];
  onItemAction: ItemActionHandler;
  disabled: boolean;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {sections.map((section) => (
        <section key={section.id} className="p-3 sm:p-4" aria-labelledby={`${section.id}-choice-heading`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 id={`${section.id}-choice-heading`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">{section.title}</h4>
            <span className="text-xs text-slate-500">{section.count} {section.count === 1 ? 'option' : 'options'}</span>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {section.items.map((item) => {
              const action = item.actions![0];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onItemAction(item.entityType, item.id, action.message, action.operationId, action.interactionType)}
                    className="group flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-teal-400 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-5 text-slate-950">{item.title}</span>
                      {item.description && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.description}</span>}
                      {item.meta.length > 0 && <span className="mt-1 block text-xs text-slate-500">{item.meta.join(' · ')}</span>}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-800">
                      {action.label}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
