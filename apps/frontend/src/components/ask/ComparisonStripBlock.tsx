'use client';

import { useContext, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import { prefersReducedMotion, resolveAdaptiveComparisonPresentation, type ComparisonPresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;

const toneStyles = {
  DEFAULT: 'border-slate-100 bg-slate-50 text-slate-700',
  POSITIVE: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-200 bg-amber-50 text-amber-950',
  CRITICAL: 'border-red-200 bg-red-50 text-red-950',
} satisfies Record<ComparisonBlock['options'][number]['attributes'][number]['tone'], string>;

export function ComparisonStripBlock({ block, renderAction }: { block: ComparisonBlock; renderAction: (action: AskAction) => ReactNode }) {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.comparisonLayouts?.[block.id] ?? 'AUTO';
  const decision = resolveAdaptiveComparisonPresentation(block, preference);
  const layout = decision.layout;
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLElement | null>>([]);

  const setLayout = (next: ComparisonPresentationPreference) => controls?.change((view) => ({
    ...view,
    comparisonLayouts: { ...(view.comparisonLayouts ?? {}), [block.id]: next },
  }));

  const moveTo = (next: number) => {
    const bounded = Math.max(0, Math.min(next, block.options.length - 1));
    setActiveIndex(bounded);
    const option = optionRefs.current[bounded];
    option?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    option?.focus({ preventScroll: true });
  };

  const syncActiveOption = () => {
    if (layout !== 'STRIP' || !stripRef.current) return;
    const left = stripRef.current.scrollLeft;
    const closest = optionRefs.current.reduce((best, option, index) => {
      if (!option) return best;
      return Math.abs(option.offsetLeft - left) < best.distance ? { index, distance: Math.abs(option.offsetLeft - left) } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    setActiveIndex(closest.index);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`ask-comparison-${block.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`ask-comparison-${block.id}`} className="font-semibold text-slate-950">{block.title}</h3>
          {block.description && <p className="mt-1 text-sm leading-5 text-slate-600">{block.description}</p>}
        </div>
        {controls && decision.offersChoice && (
          <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex" role="group" aria-label={`View ${block.title}`}>
            <button type="button" aria-pressed={preference === 'AUTO'} onClick={() => setLayout('AUTO')} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', preference === 'AUTO' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>Auto</button>
            <button type="button" aria-pressed={preference === 'STRIP'} onClick={() => setLayout('STRIP')} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', preference === 'STRIP' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>Card strip</button>
            <button type="button" aria-pressed={preference === 'GRID'} onClick={() => setLayout('GRID')} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', preference === 'GRID' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>Show all</button>
          </div>
        )}
      </div>

      <div
        ref={stripRef}
        onScroll={syncActiveOption}
        className={cn(
          'mt-4 gap-3',
          layout === 'GRID' ? 'grid sm:grid-cols-2' : 'grid sm:flex sm:snap-x sm:snap-mandatory sm:overflow-x-auto sm:pb-2',
        )}
        data-comparison-presentation={layout.toLowerCase()}
        role="list"
        aria-label={`${block.title} options`}
      >
        {block.options.map((option, index) => (
          <article
            key={option.id}
            ref={(node) => { optionRefs.current[index] = node; }}
            tabIndex={-1}
            role="listitem"
            aria-label={`Option ${index + 1} of ${block.options.length}: ${option.label}`}
            className={cn('rounded-xl border border-slate-200 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2', layout === 'STRIP' && 'sm:min-w-[19rem] sm:max-w-[22rem] sm:flex-1 sm:snap-start')}
          >
            {option.badge && (
              <div className="mb-3">
                <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800" data-badge-policy={option.badge.policyCode}>{option.badge.label}</span>
                <details className="mt-1.5 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">Why this label</summary>
                  <p className="mt-1 leading-5">{option.badge.basis}</p>
                </details>
              </div>
            )}
            <h4 className="text-base font-semibold text-slate-950">{option.label}</h4>
            {option.summary && <p className="mt-1 text-sm leading-5 text-slate-600">{option.summary}</p>}
            <dl className="mt-4 space-y-2">
              {option.attributes.map((attribute) => (
                <div key={attribute.label} className={cn('rounded-lg border px-3 py-2 text-sm', toneStyles[attribute.tone])}>
                  <dt className="text-xs font-medium opacity-75">{attribute.label}</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center justify-between gap-2 font-semibold">
                    <span>{attribute.value}</span>
                    {attribute.tone !== 'DEFAULT' && <span className="text-[10px] font-bold uppercase tracking-wide">{attribute.tone.toLowerCase()}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {option.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{option.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
          </article>
        ))}
      </div>

      {layout === 'STRIP' && block.options.length > 2 && (
        <div className="mt-3 hidden items-center justify-between gap-3 sm:flex">
          <p className="text-xs text-slate-500" aria-live="polite">Option {activeIndex + 1} of {block.options.length}. All options remain reachable by scrolling or choosing Show all.</p>
          <div className="flex gap-2">
            <button type="button" disabled={activeIndex === 0} onClick={() => moveTo(activeIndex - 1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Previous option in ${block.title}`}><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" disabled={activeIndex === block.options.length - 1} onClick={() => moveTo(activeIndex + 1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Next option in ${block.title}`}><ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
    </section>
  );
}
