'use client';

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { CompactAskCard } from './CompactAskCard';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

/** A focused, read-only forecast artifact. Recurrence and grouping are server
 * semantics; this component only provides the compact responsive hierarchy and
 * progressive disclosure required by the calm Ask presentation. */
export function MaintenanceForecastResultList({ block }: { block: Block }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="space-y-5" data-maintenance-forecast="">
      {block.sections.map((section) => (
        <section key={section.id} aria-labelledby={`maintenance-forecast-${section.id}`}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 id={`maintenance-forecast-${section.id}`} className="text-sm font-semibold text-slate-900">{section.title}</h3>
            <span className="text-xs text-slate-500">{section.count}</span>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => {
              const expanded = expandedId === item.id;
              const detailId = `maintenance-forecast-detail-${item.id}`;
              const timing = item.meta.at(-1);
              const supporting = item.meta.slice(0, -1).join(' · ');
              return (
                <li key={item.id} className="min-w-0" data-maintenance-forecast-item={item.id}>
                  <CompactAskCard
                    title={item.title}
                    iconCategory="MAINTENANCE"
                    fallbackIcon={Wrench}
                    density="dense"
                    tone={item.tone === 'CRITICAL' ? 'CRITICAL' : item.tone === 'CAUTION' ? 'CAUTION' : 'DEFAULT'}
                    badge={item.badgeLabel ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{item.badgeLabel}</span> : undefined}
                    summary={timing}
                    meta={supporting}
                    action={item.description ? (
                      <button
                        type="button"
                        className="min-h-9 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                      >
                        {expanded ? 'Hide why' : 'Why this?'}
                      </button>
                    ) : undefined}
                  />
                  {expanded && item.description && (
                    <div id={detailId} className="mx-2 rounded-b-xl border border-t-0 border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">
                      {item.description}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
