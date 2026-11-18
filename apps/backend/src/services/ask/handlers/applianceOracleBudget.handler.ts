// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { sourceRef, withSources } from '../composition/sourceAuthorization';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { applianceOracleService } from '../../applianceOracle.service';
import { budgetForecasterService } from '../../budgetForecaster.service';
import { getAskPropertyTimezone } from '../askExecutionContext';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, type SuggestedNextActionCandidate } from '../suggestedActions/suggestedNextActionCandidate';
import { singleGreaterThanAmountCents } from '../semantic/amountComparison';
import { prisma } from '../../../lib/prisma';
import { APPLIANCE_FILTER_PHRASES } from '../support/applianceFilterPhrases';

// Appliance Oracle and Budget Planner (FRD v1.70, product decision option A for the Gemini-backed tools): Ask shows only
// the calculated part of each page, with the services' Gemini recommendations switched off, and links to the page for the
// AI picks. Both services only admit the primary homeowner profile (plain Errors, 500s on the pages); Ask uses the OWNER
// floor and says who can see them. Oracle leaves out appliances with no recorded age and the page then reads "No
// Appliance Data"; Ask says how many were left out. Budget assumes a 10-year-old home when the year built is missing;
// Ask says so. Read-only.
type OracleReportView = Awaited<ReturnType<typeof applianceOracleService.generateOracleReport>>;
type BudgetForecastView = Awaited<ReturnType<typeof budgetForecasterService.generateBudgetForecast>>;
const wholeDollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

// "OVEN_RANGE" (the inventory's canonical appliance type) reads as "Oven range"; a recorded name is kept as written.
export function oracleApplianceLabel(name: string): string {
  return /^[A-Z0-9_]+$/.test(name) ? name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, ' ') : name;
}

// FRD v1.78 (homeowner decision): the bar's label and colour follow the Oracle's own risk level, so Ask never disagrees
// with the page; the bar itself shows where the age sits in the typical range.
const ORACLE_LIFESPAN_STATUS = {
  CRITICAL: ['PAST_RANGE', 'Critical'], HIGH: ['PLAN_AHEAD', 'High'], MEDIUM: ['PLAN_AHEAD', 'Medium'], LOW: ['WITHIN_RANGE', 'Low'],
} as const;

export function oracleLifespanItem(prediction: OracleReportView['predictions'][number], index: number) {
  const [status, level] = ORACLE_LIFESPAN_STATUS[prediction.urgency];
  const range = prediction.typicalLifeYears ?? { min: prediction.expectedLife, max: prediction.expectedLife };
  return {
    id: prediction.inventoryItemId ?? `appliance-${index}`,
    label: oracleApplianceLabel(prediction.applianceName),
    ageYears: Math.min(200, Math.max(0, prediction.currentAge)),
    typicalLifeYears: range,
    status,
    statusLabel: `${level} · ${prediction.failureRisk}% failure risk`,
    ...(prediction.inventoryItemId ? { entityType: 'INVENTORY_ITEM' } : {}),
    // Every appliance row gets its own onward path (entity-scoped, so it is never the generic "which system?" prompt);
    // the riskier ones lead with it.
    ...(prediction.inventoryItemId ? { actions: [{
      id: 'review-replacement', label: 'Review replacement options', message: `Should I repair or replace my ${oracleApplianceLabel(prediction.applianceName).slice(0, 80)}?`,
      style: (prediction.urgency === 'CRITICAL' || prediction.urgency === 'HIGH' ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
      interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'REPLACEMENT_GUIDANCE', outcomeKey: 'REVIEW_REPLACEMENT', entityType: 'INVENTORY_ITEM', entityId: prediction.inventoryItemId,
    }] } : {}),
    meta: [
      prediction.remainingLife > 0 ? `About ${prediction.remainingLife} year${prediction.remainingLife === 1 ? '' : 's'} left, around ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: getAskPropertyTimezone() }).format(new Date(prediction.estimatedFailureDate))}` : 'Past its expected life',
      `Replacement about ${wholeDollars(prediction.replacementCost)}`,
      prediction.maintenanceImpact,
    ].filter((value) => value.length <= 80),
  };
}

// REPLACEMENT_GUIDANCE targets one inventory item, so the generic "repair or replace a major system" prompt is always
// rejected by Suggested Next Actions (ENTITY_REQUIRED). The continuation names the highest-risk appliance instead; when
// nothing is at CRITICAL or HIGH risk there is nothing to replace and the other continuations carry the answer.
export function applianceReplacementCandidates(report: OracleReportView, propertyId: string): SuggestedNextActionCandidate[] {
  const riskiest = report.predictions
    .filter((prediction) => prediction.inventoryItemId && (prediction.urgency === 'CRITICAL' || prediction.urgency === 'HIGH'))
    .sort((a, b) => b.failureRisk - a.failureRisk)[0];
  if (!riskiest?.inventoryItemId) return [];
  const label = oracleApplianceLabel(riskiest.applianceName);
  const shortLabel = (label.length > 40 ? `${label.slice(0, 39)}…` : label).toLowerCase();
  return [{
    source: 'OPERATION_RESULT', sourceOperationId: 'APPLIANCE_FAILURE_RISK',
    label: `Review ${shortLabel} replacement options`, message: `Should I repair or replace my ${label.slice(0, 80)}?`,
    operationId: 'REPLACEMENT_GUIDANCE', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'REVIEW_REPLACEMENT',
    entityContext: { propertyId, entityType: 'INVENTORY_ITEM', entityId: riskiest.inventoryItemId, contextVersion: null },
    tier: 'CONTINUE', slotClass: 'CONTINUE_WORK', requiredFacts: [], reasonCodes: ['APPLIANCE_RISK_REVIEW_REPLACEMENT'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, currentResultOwnership: true, sourceConfidence: 1 }, traits: { ...DEFAULT_CANDIDATE_TRAITS },
  }];
}

/** What a narrowed Oracle question asks for. `missingDocumentItemIds` is the set of inventory items with NO document on file (computed by the caller); an appliance with no inventory link cannot be checked and is not matched. */
export interface ApplianceFailureRiskFilter { readonly replacementCostOverCents: number | null; readonly highRiskOnly: boolean; readonly missingDocumentItemIds?: ReadonlySet<string> }
export { APPLIANCE_FILTER_PHRASES };
function applianceFilterParts(filter: ApplianceFailureRiskFilter): string[] {
  return [
    ...(filter.highRiskOnly ? [APPLIANCE_FILTER_PHRASES.risk] : []),
    ...(filter.replacementCostOverCents !== null ? [`an estimated ${APPLIANCE_FILTER_PHRASES.cost} ${wholeDollars(filter.replacementCostOverCents / 100)}`] : []),
    ...(filter.missingDocumentItemIds ? [APPLIANCE_FILTER_PHRASES.documents] : []),
  ];
}
const isLegacyCostRiskFilter = (filter: ApplianceFailureRiskFilter): boolean => filter.highRiskOnly && filter.replacementCostOverCents !== null && !filter.missingDocumentItemIds;

export function applianceFailureRiskFromView(report: OracleReportView | 'PRIMARY_OWNER_ONLY', propertyId: string, filter?: ApplianceFailureRiskFilter): AskOperationResult {
  if (report === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'APPLIANCE_ORACLE_PRIMARY_OWNER_ONLY',
      blocks: [{ type: 'SUMMARY', id: 'appliance-oracle-summary', title: 'Only the home\'s primary owner can see the appliance oracle', body: 'Appliance Oracle is kept for the home\'s primary account holder, so it can\'t be shown here.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  let unlinkedForDocuments = 0;
  if (filter) {
    const noDocuments = filter.missingDocumentItemIds;
    unlinkedForDocuments = noDocuments ? report.predictions.filter((prediction) => !prediction.inventoryItemId).length : 0;
    const predictions = report.predictions.filter((prediction) =>
      (filter.replacementCostOverCents === null || prediction.replacementCost * 100 > filter.replacementCostOverCents)
      && (!filter.highRiskOnly || prediction.urgency === 'HIGH' || prediction.urgency === 'CRITICAL')
      && (!noDocuments || (prediction.inventoryItemId != null && noDocuments.has(prediction.inventoryItemId)))
    );
    report = {
      ...report,
      predictions,
      totalAppliances: predictions.length,
      criticalCount: predictions.filter((prediction) => prediction.urgency === 'CRITICAL').length,
      highRiskCount: predictions.filter((prediction) => prediction.urgency === 'HIGH').length,
      estimatedTotalCost: predictions.reduce((sum, prediction) => sum + prediction.replacementCost, 0),
      appliancesWithoutAge: 0,
      appliancesWithoutAgeItems: [],
    };
  }
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'appliance-oracle-boundary', title: 'An educational estimate by age',
    body: `Risk comes from each appliance's age against a typical lifespan, not an inspection. ${report.meta.disclaimer}`,
    severity: 'INFO', suggestions: [],
  };
  const skipped = report.appliancesWithoutAge ?? 0;
  // IW-PRES-018 (FRD v1.78): appliances with no age are named with an inline "Add purchase date" capture (the Oracle
  // reads age from the purchase date) through the existing inventory correction and its confirmation. A report that
  // does not name them keeps the count-only notice.
  const missing = (report.appliancesWithoutAgeItems ?? []).filter((item): item is { inventoryItemId: string; applianceName: string } => Boolean(item.inventoryItemId));
  const skippedBlock: AskPresentationBlock | null = skipped && missing.length < skipped
    ? { type: 'LIMITATION', id: 'appliance-oracle-skipped', title: `${skipped} appliance${skipped === 1 ? '' : 's'} left out`, body: `${skipped === 1 ? 'It has' : 'They have'} no purchase date recorded, so no failure risk can be worked out. Add the purchase date in the inventory to include ${skipped === 1 ? 'it' : 'them'}.`, severity: 'INFO' }
    : null;
  const lifespan = (items: OracleReportView['predictions']): AskPresentationBlock => {
    const shownPredictions = items.slice(0, 50);
    const shownMissing = missing.slice(0, 20);
    const sections = [{ items: shownPredictions }, { items: shownMissing }];
    return ({
    type: 'LIFESPAN', id: 'appliance-oracle-items', title: 'Appliance lifespans',
    description: 'Each bar shows the appliance\'s age against its typical life. The label is the Appliance Oracle\'s own failure-risk level.',
    basis: 'An estimate from each appliance\'s purchase date and a typical lifespan for its type, not an inspection.',
    items: shownPredictions.map((prediction, index) => oracleLifespanItem(prediction, index)),
    missingAge: shownMissing.map((item) => ({
      id: item.inventoryItemId, label: oracleApplianceLabel(item.applianceName), entityType: 'INVENTORY_ITEM',
      actions: [{ id: 'correct-purchasedOn', label: 'Add purchase date', message: 'Correct the purchase date of this inventory item.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_PURCHASE_DATE' }],
    })),
    missingAgeTitle: missing.length ? `No purchase date yet for ${missing.length === 1 ? 'this appliance' : `these ${missing.length} appliances`}` : null,
    collection: collectionDescriptor({
      sourceTotal: report.predictions.length + skipped,
      fetchedCount: report.predictions.length + skipped,
      sections,
      nextPageAvailable: false,
    }),
  });
  };
  if (!report.predictions.length) {
    return {
      status: 'ANSWERED', reasonCode: 'APPLIANCE_ORACLE_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'appliance-oracle-summary', title: filter ? 'No appliances match those filters' : skipped ? 'No appliance ages recorded yet' : 'No appliances recorded yet',
        body: filter
          ? (isLegacyCostRiskFilter(filter) ? `No high- or critical-risk appliance has an estimated replacement cost over ${wholeDollars((filter.replacementCostOverCents as number) / 100)}.` : `No appliance has ${applianceFilterParts(filter).join(' and ')}.`)
          : skipped
          ? 'Appliance Oracle estimates failure risk from each appliance\'s age. Add a purchase date below to include an appliance.'
          : 'Appliance Oracle estimates failure risk from each appliance\'s age. Add appliances with their purchase date to the inventory to see it.',
        tone: 'DEFAULT', actions: [],
      }, ...(missing.length ? [lifespan([])] : []), ...(skippedBlock ? [skippedBlock] : []), boundary],
      suggestions: [],
    };
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'appliance-oracle-summary',
    title: filter ? `${report.totalAppliances} appliance${report.totalAppliances === 1 ? '' : 's'} match` : `${report.totalAppliances} appliance${report.totalAppliances === 1 ? '' : 's'} analysed`,
    body: [
      filter
        ? (isLegacyCostRiskFilter(filter) ? `High or critical failure risk, with estimated replacement cost over ${wholeDollars((filter.replacementCostOverCents as number) / 100)}.` : `Appliances with ${applianceFilterParts(filter).join(' and ')}.`)
        : `${report.criticalCount} critical and ${report.highRiskCount} high risk.`,
      unlinkedForDocuments ? `${unlinkedForDocuments} appliance${unlinkedForDocuments === 1 ? ' has' : 's have'} no inventory record linked, so documents could not be checked for ${unlinkedForDocuments === 1 ? 'it' : 'them'}.` : null,
      report.criticalCount + report.highRiskCount ? `Replacing those would cost an estimated ${wholeDollars(report.estimatedTotalCost)}.` : null,
      'Replacement model suggestions are not currently available in Ask.',
    ].filter(Boolean).join(' '),
    tone: report.criticalCount + report.highRiskCount ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }];
  if (skippedBlock) blocks.push(skippedBlock);
  blocks.push(lifespan(report.predictions), boundary);
  const suggestedNextActionCandidates = applianceReplacementCandidates(report, propertyId);
  return { status: 'ANSWERED', reasonCode: 'APPLIANCE_ORACLE_READY', blocks, suggestions: [], ...(suggestedNextActionCandidates.length ? { suggestedNextActionCandidates } : {}) };
}

// "Missing documents" for an appliance: no document of any kind is linked to its inventory record, directly or through one of its warranties. The summary says so.
const APPLIANCE_HIGH_RISK = /\b(?:high|critical)\s+(?:failure\s+)?risk\b/i;
const APPLIANCE_MISSING_DOCUMENTS = /\b(?:missing|without|no|lacking|lack)\b.{0,25}\b(?:documents?|documentation|paperwork)\b|\b(?:documents?|paperwork)\b.{0,15}\bmissing\b/i;
export const askedHighRisk = (message: string): boolean => APPLIANCE_HIGH_RISK.test(message);
export const askedMissingDocuments = (message: string): boolean => APPLIANCE_MISSING_DOCUMENTS.test(message);

/** Inventory items (of those given) that have no linked document. Pure given the rows; the query is scoped to the property's own item ids. */
export async function inventoryItemsWithoutDocuments(itemIds: readonly string[]): Promise<Set<string>> {
  if (!itemIds.length) return new Set();
  const documents = await prisma.document.findMany({
    where: { deletedAt: null, OR: [{ inventoryItemId: { in: [...itemIds] } }, { warranty: { inventoryItemId: { in: [...itemIds] } } }] },
    select: { inventoryItemId: true, warranty: { select: { inventoryItemId: true } } },
  });
  const documented = new Set<string>();
  for (const document of documents) {
    if (document.inventoryItemId) documented.add(document.inventoryItemId);
    if (document.warranty?.inventoryItemId) documented.add(document.warranty.inventoryItemId);
  }
  return new Set(itemIds.filter((id) => !documented.has(id)));
}

async function applianceFailureRiskResult(propertyId: string, userId: string, message: string): Promise<AskOperationResult> {
  try {
    const amount = singleGreaterThanAmountCents(message);
    const highRisk = askedHighRisk(message);
    const missingDocuments = askedMissingDocuments(message);
    const report = await applianceOracleService.generateOracleReport(propertyId, userId, { includeRecommendations: false });
    if (!highRisk && !missingDocuments) return applianceFailureRiskFromView(report, propertyId);
    // The old rule (a cost ceiling together with high risk) is unchanged; a cost ceiling alone never narrowed the answer and still does not.
    const filter: ApplianceFailureRiskFilter = {
      replacementCostOverCents: amount,
      highRiskOnly: highRisk,
      ...(missingDocuments ? { missingDocumentItemIds: await inventoryItemsWithoutDocuments(report.predictions.map((prediction) => prediction.inventoryItemId).filter((id): id is string => Boolean(id))) } : {}),
    };
    return applianceFailureRiskFromView(report, propertyId, filter);
  } catch (error) {
    if (error instanceof Error && error.message === 'Property not found or access denied') return applianceFailureRiskFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

export function maintenanceBudgetFromView(forecast: BudgetForecastView | 'PRIMARY_OWNER_ONLY', propertyId: string): AskOperationResult {
  if (forecast === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'BUDGET_PLANNER_PRIMARY_OWNER_ONLY',
      blocks: [{ type: 'SUMMARY', id: 'budget-forecast-summary', title: 'Only the home\'s primary owner can see the budget planner', body: 'Budget Planner is kept for the home\'s primary account holder, so it can\'t be shown here.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const busiest = [...forecast.monthlyForecasts].sort((a, b) => b.total - a.total)[0];
  const annualMix = [
    ['Routine', forecast.monthlyForecasts.reduce((sum, month) => sum + month.routine, 0)],
    ['Preventive', forecast.monthlyForecasts.reduce((sum, month) => sum + month.preventive, 0)],
    ['Unexpected', forecast.monthlyForecasts.reduce((sum, month) => sum + month.unexpected, 0)],
  ] as const;
  const categoriesByCost = [...forecast.categoryBreakdowns].sort((a, b) => b.annualCost - a.annualCost);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'budget-forecast-summary',
    title: `About ${wholeDollars(forecast.totalAnnualCost)} a year for upkeep`,
    body: `${wholeDollars(forecast.monthlyAverage)} per month on average${busiest ? ` · Highest in ${busiest.month}: ${wholeDollars(busiest.total)}` : ''} · ${forecast.confidenceLevel}% confidence.`,
    tone: 'DEFAULT', actions: [],
  }];
  if (forecast.yearBuiltAssumed) {
    blocks.push({
      type: 'LIMITATION', id: 'budget-forecast-assumed-age', title: 'Home age assumed',
      body: 'The year built is not recorded, so the forecast assumed a 10-year-old home. Add the year built to the home\'s details for a closer estimate.',
      severity: 'CAUTION',
    });
  }
  const budgetSections = [
    { id: 'budget-forecast-categories', title: 'By category', count: categoriesByCost.length, items: categoriesByCost.map((category, index) => ({
      id: `category-${index}`, title: category.category, amountLabel: `${wholeDollars(category.annualCost)} a year`, proportionPercent: category.percentage, meta: category.items.slice(0, 4), status: `${category.percentage}%`,
    })) },
    { id: 'budget-forecast-months', title: 'By month', count: forecast.monthlyForecasts.length, items: forecast.monthlyForecasts.map((month) => ({
      id: `month-${month.month.toLowerCase()}`, title: month.month, description: `Routine ${wholeDollars(month.routine)} · Preventive ${wholeDollars(month.preventive)} · Unexpected ${wholeDollars(month.unexpected)}`, meta: month.tasks.slice(0, 3), status: wholeDollars(month.total),
      proportionPercent: busiest?.total ? Math.round((month.total / busiest.total) * 100) : 0,
    })) },
  ].filter((section) => section.count > 0);
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'budget-forecast-items', title: 'Where the upkeep budget goes',
    description: 'Estimated annual upkeep by category.',
    presentation: {
      pattern: 'BUDGET_BREAKDOWN',
      summary: {
        annual: wholeDollars(forecast.totalAnnualCost), monthly: wholeDollars(forecast.monthlyAverage),
        peakMonth: busiest?.month ?? '—', peakAmount: busiest ? wholeDollars(busiest.total) : '—',
        confidence: `${forecast.confidenceLevel}%`,
      },
      plan: {
        headline: `Plan on setting aside about ${wholeDollars(forecast.monthlyAverage)} each month`,
        guidance: busiest
          ? `Keep at least ${wholeDollars(busiest.total)} available for ${busiest.month}, the highest forecast month. The monthly set-aside smooths the full year's estimated cost rather than predicting an actual bill each month.`
          : 'Use the monthly set-aside as a steady buffer for the full year, not as a prediction of an actual monthly bill.',
        peakDelta: busiest ? `${wholeDollars(Math.max(0, busiest.total - forecast.monthlyAverage))} above average` : '—',
        topDrivers: categoriesByCost.slice(0, 3).map((category) => `${category.category} ${category.percentage}%`),
      },
      costMix: annualMix.map(([label, annual]) => ({
        label, annual: wholeDollars(annual), monthly: `${wholeDollars(annual / 12)}/mo`,
        proportionPercent: forecast.totalAnnualCost ? Math.round((annual / forecast.totalAnnualCost) * 100) : 0,
      })),
      calculation: {
        basis: 'A deterministic 12-month estimate of typical upkeep, not a review of your actual bills or a promise that work will occur in a particular month.',
        factors: [
          `A base monthly cost for this home's dwelling type`,
          `A home-age adjustment using ${forecast.propertyAge} years`,
          'Seasonal multipliers and typical tasks for each month',
          `${forecast.confidenceLevel}% confidence based partly on the inventory recorded for this home`,
        ],
        improvements: forecast.yearBuiltAssumed
          ? ['Add the year built so the age adjustment uses the home’s recorded age.', 'Keep the home inventory current so confidence reflects the systems and appliances on record.']
          : ['Keep the year built and home inventory current so the estimate continues to use the best available property facts.'],
      },
    },
    sections: budgetSections,
    collection: collectionDescriptor({
      sourceTotal: forecast.categoryBreakdowns.length + forecast.monthlyForecasts.length,
      fetchedCount: forecast.categoryBreakdowns.length + forecast.monthlyForecasts.length,
      sections: budgetSections,
      nextPageAvailable: false,
    }),
    actions: [],
  }, {
    type: 'BOUNDARY', id: 'budget-forecast-boundary', title: 'A typical-cost estimate, not your spending',
    body: 'The forecast uses typical upkeep costs for this kind of home and its age, not what you have actually spent. Use it to set aside a buffer, and check real bills against it.',
    severity: 'INFO', suggestions: [],
  });
  return { status: 'ANSWERED', reasonCode: 'BUDGET_FORECAST_READY', blocks, suggestions: [] };
}

async function maintenanceBudgetResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    // FR-AUT-1: the forecast is computed from the property's own facts, so the property is its source.
    return withSources(maintenanceBudgetFromView(await budgetForecasterService.generateBudgetForecast(propertyId, userId, { includeRecommendations: false }), propertyId), [sourceRef('Property', propertyId)]);
  } catch (error) {
    if (error instanceof Error && error.message === 'Property not found') return withSources(maintenanceBudgetFromView('PRIMARY_OWNER_ONLY', propertyId), []);
    throw error;
  }
}

registerCapabilityHandler('appliance-oracle.risk', async (envelope) => applianceFailureRiskResult(envelope.propertyId!, envelope.userId, envelope.message));
registerCapabilityHandler('budget-planner.forecast', async (envelope) => maintenanceBudgetResult(envelope.propertyId!, envelope.userId));
