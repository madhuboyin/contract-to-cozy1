'use client';

import { cn } from '@/lib/utils';
import type { AskBlockRenderer } from '../blocks/types';
import type { AskDisplayTone } from '@/features/ask/types';

// FRD v1.405. A visual board of grouped findings. Each section declares its layout: proportional cost bars, tone-accented cards,
// numbered steps, or a collapsed list. Labels, badges, ranges and tones are the producer's; this renderer only scales and colours them.

const BADGE: Record<AskDisplayTone, string> = {
  DEFAULT: 'bg-slate-100 text-slate-700',
  POSITIVE: 'bg-emerald-100 text-emerald-800',
  CAUTION: 'bg-amber-100 text-amber-900',
  CRITICAL: 'bg-red-100 text-red-800',
};
const CARD: Record<AskDisplayTone, string> = {
  DEFAULT: 'border-l-slate-300 bg-slate-50',
  POSITIVE: 'border-l-emerald-500 bg-emerald-50/70',
  CAUTION: 'border-l-amber-500 bg-amber-50/70',
  CRITICAL: 'border-l-red-500 bg-red-50/70',
};

type Block = Parameters<AskBlockRenderer<'INSIGHT_BOARD'>>[0]['block'];
type Section = Block['sections'][number];
type Item = Section['items'][number];

function Badge({ item }: { item: Item }) {
  if (!item.badge) return null;
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', BADGE[item.badge.tone])}>{item.badge.label}</span>;
}

function Bars({ section }: { section: Section }) {
  const top = Math.max(1, ...section.items.map((item) => item.range?.max ?? 0));
  return (
    <ul className="space-y-3.5">
      {section.items.map((item) => {
        const low = item.range ? (item.range.min / top) * 100 : 0;
        const high = item.range ? (item.range.max / top) * 100 : 0;
        return (
          <li key={item.id} data-insight-item={item.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-slate-900">{item.title}</p>
              {item.valueLabel && <p className="shrink-0 text-sm font-bold tabular-nums text-amber-700">{item.valueLabel}</p>}
            </div>
            {item.range && (
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${item.title}: ${item.valueLabel ?? 'estimated cost'}`}>
                <div className="relative h-full rounded-full bg-amber-200" style={{ width: `${Math.max(4, high)}%` }}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: high > 0 ? `${(low / high) * 100}%` : '0%' }} />
                </div>
              </div>
            )}
            {item.detail && <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.detail}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function Cards({ section }: { section: Section }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {section.items.map((item) => (
        <li key={item.id} data-insight-item={item.id} className={cn('flex flex-col gap-1.5 rounded-xl border border-l-4 border-slate-200 p-3', CARD[item.badge?.tone ?? 'DEFAULT'])}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold leading-5 text-slate-900">{item.title}</p>
            <Badge item={item} />
          </div>
          {item.detail && <p className="text-xs leading-5 text-slate-600">{item.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function Steps({ section }: { section: Section }) {
  return (
    <ol className="space-y-2.5">
      {section.items.map((item, index) => (
        <li key={item.id} data-insight-item={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white" aria-hidden="true">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-sm font-semibold leading-5 text-slate-900">{item.title}</p>
              <Badge item={item} />
            </div>
            {item.detail && <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Disclosure({ section }: { section: Section }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-slate-700">
        <span>{section.summary ?? `Show ${section.items.length} steps`}</span>
        <span className="text-xs font-semibold text-teal-800 group-open:hidden">Show</span>
        <span className="hidden text-xs font-semibold text-teal-800 group-open:inline">Hide</span>
      </summary>
      <ul className="divide-y divide-slate-200 border-t border-slate-200">
        {section.items.map((item) => (
          <li key={item.id} data-insight-item={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{item.title}</p>
              {item.detail && <p className="mt-0.5 text-xs leading-5 text-slate-600">{item.detail}</p>}
            </div>
            <Badge item={item} />
          </li>
        ))}
      </ul>
    </details>
  );
}

export const InsightBoardBlock: AskBlockRenderer<'INSIGHT_BOARD'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-display-pattern="insight-board">
    <h3 className="text-base font-semibold text-slate-950">{block.title}</h3>
    {block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <div className="mt-4 space-y-6">
      {block.sections.map((section) => (
        <div key={section.id} data-insight-section={section.id}>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-teal-600" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
            {section.layout !== 'DISCLOSURE' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{section.items.length}</span>}
          </div>
          {section.layout === 'BARS' && <Bars section={section} />}
          {section.layout === 'CARDS' && <Cards section={section} />}
          {section.layout === 'STEPS' && <Steps section={section} />}
          {section.layout === 'DISCLOSURE' && <Disclosure section={section} />}
        </div>
      ))}
    </div>
  </section>
);
