'use client';

import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Compass,
  Hammer,
  Home,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  ShieldCheck,
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

const MISSING_CATEGORY_HINTS: Record<string, string> = {
  PROPERTY_TAX: 'Add your latest property tax bill or assessment to include annual taxes.',
  INSURANCE: 'Link your homeowners policy or annual premium to include coverage costs.',
  HOA: 'Record your monthly or quarterly HOA fee, or confirm no HOA applies.',
  UTILITIES: 'Add recent electric, gas, water, or internet bills to track utility spend.',
  RECURRING_SERVICES: 'Track regular lawn, pest, pool, or cleaning service plans.',
  ROUTINE_MAINTENANCE: 'Complete or schedule maintenance tasks to include routine upkeep costs.',
  FINANCING: 'Add your mortgage rate and monthly payment to include financing costs.',
  KNOWN_REPAIRS: 'Review or log repair estimates to include upcoming repair costs.',
  CAPITAL_PROJECTS: 'Review planned home projects or upgrades to include capital spend.',
  RESERVE_CONTRIBUTIONS: 'Set up a monthly capital reserve plan to track reserve contributions.',
};

const MISSING_TITLE_HINTS: Record<string, string> = {
  'Property tax': MISSING_CATEGORY_HINTS.PROPERTY_TAX,
  'Home insurance': MISSING_CATEGORY_HINTS.INSURANCE,
  'HOA dues': MISSING_CATEGORY_HINTS.HOA,
  Utilities: MISSING_CATEGORY_HINTS.UTILITIES,
  'Recurring home services': MISSING_CATEGORY_HINTS.RECURRING_SERVICES,
  'Routine maintenance': MISSING_CATEGORY_HINTS.ROUTINE_MAINTENANCE,
  Financing: MISSING_CATEGORY_HINTS.FINANCING,
  'Known major repairs': MISSING_CATEGORY_HINTS.KNOWN_REPAIRS,
  'Capital projects': MISSING_CATEGORY_HINTS.CAPITAL_PROJECTS,
  'Capital reserve contributions': MISSING_CATEGORY_HINTS.RESERVE_CONTRIBUTIONS,
};

export function resolveOwnershipCategoryIcon(keyOrTitle: string): LucideIcon {
  const upper = keyOrTitle.toUpperCase();
  const lower = keyOrTitle.toLowerCase();
  if (upper === 'PROPERTY_TAX' || lower.includes('tax')) return Landmark;
  if (upper === 'INSURANCE' || lower.includes('insurance') || lower.includes('coverage')) return ShieldCheck;
  if (upper === 'HOA' || lower.includes('hoa')) return Building2;
  if (upper === 'UTILITIES' || lower.includes('utilit') || lower.includes('electric') || lower.includes('gas') || lower.includes('water')) return Zap;
  if (upper === 'RECURRING_SERVICES' || lower.includes('recurring') || lower.includes('service')) return CalendarClock;
  if (upper === 'ROUTINE_MAINTENANCE' || lower.includes('maintenance') || lower.includes('repair')) return Wrench;
  if (upper === 'FINANCING' || lower.includes('financing') || lower.includes('mortgage')) return Home;
  if (upper === 'CAPITAL_PROJECTS' || lower.includes('capital') || lower.includes('project')) return Hammer;
  if (upper === 'RESERVE_CONTRIBUTIONS' || lower.includes('reserve')) return PiggyBank;
  return CircleDollarSign;
}

function resolveMissingCategoryDescription(item: GroupedItem): string {
  const raw = item.description?.trim() ?? '';
  if (!raw || /^No usable current amount is recorded\.?$/i.test(raw)) {
    return (
      MISSING_CATEGORY_HINTS[item.id] ??
      MISSING_TITLE_HINTS[item.title] ??
      'Add or review your current record to include this category in your ownership cost total.'
    );
  }
  return raw;
}

function formatMissingStatusLabel(status: string | null | undefined): string {
  if (!status || status === 'MISSING') return 'Missing';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (ch) => ch.toUpperCase());
}

/**
 * Conversational Coverage Gaps panel (`ownership-cost-missing`).
 * Modeled on `HomeRecordOverviewBlock` ("Browse my home record"): a framed 2-column divided grid
 * with domain icons, category-specific guidance, status badges, and compact action buttons.
 */
export function OwnershipCostMissingGrid({
  block,
  disabled,
  onItemAction,
}: {
  block: GroupedListBlockType;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const items = block.sections.flatMap((section) => section.items);
  const hasFooter = block.actions.length > 0;

  return (
    <section
      className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      data-ownership-cost-missing=""
      data-ownership-cost-list={block.id}
      aria-labelledby={`${block.id}-title`}
    >
      <div className="flex flex-col gap-2 border-b border-slate-200/80 bg-gradient-to-r from-amber-50/70 via-white to-teal-50/35 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>Coverage Gaps</span>
          </p>
          <h3 id={`${block.id}-title`} className="mt-0.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">
            {block.title}
          </h3>
          {block.description && (
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-600">{block.description}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:mt-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50/90 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-900">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            {items.length} {items.length === 1 ? 'category' : 'categories'} missing
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-4 text-xs text-slate-600">
          All applicable categories in this lens have usable records.
        </div>
      ) : (
        <ul
          className={cn(
            'grid grid-cols-1 divide-y divide-slate-100',
            items.length > 1 && 'md:grid-cols-2 md:divide-y-0',
          )}
          aria-label={block.title}
        >
          {items.map((item, index) => {
            const Icon = resolveOwnershipCategoryIcon(item.id || item.title);
            const statusLabel = formatMissingStatusLabel(item.status);
            const isStale = /stale/i.test(item.status ?? '');
            const description = resolveMissingCategoryDescription(item);
            const actions = item.actions ?? [];

            return (
              <li
                key={item.id}
                data-ask-task-id={item.id}
                className={cn(
                  'group relative flex flex-col justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-5',
                  items.length > 1 && 'md:border-b md:border-slate-100 md:[&:nth-child(odd)]:border-r',
                  items.length > 1 &&
                    index >= items.length - (items.length % 2 || 2) &&
                    'md:border-b-0',
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border shadow-2xs transition-colors',
                      isStale
                        ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                        : 'border-slate-200/90 bg-slate-50/80 text-slate-600 group-hover:border-teal-200 group-hover:bg-teal-50/60 group-hover:text-teal-800',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          isStale
                            ? 'border-rose-200 bg-rose-50 text-rose-800'
                            : 'border-amber-200/85 bg-amber-50/80 text-amber-900',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn('h-1.5 w-1.5 rounded-full', isStale ? 'bg-rose-500' : 'bg-amber-500')}
                        />
                        {statusLabel}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
                  </div>
                </div>

                {actions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pl-12">
                    {actions.map((action) => {
                      const isPrimary = action.style === 'PRIMARY';
                      const isAddAction = /^add\b/i.test(action.label);
                      return (
                        <button
                          key={action.id}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            onItemAction(
                              action.entityType ?? item.entityType,
                              action.entityId ?? item.id,
                              action.message,
                              action.operationId,
                              action.interactionType,
                            )
                          }
                          className={cn(
                            'inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                            isPrimary
                              ? 'bg-teal-700 text-white shadow-2xs hover:bg-teal-800'
                              : 'border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-900',
                          )}
                        >
                          {isAddAction && !isPrimary && (
                            <Plus className="h-3 w-3 text-teal-700" aria-hidden="true" />
                          )}
                          <span>{action.label}</span>
                          {isPrimary && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasFooter && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
          {block.actions.map((action) => (
            <ActionLink key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Conversational Recorded Expenses panel (`ownership-cost-expenses`).
 * Eliminates the duplicate `Add an expense` button and box-in-a-box empty state when 0 expenses
 * are recorded, and renders recorded expenses as scannable ledger rows with inline actions.
 */
export function OwnershipCostExpensesBlock({
  block,
  disabled,
  onItemAction,
}: {
  block: GroupedListBlockType;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const items = block.sections.flatMap((section) => section.items);

  if (items.length === 0) {
    return (
      <section
        className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-2xs sm:px-5"
        data-ownership-cost-expenses=""
        data-ownership-cost-list={block.id}
        aria-labelledby={`${block.id}-title`}
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-teal-200/80 bg-teal-50/70 text-teal-700 shadow-2xs"
            >
              <Receipt className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`${block.id}-title`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">
                  {block.title}
                </h3>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  0 recorded
                </span>
              </div>
              {block.description && (
                <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.description}</p>
              )}
            </div>
          </div>

          {block.actions.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
              {block.actions.map((action) => (
                <ActionLink key={action.id} action={action} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
      data-ownership-cost-expenses=""
      data-ownership-cost-list={block.id}
      aria-labelledby={`${block.id}-title`}
    >
      <div className="flex flex-col justify-between gap-2.5 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/35 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${block.id}-title`} className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">
              {block.title}
            </h3>
            <span className="rounded-full border border-teal-200/80 bg-teal-50/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800">
              {items.length} {items.length === 1 ? 'expense' : 'expenses'}
            </span>
          </div>
          {block.description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.description}</p>
          )}
        </div>

        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>

      <ul className="divide-y divide-slate-100" aria-label={block.title}>
        {items.map((item) => {
          const categoryMeta = item.meta[0] ?? 'Expense';
          const metaAmount = item.meta.slice(1).find((m) => /^\$[0-9,]+(?:\.[0-9]{2})?$/.test(m.trim())) ?? null;
          const otherMeta = item.meta.slice(1).filter((m) => m !== metaAmount);
          const Icon = resolveOwnershipCategoryIcon(categoryMeta || item.title);
          const descAmountMatch = /^\s*(\$[0-9,]+(?:\.[0-9]{2})?)\s*(?:·\s*(.*))?$/.exec(item.description ?? '');
          const amountLabel = metaAmount ?? (descAmountMatch ? descAmountMatch[1] : null);
          const vendorOrNote = descAmountMatch?.[2]?.trim() || (!descAmountMatch ? item.description : null);
          const actions = item.actions ?? [];

          return (
            <li
              key={item.id}
              data-ask-task-id={item.id}
              className="flex flex-col justify-between gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:px-5"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600"
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    {categoryMeta && (
                      <span className="rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {categoryMeta}
                      </span>
                    )}
                    {otherMeta.map((metaEntry) => (
                      <span key={metaEntry} className="text-xs tabular-nums text-slate-500">
                        {metaEntry}
                      </span>
                    ))}
                  </div>
                  {vendorOrNote && (
                    <p className="mt-0.5 text-xs text-slate-600">{vendorOrNote}</p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 pl-11 sm:justify-end sm:pl-0">
                {amountLabel && (
                  <span className="text-sm font-extrabold tabular-nums text-slate-950">
                    {amountLabel}
                  </span>
                )}
                {actions.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onItemAction(
                            action.entityType ?? item.entityType,
                            action.entityId ?? item.id,
                            action.message,
                            action.operationId,
                            action.interactionType,
                          )
                        }
                        className={cn(
                          'min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                          action.style === 'PRIMARY'
                            ? 'bg-teal-700 text-white hover:bg-teal-800'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-slate-50',
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Compact segmented lens switcher (`ownership-cost-views`).
 */
export function OwnershipCostViewsBar({
  block,
  disabled,
  onItemAction,
}: {
  block: GroupedListBlockType;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const views = block.sections.flatMap((section) => section.items);
  return (
    <nav
      className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4"
      aria-label={block.title}
      data-ownership-cost-views=""
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
        <Compass className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
        <span>Explore ownership costs</span>
      </div>
      <ul className="flex flex-wrap items-center gap-1.5">
        {views.map((item) => {
          const current = item.status === 'CURRENT';
          const primaryAction = item.actions?.[0];
          return (
            <li key={item.id} data-ask-task-id={item.id} className="flex">
              {current ? (
                <span
                  aria-current="page"
                  className="inline-flex min-h-8 items-center rounded-xl bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-2xs"
                >
                  {item.title}
                </span>
              ) : primaryAction ? (
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
                  className="inline-flex min-h-8 items-center rounded-xl border border-slate-200/90 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50/60 hover:text-teal-900 disabled:opacity-50"
                >
                  {item.title}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
