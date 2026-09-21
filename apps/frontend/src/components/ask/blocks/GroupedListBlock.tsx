'use client';

import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { formatLegacyAskMaintenanceItem } from '@/features/ask/presentationCompatibility';
import { resolveGroupedListView, type GroupedListPresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';
import { DocumentResultList } from '../DocumentResultList';
import { HomeEventResultList } from '../HomeEventResultList';
import { HouseholdResultList } from '../HouseholdResultList';
import { InventoryResultList } from '../InventoryResultList';
import { MaintenanceResultList } from '../MaintenanceResultList';
import { RoomResultList } from '../RoomResultList';
import { WarrantyResultList } from '../WarrantyResultList';
import { ActionLink, AskContextLink } from './context';
import type { AskBlockRenderer } from './types';

// B07 fix: exported (previously module-private, as part of AskWorkspace's
// own BlockView) so the generic GROUPED_LIST renderer's selection
// marker/highlight can be tested directly, same convention as
// MaintenanceResultList's own export.
export function GenericGroupedListBlock({ block, executionId, propertyId, onItemAction, itemActionsDisabled, onFilterClick }: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]) {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.groupedListModes[block.id] ?? 'AUTO';
  const decision = resolveGroupedListView(block, preference);
  const presentation = decision.mode;
  const setPreference = (mode: GroupedListPresentationPreference) => controls?.change((view) => ({
    ...view, groupedListModes: { ...view.groupedListModes, [block.id]: mode },
  }));
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-grouped-list-presentation={presentation.toLowerCase()}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
        {decision.offersChoice && controls && <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label={`View ${block.title}`}>
          {(['AUTO', 'LIST', 'CARDS'] as const).map((mode) => <button key={mode} type="button" aria-pressed={preference === mode} onClick={() => setPreference(mode)} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', preference === mode ? 'bg-teal-700 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50')}>{mode === 'AUTO' ? 'Auto' : mode === 'LIST' ? 'List' : 'Cards'}</button>)}
        </div>}
        {block.filters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
            {block.filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={filter.active}
                disabled={itemActionsDisabled || filter.active}
                onClick={() => onFilterClick(filter.message)}
                className={cn(
                  'min-h-8 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-default',
                  filter.active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {block.sections.map((section) => (
          <div key={section.id} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">{section.title}</h4>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{section.count}</span>
            </div>
            {section.items.length === 0 ? <p className="text-sm text-slate-500">None recorded.</p> : (
              <ul className={presentation === 'COMPACT_LIST' ? 'space-y-1' : 'space-y-3'}>
                {section.items.map((sourceItem) => {
                  const item = block.id === 'maintenance-groups' ? formatLegacyAskMaintenanceItem(sourceItem) : sourceItem;
                  const selected = controls?.view.selectedTaskId === item.id;
                  return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border outline-offset-2', presentation === 'COMPACT_LIST' ? 'px-3 py-2' : 'p-3', selected ? 'border-teal-600 bg-teal-50' : presentation === 'COMPACT_LIST' ? 'border-transparent bg-white' : 'border-transparent bg-slate-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {item.href ? <AskContextLink className="font-medium text-slate-950 hover:text-teal-700" href={item.href}>{item.title}</AskContextLink> : <p className="font-medium text-slate-950">{item.title}</p>}
                        {item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}
                        {item.meta.length > 0 && <p className="mt-2 text-xs text-slate-500">{item.meta.join(' · ')}</p>}
                      </div>
                      {item.status && <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.status.replace(/_/g, ' ')}</span>}
                    </div>
                    {item.actions && item.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.actions.map((itemAction) => (
                          <button
                            key={itemAction.id}
                            type="button"
                            disabled={itemActionsDisabled}
                            onClick={() => onItemAction(item.entityType, item.id, itemAction.message, itemAction.operationId, itemAction.interactionType)}
                            className={cn(
                              'min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                              itemAction.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            {itemAction.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>;
                })}
              </ul>
            )}
            {section.count > section.items.length && (
              block.actions[0]?.href
                ? <AskContextLink href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{section.count - section.items.length} more · {block.actions[0].label}</AskContextLink>
                : <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more not shown here.</p>
            )}
          </div>
        ))}
      </div>
      {block.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          {block.actions.map((action) => <ActionLink key={action.id} action={action} />)}
        </div>
      )}
    </section>
  );
}

// Six bespoke rendering exceptions in the whole registry: a
// `GROUPED_LIST` block with id `maintenance-groups`; Inventory's
// item-detail-eligible ids (`inventory-results`, the primary result;
// `inventory-entity-selection`, the disambiguation list; and
// `property-inventory`, PROPERTY_SUMMARY's own bounded collection -- all
// three list the same INVENTORY_ITEM entity shape, so all three open the
// same inline detail); one of the HomeEvent detail blocks (`inventory-history`,
// events linked to an inventory item, or `property-recent-events`, events
// surfaced by PROPERTY_SUMMARY -- a different entity type, so its own
// component); `property-rooms` (canonical InventoryRoom records from
// PROPERTY_SUMMARY); `document-lookup-groups` / `property-documents`
// (canonical documents surfaced by DOCUMENT_LOOKUP or PROPERTY_SUMMARY);
// `property-household` (canonical HouseholdMember records from
// PROPERTY_SUMMARY); or `property-warranties` (canonical Warranty records
// from PROPERTY_SUMMARY). All are still registered under the single
// `GROUPED_LIST` type (see ./registry.tsx) -- the split is by block id,
// not a second block type.
const INVENTORY_ITEM_DETAIL_BLOCK_IDS = new Set(['inventory-results', 'inventory-entity-selection', 'property-inventory']);
const HOME_EVENT_DETAIL_BLOCK_IDS = new Set(['inventory-history', 'property-recent-events']);

export const GroupedListBlock: AskBlockRenderer<'GROUPED_LIST'> = (props) => {
  const { block, propertyId, itemActionsDisabled, onFilterClick, onCollectionPage, onItemAction, onAccessLost } = props;
  if (block.id === 'maintenance-groups') {
    return <MaintenanceResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onPage={onCollectionPage} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (INVENTORY_ITEM_DETAIL_BLOCK_IDS.has(block.id)) {
    return <InventoryResultList block={block} propertyId={propertyId} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (HOME_EVENT_DETAIL_BLOCK_IDS.has(block.id)) {
    return <HomeEventResultList block={block} propertyId={propertyId} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-rooms') {
    return <RoomResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'document-lookup-groups' || block.id === 'property-documents') {
    return <DocumentResultList block={block} propertyId={propertyId} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-household') {
    return <HouseholdResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-warranties') {
    return <WarrantyResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  return <GenericGroupedListBlock {...props} />;
};
