'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bookmark,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Compass,
  FileText,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { AskBlockRenderer } from './blocks/types';

type SavedBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type SavedItem = SavedBlock['sections'][number]['items'][number];

const INITIAL_VISIBLE_ROWS = 8;

type FreshnessTone = 'CURRENT' | 'STALE' | 'EXPIRED' | 'SUPERSEDED';

function resolveFreshnessTone(item: SavedItem): {
  tone: FreshnessTone;
  label: string;
  badgeClass: string;
  dotClass: string;
  iconBoxClass: string;
  rowAccentClass: string;
} {
  const raw = (item.status ?? item.meta[0] ?? 'Current').trim();
  if (/out of date|stale/i.test(raw)) {
    return {
      tone: 'STALE',
      label: 'Out of date',
      badgeClass: 'border-amber-200/90 bg-amber-50 text-amber-900',
      dotClass: 'bg-amber-500',
      iconBoxClass: 'border-amber-200/80 bg-amber-50/90 text-amber-800',
      rowAccentClass: 'border-l-4 border-l-amber-400 bg-amber-50/15',
    };
  }
  if (/expired/i.test(raw)) {
    return {
      tone: 'EXPIRED',
      label: 'Expired',
      badgeClass: 'border-rose-200/90 bg-rose-50 text-rose-800',
      dotClass: 'bg-rose-500',
      iconBoxClass: 'border-rose-200/80 bg-rose-50/90 text-rose-700',
      rowAccentClass: 'border-l-4 border-l-rose-400 bg-rose-50/15',
    };
  }
  if (/replaced|superseded/i.test(raw)) {
    return {
      tone: 'SUPERSEDED',
      label: 'Replaced',
      badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
      dotClass: 'bg-slate-400',
      iconBoxClass: 'border-slate-200 bg-slate-100 text-slate-600',
      rowAccentClass: 'border-l-4 border-l-slate-300 bg-slate-50/35',
    };
  }
  return {
    tone: 'CURRENT',
    label: 'Current',
    badgeClass: 'border-emerald-200/90 bg-emerald-50 text-emerald-800',
    dotClass: 'bg-emerald-500',
    iconBoxClass: 'border-teal-100 bg-teal-50/80 text-teal-700',
    rowAccentClass: '',
  };
}

function resolveArtifactVisual(item: SavedItem): { Icon: LucideIcon; categoryLabel: string } {
  const entity = (item.entityType ?? '').toUpperCase();
  const title = item.title.toLowerCase();

  if (entity.includes('SEASONAL') || /seasonal|winter|spring|summer|fall|checklist/i.test(title)) {
    return { Icon: CalendarCheck2, categoryLabel: 'Seasonal checklist' };
  }
  if (entity.includes('QUOTE_COMPARISON') || /quote/i.test(title)) {
    return { Icon: CircleDollarSign, categoryLabel: 'Quote comparison' };
  }
  if (entity.includes('COVERAGE') || /coverage/i.test(title)) {
    return { Icon: ShieldCheck, categoryLabel: 'Coverage comparison' };
  }
  if (entity.includes('PROPERTY_BRIEF') || /brief/i.test(title)) {
    return { Icon: BookOpen, categoryLabel: 'Property brief' };
  }
  if (entity.includes('FINANCING') || entity.includes('REFINANCE') || /financing|refinance|loan/i.test(title)) {
    return { Icon: CircleDollarSign, categoryLabel: 'Financing scenario' };
  }
  if (
    entity.includes('SELL_HOLD_RENT') ||
    entity.includes('CAPITAL') ||
    /sell, hold or rent|capital timeline/i.test(title)
  ) {
    return { Icon: TrendingUp, categoryLabel: 'Financial analysis' };
  }
  if (entity.includes('DECISION') || entity.includes('REPLACE_REPAIR') || /replace or repair|decision/i.test(title)) {
    return { Icon: Compass, categoryLabel: 'Decision analysis' };
  }
  return { Icon: FileText, categoryLabel: 'Saved report' };
}

function parseSavedMetadata(item: SavedItem) {
  const freshnessMeta = item.meta[0] ?? null;
  const factsAsOf = item.meta.find((entry) => /^Facts as of\s+/i.test(entry)) ?? null;
  const isSensitive = item.meta.some((entry) => /^Sensitive$/i.test(entry));
  const reopenNote =
    item.meta.find((entry) =>
      /cannot reopen|cannot continue|recomputes|state is shown here|owner keeps/i.test(entry),
    ) ?? null;

  const remaining = item.meta.filter(
    (entry, idx) =>
      idx !== 0 &&
      entry !== factsAsOf &&
      !/^Sensitive$/i.test(entry) &&
      entry !== reopenNote,
  );

  const versionLabel = remaining[0] ?? null;
  const freshnessReason = remaining.slice(1).join(' · ') || null;

  const taskMatch = item.description
    ? /^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i.exec(item.description.trim())
    : null;
  const taskProgress = taskMatch
    ? {
        completed: Number(taskMatch[1]),
        total: Number(taskMatch[2]),
        pct:
          Number(taskMatch[2]) > 0
            ? Math.min(100, Math.round((Number(taskMatch[1]) / Number(taskMatch[2])) * 100))
            : 0,
      }
    : null;

  return {
    freshnessMeta,
    versionLabel,
    factsAsOf,
    isSensitive,
    reopenNote,
    freshnessReason,
    taskProgress,
  };
}

function SavedArtifactRow({
  item,
  disabled,
  onItemAction,
}: {
  item: SavedItem;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const freshness = resolveFreshnessTone(item);
  const { Icon, categoryLabel } = resolveArtifactVisual(item);
  const { versionLabel, factsAsOf, isSensitive, reopenNote, freshnessReason, taskProgress } =
    parseSavedMetadata(item);

  const actions = item.actions ?? [];
  const primary = actions.find((action) => action.style === 'PRIMARY');
  const secondary = actions.filter((action) => action !== primary);

  const invoke = (action: (typeof actions)[number]) =>
    onItemAction(
      action.entityType ?? item.entityType,
      action.entityId ?? item.id,
      action.message,
      action.operationId,
      action.interactionType,
    );

  const versionRedundantInTitle =
    versionLabel !== null && item.title.toLowerCase().includes(versionLabel.toLowerCase());

  return (
    <li
      data-saved-result-row={item.id}
      data-ask-task-id={item.id}
      className={cn(
        'group px-4 py-3.5 transition-colors hover:bg-slate-50/75 sm:px-5 sm:py-4',
        freshness.rowAccentClass,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-2xs',
              freshness.iconBoxClass,
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold leading-5 text-slate-950 sm:text-[15px]">
                {item.title}
              </p>
              <span
                data-saved-freshness={freshness.tone.toLowerCase()}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight',
                  freshness.badgeClass,
                )}
              >
                <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', freshness.dotClass)} />
                {freshness.label}
              </span>
              <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {categoryLabel}
              </span>
              {isSensitive && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                  Sensitive
                </span>
              )}
            </div>

            {item.description && (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <p className="text-xs font-medium leading-5 text-slate-700 sm:text-sm">
                  {item.description}
                </p>
                {taskProgress && (
                  <div
                    aria-hidden="true"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5"
                  >
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          taskProgress.pct === 100
                            ? 'bg-emerald-500'
                            : taskProgress.pct > 0
                              ? 'bg-teal-600'
                              : 'bg-slate-300',
                        )}
                        style={{ width: `${Math.max(taskProgress.pct, taskProgress.completed > 0 ? 12 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                      {taskProgress.pct}%
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {versionLabel && !versionRedundantInTitle && (
                <span className="font-medium text-slate-600">{versionLabel}</span>
              )}
              {versionLabel && versionRedundantInTitle && (
                <span className="sr-only">{versionLabel}</span>
              )}
              {factsAsOf && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Clock3 className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  {factsAsOf}
                </span>
              )}
              {freshnessReason && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    freshness.tone === 'STALE' || freshness.tone === 'EXPIRED'
                      ? 'text-amber-800'
                      : 'text-slate-600',
                  )}
                >
                  {freshnessReason}
                </span>
              )}
            </div>

            {reopenNote && (
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{reopenNote}</p>
            )}
          </div>
        </div>

        {actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-13.5 sm:pl-0 sm:justify-end">
            {secondary.map((action) => {
              const isRestore = /restore/i.test(action.label);
              const ActionIcon = isRestore ? ArchiveRestore : Archive;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => invoke(action)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ActionIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {action.label}
                </button>
              );
            })}
            {primary && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => invoke(primary)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-teal-800 disabled:opacity-50 sm:text-sm"
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
}

/**
 * Conversational Saved Results artifact (`saved-results-list`).
 * Follows the same compact collection norms as `HomeRecordOverviewBlock` ("Browse my home record")
 * and `WorkOverviewResultList` ("What needs me?"): structured freshness tabs, compact type selector,
 * scannable artifact rows with domain icons, inline checklist progress, and right-aligned actions.
 */
export const SavedResultsListBlock: AskBlockRenderer<'GROUPED_LIST'> = ({
  block,
  itemActionsDisabled,
  onFilterClick,
  onItemAction,
}) => {
  const [showAllFetched, setShowAllFetched] = useState(false);
  const section = block.sections[0] ?? { id: 'saved', title: 'Saved results', count: 0, items: [] };

  const freshnessFilters = block.filters.filter((filter) => filter.id.startsWith('fresh-'));
  const typeFilters = block.filters.filter((filter) => filter.id.startsWith('type-'));
  const archiveFilter = block.filters.find(
    (filter) => filter.id === 'show-archived' || filter.id === 'show-active',
  );
  const clearSearchFilter = block.filters.find((filter) => filter.id === 'clear-search');
  const clearFilter = block.filters.find((filter) => filter.id === 'clear-all');
  const moreFilter = block.filters.find((filter) => filter.id === 'show-more');

  const activeType = typeFilters.find((filter) => filter.active);
  const activeFreshness = freshnessFilters.find((filter) => filter.active);
  const isArchivedView = block.title === 'Archived' || archiveFilter?.id === 'show-active';

  const visibleItems = showAllFetched
    ? section.items
    : section.items.slice(0, INITIAL_VISIBLE_ROWS);
  const locallyHidden = section.items.length - visibleItems.length;

  const currentCount = section.items.filter(
    (item) => resolveFreshnessTone(item).tone === 'CURRENT',
  ).length;
  const attentionCount = section.items.length - currentCount;
  const hasFooter = locallyHidden > 0 || Boolean(moreFilter);

  const freshnessDotTone = (id: string) => {
    if (id === 'fresh-current') return 'bg-emerald-500';
    if (id === 'fresh-stale') return 'bg-amber-500';
    if (id === 'fresh-expired') return 'bg-rose-500';
    return 'bg-slate-400';
  };

  return (
    <section
      data-saved-results-list=""
      aria-labelledby={`${block.id}-title`}
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="rounded-t-2xl border-b border-slate-200/80 bg-gradient-to-r from-teal-50/70 via-white to-slate-50/70 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isArchivedView ? 'Saved · Archive' : 'Saved library'}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 id={`${block.id}-title`} className="text-lg font-bold tracking-tight text-slate-950">
                {section.title}
              </h3>
              <span className="inline-flex items-center rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                {section.count} {section.count === 1 ? 'result' : 'results'}
              </span>
              {section.items.length > 0 && currentCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-800">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                  {currentCount} current
                </span>
              )}
              {section.items.length > 0 && attentionCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-900">
                  <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden="true" />
                  {attentionCount} {attentionCount === 1 ? 'needs review' : 'need review'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {typeFilters.length > 0 && (
              <details className="group relative" data-saved-type-filter="">
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-teal-300 hover:text-teal-900 [&::-webkit-details-marker]:hidden sm:text-sm">
                  <Layers3 className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                  <span>{activeType?.label ?? 'All result types'}</span>
                  <ChevronDown
                    className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {typeFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={filter.active}
                      disabled={itemActionsDisabled || filter.active}
                      onClick={() => onFilterClick(filter.message)}
                      className={cn(
                        'block min-h-9 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors sm:text-sm',
                        filter.active
                          ? 'bg-teal-50 text-teal-900'
                          : 'text-slate-700 hover:bg-slate-50',
                        'disabled:cursor-default',
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                  {clearFilter && (
                    <button
                      type="button"
                      disabled={itemActionsDisabled}
                      onClick={() => onFilterClick(clearFilter.message)}
                      className="mt-1 block min-h-9 w-full border-t border-slate-100 px-3 pt-2 text-left text-xs font-semibold text-teal-800 hover:bg-teal-50/50 disabled:opacity-50 sm:text-sm"
                    >
                      Reset saved filters
                    </button>
                  )}
                </div>
              </details>
            )}

            {archiveFilter && (
              <button
                type="button"
                disabled={itemActionsDisabled}
                onClick={() => onFilterClick(archiveFilter.message)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 sm:text-sm',
                  isArchivedView
                    ? 'border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100/70'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                {isArchivedView ? (
                  <ArchiveRestore className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                ) : (
                  <Archive className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                )}
                <span>{archiveFilter.label}</span>
              </button>
            )}
          </div>
        </div>

        {(freshnessFilters.length > 0 || clearSearchFilter || clearFilter) && (
          <div
            className="mt-3.5 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Saved result filters"
          >
            {freshnessFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={filter.active}
                disabled={itemActionsDisabled || filter.active}
                onClick={() => onFilterClick(filter.message)}
                className={cn(
                  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-default',
                  filter.active
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'border border-slate-200/80 bg-white/90 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-950',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    filter.active ? 'bg-teal-300' : freshnessDotTone(filter.id),
                  )}
                />
                <span>{filter.label}</span>
              </button>
            ))}

            {clearSearchFilter && (
              <button
                type="button"
                disabled={itemActionsDisabled}
                onClick={() => onFilterClick(clearSearchFilter.message)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100/80 disabled:opacity-50"
              >
                <Search className="h-3 w-3 text-teal-700" aria-hidden="true" />
                <span>{clearSearchFilter.label}</span>
                <X className="h-3 w-3 text-teal-700" aria-hidden="true" />
              </button>
            )}

            {clearFilter && (activeFreshness || activeType || clearSearchFilter) && (
              <button
                type="button"
                disabled={itemActionsDisabled}
                onClick={() => onFilterClick(clearFilter.message)}
                className="ml-auto inline-flex min-h-8 items-center rounded-lg px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 hover:underline disabled:opacity-50"
              >
                {clearFilter.label}
              </button>
            )}
          </div>
        )}
      </div>

      {section.items.length === 0 ? (
        <div className={cn('px-5 py-8 text-center', !hasFooter && 'rounded-b-2xl')}>
          <p className="font-semibold text-slate-900">
            {isArchivedView ? 'No archived results in this view' : 'No saved results match this view'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {clearFilter || clearSearchFilter
              ? 'Clear your active filters to see all saved results for this home.'
              : 'Reports, comparisons, decisions, and seasonal checklists you keep will appear here.'}
          </p>
          {(clearFilter || clearSearchFilter) && (
            <div className="mt-3 flex justify-center gap-2">
              {clearFilter && (
                <button
                  type="button"
                  disabled={itemActionsDisabled}
                  onClick={() => onFilterClick(clearFilter.message)}
                  className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {clearFilter.label}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <ul
          className={cn('divide-y divide-slate-100', !hasFooter && ' [&>li:last-child]:rounded-b-2xl')}
          aria-label={section.title}
        >
          {visibleItems.map((item) => (
            <SavedArtifactRow
              key={item.id}
              item={item}
              disabled={itemActionsDisabled}
              onItemAction={onItemAction}
            />
          ))}
        </ul>
      )}

      {hasFooter && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/55 px-4 py-3">
          {locallyHidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAllFetched(true)}
              className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-900 sm:text-sm"
            >
              Show {locallyHidden} more
            </button>
          )}
          {locallyHidden === 0 && moreFilter && (
            <button
              type="button"
              disabled={itemActionsDisabled}
              onClick={() => onFilterClick(moreFilter.message)}
              className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50/50 disabled:opacity-50 sm:text-sm"
            >
              Show more saved results
            </button>
          )}
        </div>
      )}
    </section>
  );
};
