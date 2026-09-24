'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskDisplayTone, AskGroupedListFilter, AskGroupedListItem, AskGroupedListItemAction } from '@/features/ask/types';
import { ActionLink, AskContextLink } from '../blocks/context';
import type { AskBlockRendererProps } from '../blocks/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.72): pieces shared by the display patterns, so every pattern sends
// item actions, opens details and shows filters the same way the grouped list does.

export type ItemActionHandler = AskBlockRendererProps['onItemAction'];

export const TONE_STRIPE: Record<AskDisplayTone, string> = {
  DEFAULT: 'bg-slate-300',
  POSITIVE: 'bg-emerald-500',
  CAUTION: 'bg-amber-500',
  CRITICAL: 'bg-red-600',
};

export const TONE_CHIP: Record<AskDisplayTone, string> = {
  DEFAULT: 'bg-slate-100 text-slate-700',
  POSITIVE: 'bg-emerald-50 text-emerald-800',
  CAUTION: 'bg-amber-50 text-amber-900',
  CRITICAL: 'bg-red-50 text-red-800',
};

export function ItemActionButtons({ item, actions, onItemAction, disabled, onDispatched, className }: {
  item: { id: string; entityType?: string | null };
  actions: AskGroupedListItemAction[] | undefined;
  onItemAction: ItemActionHandler;
  disabled: boolean;
  onDispatched?: (action: AskGroupedListItemAction) => void;
  className?: string;
}) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => {
            onItemAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
            onDispatched?.(action);
          }}
          className={cn(
            'min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
            action.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/**
 * IW-PRES-005 / IW-PRES-014: an item's detail opens in place, as a right-hand drawer on wide screens and a bottom
 * sheet on narrow ones. It never navigates away; a record link, when the server declared one, stays a secondary
 * choice at the bottom.
 */
export function ItemDetailSheet({ item, open, onOpenChange, onItemAction, disabled, children }: {
  item: AskGroupedListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemAction: ItemActionHandler;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog.Root open={open && Boolean(item)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/30" />
        <Dialog.Content
          data-ask-item-detail-sheet=""
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl"
        >
          {item && <>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-slate-950">{item.title}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                  {[item.timingLabel, item.status?.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ') || 'Details'}
                </Dialog.Description>
              </div>
              <Dialog.Close className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close details"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
              {children ?? <>
                {item.description && <p className="leading-6 text-slate-700">{item.description}</p>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {item.timingLabel && <><dt className="text-slate-500">When</dt><dd className="text-right font-medium text-slate-900">{item.timingLabel}</dd></>}
                  {item.amountLabel && <><dt className="text-slate-500">Cost</dt><dd className="text-right font-medium text-slate-900">{item.amountLabel}</dd></>}
                  {item.countLabel && <><dt className="text-slate-500">Contains</dt><dd className="text-right font-medium text-slate-900">{item.countLabel}</dd></>}
                  {item.badgeLabel && <><dt className="text-slate-500">Open</dt><dd className="text-right font-medium text-slate-900">{item.badgeLabel}</dd></>}
                </dl>
                {item.meta.length > 0 && <p className="text-xs text-slate-500">{item.meta.join(' · ')}</p>}
              </>}
            </div>
            {((item.actions?.length ?? 0) > 0 || item.href) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
                <ItemActionButtons item={item} actions={item.actions} onItemAction={onItemAction} disabled={disabled} onDispatched={() => onOpenChange(false)} />
                {item.href && <AskContextLink href={item.href} className="ml-auto text-xs font-semibold text-teal-700 hover:underline">Open record</AskContextLink>}
              </div>
            )}
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The heading, List switch, filters and block actions every patterned grouped list shares with the plain list. */
export function PatternFrame({ title, description, patternLabel, onChooseList, filters, onFilterClick, disabled, actions, pattern, children }: {
  title: string;
  description?: string | null;
  patternLabel: string;
  onChooseList?: () => void;
  filters: AskGroupedListFilter[];
  onFilterClick: (message: string) => void;
  disabled: boolean;
  actions: AskAction[];
  pattern: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white" data-display-pattern={pattern}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-950">{title}</h3>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {onChooseList && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${title}`}>
            <button type="button" aria-pressed="true" className="min-h-8 rounded-lg bg-white px-2.5 text-xs font-semibold text-teal-800 shadow-sm">{patternLabel}</button>
            <button type="button" aria-pressed="false" onClick={onChooseList} className="min-h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-white">List</button>
          </div>
        )}
        {filters.length > 0 && (
          <div className="flex w-full flex-wrap gap-2" role="group" aria-label="Filter">
            {filters.map((filter) => (
              <button key={filter.id} type="button" aria-pressed={filter.active} disabled={disabled || filter.active} onClick={() => onFilterClick(filter.message)}
                className={cn('min-h-8 rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-default', filter.active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 disabled:opacity-50')}>
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          {actions.map((action) => <ActionLink key={action.id} action={action} />)}
        </div>
      )}
    </section>
  );
}
