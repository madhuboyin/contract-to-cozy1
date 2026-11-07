'use client';

import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './blocks/context';
import type { AskBlockRenderer } from './blocks/types';

type GroupedListBlockType = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type GroupedItem = GroupedListBlockType['sections'][number]['items'][number];

const NOT_SET_UP_HINTS: Record<string, string> = {
  'Home insurance': 'Compare your annual or monthly policy premium and renewal window.',
  'Home warranty': 'Compare your service contract cost, provider, and coverage term.',
  Internet: 'Compare your monthly bill, provider, and speed tier.',
  'Electricity and gas': 'Compare your monthly utility spend, rate type, and kWh usage.',
};

function resolveRecurringCategoryIcon(title: string): LucideIcon {
  const lower = title.toLowerCase();
  if (lower.includes('insurance')) return ShieldCheck;
  if (lower.includes('warranty')) return Wrench;
  if (lower.includes('internet')) return Wifi;
  if (lower.includes('electricity') || lower.includes('gas') || lower.includes('utility')) return Zap;
  return CircleDollarSign;
}

function formatRecurringStatusLabel(status: string | null | undefined): string {
  if (!status || status === 'NOT_SET_UP') return 'Not set up';
  if (status === 'FOUND_SAVINGS') return 'Saving found';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function resolveRecurringDescription(item: GroupedItem): string | null {
  if (!item.description) return null;
  if (!item.status || item.status === 'NOT_SET_UP') {
    const cleaned = item.description.replace(/^Not set up yet\.\s*/i, '');
    if (/^Add what you pay now and Ask will compare it\.?$/i.test(cleaned.trim())) {
      return NOT_SET_UP_HINTS[item.title] ?? cleaned;
    }
    return cleaned;
  }
  return item.description;
}

/**
 * Conversational Recurring Costs comparison panel (`savings-recurring-setup`).
 * Modeled on `HomeRecordOverviewBlock` ("Browse my home record"): a framed 2-column divided grid
 * with domain icons, category-specific hints, status pills, and adjacent right-aligned actions.
 */
export function RecurringCostsGrid({
  block,
  disabled,
  onItemAction,
}: {
  block: GroupedListBlockType;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const items = block.sections.flatMap((section) => section.items);
  const configuredCount = items.filter((item) => item.status && item.status !== 'NOT_SET_UP').length;
  const savingsFoundCount = items.filter((item) => item.status === 'FOUND_SAVINGS').length;
  const hasFooter = block.actions.length > 0;

  return (
    <section
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      data-savings-recurring-grid=""
    >
      <div className="flex flex-col gap-2 rounded-t-2xl border-b border-slate-200/80 bg-gradient-to-r from-teal-50/75 via-white to-slate-50/60 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Recurring bills</span>
          </p>
          <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">
            Recurring costs to compare
          </h3>
          {block.description && (
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-600">{block.description}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:mt-1">
          <span className="inline-flex items-center rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
            {items.length} {items.length === 1 ? 'cost' : 'costs'}
          </span>
          {configuredCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-teal-200/80 bg-teal-50/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-teal-800">
              {configuredCount} set up
            </span>
          )}
          {savingsFoundCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-800">
              {savingsFoundCount} saving found
            </span>
          )}
        </div>
      </div>

      <ul
        className={cn(
          'grid grid-cols-1 divide-y divide-slate-100',
          items.length > 1 && 'md:grid-cols-2 md:divide-y-0',
          !hasFooter && '[&>li:last-child]:rounded-b-2xl',
        )}
        aria-label="Recurring costs to compare"
      >
        {items.map((item, index) => {
          const Icon = resolveRecurringCategoryIcon(item.title);
          const label = formatRecurringStatusLabel(item.status);
          const description = resolveRecurringDescription(item);
          const metadata = item.meta.filter((value) => !/^not set up$|^plan saved$/i.test(value));
          const positive = item.status === 'FOUND_SAVINGS';
          const isSetUp = Boolean(item.status && item.status !== 'NOT_SET_UP');
          const actions = item.actions ?? [];
          const primaryAction = actions[0];

          return (
            <li
              key={item.id}
              data-ask-task-id={item.id}
              className={cn(
                'group relative flex min-h-[6rem] items-center justify-between gap-3.5 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-5',
                items.length > 1 && 'md:border-b md:border-slate-100 md:[&:nth-child(odd)]:border-r',
                items.length > 1 &&
                  index >= items.length - (items.length % 2 || 2) &&
                  'md:border-b-0',
                positive ? 'bg-emerald-50/20' : !isSetUp ? 'bg-slate-50/25' : 'bg-white',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border shadow-2xs',
                    positive
                      ? 'border-emerald-200 bg-emerald-100/80 text-emerald-800'
                      : isSetUp
                        ? 'border-teal-100 bg-teal-50 text-teal-700'
                        : 'border-slate-200/90 bg-white text-slate-500',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        positive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : isSetUp
                            ? 'border-teal-200/80 bg-teal-50/80 text-teal-800'
                            : 'border-slate-200 bg-white text-slate-600',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          positive
                            ? 'bg-emerald-500'
                            : isSetUp
                              ? 'bg-teal-500'
                              : 'bg-slate-400',
                        )}
                      />
                      {label}
                    </span>
                  </div>

                  {description && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">
                      {description}
                    </p>
                  )}

                  {metadata.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {metadata.map((metaEntry) => (
                        <span
                          key={metaEntry}
                          className={cn(
                            'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                            /saving found/i.test(metaEntry)
                              ? 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
                              : /^\$/.test(metaEntry)
                                ? 'border-slate-200 bg-white text-slate-800'
                                : 'border-slate-200/70 bg-slate-50 text-slate-600',
                          )}
                        >
                          {metaEntry}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {primaryAction && (
                <div className="shrink-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onItemAction(
                        primaryAction.entityType ?? item.entityType,
                        primaryAction.entityId ?? item.id,
                        primaryAction.message,
                        primaryAction.operationId,
                        primaryAction.interactionType,
                      )
                    }
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                      primaryAction.style === 'PRIMARY'
                        ? 'bg-teal-700 text-white shadow-2xs hover:bg-teal-800'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-900',
                    )}
                  >
                    <span>{primaryAction.label}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {hasFooter && (
        <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
          {block.actions.map((action) => (
            <ActionLink key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}

function resolveOpportunityRowVisual(
  sectionId: string,
  item: GroupedItem,
): { Icon: LucideIcon; iconBoxClass: string; statusLabel: string | null; statusClass: string } {
  const idLower = item.id.toLowerCase();
  const titleLower = item.title.toLowerCase();

  if (sectionId === 'related' || item.status === 'RELATED') {
    const Icon = idLower.includes('coverage') || titleLower.includes('coverage')
      ? ShieldCheck
      : idLower.includes('refinance') || titleLower.includes('refinance')
        ? TrendingDown
        : FileText;
    return {
      Icon,
      iconBoxClass: 'border-amber-200/80 bg-amber-50/90 text-amber-800',
      statusLabel: 'Related decision',
      statusClass: 'border-amber-200/90 bg-amber-50 text-amber-900',
    };
  }

  if (sectionId === 'realized' || item.status === 'REALIZED') {
    return {
      Icon: CheckCircle2,
      iconBoxClass: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
      statusLabel: 'Realized',
      statusClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (sectionId === 'in-progress') {
    return {
      Icon: Clock3,
      iconBoxClass: 'border-teal-200/80 bg-teal-50 text-teal-700',
      statusLabel: item.status ? item.status.replace(/_/g, ' ') : 'In progress',
      statusClass: 'border-teal-200 bg-teal-50 text-teal-800',
    };
  }

  if (sectionId === 'benefits') {
    return {
      Icon: Sparkles,
      iconBoxClass: 'border-teal-200/80 bg-teal-50 text-teal-700',
      statusLabel: item.status === 'DETECTED' ? 'Matched benefit' : item.status?.replace(/_/g, ' ') ?? null,
      statusClass: 'border-teal-200 bg-teal-50 text-teal-800',
    };
  }

  return {
    Icon: CircleDollarSign,
    iconBoxClass: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
    statusLabel: item.status === 'FOUND_SAVINGS' ? 'Saving found' : item.status?.replace(/_/g, ' ') ?? null,
    statusClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
}

/**
 * Conversational Savings & Benefits lifecycle panel (`savings-opportunity-groups`).
 * Renders recurring-cost opportunities, matched benefits/rebates, in-progress actions,
 * realized outcomes, and related savings decisions as a cohesive, scannable collection.
 */
export function SavingsOpportunityGroupsBlock({
  block,
  disabled,
  onItemAction,
}: {
  block: GroupedListBlockType;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const totalCount = block.sections.reduce((acc, section) => acc + section.count, 0);

  return (
    <section
      data-savings-opportunity-groups=""
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="flex flex-col gap-1.5 rounded-t-2xl border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/45 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Savings &amp; decisions</span>
          </p>
          <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">
            {block.title}
          </h3>
          {block.description && (
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">{block.description}</p>
          )}
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600 sm:mt-1">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {block.sections.map((section, sectionIdx) => {
          const isExpanded = Boolean(expandedSections[section.id]);
          const initialLimit = section.initialVisibleCount ?? section.items.length;
          const visibleItems = isExpanded ? section.items : section.items.slice(0, initialLimit);
          const hiddenCount = section.items.length - visibleItems.length;
          const isLastSection = sectionIdx === block.sections.length - 1;

          return (
            <div key={section.id} data-savings-section={section.id}>
              <div className="flex items-center justify-between gap-2 bg-slate-50/60 px-4 py-2 sm:px-5">
                <h4 className="text-xs font-bold uppercase tracking-[0.11em] text-slate-600">
                  {section.title}
                </h4>
                <span className="rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                  {section.count}
                </span>
              </div>

              <ul
                className={cn(
                  'divide-y divide-slate-100',
                  isLastSection && hiddenCount === 0 && '[&>li:last-child]:rounded-b-2xl',
                )}
                aria-label={section.title}
              >
                {visibleItems.map((item) => {
                  const visual = resolveOpportunityRowVisual(section.id, item);
                  const { Icon } = visual;
                  const actions = item.actions ?? [];
                  const primary =
                    actions.find((action) => action.style === 'PRIMARY') ??
                    actions.find((action) => action.style !== 'QUIET') ??
                    actions[0];
                  const secondary = actions.filter((action) => action !== primary);

                  const invoke = (action: (typeof actions)[number]) =>
                    onItemAction(
                      action.entityType ?? item.entityType,
                      action.entityId ?? item.id,
                      action.message,
                      action.operationId,
                      action.interactionType,
                    );

                  return (
                    <li
                      key={item.id}
                      data-ask-task-id={item.id}
                      className="group px-4 py-3.5 transition-colors hover:bg-slate-50/75 sm:px-5 sm:py-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                        <div className="flex min-w-0 flex-1 items-start gap-3.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-2xs',
                              visual.iconBoxClass,
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold leading-5 text-slate-950 sm:text-[15px]">
                                {item.title}
                              </p>
                              {visual.statusLabel && (
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                    visual.statusClass,
                                  )}
                                >
                                  {visual.statusLabel}
                                </span>
                              )}
                            </div>

                            {item.description && (
                              <p className="mt-1 text-xs font-medium leading-5 text-slate-700 sm:text-sm">
                                {item.description}
                              </p>
                            )}

                            {item.meta.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {item.meta.map((metaItem) => {
                                  const isEstimate = /\$|estimated\s+\$/i.test(metaItem);
                                  return (
                                    <span
                                      key={metaItem}
                                      className={cn(
                                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                                        isEstimate
                                          ? 'border-emerald-200/90 bg-emerald-50/90 font-bold tabular-nums text-emerald-900'
                                          : 'border-slate-200/80 bg-slate-50/80 text-slate-600',
                                      )}
                                    >
                                      {metaItem}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {actions.length > 0 && (
                          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-13.5 sm:pl-0 sm:justify-end">
                            {secondary.map((action) => (
                              <button
                                key={action.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => invoke(action)}
                                className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {action.label}
                              </button>
                            ))}
                            {primary && (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => invoke(primary)}
                                className={cn(
                                  'inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm',
                                  primary.style === 'PRIMARY'
                                    ? 'bg-teal-700 text-white shadow-2xs hover:bg-teal-800'
                                    : 'border border-teal-200 bg-teal-50/80 text-teal-900 hover:border-teal-300 hover:bg-teal-100/80',
                                )}
                              >
                                <span>{primary.label}</span>
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {hiddenCount > 0 && (
                <div
                  className={cn(
                    'flex justify-center border-t border-slate-100 bg-slate-50/50 px-4 py-2.5',
                    isLastSection && 'rounded-b-2xl',
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSections((current) => ({ ...current, [section.id]: true }))
                    }
                    className="min-h-8 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-teal-800 hover:bg-slate-50"
                  >
                    Show {hiddenCount} more
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
