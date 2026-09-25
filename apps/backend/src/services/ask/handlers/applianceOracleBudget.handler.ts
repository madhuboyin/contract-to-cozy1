// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { applianceOracleService } from '../../applianceOracle.service';
import { budgetForecasterService } from '../../budgetForecaster.service';
import { getAskPropertyTimezone } from '../askExecutionContext';

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
    meta: [
      prediction.remainingLife > 0 ? `About ${prediction.remainingLife} year${prediction.remainingLife === 1 ? '' : 's'} left, around ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: getAskPropertyTimezone() }).format(new Date(prediction.estimatedFailureDate))}` : 'Past its expected life',
      `Replacement about ${wholeDollars(prediction.replacementCost)}`,
      prediction.maintenanceImpact,
    ].filter((value) => value.length <= 80),
  };
}

export function applianceFailureRiskFromView(report: OracleReportView | 'PRIMARY_OWNER_ONLY', propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/oracle?propertyId=${encodeURIComponent(propertyId)}`;
  const openAction = { id: 'open-appliance-oracle', label: 'Open Appliance Oracle for AI replacement picks', href: pageHref, style: 'PRIMARY' as const };
  if (report === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'APPLIANCE_ORACLE_PRIMARY_OWNER_ONLY',
      blocks: [{ type: 'SUMMARY', id: 'appliance-oracle-summary', title: 'Only the home\'s primary owner can see the appliance oracle', body: 'Appliance Oracle is kept for the home\'s primary account holder, so it can\'t be shown here.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
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
  const lifespan = (items: OracleReportView['predictions']): AskPresentationBlock => ({
    type: 'LIFESPAN', id: 'appliance-oracle-items', title: 'Appliance lifespans',
    description: 'Each bar shows the appliance\'s age against its typical life. The label is the Appliance Oracle\'s own failure-risk level.',
    basis: 'An estimate from each appliance\'s purchase date and a typical lifespan for its type, not an inspection.',
    items: items.slice(0, 50).map((prediction, index) => oracleLifespanItem(prediction, index)),
    missingAge: missing.slice(0, 20).map((item) => ({
      id: item.inventoryItemId, label: oracleApplianceLabel(item.applianceName), entityType: 'INVENTORY_ITEM',
      actions: [{ id: 'correct-purchasedOn', label: 'Add purchase date', message: 'Correct the purchase date of this inventory item.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT' }],
    })),
    missingAgeTitle: missing.length ? `No purchase date yet for ${missing.length === 1 ? 'this appliance' : `these ${missing.length} appliances`}` : null,
  });
  if (!report.predictions.length) {
    return {
      status: 'ANSWERED', reasonCode: 'APPLIANCE_ORACLE_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'appliance-oracle-summary', title: skipped ? 'No appliance ages recorded yet' : 'No appliances recorded yet',
        body: skipped
          ? 'Appliance Oracle estimates failure risk from each appliance\'s age. Add a purchase date below to include an appliance.'
          : 'Appliance Oracle estimates failure risk from each appliance\'s age. Add appliances with their purchase date to the inventory to see it.',
        tone: 'DEFAULT', actions: [openAction],
      }, ...(missing.length ? [lifespan([])] : []), ...(skippedBlock ? [skippedBlock] : []), boundary],
      suggestions: ['Show my inventory'],
    };
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'appliance-oracle-summary',
    title: `${report.totalAppliances} appliance${report.totalAppliances === 1 ? '' : 's'} analysed`,
    body: [
      `${report.criticalCount} critical and ${report.highRiskCount} high risk.`,
      report.criticalCount + report.highRiskCount ? `Replacing those would cost an estimated ${wholeDollars(report.estimatedTotalCost)}.` : null,
      'Replacement model suggestions are on the Appliance Oracle page.',
    ].filter(Boolean).join(' '),
    tone: report.criticalCount + report.highRiskCount ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  if (skippedBlock) blocks.push(skippedBlock);
  blocks.push(lifespan(report.predictions), boundary);
  return { status: 'ANSWERED', reasonCode: 'APPLIANCE_ORACLE_READY', blocks, suggestions: ['When should I replace my water heater?'] };
}

async function applianceFailureRiskResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    return applianceFailureRiskFromView(await applianceOracleService.generateOracleReport(propertyId, userId, { includeRecommendations: false }), propertyId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Property not found or access denied') return applianceFailureRiskFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

export function maintenanceBudgetFromView(forecast: BudgetForecastView | 'PRIMARY_OWNER_ONLY', propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/budget?propertyId=${encodeURIComponent(propertyId)}`;
  const openAction = { id: 'open-budget-planner', label: 'Open Budget Planner for AI tips', href: pageHref, style: 'PRIMARY' as const };
  if (forecast === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'BUDGET_PLANNER_PRIMARY_OWNER_ONLY',
      blocks: [{ type: 'SUMMARY', id: 'budget-forecast-summary', title: 'Only the home\'s primary owner can see the budget planner', body: 'Budget Planner is kept for the home\'s primary account holder, so it can\'t be shown here.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const busiest = [...forecast.monthlyForecasts].sort((a, b) => b.total - a.total)[0];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'budget-forecast-summary',
    title: `About ${wholeDollars(forecast.totalAnnualCost)} a year for upkeep`,
    body: [
      `That is about ${wholeDollars(forecast.monthlyAverage)} a month on average${busiest ? `, highest in ${busiest.month} (${wholeDollars(busiest.total)})` : ''}.`,
      `Confidence ${forecast.confidenceLevel}%.`,
      'Money-saving tips are on the Budget Planner page.',
    ].join(' '),
    tone: 'DEFAULT', actions: [openAction],
  }];
  if (forecast.yearBuiltAssumed) {
    blocks.push({
      type: 'LIMITATION', id: 'budget-forecast-assumed-age', title: 'Home age assumed',
      body: 'The year built is not recorded, so the forecast assumed a 10-year-old home. Add the year built to the home\'s details for a closer estimate.',
      severity: 'CAUTION',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'budget-forecast-items', title: 'Where the upkeep budget goes',
    description: 'By category, then month by month, as on the page.',
    sections: [
      { id: 'budget-forecast-categories', title: 'By category', count: forecast.categoryBreakdowns.length, items: forecast.categoryBreakdowns.map((category, index) => ({
        id: `category-${index}`, title: category.category, description: `${wholeDollars(category.annualCost)} a year (${category.percentage}%)`, meta: category.items.slice(0, 4), status: `${category.percentage}%`,
      })) },
      { id: 'budget-forecast-months', title: 'By month', count: forecast.monthlyForecasts.length, items: forecast.monthlyForecasts.map((month) => ({
        id: `month-${month.month.toLowerCase()}`, title: month.month, description: `${wholeDollars(month.total)}: routine ${wholeDollars(month.routine)}, preventive ${wholeDollars(month.preventive)}, unexpected ${wholeDollars(month.unexpected)}`, meta: month.tasks.slice(0, 3), status: wholeDollars(month.total),
      })) },
    ].filter((section) => section.count > 0),
    actions: [],
  }, {
    type: 'BOUNDARY', id: 'budget-forecast-boundary', title: 'A typical-cost estimate, not your spending',
    body: 'The forecast uses typical upkeep costs for this kind of home and its age, not what you have actually spent. Use it to set aside a buffer, and check real bills against it.',
    severity: 'INFO', suggestions: [],
  });
  return { status: 'ANSWERED', reasonCode: 'BUDGET_FORECAST_READY', blocks, suggestions: ['What are my monthly ownership costs?'] };
}

async function maintenanceBudgetResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    return maintenanceBudgetFromView(await budgetForecasterService.generateBudgetForecast(propertyId, userId, { includeRecommendations: false }), propertyId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Property not found') return maintenanceBudgetFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('appliance-oracle.risk', async (envelope) => applianceFailureRiskResult(envelope.propertyId!, envelope.userId));
registerCapabilityHandler('budget-planner.forecast', async (envelope) => maintenanceBudgetResult(envelope.propertyId!, envelope.userId));
