'use client';

import { useContext, useState } from 'react';
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
import { ActionLink, AskBlockActionContext, AskContextLink } from './context';
import type { AskBlockRenderer } from './types';

// B07 fix: exported (previously module-private, as part of AskWorkspace's
// own BlockView) so the generic GROUPED_LIST renderer's selection
// marker/highlight can be tested directly, same convention as
// MaintenanceResultList's own export.
export function GenericGroupedListBlock({ block, executionId, propertyId, onItemAction, itemActionsDisabled, onFilterClick }: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]) {
  const controls = useContext(ResultViewContext);
  const workflowControls = useContext(AskBlockActionContext);
  const [focusedDisclosure, setFocusedDisclosure] = useState<'DETAILS' | 'SNOOZE' | null>(null);
  if (block.id === 'focused-home-action-guidance') {
    const next = block.sections.find((section) => section.id === 'next-step');
    const why = block.sections.find((section) => section.id === 'why-it-matters')?.items[0];
    const facts = block.sections.find((section) => section.id === 'known-details')?.items ?? [];
    const checklist = block.sections.find((section) => section.id === 'checklist');
    const policyConflicts = block.sections.find((section) => section.id === 'policy-conflicts');
    const snoozeAction = block.actions.find((action) => action.interactionType === 'START_WORKFLOW' && /^Snooze reminders?$/i.test(action.label));
    const primaryActions = block.actions.filter((action) => action !== snoozeAction);
    const hasDetails = Boolean(why?.description || facts.length > 0);
    const detailsOpen = focusedDisclosure === 'DETAILS';
    const snoozeOpen = focusedDisclosure === 'SNOOZE';
    const startSnooze = (message: string) => {
      if (!snoozeAction || !workflowControls || workflowControls.disabled) return;
      setFocusedDisclosure(null);
      workflowControls.invoke({ ...snoozeAction, message });
    };
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{block.title}</p>
        <div className="mt-2 space-y-2">
          {next?.items.map((item) => (
            <div key={item.id}>
              <p className="font-semibold text-slate-950">{item.title}</p>
              {item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}
              {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-500">{item.meta.join(' · ')}</p>}
            </div>
          ))}
        </div>
        {detailsOpen && hasDetails && (
          <div id={`${block.id}-details`} className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
                {why?.description && <p className="mt-2 text-sm leading-5 text-slate-600">{why.description}</p>}
              </div>
              <button type="button" onClick={() => setFocusedDisclosure(null)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Close<span className="sr-only"> details</span></button>
            </div>
            {facts.length > 0 && (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {facts.slice(0, 6).map((fact) => (
                  <div key={fact.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fact.title}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-slate-800">{fact.description}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
        {checklist && checklist.items.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{checklist.title}</p>
            <ul className="mt-2 space-y-2">
              {checklist.items.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    {item.meta.length > 0 && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.meta[0]}</span>}
                  </div>
                  {item.description && <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* FRD v1.171: each conflicting policy fact is resolved here through the existing confirmation-gated
            DOCUMENT_PROMOTION_CONFIRM. Without this branch the section would be silently dropped, exactly as the
            checklist section would be by this fixed-id renderer. */}
        {policyConflicts && policyConflicts.items.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{policyConflicts.title}</p>
            <ul className="mt-2 space-y-2">
              {policyConflicts.items.map((item) => (
                <li key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    {item.meta.length > 0 && <span className="shrink-0 text-xs text-slate-500">{item.meta[0]}</span>}
                  </div>
                  {item.description && <p className="mt-1 text-sm leading-5 text-slate-700">{item.description}</p>}
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
                </li>
              ))}
            </ul>
          </div>
        )}
        {(primaryActions.length > 0 || snoozeAction || hasDetails) && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {primaryActions.map((action) => <ActionLink key={action.id} action={action} />)}
          {snoozeAction && <button type="button" disabled={!workflowControls || workflowControls.disabled} aria-expanded={snoozeOpen} aria-controls={`${block.id}-snooze`} onClick={() => setFocusedDisclosure(snoozeOpen ? null : 'SNOOZE')} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50">{snoozeAction.label}</button>}
          {hasDetails && <button type="button" aria-expanded={detailsOpen} aria-controls={`${block.id}-details`} onClick={() => setFocusedDisclosure(detailsOpen ? null : 'DETAILS')} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">View details</button>}
        </div>}
        {snoozeOpen && snoozeAction && <div id={`${block.id}-snooze`} className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
          <p className="text-sm font-semibold text-slate-900">When should Cozy remind you?</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">You will review the date before the reminder is changed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={workflowControls?.disabled} onClick={() => startSnooze('Snooze this work item until tomorrow.')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50">Tomorrow</button>
            <button type="button" disabled={workflowControls?.disabled} onClick={() => startSnooze('Snooze this work item for one week.')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50">One week</button>
            <button type="button" disabled={workflowControls?.disabled} onClick={() => startSnooze('Snooze this work item for two weeks.')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50">Two weeks</button>
            <button type="button" disabled={workflowControls?.disabled} onClick={() => startSnooze('Snooze this work item until next month.')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50">One month</button>
          </div>
        </div>}
      </section>
    );
  }
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
  // Home Event Radar keeps its own component in both layouts, so the filters and the live event detail stay (FRD v1.92).
  if (props.block.id === 'home-event-radar-feed') {
    const { block, propertyId, itemActionsDisabled, onFilterClick, onItemAction, onAccessLost } = props;
    const declaresDeck = block.presentation?.pattern === 'DECK';
    return <RadarEventResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      deck={decision.pattern === 'DECK' ? { swipeRightActionId: decision.swipeRightActionId, swipeLeftActionId: decision.swipeLeftActionId } : null}
      onChooseLayout={declaresDeck && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
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
  // 'warranty-results' is the WARRANTY_LOOKUP answer (Warranties W-1); 'property-warranties' is the Property Summary section. Same rows, same detail.
  if (block.id === 'property-warranties' || block.id === 'warranty-results') {
    return <WarrantyResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onAccessLost={onAccessLost}
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
  // Buyer-closing capability-card slice (FRD v1.46): blocking tasks open inline, with Mark complete while open.
  if (block.id === 'buyer-deadlines-list') {
    return <BuyerTaskResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Inspection-hub capability-card slice (FRD v1.43): findings open inline, re-read through their report.
  // Claims capability-card slice (FRD v1.42): claim rows open the canonical claim inline, with its legal status
  // changes as declared CLAIM_TRANSITION actions; incident rows keep their link.
  if (block.id === 'incident-claim-list') {
    return <ClaimResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  return <GenericGroupedListBlock {...props} />;
};
