'use client';

import { useContext, useState, type ComponentType } from 'react';
import type { AskCollectionDescriptor, AskPresentationBlock } from '@/features/ask/types';
import { cn } from '@/lib/utils';
import { formatLegacyAskMaintenanceItem } from '@/features/ask/presentationCompatibility';
import { resolveGroupedListView, type GroupedListPresentationPreference } from '@/features/ask/adaptivePresentation';
import { ResultViewContext } from '@/features/ask/useResultView';
import { groupedListItems, PATTERN_LABELS, resolveGroupedListPattern } from '@/features/ask/displayPatterns';
import { CardDeckView } from '../patterns/CardDeckView';
import { ChoiceGridView } from '../patterns/ChoiceGridView';
import { BudgetBreakdownView } from '../patterns/BudgetBreakdownView';
import { PatternFrame } from '../patterns/PatternParts';
import { RoomMapView } from '../patterns/RoomMapView';
import { ShelvesView } from '../patterns/ShelvesView';
import { StatusAccordionView } from '../patterns/StatusAccordionView';
import { CollectionStatusNote } from '../patterns/CollectionStatusNote';
import { sectionHasNextPage } from '@/features/ask/collectionStatus';
import { DocumentResultList } from '../DocumentResultList';
import { HomeEventResultList } from '../HomeEventResultList';
import { HouseholdResultList } from '../HouseholdResultList';
import { InventoryResultList } from '../InventoryResultList';
import { MaintenanceResultList } from '../MaintenanceResultList';
import { MaintenanceForecastResultList } from '../MaintenanceForecastResultList';
import { ClaimResultList } from '../ClaimResultList';
import { InspectionFindingResultList } from '../InspectionFindingResultList';
import { SellerPrepItemResultList } from '../SellerPrepItemResultList';
import { BuyerTaskResultList } from '../BuyerTaskResultList';
import { RadarEventResultList } from '../RadarEventResultList';
import { ReserveAllocationResultList } from '../ReserveAllocationResultList';
import { RoomResultList } from '../RoomResultList';
import { FACT_SHEET_BLOCK_IDS, FactSheetResultList, PLAN_LAYOUT_BLOCK_IDS, SeasonalPlanResultList } from '../SeasonalPlanResultList';
import { WarrantyResultList } from '../WarrantyResultList';
import { MaterialSpecResultList } from '../MaterialSpecResultList';
import { HomeContinuityPlanResultList } from '../HomeContinuityPlanResultList';
import { PlantRecommendationResultList } from '../PlantRecommendationResultList';
import { HomeRecordOverviewBlock } from '../HomeRecordOverviewBlock';
import { GUIDANCE_JOURNEY_LIST_ID, GuidanceJourneyListView } from '../GuidanceJourneyList';
import { PROPERTY_BRIEF_PREVIEW_IDS, PropertyBriefFactSheet, PropertyBriefSharePanel, PropertyBriefsListBlock } from '../PropertyBriefPreview';
import { ActionLink, AskBlockActionContext, AskContextLink } from './context';
import type { AskBlockRenderer } from './types';
import { AskCollection, AskCollectionState } from '../presentation/AskLayoutPrimitives';
import { AttachEvidenceControl, EVIDENCE_ATTACH_MESSAGES } from '../AttachEvidenceControl';
import { FinancingNumbers, FinancingOptions, FinancingPlanner, FinancingScenarios } from '../FinancingOverviewResult';

// Blocks whose items carry longer text revealed on demand (`item.detail`). The Negotiation Shield draft is collapsed by default so a long
// message does not push the analysis down; the producer sets the id, the client only implements the expand/collapse.
const NEGOTIATION_DRAFT_BLOCK_ID = 'negotiation-shield-draft';
const INLINE_DETAIL_BLOCK_IDS: ReadonlySet<string> = new Set(['project-detail-records', NEGOTIATION_DRAFT_BLOCK_ID]);

// B07 fix: exported (previously module-private, as part of AskWorkspace's
// own BlockView) so the generic GROUPED_LIST renderer's selection
// marker/highlight can be tested directly, same convention as
// MaintenanceResultList's own export.
const MAX_INLINE_ITEM_ACTIONS = 2;
const itemActionClass = (style: string | undefined) => cn(
  'min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
  style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
);

// Presentation Quality 2C: a row shows at most two actions inline; the rest sit behind "More" so a row never becomes a wall of pills.
function ItemActionRow({ item, disabled, onItemAction, className }: {
  item: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['sections'][number]['items'][number];
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
  className?: string;
}) {
  const actions = item.actions ?? [];
  const ordered = [...actions.filter((action) => action.style === 'PRIMARY'), ...actions.filter((action) => action.style !== 'PRIMARY')];
  const inline = ordered.slice(0, MAX_INLINE_ITEM_ACTIONS);
  const overflow = ordered.slice(MAX_INLINE_ITEM_ACTIONS);
  const run = (action: (typeof actions)[number]) => onItemAction(action.entityType ?? item.entityType, action.entityId ?? item.id, action.message, action.operationId, action.interactionType);
  return (
    <div className={cn('mt-3 flex flex-wrap items-center gap-2', className)}>
      {inline.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => run(action)} className={itemActionClass(action.style)}>{action.label}</button>)}
      {overflow.length > 0 && <details className="relative">
        <summary className="flex min-h-8 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">More<span className="sr-only"> actions for {item.title}</span></summary>
        <div className="absolute left-0 z-10 mt-1 min-w-40 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          {overflow.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => run(action)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{action.label}</button>)}
        </div>
      </details>}
    </div>
  );
}

function ReservePlanningControls({ block, disabled, onItemAction }: {
  block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const balance = block.sections.find((section) => section.id === 'fund-actions');
  const postures = block.sections.find((section) => section.id === 'postures');
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-reserve-planning-controls="">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{block.description}</p>}
      </div>
      <div className="space-y-5 p-4">
        {balance && <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{balance.title}</h4>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {balance.items.map((item) => <li key={item.id} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              {item.description && <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>}
              <div className="mt-auto pt-1"><ItemActionRow item={item} disabled={disabled} onItemAction={onItemAction} /></div>
            </li>)}
          </ul>
        </div>}
        {postures && <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{postures.title}</h4>
          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3" aria-label={postures.title}>
            {postures.items.map((item) => {
              const current = item.status === 'CURRENT';
              return <li key={item.id} className={cn('flex flex-col rounded-xl border p-3', current ? 'border-teal-500 bg-teal-50/70 ring-1 ring-teal-500' : 'border-slate-200 bg-white')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  {current && <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Current</span>}
                </div>
                {item.description && <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>}
                {(item.actions?.length ?? 0) > 0 && <div className="mt-auto pt-1"><ItemActionRow item={item} disabled={disabled} onItemAction={onItemAction} /></div>}
              </li>;
            })}
          </ul>
        </div>}
      </div>
    </section>
  );
}

const OWNERSHIP_COST_BADGE_BY_ID: Record<string, string> = {
  'ownership-cost-missing': 'Coverage Gaps',
  'ownership-cost-changes': 'Category Deltas',
  'ownership-cost-notifications': 'Cost Alerts',
  'ownership-cost-forecast-drivers': 'Forecast Drivers',
  'ownership-cost-forecast-actions': 'Next Steps',
  'ownership-cost-scenarios': 'Scenario Simulator',
  'ownership-cost-buffer-options': 'Reserve Sizing',
};

function OwnershipCostViewsBlock({ block, disabled, onItemAction }: {
  block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
  disabled: boolean;
  onItemAction: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];
}) {
  const views = block.sections.flatMap((section) => section.items);
  return (
    <section className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs" data-ownership-cost-views="">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Workspace Views</span>
        </div>
        {block.description && <p className="text-xs text-slate-500">{block.description}</p>}
      </div>
      <div className="p-3 sm:px-4 sm:py-3">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={block.title}>
          {views.map((item) => {
            const current = item.status === 'CURRENT';
            const primaryAction = item.actions?.[0];
            return (
              <li
                key={item.id}
                data-ask-task-id={item.id}
                className={cn(
                  'flex flex-col rounded-xl border px-3 py-2 transition-colors',
                  current
                    ? 'border-teal-400 bg-teal-50/60 ring-1 ring-teal-500/20'
                    : 'border-slate-200/80 bg-slate-50/55 hover:border-teal-200 hover:bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <p className="text-xs font-bold text-slate-950 sm:text-sm">{item.title}</p>
                  {current && (
                    <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Current
                    </span>
                  )}
                </div>
                {item.description && <p className="mt-1 text-[11px] leading-4 text-slate-600">{item.description}</p>}
                {primaryAction && (
                  <div className="mt-2 pt-0.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onItemAction(primaryAction.entityType ?? item.entityType, primaryAction.entityId ?? item.id, primaryAction.message, primaryAction.operationId, primaryAction.interactionType)}
                      className="inline-flex min-h-7 items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 shadow-2xs transition-colors hover:border-teal-300 hover:bg-teal-50/60 disabled:opacity-50"
                    >
                      {primaryAction.label}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function GenericGroupedListBlock({ block, executionId, propertyId, onItemAction, itemActionsDisabled, onFilterClick, onCollectionPage }: Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]) {
  const controls = useContext(ResultViewContext);
  const workflowControls = useContext(AskBlockActionContext);
  const [focusedDisclosure, setFocusedDisclosure] = useState<'DETAILS' | 'SNOOZE' | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  if (block.id === 'reserve-planning-controls') return <ReservePlanningControls block={block} disabled={itemActionsDisabled} onItemAction={onItemAction} />;
  if (block.id === 'ownership-cost-views') return <OwnershipCostViewsBlock block={block} disabled={itemActionsDisabled} onItemAction={onItemAction} />;
  if (block.id === 'focused-home-action-guidance') {
    const next = block.sections.find((section) => section.id === 'next-step');
    const why = block.sections.find((section) => section.id === 'why-it-matters')?.items[0];
    const facts = block.sections.find((section) => section.id === 'known-details')?.items ?? [];
    const checklist = block.sections.find((section) => section.id === 'checklist');
    const policyConflicts = block.sections.find((section) => section.id === 'policy-conflicts');
    const evidence = block.sections.find((section) => section.id === 'work-evidence');
    const evidenceRows = evidence?.items.filter((item) => !item.evidenceTarget) ?? [];
    const evidenceTarget = evidence?.items.find((item) => item.evidenceTarget);
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
      <section className="w-full max-w-[900px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="p-3.5 sm:p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{block.title}</p>
        <div className="mt-2">
          {next?.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              <p className="font-semibold text-slate-950">{item.title}</p>
              {item.description && <p className="text-sm leading-5 text-slate-700">{item.description}</p>}
              {item.meta.length > 0 && <p className="text-xs text-slate-500">{item.meta.join(' · ')}</p>}
            </div>
          ))}
        </div>
        {evidence && (evidenceRows.length > 0 || evidenceTarget) && (
          <div className="mt-4 border-t border-slate-100 pt-3" data-work-evidence="">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{evidence.title}</p>
            {evidenceRows.length > 0 ? (
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {evidenceRows.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-900">{item.title}</p>
                      {item.meta.length > 0 && <p className="text-xs text-slate-500">{item.meta.join(' · ')}</p>}
                    </div>
                    {item.status && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{item.status}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            {evidenceTarget && (
              <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between [&>div]:mt-0', evidenceRows.length > 0 ? 'mt-2' : 'mt-1')}>
                <p className="text-xs leading-5 text-slate-600">{evidenceRows.length > 0 ? evidenceTarget.description : 'No evidence is attached yet.'}</p>
                {(evidenceTarget.actions?.length ?? 0) > 0 && <ItemActionRow item={evidenceTarget} disabled={itemActionsDisabled} onItemAction={onItemAction} />}
              </div>
            )}
          </div>
        )}
        {detailsOpen && hasDetails && (
          <div id={`${block.id}-details`} className="mt-4 border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
              {why?.description && (
                <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planning rationale</p>
                  <p className="mt-1 text-sm leading-5 text-slate-700">{why.description}</p>
                </div>
              )}
            </div>
            {facts.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm" aria-label="Planning details">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr><th scope="col" className="px-3 py-2.5">Category</th><th scope="col" className="px-3 py-2.5">Detail</th><th scope="col" className="px-3 py-2.5">Value</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {facts.map((fact) => (
                      <tr key={fact.id}>
                        <td className="px-3 py-2.5 text-slate-500">{fact.meta[0] ?? 'Home details'}</td>
                        <th scope="row" className="px-3 py-2.5 font-medium text-slate-700">{fact.title}</th>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{fact.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {checklist && checklist.items.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{checklist.title}</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
              <table className="block w-full text-left text-sm md:table" aria-label={checklist.title}>
                <thead className="hidden bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 md:table-header-group">
                  <tr><th className="px-3 py-2.5">System</th><th className="px-3 py-2.5">Current condition</th><th className="px-3 py-2.5">Recommended action</th><th className="px-3 py-2.5">Priority</th></tr>
                </thead>
                <tbody className="block divide-y divide-slate-200 bg-white md:table-row-group">
                  {checklist.items.map((item) => (
                    <tr key={item.id} className="block p-3 md:table-row md:p-0">
                      <th scope="row" className="block font-semibold text-slate-950 md:table-cell md:w-[16%] md:px-3 md:py-3 md:align-top">{item.title}</th>
                      <td className="mt-2 block leading-5 text-slate-600 md:mt-0 md:table-cell md:w-[28%] md:px-3 md:py-3 md:align-top"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Current condition</span>{item.condition ?? 'Not recorded'}</td>
                      <td className="mt-2 block leading-5 text-slate-700 md:mt-0 md:table-cell md:px-3 md:py-3 md:align-top"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Recommended action</span>{item.description}</td>
                      <td className="mt-2 block md:mt-0 md:table-cell md:w-[8.5rem] md:px-3 md:py-3 md:align-top">{item.meta[0] && <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.meta[0]}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <ItemActionRow item={item} disabled={itemActionsDisabled} onItemAction={onItemAction} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
        {(primaryActions.length > 0 || snoozeAction || hasDetails) && <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/50 px-3.5 py-2.5 sm:px-4">
          {primaryActions.map((action) => <ActionLink key={action.id} action={action} />)}
          {snoozeAction && <button type="button" disabled={!workflowControls || workflowControls.disabled} aria-expanded={snoozeOpen} aria-controls={`${block.id}-snooze`} onClick={() => setFocusedDisclosure(snoozeOpen ? null : 'SNOOZE')} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50">{snoozeAction.label}</button>}
          {hasDetails && <button type="button" aria-expanded={detailsOpen} aria-controls={`${block.id}-details`} onClick={() => setFocusedDisclosure(detailsOpen ? null : 'DETAILS')} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">{detailsOpen ? 'Hide details' : 'View details'}</button>}
        </div>}
        {snoozeOpen && snoozeAction && <div id={`${block.id}-snooze`} className="border-t border-teal-100 bg-teal-50/40 p-4">
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
  const dense = block.listDensity === 'DENSE';
  const decision = dense ? { mode: 'COMPACT_LIST' as const, offersChoice: false } : resolveGroupedListView(block, preference);
  const presentation = decision.mode;
  const setPreference = (mode: GroupedListPresentationPreference) => controls?.change((view) => ({
    ...view, groupedListModes: { ...view.groupedListModes, [block.id]: mode },
  }));
  const isDriversBlock = block.id === 'sell-hold-rent-drivers' || block.id === 'break-even-drivers';
  const isOwnershipCostList = block.id.startsWith('ownership-cost-');
  const isServicePriceRadarList = block.id === 'service-price-radar-checks';
  const isCoverageGroupsList = block.id === 'coverage-groups' || block.id === 'coverage-comparison-options';
  const isPlantCareList = block.id === 'plant-care-items';
  const isFramedDecisionList = isDriversBlock || isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList;
  const ownershipCostBadge = OWNERSHIP_COST_BADGE_BY_ID[block.id];
  return (
    <section
      data-ownership-cost-list={isOwnershipCostList ? block.id : undefined}
      data-service-price-radar-checks={isServicePriceRadarList ? '' : undefined}
      data-coverage-groups-list={isCoverageGroupsList ? block.id : undefined}
      data-plant-care-list={isPlantCareList ? block.id : undefined}
      className={cn(
        isFramedDecisionList ? 'w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs' : 'overflow-hidden rounded-2xl border border-slate-200 bg-white',
        block.id === 'home-work-items' && 'w-full max-w-[960px]',
      )}
      data-grouped-list-presentation={presentation.toLowerCase()}
      data-list-density={dense ? 'dense' : undefined}
    >
      <div
        className={cn(
          'border-b border-slate-100',
          isFramedDecisionList && 'rounded-t-2xl bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5',
          !isFramedDecisionList && (dense ? 'px-3 py-2.5' : 'px-4 py-3'),
        )}
      >
        <div className="flex items-baseline gap-2">
          <h3 className={cn('text-slate-950', isFramedDecisionList ? 'text-sm font-bold tracking-tight sm:text-base' : 'font-semibold')}>{block.title}</h3>
          {isDriversBlock && <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Key Drivers</span>}
          {isServicePriceRadarList && <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Benchmark Comparison</span>}
          {isCoverageGroupsList && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              {block.id === 'coverage-groups' ? 'Item-Level Protection' : 'Policy Options'}
            </span>
          )}
          {isPlantCareList && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Forecast &amp; Cadence
            </span>
          )}
          {ownershipCostBadge && (
            <span className={cn('text-[10px] font-bold uppercase tracking-wider', block.id === 'ownership-cost-missing' ? 'text-amber-700' : 'text-teal-700')}>
              {ownershipCostBadge}
            </span>
          )}
        </div>
        {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
        {decision.offersChoice && controls && !isCoverageGroupsList && !isPlantCareList && <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label={`View ${block.title}`}>
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
        {block.sections.map((section) => {
          const declaredVisibleCount = section.initialVisibleCount;
          const canExpand = Boolean(declaredVisibleCount && declaredVisibleCount < section.items.length);
          const expanded = Boolean(expandedSections[section.id]);
          const visibleItems = canExpand && !expanded ? section.items.slice(0, declaredVisibleCount) : section.items;
          const hiddenItemCount = canExpand ? section.items.length - declaredVisibleCount! : 0;
          const listId = `${block.id}-${section.id}-items`;
          const isConfirmedGapSection = block.id === 'coverage-groups' && (section.id === 'no_coverage' || section.id === 'expired');
          const isUnclearOrExpiringSection = block.id === 'coverage-groups' && (section.id === 'coverage_unclear' || section.id === 'expiring_soon');
          const isEvidenceMissingSection = block.id === 'coverage-groups' && section.id === 'evidence_missing';
          const isPlantCareNowSection = isPlantCareList && section.id === 'plant-care-now';
          const isPlantCareSoonSection = isPlantCareList && section.id === 'plant-care-soon';
          const isPlantCareRoutineSection = isPlantCareList && (section.id === 'plant-care-routine' || section.id === 'plant-care-garden');
          return (
          <div key={section.id} className={isFramedDecisionList ? 'px-4 py-3 sm:px-5' : dense ? 'px-3 py-2.5' : 'p-4'}>
            <div className={cn('flex items-center justify-between', isFramedDecisionList && !isCoverageGroupsList && !isPlantCareList ? 'sr-only' : isCoverageGroupsList || isPlantCareList ? 'mb-2.5' : dense ? 'mb-1.5' : 'mb-3')}>
              <div className="flex items-center gap-2">
                {(block.id === 'coverage-groups' || isPlantCareList) && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      isConfirmedGapSection || isPlantCareNowSection
                        ? 'bg-rose-500'
                        : isUnclearOrExpiringSection || isPlantCareSoonSection
                          ? 'bg-amber-500'
                          : isEvidenceMissingSection
                            ? 'bg-sky-500'
                            : isPlantCareRoutineSection
                              ? 'bg-emerald-500'
                              : 'bg-teal-500',
                    )}
                  />
                )}
                <div>
                  <h4 className={cn('font-semibold text-slate-800', isCoverageGroupsList || isPlantCareList ? 'text-xs font-bold uppercase tracking-wider text-slate-700' : 'text-sm')}>{section.title}</h4>
                  {section.caption && <p className="mt-0.5 text-xs text-slate-500">{section.caption}</p>}
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                  isConfirmedGapSection || isPlantCareNowSection
                    ? 'border border-rose-200 bg-rose-50 text-rose-800'
                    : isUnclearOrExpiringSection || isPlantCareSoonSection
                      ? 'border border-amber-200 bg-amber-50 text-amber-800'
                      : isEvidenceMissingSection
                        ? 'border border-sky-200 bg-sky-50 text-sky-800'
                        : isPlantCareRoutineSection
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'bg-slate-100 text-slate-600',
                )}
              >
                {section.count}
              </span>
            </div>
            {section.items.length === 0 ? <AskCollectionState kind="EMPTY" title={section.title} action={block.sections.length === 1 && block.actions[0] ? <ActionLink action={block.actions[0]} /> : undefined} /> : (
              <AskCollection id={listId} className={cn(
                block.id === 'project-detail-records' && 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3',
                block.id === 'coverage-groups' && 'grid grid-cols-1 gap-2.5 sm:grid-cols-2',
                block.id !== 'project-detail-records' && block.id !== 'coverage-groups' && (dense ? 'divide-y divide-slate-100' : presentation === 'COMPACT_LIST' ? 'space-y-1' : isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList ? 'space-y-2' : 'space-y-3'),
              )} data-project-record-grid={block.id === 'project-detail-records' ? '' : undefined} data-coverage-groups-grid={block.id === 'coverage-groups' ? '' : undefined} data-plant-care-grid={isPlantCareList ? '' : undefined}>
                {visibleItems.map((sourceItem) => {
                  const item = block.id === 'maintenance-groups' ? formatLegacyAskMaintenanceItem(sourceItem) : sourceItem;
                  const selected = controls?.view.selectedTaskId === item.id;
                  const detailKey = `${section.id}:${item.id}`;
                  const itemDetailsExpanded = Boolean(expandedItems[detailKey]);
                  const hasInlineDetails = INLINE_DETAIL_BLOCK_IDS.has(block.id) && Boolean(item.detail);
                  const projectActions = block.id === 'project-detail-records' ? (item.actions ?? []) : [];
                  const dominantProjectAction = projectActions.find((action) => action.style === 'PRIMARY') ?? projectActions[0];
                  const overflowProjectActions = projectActions.filter((action) => action !== dominantProjectAction);
                  const denseActions = dense ? (item.actions ?? []) : [];
                  const dominantDenseAction = denseActions.find((action) => action.style === 'PRIMARY') ?? denseActions[0];
                  const inlineDenseActions = denseActions.length <= 2 ? denseActions : dominantDenseAction ? [dominantDenseAction] : [];
                  const overflowDenseActions = denseActions.length <= 2 ? [] : denseActions.filter((action) => action !== dominantDenseAction);
                  const statusLabel = item.status?.replace(/_/g, ' ');
                  const visibleStatus = statusLabel?.trim().toLowerCase() === section.title.trim().toLowerCase() ? null : statusLabel;
                  const homeWorkItemList = block.id === 'home-work-items';
                  const overdueWorkItem = homeWorkItemList && item.tone === 'CRITICAL';
                  const sellHoldRentDriversList = block.id === 'sell-hold-rent-drivers' || block.id === 'break-even-drivers';
                  const impactMatch = visibleStatus ? /^(high|medium|low)\s+impact$/i.exec(visibleStatus.trim()) : null;
                  const impactLevel = impactMatch ? impactMatch[1].toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW' : null;
                  const quoteMeta = isServicePriceRadarList ? item.meta.find((m) => /^Quote\s+\$/i.test(m)) : null;
                  const expectedMeta = isServicePriceRadarList ? item.meta.find((m) => /^Expected\s+/i.test(m)) : null;
                  const isCoverageGapItem = block.id === 'coverage-groups';
                  const isConfirmedGapItem = isCoverageGapItem && (item.status === 'NO_COVERAGE' || item.status === 'EXPIRED');
                  const isUnclearGapItem = isCoverageGapItem && (item.status === 'COVERAGE_UNCLEAR' || item.status === 'EXPIRING_SOON');
                  const isEvidenceGapItem = isCoverageGapItem && item.status === 'EVIDENCE_MISSING';
                  const isPlantCareNowItem = isPlantCareList && item.status === 'NOW';
                  const isPlantCareSoonItem = isPlantCareList && item.status === 'SOON';
                  const isPlantCareRoutineItem = isPlantCareList && (item.status === 'ROUTINE' || item.status === 'SEASONAL');
                  const coverageLocationMeta = (isCoverageGapItem || isPlantCareList) && item.meta[0]
                    ? (/^hvac$/i.test(item.meta[0].trim())
                      ? 'HVAC'
                      : /^[a-z][a-z0-9_ ]*$/.test(item.meta[0].trim())
                        ? item.meta[0].trim().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
                        : item.meta[0].trim())
                    : null;
                  const coverageExposureMeta = isCoverageGapItem ? item.meta.find((m) => /exposure|replacement value/i.test(m)) : null;
                  const coverageOtherMeta = (isCoverageGapItem || isPlantCareList)
                    ? item.meta.slice(1).filter((m) => m !== coverageExposureMeta)
                    : [];
                  return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('border outline-offset-2', dense ? 'border-b-0 border-r-0 border-t-0 px-2 py-2' : 'rounded-xl', dense && (overdueWorkItem ? 'border-l-4 border-l-rose-400 bg-rose-50/70' : sellHoldRentDriversList && impactLevel === 'HIGH' ? 'border-l-4 border-l-amber-400 bg-amber-50/30 py-2.5' : sellHoldRentDriversList ? 'border-l-4 border-l-teal-500/60 py-2.5' : 'border-l-0'), !dense && (presentation === 'COMPACT_LIST' ? 'px-3 py-2' : isCoverageGapItem || isPlantCareList ? 'px-3.5 py-2.5' : isOwnershipCostList || isServicePriceRadarList ? 'px-3 py-2.5' : 'p-3'), selected ? 'border-teal-600 bg-teal-50' : !dense && (isConfirmedGapItem || isPlantCareNowItem ? 'border-rose-200/85 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-50/35 via-white to-white shadow-2xs' : isUnclearGapItem || isPlantCareSoonItem ? 'border-amber-200/85 border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/35 via-white to-white shadow-2xs' : isPlantCareRoutineItem ? 'border-emerald-200/85 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50/30 via-white to-white shadow-2xs' : isEvidenceGapItem ? 'border-slate-200/90 border-l-4 border-l-sky-500 bg-slate-50/50' : presentation === 'COMPACT_LIST' ? 'border-transparent bg-white' : isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList ? 'border-slate-200/80 bg-slate-50/55' : 'border-transparent bg-slate-50'))}>
                    {dense ? <div className={cn('flex flex-col gap-1.5', !homeWorkItemList && 'sm:flex-row sm:items-center sm:justify-between sm:gap-3')} data-dense-row-content="">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2" data-dense-primary-line="">
                          {item.href ? <AskContextLink className="font-medium text-slate-950 hover:text-teal-700" href={item.href}>{item.title}</AskContextLink> : <p className={cn('font-medium text-slate-950', sellHoldRentDriversList && 'font-semibold')}>{item.title}</p>}
                          {item.description && <p className="text-xs leading-5 text-slate-600">{item.description}</p>}
                        </div>
                        {item.meta.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-500" title={item.meta.join(' · ')}>{item.meta.join(' · ')}</p>}
                      </div>
                      {(visibleStatus || overdueWorkItem || inlineDenseActions.length > 0) && <div className={cn('flex shrink-0 items-center gap-1.5', homeWorkItemList && 'w-full flex-wrap')}>
                        {overdueWorkItem && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">Overdue</span>}
                        {impactLevel && (
                          <span aria-hidden="true" className="inline-flex items-end gap-0.5 px-1">
                            <span className={cn('h-2 w-1 rounded-xs', impactLevel === 'HIGH' ? 'bg-amber-500' : impactLevel === 'MEDIUM' ? 'bg-teal-500' : 'bg-slate-400')} />
                            <span className={cn('h-3 w-1 rounded-xs', impactLevel === 'HIGH' ? 'bg-amber-500' : impactLevel === 'MEDIUM' ? 'bg-teal-500' : 'bg-slate-200')} />
                            <span className={cn('h-4 w-1 rounded-xs', impactLevel === 'HIGH' ? 'bg-amber-500' : 'bg-slate-200')} />
                          </span>
                        )}
                        {visibleStatus && <span data-item-status={visibleStatus.toLowerCase()} className={cn('rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide', impactLevel === 'HIGH' ? 'border border-amber-200 bg-amber-100/80 text-amber-900' : impactLevel === 'MEDIUM' ? 'border border-teal-200 bg-teal-50 text-teal-800' : impactLevel === 'LOW' ? 'border border-slate-200 bg-slate-100 text-slate-600' : 'bg-white text-slate-500')}>{visibleStatus}</span>}
                        {inlineDenseActions.length > 0 && <div className={cn('flex items-center gap-1.5', homeWorkItemList && 'mt-1 basis-full border-t border-slate-100 pt-2')} data-home-work-item-actions={homeWorkItemList ? '' : undefined}>
                          {inlineDenseActions.map((itemAction) => <button key={itemAction.id} type="button" disabled={itemActionsDisabled} onClick={() => onItemAction(item.entityType, item.id, itemAction.message, itemAction.operationId, itemAction.interactionType)} className={cn('min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50', itemAction.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>{itemAction.label}</button>)}
                          {overflowDenseActions.length > 0 && <details className="relative">
                            <summary className="flex min-h-8 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">More</summary>
                            <div className="absolute right-0 z-10 mt-1 min-w-36 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                              {overflowDenseActions.map((itemAction) => <button key={itemAction.id} type="button" disabled={itemActionsDisabled} onClick={() => onItemAction(item.entityType, item.id, itemAction.message, itemAction.operationId, itemAction.interactionType)} className="block min-h-8 w-full rounded-md px-2.5 py-1 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{itemAction.label}</button>)}
                            </div>
                          </details>}
                        </div>}
                      </div>}
                    </div> : <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.href ? <AskContextLink className={cn('font-medium text-slate-950 hover:text-teal-700', (isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList) && 'text-xs font-bold sm:text-sm')} href={item.href}>{item.title}</AskContextLink> : <p className={cn('font-medium text-slate-950', (isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList) && 'text-xs font-bold sm:text-sm')}>{item.title}</p>}
                          {coverageLocationMeta && (
                            <span aria-hidden="true" className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              {coverageLocationMeta}
                            </span>
                          )}
                        </div>
                        {item.description && <p className={cn('text-slate-600', isOwnershipCostList || isServicePriceRadarList || isCoverageGroupsList || isPlantCareList ? 'mt-0.5 text-xs leading-5' : 'mt-1 text-sm leading-5')}>{item.description}</p>}
                        {isServicePriceRadarList && (quoteMeta || expectedMeta) && (
                          <div aria-hidden="true" className="mt-1.5 flex flex-wrap items-center gap-2">
                            {quoteMeta && (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-900">
                                {quoteMeta}
                              </span>
                            )}
                            {expectedMeta && (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-teal-200/80 bg-teal-50/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-teal-900">
                                {expectedMeta}
                              </span>
                            )}
                          </div>
                        )}
                        {(isCoverageGapItem || isPlantCareList) && item.meta.length > 0 && (
                          <div aria-hidden="true" className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', isConfirmedGapItem && 'sm:flex-nowrap')} data-coverage-item-meta={isCoverageGapItem ? '' : undefined}>
                            {coverageExposureMeta && (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums',
                                  isConfirmedGapItem
                                    ? 'border-rose-200/80 bg-rose-50/80 text-rose-900'
                                    : 'border-slate-200 bg-white text-slate-800',
                                )}
                              >
                                {coverageExposureMeta}
                              </span>
                            )}
                            {coverageOtherMeta.map((metaItem) => (
                              <span
                                key={metaItem}
                                className={cn(
                                  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                                  /no linked policy/i.test(metaItem)
                                    ? 'border-rose-200/70 bg-rose-50/50 text-rose-800'
                                    : /^expires|^expired|^check every/i.test(metaItem)
                                      ? 'border-teal-200/70 bg-teal-50/50 text-teal-900'
                                      : 'border-slate-200/80 bg-white text-slate-600',
                                )}
                              >
                                {metaItem}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.meta.length > 0 && <p className={cn('text-xs text-slate-500', isCoverageGapItem || isPlantCareList ? 'sr-only' : isOwnershipCostList || isServicePriceRadarList ? 'mt-1' : 'mt-2')}>{item.meta.join(' · ')}</p>}
                      </div>
                      {item.status && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', isConfirmedGapItem || isPlantCareNowItem ? 'border border-rose-200 bg-rose-50 text-rose-800' : isUnclearGapItem || isPlantCareSoonItem ? 'border border-amber-200 bg-amber-50 text-amber-800' : isPlantCareRoutineItem ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : isEvidenceGapItem ? 'border border-sky-200 bg-sky-50 text-sky-800' : item.tone === 'CAUTION' ? 'border border-amber-200 bg-amber-50 text-amber-800' : item.tone === 'POSITIVE' ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-slate-200 bg-white text-slate-600')}>{item.status.replace(/_/g, ' ')}</span>}
                    </div>}
                    {hasInlineDetails && (
                      <div className="mt-2">
                        <button
                          type="button"
                          aria-expanded={itemDetailsExpanded}
                          aria-controls={`${block.id}-${section.id}-${item.id}-details`}
                          onClick={() => setExpandedItems((current) => ({ ...current, [detailKey]: !itemDetailsExpanded }))}
                          className="min-h-8 text-xs font-semibold text-teal-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          {itemDetailsExpanded ? `Hide ${block.id === NEGOTIATION_DRAFT_BLOCK_ID ? 'the draft' : 'details'}` : `${block.id === NEGOTIATION_DRAFT_BLOCK_ID ? 'Show the draft' : 'View details'}`}
                          <span className="sr-only"> for {item.title}</span>
                        </button>
                        {itemDetailsExpanded && <p id={`${block.id}-${section.id}-${item.id}-details`} className="whitespace-pre-line rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">{item.detail}</p>}
                      </div>
                    )}
                    {!dense && block.id !== 'project-detail-records' && !isEvidenceGapItem && item.actions && item.actions.length > 0 && (
                      <ItemActionRow item={item} disabled={itemActionsDisabled} onItemAction={onItemAction} />
                    )}
                    {isEvidenceGapItem && item.entityType === 'INVENTORY_ITEM' && item.actions !== undefined && (
                      <div className="mt-2 flex flex-wrap items-center gap-2" data-coverage-item-actions="">
                        {item.actions.length > 0 && <ItemActionRow item={item} disabled={itemActionsDisabled} onItemAction={onItemAction} className="mt-0" />}
                        <AttachEvidenceControl
                          event={{ entityType: item.entityType, id: item.id, title: item.title }}
                          propertyId={propertyId}
                          disabled={itemActionsDisabled}
                          label="Add evidence"
                          className="mt-0"
                          onAttached={(documentId) => onItemAction(item.entityType, item.id, EVIDENCE_ATTACH_MESSAGES.INVENTORY_ITEM, 'CAPTURE_EVIDENCE_CONFIRM', 'MUTATE_RECORD', documentId)}
                        />
                      </div>
                    )}
                    {dominantProjectAction && (
                      <div className="mt-3 flex items-center gap-2" data-project-record-actions="">
                        <button type="button" disabled={itemActionsDisabled} onClick={() => onItemAction(item.entityType, item.id, dominantProjectAction.message, dominantProjectAction.operationId, dominantProjectAction.interactionType)} className={cn('min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50', dominantProjectAction.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>{dominantProjectAction.label}</button>
                        {overflowProjectActions.length > 0 && <details className="relative">
                          <summary className="flex min-h-8 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">More actions</summary>
                          <div className="absolute right-0 z-10 mt-1 min-w-40 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                            {overflowProjectActions.map((itemAction) => <button key={itemAction.id} type="button" disabled={itemActionsDisabled} onClick={() => onItemAction(item.entityType, item.id, itemAction.message, itemAction.operationId, itemAction.interactionType)} className="block min-h-8 w-full rounded-md px-2.5 py-1 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{itemAction.label}</button>)}
                          </div>
                        </details>}
                      </div>
                    )}
                  </li>;
                })}
              </AskCollection>
            )}
            {canExpand && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpandedSections((current) => ({ ...current, [section.id]: !expanded }))}
                className="mt-3 inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                {expanded ? 'Show fewer' : `Show ${hiddenItemCount} more`}
              </button>
            )}
            {/* Presentation Quality 5: keyed on the section's own declared window, not on one block id. Blocks with their own list component never reach this renderer. */}
            {section.offset !== undefined && (section.offset > 0 || sectionHasNextPage(block, section)) && (
              <div className="mt-3 flex gap-2">
                {section.offset > 0 && <button type="button" disabled={itemActionsDisabled} onClick={() => onCollectionPage(section.id, 'PREVIOUS')} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Previous page<span className="sr-only"> of {section.title}</span></button>}
                {sectionHasNextPage(block, section) && <button type="button" disabled={itemActionsDisabled} onClick={() => onCollectionPage(section.id, 'NEXT')} className="min-h-9 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Next page<span className="sr-only"> of {section.title}</span></button>}
              </div>
            )}
            {section.offset === undefined && section.count > section.items.length && (
              block.actions[0]?.href
                ? <AskContextLink href={block.actions[0].href} className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline">+{section.count - section.items.length} more · {block.actions[0].label}</AskContextLink>
                : <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more not shown here.</p>
            )}
          </div>
          );
        })}
      </div>
      <CollectionStatusNote collection={block.collection} />
      {block.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          {block.actions.map((action) => <ActionLink key={action.id} action={action} />)}
        </div>
      )}
    </section>
  );
}

// Bespoke rendering exceptions in the registry include the Home Continuity Plan's compact section workspace and a
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

// Presentation Quality 2A: specialized list renderers do not draw the shared "Showing X of Y." note themselves, so it is added once here.
function withCollectionNote<P extends { block: { collection?: AskCollectionDescriptor } }>(Component: ComponentType<P>) {
  return function NotedList(props: P) {
    return <><Component {...props} /><CollectionStatusNote collection={props.block.collection} /></>;
  };
}
const NotedMaintenanceResultList = withCollectionNote(MaintenanceResultList);
const NotedRoomResultList = withCollectionNote(RoomResultList);
const NotedInventoryResultList = withCollectionNote(InventoryResultList);
const NotedHomeEventResultList = withCollectionNote(HomeEventResultList);
const NotedDocumentResultList = withCollectionNote(DocumentResultList);
const NotedHouseholdResultList = withCollectionNote(HouseholdResultList);
const NotedWarrantyResultList = withCollectionNote(WarrantyResultList);
const NotedMaterialSpecResultList = withCollectionNote(MaterialSpecResultList);
const NotedReserveAllocationResultList = withCollectionNote(ReserveAllocationResultList);
const NotedBuyerTaskResultList = withCollectionNote(BuyerTaskResultList);
const NotedClaimResultList = withCollectionNote(ClaimResultList);
const NotedSeasonalPlanResultList = withCollectionNote(SeasonalPlanResultList);
const NotedInspectionFindingResultList = withCollectionNote(InspectionFindingResultList);
const NotedSellerPrepItemResultList = withCollectionNote(SellerPrepItemResultList);

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
  if (props.block.id === 'financing-numbers') return <FinancingNumbers block={props.block} propertyId={props.propertyId} />;
  if (props.block.id === 'financing-planner') return <FinancingPlanner block={props.block} propertyId={props.propertyId} />;
  if (props.block.id === 'financing-options') return <FinancingOptions block={props.block} />;
  if (props.block.id === 'financing-scenarios') return <FinancingScenarios block={props.block} propertyId={props.propertyId} />;
  // The Property Brief preview is one exact recipient snapshot: a fixed fact sheet, never the Auto/List/Cards chooser.
  if (props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.sections) return <PropertyBriefFactSheet {...props} />;
  if (props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.shares) return <PropertyBriefSharePanel {...props} />;
  if (props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.listItems) return <PropertyBriefsListBlock {...props} />;
  // The guided-journey list opens a journey in this same card (see GuidanceJourneyList).
  if (props.block.id === GUIDANCE_JOURNEY_LIST_ID) return <GuidanceJourneyListView props={props} renderList={(onItemAction) => <GenericGroupedListBlock {...props} onItemAction={onItemAction} />} />;
  if (props.block.id === 'property-record-index') return <HomeRecordOverviewBlock {...props} />;
  if (props.block.id === 'digital-will-items') {
    return <HomeContinuityPlanResultList block={props.block} propertyId={props.propertyId} disabled={props.itemActionsDisabled} onAction={props.onItemAction} />;
  }
  if (props.block.id === 'room-plant-recommendations' || props.block.id === 'previous-room-plant-recommendations') {
    return <PlantRecommendationResultList block={props.block} disabled={props.itemActionsDisabled} onAction={props.onItemAction} />;
  }
  // Maintenance keeps its own component in both layouts, so its live-record detail, paging and selection are the
  // same whichever the homeowner chooses. The pattern still comes only from the server's declaration.
  if (props.block.id === 'maintenance-groups') {
    const { block, propertyId, itemActionsDisabled, onFilterClick, onCollectionPage, onItemAction, onWorkspaceExecutionComplete, onAccessLost } = props;
    const declaresShelves = block.presentation?.pattern === 'SHELVES';
    return <NotedMaintenanceResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onPage={onCollectionPage} onAction={onItemAction} onExecutionComplete={onWorkspaceExecutionComplete} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'SHELVES' ? 'SHELVES' : 'LIST'}
      onChooseLayout={declaresShelves && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  if (props.block.id === 'maintenance-forecast-items') {
    return <MaintenanceForecastResultList block={props.block} />;
  }
  // Rooms keep their own component in both layouts too, so the live room detail and its corrections stay (FRD v1.79).
  if (props.block.id === 'property-rooms') {
    const { block, propertyId, itemActionsDisabled, onItemAction, onAccessLost } = props;
    const declaresMap = block.presentation?.pattern === 'ROOM_MAP';
    return <NotedRoomResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'ROOM_MAP' ? 'MAP' : 'LIST'}
      onChooseLayout={declaresMap && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  // The seasonal home-care plan is a read-only, numbered "do soon / can wait" list in both layouts; its next steps are the answer's own actions.
  if (FACT_SHEET_BLOCK_IDS.has(props.block.id)) return <FactSheetResultList block={props.block} />;
  if (PLAN_LAYOUT_BLOCK_IDS.has(props.block.id)) return <NotedSeasonalPlanResultList block={props.block} onItemAction={props.onItemAction} disabled={props.itemActionsDisabled} />;
  if (props.block.id === 'inspection-findings') {
    const { block, propertyId, itemActionsDisabled, onItemAction, onAccessLost, onBatchItemAction } = props;
    const declaresDeck = block.presentation?.pattern === 'DECK';
    return <NotedInspectionFindingResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
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
    return <NotedSellerPrepItemResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
      layout={decision.pattern === 'SHELVES' ? 'SHELVES' : 'LIST'}
      onChooseLayout={declaresShelves && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />;
  }
  // Home Event Radar keeps its own component in both layouts, so the filters and the live event detail stay (FRD v1.92).
  if (props.block.id === 'home-event-radar-feed') {
    const { block, propertyId, itemActionsDisabled, onFilterClick, onItemAction, onAccessLost } = props;
    const declaresDeck = block.presentation?.pattern === 'DECK';
    return <>
      <RadarEventResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
        link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>}
        deck={decision.pattern === 'DECK' ? { swipeRightActionId: decision.swipeRightActionId, swipeLeftActionId: decision.swipeLeftActionId } : null}
        onChooseLayout={declaresDeck && decision.offersChoice && controls ? (layout) => setPreference(layout === 'LIST' ? 'LIST' : 'AUTO') : undefined} />
      <CollectionStatusNote collection={block.collection} />
    </>;
  }
  if (decision.pattern) {
    const { block, itemActionsDisabled, onFilterClick, onItemAction, onBatchItemAction } = props;
    return (
      <PatternFrame title={block.title} description={block.description} pattern={decision.pattern.toLowerCase()} patternLabel={PATTERN_LABELS[decision.pattern]}
        onChooseList={decision.offersChoice && controls ? () => setPreference('LIST') : undefined} filters={block.filters} onFilterClick={onFilterClick}
        disabled={itemActionsDisabled} actions={block.actions}>
        {decision.pattern === 'CHOICE_GRID' && <ChoiceGridView sections={block.sections} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
        {decision.pattern === 'BUDGET_BREAKDOWN' && <BudgetBreakdownView sections={block.sections} presentation={block.presentation?.pattern === 'BUDGET_BREAKDOWN' ? block.presentation : undefined} />}
        {decision.pattern === 'STATUS_ACCORDION' && <StatusAccordionView sections={block.sections} collection={block.collection} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
        {decision.pattern === 'SHELVES' && <ShelvesView sections={block.sections} moreAction={block.actions[0]} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
        {decision.pattern === 'DECK' && <CardDeckView items={groupedListItems(block)} swipeRightActionId={decision.swipeRightActionId} swipeLeftActionId={decision.swipeLeftActionId} onItemAction={onItemAction} disabled={itemActionsDisabled}
          batch={decision.batch} onBatch={decision.batch && onBatchItemAction ? (decisions) => onBatchItemAction({ operationId: decision.batch!.operationId, entityType: decision.batch!.entityType, message: decision.batch!.message, decisions }) : undefined} />}
        {decision.pattern === 'ROOM_MAP' && <RoomMapView items={groupedListItems(block)} onItemAction={onItemAction} disabled={itemActionsDisabled} />}
        {decision.pattern !== 'STATUS_ACCORDION' && <CollectionStatusNote collection={block.collection} />}
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
    return <NotedInventoryResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (HOME_EVENT_DETAIL_BLOCK_IDS.has(block.id)) {
    return <NotedHomeEventResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-rooms') {
    return <NotedRoomResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'document-lookup-groups' || block.id === 'property-documents') {
    return <NotedDocumentResultList block={block} propertyId={propertyId} onFilter={onFilterClick} onPage={onCollectionPage} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  if (block.id === 'property-household') {
    return <NotedHouseholdResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // 'material-specs-items' is the MATERIAL_SPECS_LIST answer (FRD v1.390): compact rows, inline canonical detail, Edit material in its Manage region.
  if (block.id === 'material-specs-items') {
    return <NotedMaterialSpecResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onAccessLost={onAccessLost} />;
  }
  // 'warranty-results' is the WARRANTY_LOOKUP answer (Warranties W-1); 'property-warranties' is the Property Summary section. Same rows, same detail.
  if (block.id === 'property-warranties' || block.id === 'warranty-results') {
    return <NotedWarrantyResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Home Capital Timeline reference journey (FRD Appendix D), first inline-detail slice: reserve-allocations'
  // line items get canonical detail the same way every other read-only Property Records collection does.
  // capital-timeline-table (a TABLE block, not GROUPED_LIST) got its own row-click-to-detail platform
  // capability separately -- see ./TableBlock.tsx, not this file.
  if (block.id === 'reserve-allocations') {
    return <NotedReserveAllocationResultList block={block} propertyId={propertyId} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Buyer-closing capability-card slice (FRD v1.46): blocking tasks open inline, with Mark complete while open.
  if (block.id === 'buyer-deadlines-list') {
    return <NotedBuyerTaskResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onFilter={onFilterClick} onAction={onItemAction} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  // Inspection-hub capability-card slice (FRD v1.43): findings open inline, re-read through their report.
  // Claims capability-card slice (FRD v1.42): claim rows open the canonical claim inline, with its legal status
  // changes as declared CLAIM_TRANSITION actions; incident rows keep their link.
  if (block.id === 'incident-claim-list') {
    return <NotedClaimResultList block={block} propertyId={propertyId} disabled={itemActionsDisabled} onAction={onItemAction} onFilter={onFilterClick} onAccessLost={onAccessLost}
      link={(href, label) => <AskContextLink href={href}>{label}</AskContextLink>} />;
  }
  return <GenericGroupedListBlock {...props} />;
};
