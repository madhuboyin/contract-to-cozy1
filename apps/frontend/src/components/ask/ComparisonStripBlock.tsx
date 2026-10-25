'use client';

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  Home,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import {
  comparisonPriceShares,
  prefersReducedMotion,
  resolveAdaptiveComparisonPresentation,
  type ComparisonPresentationPreference,
} from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';
import { comparisonBadges } from '@/features/ask/displayPatterns';

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;
type ComparisonOption = ComparisonBlock['options'][number];

const toneStyles = {
  DEFAULT: 'border-slate-100 bg-slate-50 text-slate-700',
  POSITIVE: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-200 bg-amber-50 text-amber-950',
  CRITICAL: 'border-red-200 bg-red-50 text-red-950',
} satisfies Record<ComparisonOption['attributes'][number]['tone'], string>;

const choiceLabel = (choice: ComparisonPresentationPreference, optionCount: number) =>
  choice === 'AUTO'
    ? 'Auto'
    : choice === 'STRIP'
      ? 'Card strip'
      : choice === 'TABLE'
        ? 'Table'
        : optionCount <= 2
          ? 'Cards'
          : 'Show all';

function parseCurrencyNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function getSellHoldRentVisuals(option: ComparisonOption) {
  const id = option.id.toLowerCase();
  const isLead = comparisonBadges(option).some((b) => b.policyCode === 'SELL_HOLD_RENT_MODELED_OUTCOME');

  const Icon = id === 'sell' ? BadgeDollarSign : id === 'hold' ? Home : Building2;
  const pathTag =
    id === 'sell'
      ? 'Liquidity & Exit Path'
      : id === 'hold'
        ? 'Equity & Appreciation Path'
        : 'Income & Carry Path';

  const outcomeAttr = option.attributes.find((a) => a.label === 'Modeled outcome');
  const outcomeRaw = outcomeAttr?.value ?? '';
  const outcomeNum = parseCurrencyNumber(outcomeRaw);
  const isNegative = outcomeNum !== null && outcomeNum < 0;

  // Compute inflow vs cost mix for visual bar
  let positiveTotal = 0;
  let costTotal = 0;
  for (const attr of option.attributes) {
    if (attr.label === 'Modeled outcome') continue;
    const val = Math.abs(parseCurrencyNumber(attr.value) ?? 0);
    const l = attr.label.toLowerCase();
    if (l.includes('cost') || l.includes('vacancy') || l.includes('management')) {
      costTotal += val;
    } else {
      positiveTotal += val;
    }
  }
  const combined = positiveTotal + costTotal;
  const positivePct = combined > 0 ? Math.round((positiveTotal / combined) * 100) : 70;
  const costPct = combined > 0 ? Math.max(0, 100 - positivePct) : 30;

  return {
    Icon,
    pathTag,
    isLead,
    outcomeNum,
    isNegative,
    positivePct,
    costPct,
    hasBreakdownBar: combined > 0,
  };
}

// IW-PRES-016 (FRD v1.76): the same options as rows. A value is marked only where the server declared it leading.
function ComparisonTable({ block, renderAction }: { block: ComparisonBlock; renderAction: (action: AskAction) => ReactNode }) {
  const labels = [...new Set(block.options.flatMap((option) => option.attributes.map((attribute) => attribute.label)))];
  const anyBadges = block.options.some((option) => comparisonBadges(option).length > 0);
  const anyActions = block.options.some((option) => option.actions.length > 0);
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80" data-comparison-presentation="table">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <caption className="sr-only">{block.title}</caption>
        <thead className="bg-slate-50/80">
          <tr>
            <td className="w-36 border-b border-slate-200 p-2.5" />
            {block.options.map((option) => (
              <th key={option.id} scope="col" className="border-b border-slate-200 p-2.5 font-bold text-slate-950">
                {option.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anyBadges && (
            <tr>
              <th scope="row" className="border-b border-slate-100 p-2.5 text-xs font-semibold text-slate-600">
                Labels
              </th>
              {block.options.map((option) => (
                <td key={option.id} className="border-b border-slate-100 p-2.5">
                  {comparisonBadges(option).map((badge) => (
                    <span
                      key={badge.policyCode}
                      title={badge.basis}
                      className="mr-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900"
                      data-badge-policy={badge.policyCode}
                    >
                      {badge.label}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          )}
          {labels.map((label) => (
            <tr key={label} className="hover:bg-slate-50/50">
              <th scope="row" className="border-b border-slate-100 p-2.5 align-top text-xs font-semibold text-slate-600">
                {label}
              </th>
              {block.options.map((option) => {
                const attribute = option.attributes.find((candidate) => candidate.label === label);
                if (!attribute) {
                  return (
                    <td key={option.id} className="border-b border-slate-100 p-2.5 text-slate-400">
                      Not listed
                    </td>
                  );
                }
                return (
                  <td
                    key={option.id}
                    className={cn(
                      'border-b border-slate-100 p-2.5 align-top tabular-nums',
                      attribute.leading
                        ? 'bg-emerald-50 font-bold text-emerald-950'
                        : attribute.tone === 'CAUTION'
                          ? 'text-amber-900'
                          : attribute.tone === 'CRITICAL'
                            ? 'text-red-900'
                            : 'font-medium text-slate-800',
                    )}
                    data-leading={attribute.leading ? 'true' : undefined}
                  >
                    {attribute.value}
                    {attribute.leading && (
                      <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        Leads
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {anyActions && (
            <tr>
              <th scope="row" className="p-2.5 text-xs font-medium text-slate-600">
                <span className="sr-only">Actions</span>
              </th>
              {block.options.map((option) => (
                <td key={option.id} className="p-2.5">
                  <div className="flex flex-wrap gap-2">
                    {option.actions.map((action) => (
                      <span key={action.id}>{renderAction(action)}</span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ComparisonStripBlock({
  block,
  renderAction,
}: {
  block: ComparisonBlock;
  renderAction: (action: AskAction) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.comparisonLayouts?.[block.id] ?? 'AUTO';
  const decision = resolveAdaptiveComparisonPresentation(block, preference);
  const layout = decision.layout;
  const priceShares = comparisonPriceShares(block);
  const isSellHoldRent = block.id === 'sell-hold-rent-comparison';
  const restoredOptionId = controls?.view.selectedComparisonOptions?.[block.id];
  const restoredIndex = Math.max(0, block.options.findIndex((option) => option.id === restoredOptionId));
  const [activeIndex, setActiveIndex] = useState(restoredIndex);
  const stripRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const next = block.options.findIndex((option) => option.id === restoredOptionId);
    if (next >= 0) setActiveIndex(next);
  }, [block.options, restoredOptionId]);

  const setLayout = (next: ComparisonPresentationPreference) =>
    controls?.change((view) => ({
      ...view,
      comparisonLayouts: { ...(view.comparisonLayouts ?? {}), [block.id]: next },
    }));

  const rememberOption = (index: number) =>
    controls?.change((view) => ({
      ...view,
      selectedComparisonOptions: { ...(view.selectedComparisonOptions ?? {}), [block.id]: block.options[index]?.id },
    }));

  const moveTo = (next: number) => {
    const bounded = Math.max(0, Math.min(next, block.options.length - 1));
    setActiveIndex(bounded);
    rememberOption(bounded);
    const option = optionRefs.current[bounded];
    option?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    option?.focus({ preventScroll: true });
  };

  const syncActiveOption = () => {
    if (layout !== 'STRIP' || !stripRef.current) return;
    const left = stripRef.current.scrollLeft;
    const closest = optionRefs.current.reduce(
      (best, option, index) => {
        if (!option) return best;
        return Math.abs(option.offsetLeft - left) < best.distance
          ? { index, distance: Math.abs(option.offsetLeft - left) }
          : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    setActiveIndex(closest.index);
    rememberOption(closest.index);
  };

  // The at-a-glance verdict: only what the server marked as leading, so the card never ranks options on its own.
  const leaders =
    block.options.length < 2
      ? []
      : [...new Set(block.options.flatMap((option) => option.attributes.map((attribute) => attribute.label)))]
          .map((label) => ({
            label,
            options: block.options
              .filter((option) => option.attributes.some((attribute) => attribute.label === label && attribute.leading))
              .map((option) => option.label),
          }))
          .filter((leader) => leader.options.length > 0);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white',
        isSellHoldRent ? 'border-slate-200/90 shadow-xs' : 'border-slate-200 p-4',
      )}
      aria-labelledby={`ask-comparison-${block.id}`}
    >
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-3',
          isSellHoldRent && 'border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/30 px-4 py-3.5 sm:px-5',
        )}
      >
        <div>
          {isSellHoldRent && (
            <span
              aria-hidden="true"
              className="mb-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800 ring-1 ring-teal-200/70"
            >
              <Sparkles className="h-3 w-3 text-teal-600" />
              Side-by-Side Path Economics
            </span>
          )}
          <h3 id={`ask-comparison-${block.id}`} className="text-base font-bold text-slate-950">
            {block.title}
          </h3>
          {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.description}</p>}
        </div>
        {controls && (
          <div
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label={`View ${block.title}`}
          >
            {decision.choices.map((choice) => {
              const pressed =
                decision.reason === 'USER_CHOICE'
                  ? choice === preference
                  : decision.choices.includes('AUTO')
                    ? choice === 'AUTO'
                    : choice === layout;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setLayout(choice)}
                  className={cn(
                    'min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                    (choice === 'AUTO' || choice === 'STRIP') && 'hidden sm:inline-flex sm:items-center',
                    pressed ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:bg-white',
                  )}
                >
                  {choiceLabel(choice, block.options.length)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={cn(isSellHoldRent && 'p-4 sm:p-5')}>
        {leaders.length > 0 && (
          <div
            className="mb-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Where each option leads"
            data-comparison-leaders=""
          >
            {leaders.map((leader) => (
              <span key={leader.label} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-950 ring-1 ring-emerald-200/70">
                <span className="text-emerald-800">{leader.label}:</span>{' '}
                <span className="font-semibold">{leader.options.join(', ')}</span>
              </span>
            ))}
          </div>
        )}

        {layout === 'TABLE' ? (
          <ComparisonTable block={block} renderAction={renderAction} />
        ) : (
          <div
            ref={stripRef}
            onScroll={syncActiveOption}
            className={cn(
              !isSellHoldRent && 'mt-4',
              'gap-3.5',
              isSellHoldRent
                ? 'grid grid-cols-1 md:grid-cols-3'
                : layout === 'GRID'
                  ? 'grid sm:grid-cols-2'
                  : 'grid sm:flex sm:snap-x sm:snap-mandatory sm:overflow-x-auto sm:pb-2',
            )}
            data-comparison-presentation={layout.toLowerCase()}
            role="list"
            aria-label={`${block.title} options`}
          >
            {block.options.map((option, index) => {
              const shr = isSellHoldRent ? getSellHoldRentVisuals(option) : null;
              const OptionIcon = shr?.Icon ?? BadgeDollarSign;
              const badges = comparisonBadges(option);

              return (
                <article
                  key={option.id}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  tabIndex={-1}
                  role="listitem"
                  aria-label={`Option ${index + 1} of ${block.options.length}: ${option.label}`}
                  className={cn(
                    'relative flex flex-col justify-between rounded-2xl border p-4 outline-none transition-all focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2',
                    shr?.isLead
                      ? 'border-emerald-400/90 bg-gradient-to-b from-emerald-50/50 via-white to-white shadow-md ring-1 ring-emerald-500/30'
                      : 'border-slate-200/90 bg-white shadow-2xs hover:border-slate-300',
                    !isSellHoldRent && layout === 'STRIP' && 'sm:min-w-[19rem] sm:max-w-[22rem] sm:flex-1 sm:snap-start',
                  )}
                >
                  <div>
                    {/* Top Accent Stripe for Sell / Hold / Rent */}
                    {shr && (
                      <div
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-x-0 top-0 h-1.5 rounded-t-2xl',
                          shr.isLead
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : option.id === 'sell'
                              ? 'bg-sky-500/70'
                              : option.id === 'hold'
                                ? 'bg-indigo-500/70'
                                : 'bg-amber-500/70',
                        )}
                      />
                    )}

                    {/* Badges Row */}
                    {badges.length > 0 && (
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-1.5">
                          {badges.map((badge) => (
                            <span
                              key={badge.policyCode}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
                                badge.policyCode === 'SELL_HOLD_RENT_MODELED_OUTCOME'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-sky-100 text-sky-800',
                              )}
                              data-badge-policy={badge.policyCode}
                            >
                              {badge.policyCode === 'SELL_HOLD_RENT_MODELED_OUTCOME' && (
                                <Trophy aria-hidden="true" className="h-3 w-3" />
                              )}
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        <details className="mt-1.5 text-xs text-slate-600">
                          <summary className="cursor-pointer font-medium text-slate-700 hover:text-teal-800">
                            {badges.length === 1 ? 'Why this label' : 'Why these labels'}
                          </summary>
                          {badges.map((badge) => (
                            <p key={badge.policyCode} className="mt-1 leading-5">
                              {badges.length > 1 && <strong className="font-semibold">{badge.label}: </strong>}
                              {badge.basis}
                            </p>
                          ))}
                        </details>
                      </div>
                    )}

                    {/* Option Header */}
                    <div className="flex items-center gap-3">
                      {shr && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-2xs',
                            shr.isLead
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                              : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80',
                          )}
                        >
                          <OptionIcon className="h-5 w-5" />
                        </span>
                      )}
                      <div>
                        <h4 className="text-base font-bold text-slate-950">{option.label}</h4>
                        {shr && (
                          <p aria-hidden="true" className="text-[11px] font-medium text-slate-500">
                            {shr.pathTag}
                          </p>
                        )}
                      </div>
                    </div>

                    {option.summary && <p className="mt-1.5 text-sm leading-5 text-slate-600">{option.summary}</p>}

                    {/* Visual Inflows vs Costs Bar for Sell / Hold / Rent */}
                    {shr?.hasBreakdownBar && (
                      <div aria-hidden="true" className="mt-3.5 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70">
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <TrendingUp className="h-3 w-3" />
                            Value / Inflows ({shr.positivePct}%)
                          </span>
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <TrendingDown className="h-3 w-3" />
                            Costs ({shr.costPct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <span style={{ width: `${shr.positivePct}%` }} className="h-full bg-emerald-500" />
                          <span style={{ width: `${shr.costPct}%` }} className="h-full bg-rose-400" />
                        </div>
                      </div>
                    )}

                    {/* Price Share Bar (for quote comparisons) */}
                    {priceShares && (
                      <progress
                        role="img"
                        className="mt-3 block h-2 w-full overflow-hidden rounded-full accent-teal-600"
                        aria-label={
                          priceShares[index] === 1
                            ? 'Highest price of these options'
                            : `${Math.round(priceShares[index] * 100)}% of the highest price of these options`
                        }
                        data-price-share={priceShares[index].toFixed(3)}
                        max={100}
                        value={Math.max(2, priceShares[index] * 100)}
                      />
                    )}

                    {/* Attributes DL */}
                    <dl className="mt-3.5 grid grid-cols-1 gap-2">
                      {option.attributes.map((attribute) => {
                        const isOutcomeHero = isSellHoldRent && attribute.label === 'Modeled outcome';
                        const isNegativeOutcome = isOutcomeHero && shr?.isNegative;
                        return (
                          <div
                            key={attribute.label}
                            className={cn(
                              'rounded-xl border px-3 py-2.5 text-sm transition-colors',
                              isOutcomeHero
                                ? isNegativeOutcome
                                  ? 'border-rose-200 bg-rose-50/70 text-rose-950'
                                  : shr?.isLead
                                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
                                    : 'border-teal-200/80 bg-teal-50/40 text-slate-900'
                                : toneStyles[attribute.tone],
                            )}
                          >
                            <dt
                              className={cn(
                                'text-xs font-semibold',
                                isOutcomeHero ? 'uppercase tracking-wider opacity-80' : 'opacity-75',
                              )}
                            >
                              {attribute.label}
                            </dt>
                            <dd
                              className={cn(
                                'mt-0.5 flex flex-wrap items-center justify-between gap-2 font-bold tabular-nums',
                                isOutcomeHero ? 'text-lg sm:text-xl' : 'text-sm font-semibold',
                              )}
                            >
                              <span>{attribute.value}</span>
                              {attribute.leading && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                  Leads
                                </span>
                              )}
                              {attribute.tone !== 'DEFAULT' && (
                                <span className="text-[10px] font-bold uppercase tracking-wide">
                                  {attribute.tone.toLowerCase()}
                                </span>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>

                  {option.actions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {option.actions.map((action) => (
                        <span key={action.id}>{renderAction(action)}</span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {layout === 'STRIP' && block.options.length > 2 && (
          <div className="mt-3 hidden items-center justify-between gap-3 sm:flex">
            <p className="text-xs text-slate-500" aria-live="polite">
              Option {activeIndex + 1} of {block.options.length}. All options remain reachable by scrolling or choosing
              Show all.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => moveTo(activeIndex - 1)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Previous option in ${block.title}`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={activeIndex === block.options.length - 1}
                onClick={() => moveTo(activeIndex + 1)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Next option in ${block.title}`}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {block.actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {block.actions.map((action) => (
              <span key={action.id}>{renderAction(action)}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
