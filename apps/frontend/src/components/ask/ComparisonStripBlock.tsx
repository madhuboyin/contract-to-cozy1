'use client';

import { useContext, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import { comparisonPriceShares, prefersReducedMotion, resolveAdaptiveComparisonPresentation, type ComparisonPresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';
import { comparisonBadges } from '@/features/ask/displayPatterns';

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;

const toneStyles = {
  DEFAULT: 'border-slate-100 bg-slate-50 text-slate-700',
  POSITIVE: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-200 bg-amber-50 text-amber-950',
  CRITICAL: 'border-red-200 bg-red-50 text-red-950',
} satisfies Record<ComparisonBlock['options'][number]['attributes'][number]['tone'], string>;

const choiceLabel = (choice: ComparisonPresentationPreference, optionCount: number) => (
  choice === 'AUTO' ? 'Auto' : choice === 'STRIP' ? 'Card strip' : choice === 'TABLE' ? 'Table' : optionCount <= 2 ? 'Cards' : 'Show all'
);

// IW-PRES-016 (FRD v1.76): the same options as rows. A value is marked only where the server declared it leading.
function ComparisonTable({ block, renderAction }: { block: ComparisonBlock; renderAction: (action: AskAction) => ReactNode }) {
  const labels = [...new Set(block.options.flatMap((option) => option.attributes.map((attribute) => attribute.label)))];
  const anyBadges = block.options.some((option) => comparisonBadges(option).length > 0);
  const anyActions = block.options.some((option) => option.actions.length > 0);
  return (
    <div className="mt-4 overflow-x-auto" data-comparison-presentation="table">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">{block.title}</caption>
        <thead>
          <tr>
            <td className="w-32 border-b border-slate-200 p-2" />
            {block.options.map((option) => <th key={option.id} scope="col" className="border-b border-slate-200 p-2 font-semibold text-slate-950">{option.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {anyBadges && (
            <tr>
              <th scope="row" className="border-b border-slate-100 p-2 text-xs font-medium text-slate-600">Labels</th>
              {block.options.map((option) => (
                <td key={option.id} className="border-b border-slate-100 p-2">
                  {comparisonBadges(option).map((badge) => <span key={badge.policyCode} title={badge.basis} className="mr-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800" data-badge-policy={badge.policyCode}>{badge.label}</span>)}
                </td>
              ))}
            </tr>
          )}
          {labels.map((label) => (
            <tr key={label}>
              <th scope="row" className="border-b border-slate-100 p-2 align-top text-xs font-medium text-slate-600">{label}</th>
              {block.options.map((option) => {
                const attribute = option.attributes.find((candidate) => candidate.label === label);
                if (!attribute) return <td key={option.id} className="border-b border-slate-100 p-2 text-slate-400">Not listed</td>;
                return (
                  <td key={option.id} className={cn('border-b border-slate-100 p-2 align-top', attribute.leading ? 'bg-emerald-50 font-semibold text-emerald-950' : attribute.tone === 'CAUTION' ? 'text-amber-900' : attribute.tone === 'CRITICAL' ? 'text-red-900' : 'text-slate-800')} data-leading={attribute.leading ? 'true' : undefined}>
                    {attribute.value}
                    {attribute.leading && <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Leads</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {anyActions && (
            <tr>
              <th scope="row" className="p-2 text-xs font-medium text-slate-600"><span className="sr-only">Actions</span></th>
              {block.options.map((option) => <td key={option.id} className="p-2"><div className="flex flex-wrap gap-2">{option.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div></td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ComparisonStripBlock({ block, renderAction }: { block: ComparisonBlock; renderAction: (action: AskAction) => ReactNode }) {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.comparisonLayouts?.[block.id] ?? 'AUTO';
  const decision = resolveAdaptiveComparisonPresentation(block, preference);
  const layout = decision.layout;
  const priceShares = comparisonPriceShares(block);
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
        {controls && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${block.title}`}>
            {decision.choices.map((choice) => {
              const pressed = decision.reason === 'USER_CHOICE' ? choice === preference : decision.choices.includes('AUTO') ? choice === 'AUTO' : choice === layout;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setLayout(choice)}
                  // The strip only differs from the grid on wider screens, so a phone offers the grid and the table.
                  className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', (choice === 'AUTO' || choice === 'STRIP') && 'hidden sm:inline-flex sm:items-center', pressed ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}
                >
                  {choiceLabel(choice, block.options.length)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {layout === 'TABLE' ? <ComparisonTable block={block} renderAction={renderAction} /> : <div
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
            {comparisonBadges(option).length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1.5">
                  {comparisonBadges(option).map((badge) => <span key={badge.policyCode} className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800" data-badge-policy={badge.policyCode}>{badge.label}</span>)}
                </div>
                <details className="mt-1.5 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">{comparisonBadges(option).length === 1 ? 'Why this label' : 'Why these labels'}</summary>
                  {comparisonBadges(option).map((badge) => <p key={badge.policyCode} className="mt-1 leading-5">{comparisonBadges(option).length > 1 && <strong className="font-semibold">{badge.label}: </strong>}{badge.basis}</p>)}
                </details>
              </div>
            )}
            <h4 className="text-base font-semibold text-slate-950">{option.label}</h4>
            {option.summary && <p className="mt-1 text-sm leading-5 text-slate-600">{option.summary}</p>}
            {priceShares && (
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={priceShares[index] === 1 ? 'Highest price of these options' : `${Math.round(priceShares[index] * 100)}% of the highest price of these options`}
                data-price-share={priceShares[index].toFixed(3)}
              >
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(2, priceShares[index] * 100)}%` }} />
              </div>
            )}
            <dl className="mt-4 space-y-2">
              {option.attributes.map((attribute) => (
                <div key={attribute.label} className={cn('rounded-lg border px-3 py-2 text-sm', toneStyles[attribute.tone])}>
                  <dt className="text-xs font-medium opacity-75">{attribute.label}</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center justify-between gap-2 font-semibold">
                    <span>{attribute.value}</span>
                    {attribute.leading && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Leads</span>}
                    {attribute.tone !== 'DEFAULT' && <span className="text-[10px] font-bold uppercase tracking-wide">{attribute.tone.toLowerCase()}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {option.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{option.actions.map((action) => <span key={action.id}>{renderAction(action)}</span>)}</div>}
          </article>
        ))}
      </div>}

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
