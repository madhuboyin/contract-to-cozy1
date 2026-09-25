'use client';

import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { formatLegacyAskMaintenanceItem } from '@/features/ask/presentationCompatibility';
import { resolveGroupedListView, type GroupedListPresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';
import { groupedListItems, PATTERN_LABELS, resolveGroupedListPattern } from '@/features/ask/displayPatterns';
import { CardDeckView } from '../patterns/CardDeckView';
import { PatternFrame } from '../patterns/PatternParts';
import { RoomMapView } from '../patterns/RoomMapView';
import { ShelvesView } from '../patterns/ShelvesView';
import { DocumentResultList } from '../DocumentResultList';
import { HomeEventResultList } from '../HomeEventResultList';
import { HouseholdResultList } from '../HouseholdResultList';
import { InventoryResultList } from '../InventoryResultList';
import { MaintenanceResultList } from '../MaintenanceResultList';
import { ClaimResultList } from '../ClaimResultList';
import { InspectionFindingResultList } from '../InspectionFindingResultList';
import { SellerPrepItemResultList } from '../SellerPrepItemResultList';
import { BuyerTaskResultList } from '../BuyerTaskResultList';
import { RadarEventResultList } from '../RadarEventResultList';
import { ReserveAllocationResultList } from '../ReserveAllocationResultList';
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

// Nine bespoke rendering exceptions in the whole registry: a
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
// PROPERTY_SUMMARY); `property-warranties` (canonical Warranty records
// from PROPERTY_SUMMARY); `reserve-allocations` (canonical
// ReserveFundLineItem records from CAPITAL_RESERVE_PLAN, FRD Appendix D's
// first reference-journey slice); or `home-event-radar-feed` (canonical
// PropertyRadarMatch records from HOME_EVENT_RADAR_FEED, FRD Appendix D's
// second reference-journey slice). All are still registered under the
// single `GROUPED_LIST` type (see ./registry.tsx) -- the split is by block
// id, not a second block type.
const INVENTORY_ITEM_DETAIL_BLOCK_IDS = new Set(['inventory-results', 'inventory-entity-selection', 'property-inventory']);
const HOME_EVENT_DETAIL_BLOCK_IDS = new Set(['inventory-history', 'property-recent-events']);

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014/015/019/022, FRD v1.72): a grouped list whose server declared a
// shared pattern, and whose data fits it, renders through that pattern. The homeowner can switch it to the plain
// list and back; the choice is kept with the result like the other view choices.
export const GroupedListBlock: AskBlockRenderer<'GROUPED_LIST'> = (props) => {
  const controls = useContext(ResultViewContext);
  const preference = controls?.view.groupedListModes[props.block.id] ?? 'AUTO';
  const resolved = resolveGroupedListPattern(props.block, preference);
  // IW-PRES-015 (FRD v1.75): a deck that collects decisions needs the batch sender; where a renderer has none, the
  // plain list is used rather than sending the collected decisions one by one.
  const batchUnavailable = resolved.pattern === 'DECK' && Boolean(resolved.batch) && !props.onBatchItemAction;
  const decision = batchUnavailable ? { pattern: null, offersChoice: false, reason: 'NO_PATTERN' as const } : resolved;
  const setPreference = (mode: GroupedListPresentationPreference) => controls?.change((view) => ({
    ...view, groupedListModes: { ...view.groupedListModes, [props.block.id]: mode },
  }));
  // Maintenance keeps its own component in both layouts, so its live-record detail, paging and selection are the
  // same whichever the homeowner chooses. The pattern still comes only from the server's declaration.
  if (props.block.id === 'maintenance-groups') {
    const { block, propertyId, itemActionsDisabled, onFilterClick, onCollectionPage, onItemAction, onAccessLost } = props;
    const declaresShelves = block.presentation?.pattern === 'SHELVES';
    return <MaintenanceResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onPage={onCollectionPage} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'SHELVES' ? 'SHELVES' : 'LIST'}
      onChooseLayout={declaresShelves && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  // Rooms keep their own component in both layouts too, so the live room detail and its corrections stay (FRD v1.79).
  if (props.block.id === 'property-rooms') {
    const { block, propertyId, itemActionsDisabled, onItemAction, onAccessLost } = props;
    const declaresMap = block.presentation?.pattern === 'ROOM_MAP';
    return <RoomResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'ROOM_MAP' ? 'MAP' : 'LIST'}
      onChooseLayout={declaresMap && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  if (props.block.id === 'inspection-findings') {
    const { block, propertyId, itemActionsDisabled, onItemAction, onAccessLost, onBatchItemAction } = props;
    const declaresDeck = block.presentation?.pattern === 'DECK';
    return <InspectionFindingResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      deck={decision.pattern === 'DECK' ? {
        swipeRightActionId: decision.swipeRightActionId, swipeLeftActionId: decision.swipeLeftActionId, batch: decision.batch,
        onBatch: decision.batch && onBatchItemAction ? (decisions) => onBatchItemAction({ operationId: decision.batch!.operationId, entityType: decision.batch!.entityType, message: decision.batch!.message, decisions }) : undefined,
      } : null}
      onChooseLayout={declaresDeck && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  // Seller-prep keeps its own component in both layouts, so the live item detail and its decisions stay (FRD v1.84).
  if (props.block.id === 'seller-prep-open-items') {
    const { block, propertyId, itemActionsDisabled, onItemAction, onAccessLost } = props;
    const declaresShelves = block.presentation?.pattern === 'SHELVES';
    return <SellerPrepItemResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'SHELVES' ? 'SHELVES' : 'LIST'}
      onChooseLayout={declaresShelves && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  if (decision.pattern) {
    const { block, itemActionsDisabled, onFilterClick, onItemAction, onBatchItemAction } = props;
    return (
      <PatternFrame title={block.title} description={block.description} pattern={decision.pattern.toLowerCase()} patternLabel={PATTERN_LABELS[decision.pattern]}
        onChooseList={controls ? () => setPreference('LIST') : undefined} filters={block.filters} onFilterClick={onFilterClick}
        disabled={itemActionsDisabled} actions={block.actions}>
        {decision.pattern === 'SHELVES' && <ShelvesView sections={block.sections} moreAction={block.actions[0]} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
        {decision.pattern === 'DECK' && <CardDeckView items={groupedListItems(block)} swipeRightActionId={decision.swipeRightActionId} swipeLeftActionId={decision.swipeLeftActionId} onItemAction={onItemAction} disabled={itemActionsDisabled}
          batch={decision.batch} onBatch={decision.batch && onBatchItemAction ? (decisions) => onBatchItemAction({ operationId: decision.batch!.operationId, entityType: decision.batch!.entityType, message: decision.batch!.message, decisions }) : undefined} />}
        {decision.pattern === 'ROOM_MAP' && <RoomMapView items={groupedListItems(block)} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
      </PatternFrame>
    );
  }
  if (decision.reason === 'HOMEOWNER_CHOSE_LIST' && props.block.presentation && controls) {
    const label = PATTERN_LABELS[props.block.presentation.pattern];
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <button type="button" onClick={() => setPreference('AUTO')} className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-teal-800 hover:bg-slate-50">Show as {label.toLowerCase()}</button>
        </div>
        <DeclaredListBlock {...props} />
      </div>
    );
  }
  return <DeclaredListBlock {...props} />;
};

const DeclaredListBlock: AskBlockRenderer<'GROUPED_LIST'> = (props) => {
  const { block, propertyId, itemActionsDisabled, onFilterClick, onCollectionPage, onItemAction, onAccessLost } = props;
  if (INVENTORY_ITEM_DETAIL_BLOCK_IDS.has(block.id)) {
    return <InventoryResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (HOME_EVENT_DETAIL_BLOCK_IDS.has(block.id)) {
    return <HomeEventResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-rooms') {
    return <RoomResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
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
    return <WarrantyResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Home Capital Timeline reference journey (FRD Appendix D), first inline-detail slice: reserve-allocations'
  // line items get canonical detail the same way every other read-only Property Records collection does.
  // capital-timeline-table (a TABLE block, not GROUPED_LIST) got its own row-click-to-detail platform
  // capability separately -- see ./TableBlock.tsx, not this file.
  if (block.id === 'reserve-allocations') {
    return <ReserveAllocationResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Home Event Radar reference journey (FRD Appendix D), second inline-detail
  // slice: home-event-radar-feed's items get canonical detail via the real
  // radarQueryService.getDetail read (a genuine per-match GET, unlike the
  // reserve-allocations/warranty/household list-scan exception above).
  if (block.id === 'home-event-radar-feed') {
    return <RadarEventResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Buyer-closing capability-card slice (FRD v1.46): blocking tasks open inline, with Mark complete while open.
  if (block.id === 'buyer-deadlines-list') {
    return <BuyerTaskResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Inspection-hub capability-card slice (FRD v1.43): findings open inline, re-read through their report.
  // Claims capability-card slice (FRD v1.42): claim rows open the canonical claim inline, with its legal status
  // changes as declared CLAIM_TRANSITION actions; incident rows keep their link.
  if (block.id === 'incident-claim-list') {
    return <ClaimResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  return <GenericGroupedListBlock {...props} />;
};
