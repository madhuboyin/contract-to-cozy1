// Item funding goal (audit: ASK_COZY_COMPOUND_CROSS_TOOL_PROMPTS_AUDIT.md): "if I replace my roof in 5 years, how much capital do I need and how much more
// should I be saving?". One read that joins three tools the homeowner would otherwise open one by one: the Home Capital Timeline (what the item costs and
// when the model expects it), the Reserve Fund (what is set aside, what is being deposited) and the financial assumptions (cost growth). All arithmetic is in
// support/itemFunding.ts and every figure in the answer traces to one of those sources; nothing here asks a model for a number.
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { homeReserveFundService } from '../../homeReserveFund.service';
import { HomeCapitalTimelineService } from '../../homeCapitalTimeline.service';
import { deriveExpenseGrowthRate } from '../../financialAssumption.service';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess, isCapitalTimelineAnalysisStale } from '../askHandlerSupport';
import { inventoryAddItemAction } from './inventoryAskActions';
import { namedFundingTerms, selectFundingItems, wantsAllFundingItems } from '../support/itemFundingWording';
import { parseTargetDate } from '../support/targetDate';
import {
  DEFAULT_CAPITAL_COST_GROWTH_RATE, DEPOSIT_RATE_WINDOW_MONTHS, buildFundingPlan, depositsPerMonth, pointEstimate,
  type FundingPosture, type FundingTimelineItem,
} from '../support/itemFunding';
import { RESERVE_FUND_ACTION_IDS, RESERVE_FUND_COMMAND_MESSAGE } from '../support/reserveFundConstants';

const homeCapitalTimelineService = new HomeCapitalTimelineService();

export const ITEM_FUNDING_ACTION_IDS = Object.freeze({ CAPITAL_PLAN: 'item-funding-capital-plan' });

const words = (value: unknown) => String(value).toLowerCase().replace(/_/g, ' ');
const dollars = (cents: number) => money(Math.round(cents / 100));
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

function growthRateOf(analysis: { inputsSnapshot?: unknown } | null): number {
  const snapshot = analysis?.inputsSnapshot;
  const stored = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>).financialAssumptions : null;
  if (stored && typeof stored === 'object') {
    const a = stored as Record<string, unknown>;
    if (['propertyTaxGrowthRate', 'insuranceGrowthRate', 'maintenanceGrowthRate', 'inflationRate'].every((key) => typeof a[key] === 'number')) {
      return deriveExpenseGrowthRate(a as unknown as Parameters<typeof deriveExpenseGrowthRate>[0]);
    }
  }
  return DEFAULT_CAPITAL_COST_GROWTH_RATE;
}

function notice(reasonCode: string, id: string, title: string, body: string, actions: any[] = [], status: AskOperationResult['status'] = 'READY_WITH_LIMITATIONS'): AskOperationResult {
  return { status, reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions } as AskPresentationBlock], suggestions: [] };
}

export async function itemFundingGoalResult(userId: string, propertyId: string, message: string, now: Date = new Date()): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const canManage = access.role !== HouseholdRole.VIEWER;
  const target = parseTargetDate(message, now);

  const [capitalContext, property, inventoryCount, financialContext] = await Promise.all([
    evaluateFeatureContext(propertyId, userId, { featureKey: 'CAPITAL_TIMELINE', operationKey: 'RUN_TIMELINE' }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } }),
    prisma.inventoryItem.count({ where: { propertyId } }),
    getFinancialContextDecisions(propertyId, userId, 'CAPITAL_TIMELINE'),
  ]);
  if (inventoryCount === 0) {
    return notice('ITEM_FUNDING_INVENTORY_REQUIRED', 'item-funding-empty', 'Add the item to your home first',
      'A savings goal needs the item’s age and condition. Add the roof, HVAC, water heater or appliance to your home and I’ll work out what to put aside.',
      canManage ? [{ ...inventoryAddItemAction(), label: 'Add an inventory item' }] : []);
  }

  let analysis: any = await homeCapitalTimelineService.getLatestTimeline(propertyId);
  const targetYears = target ? Math.ceil(target.months / 12) : 0;
  const needsLongerHorizon = analysis != null && targetYears > (analysis.horizonYears ?? 10) && (analysis.horizonYears ?? 10) < 10;
  if ((!analysis || isCapitalTimelineAnalysisStale(analysis, financialContext.contextVersion) || needsLongerHorizon) && property) {
    analysis = await homeCapitalTimelineService.runTimeline(propertyId, property.homeownerProfileId, targetYears > 5 ? 10 : (analysis?.horizonYears ?? 10), {
      assumptionSetId: typeof analysis?.inputsSnapshot?.assumptionSetId === 'string' ? analysis.inputsSnapshot.assumptionSetId : undefined,
      createdByUserId: userId, propertyContextVersion: capitalContext.contextVersion, awaitReserveFundSync: true,
    });
  }
  const timelineItems: any[] = Array.isArray(analysis?.items) ? analysis.items : [];
  const named = namedFundingTerms(message);
  const everything = wantsAllFundingItems(message);
  const matched = everything
    ? timelineItems.filter((item) => !target || new Date(item.windowStart) <= target.date)
    : selectFundingItems(message, timelineItems.map((item) => ({ ...item, name: item.inventoryItem?.name ?? words(item.category) })));
  if (!matched.length) {
    const spoken = named.length ? namedFundingTerms(message)[0] : null;
    return notice('ITEM_FUNDING_ITEM_NOT_ON_TIMELINE', 'item-funding-no-item',
      spoken ? `I don’t see a ${spoken} in your capital timeline` : 'Tell me which item to plan for',
      spoken
        ? `Your timeline covers the next ${analysis?.horizonYears ?? 10} years of the systems and appliances in your home. If the ${spoken} is not recorded, add it with its age and condition and I’ll work out what to put aside.`
        : 'Name the roof, HVAC, water heater or appliance, or ask about all your big replacements, and give a date such as “in 5 years”.',
      canManage ? [{ ...inventoryAddItemAction(), label: spoken ? `Add a ${spoken} to my home` : 'Add an inventory item' }] : []);
  }

  const [fund, lineItems, contributionPage]: any[] = await Promise.all([
    homeReserveFundService.getSummary(propertyId),
    homeReserveFundService.listLineItems(propertyId),
    homeReserveFundService.listContributions(propertyId, { limit: 100 }),
  ]);
  const posture = (['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].includes(fund.posture) ? fund.posture : 'MODERATE') as FundingPosture;
  const activeLines: any[] = lineItems.filter((line: any) => line.status === 'ACTIVE');
  const lineByTimelineItem = new Map<string, any>(activeLines.map((line) => [line.timelineItemId, line]));
  const fundTargetTotalCents = activeLines.reduce((sum, line) => sum + (line.targetCostCents ?? 0), 0);
  const deposits = depositsPerMonth(contributionPage.items ?? [], now);

  const fundingItems: FundingTimelineItem[] = matched.map((item) => {
    const line = lineByTimelineItem.get(item.id);
    const min = item.estimatedCostMinCents ?? item.estimatedCostMaxCents ?? 0;
    const max = item.estimatedCostMaxCents ?? item.estimatedCostMinCents ?? 0;
    return {
      id: item.id, name: item.inventoryItem?.name ?? words(item.category),
      windowStart: new Date(item.windowStart), windowEnd: new Date(item.windowEnd), costMinCents: min, costMaxCents: max,
      targetCents: line ? line.targetCostCents : pointEstimate(min, max, posture),
      setAsideCents: line ? line.allocatedBalanceCents : 0,
    };
  });
  const missingCost = fundingItems.some((item) => item.costMinCents === 0 && item.costMaxCents === 0);
  const growthRate = growthRateOf(analysis);
  const plan = buildFundingPlan({
    now, items: fundingItems, posture, targetDate: target?.date ?? null, growthRate,
    depositsPerMonthCents: deposits.perMonthCents, fundTargetTotalCents,
  });

  const names = list(plan.items.map((item) => item.name));
  const when = target ? target.label : `around ${humanDate(plan.planningDate)}`;
  const sentences: string[] = [];
  sentences.push(`To replace ${plan.items.length > 1 ? 'these' : 'your'} ${names} ${target ? when : `${when}, when your home record expects it`}, plan on about ${dollars(plan.costAtTargetCents)}${plan.items.length === 1 ? ` (range ${dollars(plan.items[0].costMinAtTargetCents)}–${dollars(plan.items[0].costMaxAtTargetCents)})` : ''}.`);
  if (plan.setAsideCents > 0) sentences.push(`About ${dollars(plan.setAsideCents)} of your reserve balance counts toward it, which leaves ${dollars(plan.stillToFundCents)} to fund.`);
  else sentences.push(`Nothing in your reserve balance counts toward it yet, so the whole ${dollars(plan.stillToFundCents)} is still to fund.`);
  if (plan.nearTerm) {
    sentences.push(`That is only about ${plan.months} month${plan.months === 1 ? '' : 's'} away, too soon to spread out. Plan for ${dollars(plan.stillToFundCents)} as a lump sum.`);
  } else {
    sentences.push(`Saving that over ${plan.months} months takes about ${dollars(plan.neededPerMonthCents!)} a month.`);
    sentences.push(deposits.depositCount > 0
      ? `Your logged reserve deposits average about ${dollars(deposits.perMonthCents)} a month over the last ${DEPOSIT_RATE_WINDOW_MONTHS} months, of which about ${dollars(plan.currentPerMonthCents)} goes toward this.`
      : `No reserve deposits are logged in the last ${DEPOSIT_RATE_WINDOW_MONTHS} months, so I counted $0 a month toward it.`);
    sentences.push(plan.additionalPerMonthCents! > 0
      ? `Save about ${dollars(plan.additionalPerMonthCents!)} more a month.`
      : 'You are already saving enough to get there.');
  }
  const sooner = plan.items.filter((item) => item.modelExpectsSooner);
  if (sooner.length) sentences.push(`Your home record expects ${list(sooner.map((item) => item.name))} to need replacing as early as ${humanDate(sooner.reduce((a, b) => (a.windowStart < b.windowStart ? a : b)).windowStart)}, sooner than you planned.`);
  if (missingCost) sentences.push('One item has no cost estimate yet, so its share is counted as $0.');

  const needsMore = !plan.nearTerm && (plan.additionalPerMonthCents ?? 0) > 0;
  const rows = [
    { id: 'cost', values: { measure: `Cost ${target ? target.label : 'at the expected window'}`, amount: dollars(plan.costAtTargetCents), how: target ? `Timeline estimate taken back to today’s money and grown ${(growthRate * 100).toFixed(1)}% a year to your date` : 'Home Capital Timeline estimate, already grown to the middle of the expected window' } },
    { id: 'set-aside', values: { measure: 'Already set aside', amount: dollars(plan.setAsideCents), how: 'This item’s share, by cost, of your recorded reserve balance' } },
    { id: 'still', values: { measure: 'Still to fund', amount: dollars(plan.stillToFundCents), how: 'Cost minus what is set aside' } },
    { id: 'months', values: { measure: 'Months to go', amount: String(plan.months), how: target ? 'From today to your date' : 'From today to the start of the expected window' } },
    ...(plan.nearTerm ? [] : [
      { id: 'needed', values: { measure: 'Needed per month', amount: dollars(plan.neededPerMonthCents!), how: 'Still to fund divided by months to go' } },
      { id: 'current', values: { measure: 'Putting toward it now', amount: dollars(plan.currentPerMonthCents), how: `Average logged reserve deposit over ${DEPOSIT_RATE_WINDOW_MONTHS} months, by this item’s share of the reserve targets` } },
      { id: 'additional', values: { measure: 'Additional per month', amount: dollars(plan.additionalPerMonthCents!), how: 'Needed minus putting toward it now' } },
    ]),
  ];
  const itemRows = plan.items.map((item) => ({
    id: item.id,
    values: {
      item: item.name,
      window: `${humanDate(item.windowStart)}–${humanDate(item.windowEnd)}`,
      cost: `${dollars(item.costMinAtTargetCents)}–${dollars(item.costMaxAtTargetCents)}`,
      funded: dollars(item.setAsideCents),
    },
  }));

  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'item-funding-summary',
      title: plan.nearTerm ? `${names}: about ${dollars(plan.stillToFundCents)} needed soon` : needsMore ? `${names}: save about ${dollars(plan.additionalPerMonthCents!)} more a month` : `${names}: you are on track`,
      body: sentences.join(' '), tone: needsMore || plan.nearTerm ? 'CAUTION' : 'DEFAULT',
      actions: [
        { id: ITEM_FUNDING_ACTION_IDS.CAPITAL_PLAN, label: 'Show my full capital plan', interactionType: 'START_WORKFLOW' as const, message: 'Show my capital reserve plan.', operationId: 'CAPITAL_RESERVE_PLAN' as const, style: 'SECONDARY' as const },
        ...(canManage ? [{ id: RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, label: 'Log a reserve deposit', interactionType: 'START_WORKFLOW' as const, message: RESERVE_FUND_COMMAND_MESSAGE, operationId: 'RESERVE_FUND_COMMAND' as const, actionId: RESERVE_FUND_ACTION_IDS.ADD_CONTRIBUTION, style: 'SECONDARY' as const }] : []),
      ],
    },
    { type: 'TABLE', id: 'item-funding-steps', title: 'How this was worked out', description: 'Each line comes from your capital timeline, your reserve fund, or simple arithmetic on the lines above it.', columns: [{ key: 'measure', label: 'Measure' }, { key: 'amount', label: 'Amount' }, { key: 'how', label: 'Where it comes from' }], rows, actions: [] },
    { type: 'TABLE', id: 'item-funding-items', title: plan.items.length > 1 ? 'Items included' : 'The item', description: 'The expected window is the Home Capital Timeline’s estimate from the item’s age and condition.', columns: [{ key: 'item', label: 'Item' }, { key: 'window', label: 'Expected window' }, { key: 'cost', label: 'Cost range' }, { key: 'funded', label: 'Set aside' }], rows: itemRows, actions: [] },
    { type: 'EVIDENCE', id: 'item-funding-evidence', title: 'Sources and freshness', items: [
      { label: 'Home Capital Timeline', source: `${plan.items.length} item${plan.items.length === 1 ? '' : 's'}, ${analysis?.horizonYears ?? 10}-year horizon`, observedAt: analysis?.computedAt?.toISOString?.() ?? null },
      { label: 'Reserve Fund', source: `Self-reported balance and ledger, ${posture.toLowerCase()} planning style`, observedAt: fund.lastRecalculatedAt?.toISOString?.() ?? null },
    ] },
    { type: 'BOUNDARY', id: 'item-funding-boundary', title: 'Planning figure—not a quote', body: 'Actual prices depend on materials, labor, permits and when you do the work. The reserve ledger is self-reported and is not connected to a bank.', severity: 'INFO', suggestions: [] },
  ];

  return {
    status: analysis?.confidence === 'LOW' || missingCost ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: analysis?.confidence === 'LOW' ? 'ITEM_FUNDING_LOW_CONFIDENCE' : missingCost ? 'ITEM_FUNDING_COST_MISSING' : undefined,
    contextVersion: capitalContext.contextVersion,
    parameters: { itemTimelineIds: plan.items.map((item) => item.id), planningDate: plan.planningDate.toISOString(), planningDateFromHomeowner: plan.planningDateFromHomeowner },
    blocks, suggestions: [],
  };
}

registerCapabilityHandler('capital-item-funding.goal', async (envelope) => itemFundingGoalResult(envelope.userId, envelope.propertyId!, envelope.message));
