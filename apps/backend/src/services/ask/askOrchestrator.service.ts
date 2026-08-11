import { AskExecutionStatus, MaintenanceTaskStatus, NotificationCadence, Prisma, RefinanceRateMonitorProduct } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  AskExecutionResponseSchema,
  type AskCaptureRequest,
  type AskExecutionResponse,
  type AskPresentationBlock,
  type CreateAskExecutionRequest,
  type SubmitAskCaptureRequest,
  type SubmitAskConfirmation,
} from '../../productFramework/ask/ask.contract';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { PropertyMaintenanceTaskService } from '../PropertyMaintenanceTask.service';
import { detectCoverageGaps } from '../coverageGap.service';
import { answerGroundedAsk } from '../groundedAsk.service';
import {
  buildCapabilityCatalog,
  canonicalCapabilityRegistry,
  type CapabilityCatalogItem,
} from '../../productFramework/capabilities';
import { createToolDiscoveryCapabilityAvailabilityAdapter } from '../toolDiscoveryAvailability.service';
import {
  resolveAskOperation,
  type AskOperationResolution,
  type AskOperationResult,
} from './askOperationRegistry';
import { evaluateFeatureContext } from '../../modules/propertyContext/application/evaluateFeatureContext';
import { captureFeatureContext } from '../../modules/propertyContext/application/captureFeatureContext';
import { getFinancialContextDecisions } from '../financialContext/context';
import { getProfile, upsertProfile } from '../financing.service';
import { RefinanceRadarService } from '../../refinanceRadar/refinanceRadar.service';
import { MortgageRateService } from '../../refinanceRadar/engine/mortgageRate.service';
import { getRefinanceAlertPreference } from '../../refinanceRadar/refinanceAlertPreference.service';
import { createOrUpdateRefinanceRateMonitor } from '../../refinanceRadar/refinanceRateMonitor.service';

const SESSION_TTL_DAYS = 30;
const MAX_RESULT_ITEMS = 50;
const refinanceRadarService = new RefinanceRadarService();
const mortgageRateService = new MortgageRateService();

const RefinanceProfileCaptureSchema = z.object({
  currentMortgageBalanceUsd: z.number().min(1_000).max(100_000_000),
  interestRatePct: z.number().positive().max(30),
  remainingTermYears: z.number().positive().max(50),
  monthlyPaymentUsd: z.number().positive().max(1_000_000).optional(),
}).strict();

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function humanDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value);
}

function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL'].includes(status);
}

async function ensurePropertyAccess(userId: string, propertyId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

async function propertySummary(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  return property ? { id: property.id, label: propertyLabel(property) } : null;
}

function needsPropertyResult(): AskOperationResult {
  return {
    status: 'NEEDS_PROPERTY',
    reasonCode: 'PROPERTY_REQUIRED',
    blocks: [{
      type: 'SUMMARY',
      id: 'property-required',
      title: 'Select a home to continue',
      body: 'This question needs a specific Living Home Record. Select a home, then Ask will continue with the same question.',
      tone: 'CAUTION',
      actions: [{ id: 'select-property', label: 'Select a home', href: '/dashboard/properties', style: 'PRIMARY' }],
    }],
    suggestions: ['You can also ask a general home-care question without selecting a property.'],
  };
}

async function maintenanceResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const tasks = await PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true });
  const completed = tasks.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
  const pending = tasks.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  const wantsCompletedOnly = /\bcompleted|finished|done\b/i.test(message) && !/\bpending|remaining|still|overdue\b/i.test(message);
  const wantsPendingOnly = /\bpending|remaining|still|overdue|due soon\b/i.test(message) && !/\bcompleted|finished|done\b/i.test(message);
  const sections = [
    ...(!wantsPendingOnly ? [{ id: 'completed', title: 'Completed', records: completed }] : []),
    ...(!wantsCompletedOnly ? [{ id: 'pending', title: 'Pending', records: pending }] : []),
  ].map((section) => ({
    id: section.id,
    title: section.title,
    count: section.records.length,
    items: section.records.slice(0, MAX_RESULT_ITEMS).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      meta: [
        task.inventoryItem?.name ?? task.category ?? task.assetType ?? '',
        task.status === MaintenanceTaskStatus.COMPLETED
          ? humanDate(task.lastCompletedDate) ? `Completed ${humanDate(task.lastCompletedDate)}` : 'Completed date not recorded'
          : humanDate(task.nextDueDate) ? `Due ${humanDate(task.nextDueDate)}` : 'No due date',
        `${task.priority.toLowerCase()} priority`,
      ].filter(Boolean),
      href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`,
    })),
  }));

  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY',
      id: 'maintenance-summary',
      title: pending.length ? `${pending.length} maintenance task${pending.length === 1 ? '' : 's'} still need attention` : 'No pending maintenance tasks found',
      body: `${completed.length} completed and ${pending.length} pending task${pending.length === 1 ? '' : 's'} are recorded for this home. Cancelled tasks are excluded.`,
      tone: pending.some((task) => task.nextDueDate && task.nextDueDate < new Date()) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`, style: 'PRIMARY' }],
    }, {
      type: 'GROUPED_LIST',
      id: 'maintenance-groups',
      title: 'Maintenance record',
      description: tasks.length > MAX_RESULT_ITEMS ? `Showing up to ${MAX_RESULT_ITEMS} items per section.` : null,
      sections,
      actions: [],
    }],
    suggestions: ['Show overdue tasks only', 'What maintenance is coming up next?', 'Create a maintenance task'],
  };
}

async function coverageResult(propertyId: string): Promise<AskOperationResult> {
  const gaps = await detectCoverageGaps(propertyId);
  const grouped = new Map<string, typeof gaps>();
  for (const gap of gaps) grouped.set(gap.gapType, [...(grouped.get(gap.gapType) ?? []), gap]);
  const labels: Record<string, string> = {
    NO_COVERAGE: 'No coverage recorded',
    WARRANTY_ONLY: 'Warranty only',
    INSURANCE_ONLY: 'Insurance only',
    EXPIRED_WARRANTY: 'Expired warranty',
    EXPIRED_INSURANCE: 'Expired insurance',
  };
  const sections = [...grouped.entries()].map(([gapType, records]) => ({
    id: gapType.toLowerCase(),
    title: labels[gapType] ?? gapType,
    count: records.length,
    items: records.slice(0, MAX_RESULT_ITEMS).map((gap) => ({
      id: gap.inventoryItemId,
      title: gap.itemName,
      description: gap.reasons.join(' '),
      status: gap.gapType,
      meta: [
        gap.roomName ?? '',
        gap.itemCategory ? gap.itemCategory.toLowerCase().replace(/_/g, ' ') : '',
        gap.exposureCents > 0 ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: gap.currency, maximumFractionDigits: 0 }).format(gap.exposureCents / 100)} estimated exposure` : '',
      ].filter(Boolean),
      href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`,
    })),
  }));

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'coverage-summary',
    title: gaps.length ? `${gaps.length} item${gaps.length === 1 ? '' : 's'} need coverage review` : 'No actionable coverage gaps found',
    body: gaps.length
      ? 'These are record-based coverage gaps or expirations. Unknown coverage is not treated as confirmed protection.'
      : 'No currently actionable item-level gap was found in the recorded policies, warranties, and inventory values.',
    tone: gaps.length ? 'CAUTION' : 'POSITIVE',
    actions: [{ id: 'open-coverage', label: 'Review coverage', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`, style: 'PRIMARY' }],
  }];
  if (sections.length) blocks.push({ type: 'GROUPED_LIST', id: 'coverage-groups', title: 'Items to review', description: null, sections, actions: [] });
  return {
    status: 'ANSWERED',
    blocks,
    suggestions: ['Which gaps have the largest exposure?', 'Show warranties expiring soon', 'Open Coverage & Premium Review'],
  };
}

function yearsSince(value: Date | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
}

async function replacementGuidanceResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      OR: [
        { name: { contains: 'refrigerator', mode: 'insensitive' } },
        { name: { contains: 'fridge', mode: 'insensitive' } },
        { assetType: { contains: 'refrigerator', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ isVerified: 'desc' }, { updatedAt: 'desc' }],
    take: 2,
    select: { id: true, name: true, condition: true, installedOn: true, purchasedOn: true, expectedExpiryDate: true },
  });
  if (!items.length) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'REFRIGERATOR_NOT_IN_HOME_RECORD',
      blocks: [{
        type: 'SUMMARY', id: 'refrigerator-general-estimate', title: 'Most refrigerators last about 10–15 years',
        body: 'Replacement timing also depends on condition, repair frequency, energy use, and parts availability. I could not find a refrigerator in this home’s inventory, so this is general guidance rather than a home-specific recommendation.',
        tone: 'CAUTION',
        actions: [{ id: 'add-refrigerator', label: 'Add refrigerator to inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }],
      }],
      suggestions: ['What signs mean a refrigerator should be replaced?', 'Open Repair vs Replace'],
    };
  }
  if (items.length > 1) {
    return {
      status: 'NEEDS_ENTITY',
      reasonCode: 'MULTIPLE_REFRIGERATORS',
      blocks: [{
        type: 'GROUPED_LIST', id: 'refrigerator-selection', title: 'Which refrigerator do you mean?',
        description: 'Open the matching inventory record, or make its name more specific, then ask again.',
        sections: [{ id: 'matches', title: 'Possible matches', count: items.length, items: items.map((item) => ({
          id: item.id, title: item.name, description: null, status: item.condition, meta: [],
          href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`,
        })) }], actions: [],
      }],
      suggestions: ['Open home inventory'],
    };
  }

  const item = items[0];
  const lifecycleDate = item.installedOn ?? item.purchasedOn;
  const age = yearsSince(lifecycleDate);
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'REPAIR_REPLACE', operationKey: 'RUN_ANALYSIS', operationInput: { inventoryItemId: item.id },
  });
  const captureRequests: AskCaptureRequest[] = evaluation.requirements.map((requirement) => ({
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }));
  const remainingYears = age === null ? null : Math.max(0, 12 - age);
  const conditionCopy = item.condition === 'POOR'
    ? 'Its recorded condition is poor, so replacement planning should begin now.'
    : item.condition === 'FAIR'
      ? 'Its recorded condition is fair; compare any major repair against replacement cost and efficiency.'
      : 'Continue monitoring cooling performance, noise, seals, and repair frequency.';
  return {
    status: captureRequests.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length ? 'LIFECYCLE_CONTEXT_OPTIONAL' : undefined,
    contextVersion: evaluation.contextVersion,
    parameters: { inventoryItemId: item.id },
    captureRequests,
    blocks: [{
      type: 'SUMMARY', id: 'refrigerator-replacement-guidance', title: age === null
        ? `${item.name}: add its age for a home-specific replacement window`
        : remainingYears === 0
          ? `${item.name} is in the typical replacement window`
          : `${item.name} may have roughly ${remainingYears} year${remainingYears === 1 ? '' : 's'} before the typical replacement window`,
      body: age === null
        ? `Most refrigerators last about 10–15 years. ${conditionCopy} Add an approximate install or purchase date below and I’ll update this answer immediately.`
        : `The home record indicates an age of about ${age} year${age === 1 ? '' : 's'}. Most refrigerators last about 10–15 years, but this is a planning range—not a guaranteed failure date. ${conditionCopy}`,
      tone: item.condition === 'POOR' || (age !== null && age >= 12) ? 'CAUTION' : 'DEFAULT',
      actions: [{ id: 'open-repair-replace', label: 'Open Repair vs Replace', href: `/dashboard/replace-repair?propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(item.id)}`, style: 'PRIMARY' }],
    }],
    suggestions: ['What replacement warning signs should I watch?', 'How much should I budget for replacement?'],
  };
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

async function refinanceAnalysisResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const [profile, financialContext, marketSnapshot] = await Promise.all([
    getProfile(propertyId),
    getFinancialContextDecisions(propertyId, userId, 'REFINANCE_RADAR'),
    mortgageRateService.getLatestSnapshot(),
  ]);
  if (profile?.mortgageStatus === 'NO_MORTGAGE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_MORTGAGE',
      blocks: [{ type: 'SUMMARY', id: 'refinance-not-applicable', title: 'No mortgage is recorded for this home', body: 'A mortgage refinance analysis does not apply unless the financing profile is corrected to show an active mortgage.', tone: 'DEFAULT', actions: [{ id: 'review-financing', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'SECONDARY' }] }],
      suggestions: ['Show other home savings opportunities'],
    };
  }

  const missing = [
    profile?.currentMortgageBalanceCents == null ? 'currentMortgageBalanceUsd' : null,
    profile?.interestRateBps == null ? 'interestRatePct' : null,
    profile?.remainingTermMonths == null ? 'remainingTermYears' : null,
  ].filter((value): value is string => Boolean(value));
  if (missing.length) {
    const fields = [
      ...(missing.includes('currentMortgageBalanceUsd') ? [{ key: 'currentMortgageBalanceUsd', label: 'Current mortgage balance', helpText: 'An approximate current principal balance is acceptable.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 1_000, max: 100_000_000, unit: 'USD' } }] : []),
      ...(missing.includes('interestRatePct') ? [{ key: 'interestRatePct', label: 'Current interest rate', helpText: 'Enter the note rate on your existing mortgage, not a market quote.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.01, max: 30, unit: '%' } }] : []),
      ...(missing.includes('remainingTermYears') ? [{ key: 'remainingTermYears', label: 'Remaining loan term', helpText: 'An estimate in years is fine.', required: true, inputSchema: { type: 'DECIMAL' as const, min: 0.1, max: 50, unit: 'years' } }] : []),
      ...(profile?.monthlyPaymentCents == null ? [{ key: 'monthlyPaymentUsd', label: 'Monthly principal and interest payment', helpText: 'Optional. Leave blank and the analysis will calculate an amortized estimate.', required: false, inputSchema: { type: 'DECIMAL' as const, min: 1, max: 1_000_000, unit: 'USD/month' } }] : []),
    ];
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MORTGAGE_PROFILE_INCOMPLETE', contextVersion: financialContext.contextVersion,
      parameters: { captureOwner: 'PropertyFinancingProfile' },
      blocks: [{
        type: 'SUMMARY', id: 'refinance-needs-context', title: 'A few mortgage details are needed for a meaningful comparison',
        body: marketSnapshot
          ? `The latest governed 30-year benchmark is ${marketSnapshot.rate30yr.toFixed(3)}% as of ${marketSnapshot.date}. I won’t compare it with an assumed current loan rate or treat missing balances as zero.`
          : 'Your mortgage profile is incomplete, and no governed market-rate snapshot is currently available. Save the loan details now and Ask can use them when a benchmark becomes available.',
        tone: 'CAUTION', actions: [],
      }],
      captureRequests: [{
        requirementId: `refinance-profile-${financialContext.contextVersion.slice(0, 20)}`,
        captureKey: 'FINANCING_PROFILE_REFINANCE_INPUTS', classification: 'REQUIRED_CALCULATION', state: 'UNKNOWN',
        title: 'Complete mortgage details', question: 'Add only the current-loan details needed to compare refinancing options.',
        helpText: 'These values are stored in this home’s Financing Profile and are not sent to an LLM.',
        inputSchema: { type: 'GROUP', fields },
        currentAnswer: {}, allowNotSure: false, sensitivity: 'FINANCIAL',
        confirmationText: 'I confirm these mortgage details are accurate enough to save to this home’s Financing Profile.',
        expectedContextVersion: financialContext.contextVersion,
      }],
      suggestions: ['Use the full Financing Profile instead'],
    };
  }

  if (!marketSnapshot) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'MARKET_RATE_UNAVAILABLE', contextVersion: financialContext.contextVersion,
      blocks: [{ type: 'SUMMARY', id: 'refinance-market-unavailable', title: 'A current governed mortgage-rate benchmark is unavailable', body: 'Your loan details are ready, but Ask will not use model knowledge or an undated rate as the market benchmark. Try again after the Mortgage Refinance Radar receives a dated source snapshot.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['What rate would make refinancing worth reviewing?'],
    };
  }

  const result = await refinanceRadarService.evaluateProperty(propertyId, financialContext.contextVersion);
  if (!result.available) {
    return { status: 'UNAVAILABLE', reasonCode: result.reason, contextVersion: financialContext.contextVersion, blocks: [{ type: 'SUMMARY', id: 'refinance-analysis-unavailable', title: 'The refinance analysis is not ready', body: 'The Mortgage Refinance Radar could not complete a property-specific comparison. Review the financing profile and try again.', tone: 'CAUTION', actions: [{ id: 'open-profile', label: 'Review financing profile', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'PRIMARY' }] }], suggestions: [] };
  }
  const favorable = result.radarState === 'OPEN';
  const rows = [
    { id: 'current-rate', values: { metric: 'Your recorded mortgage rate', value: `${result.currentRatePct.toFixed(3)}%`, meaning: 'Existing loan note rate' } },
    { id: 'market-rate', values: { metric: 'Market benchmark rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: `National 30-year benchmark as of ${marketSnapshot.date}` } },
    { id: 'target-rate', values: { metric: 'Modeled target scenario rate', value: `${result.marketRatePct.toFixed(3)}%`, meaning: 'Illustrative target set to the latest benchmark—not a lender quote' } },
    { id: 'rate-gap', values: { metric: 'Rate difference', value: `${result.rateGapPct.toFixed(3)} percentage points`, meaning: result.rateGapPct > 0 ? 'Existing rate is higher' : 'Existing rate is not higher' } },
    ...(result.triggerRatePct == null ? [] : [{ id: 'trigger-rate', values: { metric: 'Radar review threshold', value: `${result.triggerRatePct.toFixed(3)}% or lower`, meaning: result.triggerRateExplanation } }]),
    { id: 'monthly-savings', values: { metric: 'Modeled monthly savings', value: money(result.monthlySavings), meaning: 'Principal-and-interest estimate' } },
    { id: 'lifetime-savings', values: { metric: 'Modeled lifetime savings', value: money(result.lifetimeSavings), meaning: 'Interest difference after modeled closing costs' } },
    { id: 'closing-cost', values: { metric: 'Modeled closing costs', value: money(result.closingCostAssumptionUsd), meaning: 'Planning assumption' } },
    { id: 'break-even', values: { metric: 'Estimated break-even', value: result.breakEvenMonths == null ? 'Not reached' : `${result.breakEvenMonths} months`, meaning: 'Time to recover modeled costs' } },
    { id: 'confidence', values: { metric: 'Opportunity confidence', value: result.confidenceLevel ?? 'Not qualified', meaning: 'Based on modeled savings and break-even' } },
  ];
  return {
    status: 'ANSWERED', contextVersion: financialContext.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'refinance-analysis-summary', title: favorable ? 'Refinancing may be worth comparing now' : 'Current conditions do not meet the radar’s actionable threshold',
      body: result.radarSummary, tone: favorable ? 'POSITIVE' : 'DEFAULT',
      actions: [{ id: 'open-radar', label: 'Explore refinance scenarios', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }],
    }, {
      type: 'TABLE', id: 'refinance-analysis-table', title: 'Current loan versus governed benchmark',
      description: 'The benchmark is not a personalized lender offer or guaranteed available rate.',
      columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Estimate' }, { key: 'meaning', label: 'What it represents' }], rows, actions: [],
    }, {
      type: 'EVIDENCE', id: 'refinance-evidence', title: 'Sources used', items: [
        { label: 'Current mortgage details', source: 'Property Financing Profile', observedAt: profile!.mortgageBalanceAsOfDate?.toISOString() ?? profile!.updatedAt.toISOString() },
        { label: '30-year market benchmark', source: `${marketSnapshot.source}${marketSnapshot.sourceRef ? ` · ${marketSnapshot.sourceRef}` : ''}`, observedAt: `${marketSnapshot.date}T00:00:00.000Z` },
      ],
    }, {
      type: 'BOUNDARY', id: 'refinance-boundary', title: 'Planning estimate—not a loan offer', body: 'Actual eligibility, APR, closing costs, taxes, insurance, points, credits, and available rates depend on lender underwriting and a formal Loan Estimate. Compare offers before making a financial commitment.', severity: 'INFO', suggestions: [],
    }],
    suggestions: ['What rate would open a stronger opportunity?', 'Show me the Mortgage Refinance Radar'],
  };
}

function parseRateThreshold(message: string): number | null {
  const match = message.match(/(?:below|under|to|reaches?|hits?)\s*(\d{1,2}(?:\.\d{1,3})?)\s*%/i)
    ?? message.match(/(\d{1,2}(?:\.\d{1,3})?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 30 ? value : null;
}

async function refinanceRateMonitorResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const thresholdPct = parseRateThreshold(message);
  if (thresholdPct === null) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'RATE_THRESHOLD_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-threshold-needed', title: 'What rate should trigger the alert?', body: 'Enter a mortgage benchmark threshold such as “Notify me when 30-year rates reach 5.5%.”', tone: 'CAUTION', actions: [] }],
      suggestions: ['Notify me when 30-year rates reach 5.5%', 'Notify me when 15-year rates reach 4.75%'],
    };
  }
  const product = /\b15[ -]?year\b/i.test(message) ? RefinanceRateMonitorProduct.FIXED_15_YEAR : RefinanceRateMonitorProduct.FIXED_30_YEAR;
  const preference = await getRefinanceAlertPreference(userId, propertyId);
  if (!preference.recipientInRolloutCohort || !preference.externalDeliveryEnabled) {
    return {
      status: 'UNAVAILABLE', reasonCode: !preference.recipientInRolloutCohort ? 'REFINANCE_ALERT_ROLLOUT_UNAVAILABLE' : 'REFINANCE_ALERT_DELIVERY_UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'rate-monitor-unavailable', title: 'Email rate alerts are not available for this account yet', body: 'Mortgage Refinance Radar can still show the latest governed benchmark and personalized review threshold in the app. Ask will not claim an external notification is active until delivery eligibility is confirmed.', tone: 'CAUTION', actions: [{ id: 'open-radar', label: 'Open Mortgage Refinance Radar', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] }],
      suggestions: ['Is refinancing worth reviewing now?'],
    };
  }
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const quietStart = preference.quietStart ?? '21:00';
  const quietEnd = preference.quietEnd ?? '07:00';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MONITOR_CONFIRMATION_REQUIRED',
    parameters: {
      thresholdPct, product, channel: 'EMAIL', cadence: 'IMMEDIATE', quietStart, quietEnd,
      timezone: preference.timezone || 'UTC', confirmationVersion, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'rate-monitor-review', title: 'Review this mortgage-rate monitor', body: 'No monitor has been created yet. Confirm the settings below to activate governed benchmark monitoring and email delivery.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `rate-monitor-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Start mortgage-rate monitoring?',
      description: 'ContractToCozy will evaluate newly ingested governed mortgage-rate snapshots and notify you when the selected benchmark is at or below your threshold.',
      fields: [
        { label: 'Benchmark', value: product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? '15-year fixed national benchmark' : '30-year fixed national benchmark' },
        { label: 'Threshold', value: `${thresholdPct.toFixed(3)}% or lower` },
        { label: 'Channel', value: 'Email plus in-app notification' },
        { label: 'Cadence', value: 'Immediate when a newly ingested snapshot qualifies' },
        { label: 'Quiet hours', value: `${quietStart}–${quietEnd} (${preference.timezone || 'UTC'})` },
        { label: 'Source boundary', value: 'Governed national benchmark—not a personalized lender quote' },
      ],
      confirmLabel: 'Start monitor',
      consentText: 'I consent to receive refinance threshold notifications by email using these settings.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function capabilityScore(message: string, capability: CapabilityCatalogItem): number {
  const query = tokenize(message);
  const text = tokenize([capability.label, capability.shortDescription, ...capability.intentAliases].join(' '));
  let score = 0;
  for (const token of query) if (text.has(token)) score += token.length > 7 ? 3 : 1;
  if (/refinanc/i.test(message) && capability.id === 'mortgage-refinance-radar') score += 20;
  if (/sell.*rent|rent.*sell/i.test(message) && capability.id === 'sell-hold-rent') score += 20;
  if (/quote/i.test(message) && capability.id === 'quote-comparison') score += 20;
  if (/saving|rebate|benefit/i.test(message) && capability.id === 'savings-benefits') score += 15;
  return score;
}

async function capabilityResult(userId: string, propertyId: string | null | undefined, message: string): Promise<AskOperationResult> {
  const catalog = buildCapabilityCatalog({
    registry: canonicalCapabilityRegistry,
    availability: createToolDiscoveryCapabilityAvailabilityAdapter(canonicalCapabilityRegistry),
    userId,
    propertyId: propertyId ?? undefined,
    includeWorkflowContext: false,
  });
  const ranked = catalog.capabilities
    .map((capability) => ({ capability, score: capabilityScore(message, capability) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.capability.label.localeCompare(right.capability.label))
    .slice(0, 3);
  if (!ranked.length) {
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'no-capability-match', title: 'Tell me what outcome you want',
        body: 'I could not identify one specific tool yet. Describe the decision, task, risk, savings goal, or major home moment you want help with.',
        tone: 'DEFAULT', actions: [{ id: 'explore-tools', label: 'Explore home tools', href: '/dashboard/tools', style: 'SECONDARY' }],
      }],
      suggestions: ['Help me compare contractor quotes', 'I want to plan future replacements', 'Can you monitor refinance rates?'],
    };
  }
  return {
    status: 'ANSWERED',
    contextVersion: catalog.registryVersion,
    blocks: [{
      type: 'CAPABILITY_LIST',
      id: 'capability-matches',
      title: ranked.length === 1 ? 'This tool matches your goal' : 'Tools that match your goal',
      description: 'Availability comes from the current ContractToCozy capability registry.',
      capabilities: ranked.map(({ capability }) => ({
        id: capability.id,
        label: capability.label,
        description: capability.shortDescription,
        expectedOutput: capability.expectedOutput,
        href: capability.href,
        readiness: propertyId || !capability.routeTemplate.includes('[id]') ? 'READY' : 'NEEDS_PROPERTY',
        releaseStage: capability.releaseStage,
      })),
    }],
    suggestions: ['What information does this tool need?', 'What result will I get?', 'Show another option'],
  };
}

function emergencyResult(): AskOperationResult {
  return {
    status: 'BLOCKED',
    reasonCode: 'IMMEDIATE_SAFETY',
    blocks: [{
      type: 'BOUNDARY', id: 'emergency-boundary', title: 'Treat this as an immediate safety issue', severity: 'EMERGENCY',
      body: 'Leave the affected area if you can do so safely. Call 911 or your local emergency service and the appropriate utility emergency line from a safe location. Do not operate switches, appliances, flames, or vehicles near a suspected gas leak.',
      suggestions: ['Follow instructions from emergency responders or the utility.', 'Do not wait for an app assessment when there may be immediate danger.'],
    }],
    suggestions: [],
  };
}

function outOfScopeResult(): AskOperationResult {
  return {
    status: 'OUT_OF_SCOPE',
    reasonCode: 'NOT_HOMEOWNER_DOMAIN',
    blocks: [{
      type: 'BOUNDARY', id: 'out-of-scope-boundary', title: 'Ask is focused on your home', severity: 'INFO',
      body: 'I can help with home records, maintenance, coverage, costs, tools, decisions, projects, and major home moments. I cannot create unrelated programs or general-purpose coding content here.',
      suggestions: ['What maintenance is pending?', 'Which items are missing coverage?', 'Is there a tool to help with refinancing?'],
    }],
    suggestions: [],
  };
}

async function groundedGuidanceResult(input: { userId: string; sessionId: string; message: string; propertyId?: string | null }): Promise<AskOperationResult> {
  const answer = await answerGroundedAsk({
    userId: input.userId,
    sessionId: input.sessionId,
    message: input.message,
    propertyId: input.propertyId ?? undefined,
  });
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'grounded-guidance', title: answer.groundingMode === 'PROPERTY' ? 'Guidance for this home' : 'General home guidance',
    body: answer.text, tone: answer.confidence.label === 'LOW' ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (answer.evidence.length) {
    blocks.push({ type: 'EVIDENCE', id: 'grounded-evidence', title: 'Sources used', items: answer.evidence.map((item) => ({ label: item.label, source: item.source, observedAt: item.observedAt })) });
  }
  return { status: 'ANSWERED', blocks, suggestions: [answer.nextAction].filter(Boolean) };
}

async function executeOperation(input: { userId: string; sessionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution }): Promise<AskOperationResult> {
  if (input.operation.requiresProperty && !input.propertyId) return needsPropertyResult();
  switch (input.operation.operationId) {
    case 'EMERGENCY_BOUNDARY': return emergencyResult();
    case 'OUT_OF_SCOPE_BOUNDARY': return outOfScopeResult();
    case 'MAINTENANCE_STATUS': return maintenanceResult(input.userId, input.propertyId!, input.message);
    case 'COVERAGE_GAPS': return coverageResult(input.propertyId!);
    case 'REPLACEMENT_GUIDANCE': return replacementGuidanceResult(input.userId, input.propertyId!);
    case 'REFINANCE_ANALYSIS': return refinanceAnalysisResult(input.userId, input.propertyId!);
    case 'REFINANCE_RATE_MONITOR': return refinanceRateMonitorResult(input.userId, input.propertyId!, input.message);
    case 'CAPABILITY_DISCOVERY': return capabilityResult(input.userId, input.propertyId, input.message);
    case 'GROUNDED_GUIDANCE': return groundedGuidanceResult(input);
  }
}

function mapPersistedExecution(execution: {
  id: string; sessionId: string; message: string; status: AskExecutionStatus; propertyId: string | null; operationId: string | null;
  operationVersion: string | null; intentFamily: string | null; contextVersion: string | null; resultJson: Prisma.JsonValue | null;
  createdAt: Date; updatedAt: Date;
}, property: { id: string; label: string } | null): AskExecutionResponse {
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { blocks?: unknown; captureRequests?: unknown; confirmation?: unknown; suggestions?: unknown }
    : {};
  return AskExecutionResponseSchema.parse({
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: execution.status,
    property,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? '1.0', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: stored.blocks ?? [],
    captureRequests: stored.captureRequests ?? [],
    confirmation: stored.confirmation ?? null,
    suggestions: stored.suggestions ?? [],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  });
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest): Promise<AskExecutionResponse> {
  if (input.propertyId) await ensurePropertyAccess(userId, input.propertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) return mapPersistedExecution(duplicate, await propertySummary(duplicate.propertyId));

  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const existingSession = await prisma.askSession.findUnique({ where: { id: input.sessionId } });
  if (existingSession && existingSession.userId !== userId) {
    const error = new Error('Ask session not found.');
    (error as Error & { code?: string }).code = 'ASK_SESSION_NOT_FOUND';
    throw error;
  }
  const session = existingSession
    ? await prisma.askSession.update({
      where: { id: existingSession.id },
      data: { propertyId: input.propertyId ?? undefined, lastActiveAt: new Date(), expiresAt },
    })
    : await prisma.askSession.create({
      data: { id: input.sessionId, userId, propertyId: input.propertyId ?? null, title: input.message.slice(0, 120), expiresAt },
    });
  const execution = await prisma.askExecution.create({
    data: {
      sessionId: session.id,
      userId,
      propertyId: input.propertyId ?? null,
      clientRequestId: input.clientRequestId,
      message: input.message,
      launchContextJson: input.launchContext ? asInputJson(input.launchContext) : undefined,
      status: 'ROUTING',
      expiresAt,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECEIVED', metadataJson: asInputJson({ surface: input.launchContext?.surface ?? 'unknown' }) } });

  const operation = resolveAskOperation(input.message);
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: { operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING' },
  });
  try {
    const result = await executeOperation({ userId, sessionId: session.id, message: input.message, propertyId: input.propertyId, operation });
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, suggestions: result.suggestions }),
        completedAt,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, blockTypes: result.blocks.map((block) => block.type) }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    await prisma.askExecution.update({ where: { id: execution.id }, data: { status: 'FAILED_RETRYABLE', errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED' } });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'FAILED_RETRYABLE', metadataJson: asInputJson({ operationId: operation.operationId }) } });
    throw caught;
  }
}

export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  const answerHash = createHash('sha256').update(JSON.stringify({ captureKey: input.captureKey, answer: input.answer, sensitiveDataConfirmed: input.sensitiveDataConfirmed ?? false })).digest('hex');
  const previousCapture = await prisma.askCaptureReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
  });
  if (previousCapture) {
    if (previousCapture.answerHash !== answerHash) {
      const error = new Error('The idempotency key was already used for a different inline answer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  if (!['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS'].includes(execution.operationId ?? '')) {
    const error = new Error('This execution does not have an active inline capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }

  let captureId: string;
  let capturedContextVersion: string;
  if (execution.operationId === 'REPLACEMENT_GUIDANCE') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
  } else {
    if (input.captureKey !== 'FINANCING_PROFILE_REFINANCE_INPUTS') {
      const error = new Error('This financing capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    if (input.sensitiveDataConfirmed !== true) {
      const error = new Error('Confirm the mortgage details before saving them to the Financing Profile.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_CONFIRMATION_REQUIRED';
      throw error;
    }
    const [currentContext, profile] = await Promise.all([
      getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR'),
      getProfile(execution.propertyId),
    ]);
    if (currentContext.contextVersion !== input.expectedContextVersion) {
      const error = new Error('The financing profile changed while this answer was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RefinanceProfileCaptureSchema.safeParse({
      currentMortgageBalanceUsd: input.answer.currentMortgageBalanceUsd ?? (profile?.currentMortgageBalanceCents == null ? undefined : profile.currentMortgageBalanceCents / 100),
      interestRatePct: input.answer.interestRatePct ?? (profile?.interestRateBps == null ? undefined : profile.interestRateBps / 100),
      remainingTermYears: input.answer.remainingTermYears ?? (profile?.remainingTermMonths == null ? undefined : profile.remainingTermMonths / 12),
      monthlyPaymentUsd: input.answer.monthlyPaymentUsd ?? (profile?.monthlyPaymentCents == null ? undefined : profile.monthlyPaymentCents / 100),
    });
    if (!candidate.success) {
      const error = new Error('Enter a valid balance, current rate, and remaining term.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    await upsertProfile(execution.propertyId, {
      currentMortgageBalanceCents: Math.round(candidate.data.currentMortgageBalanceUsd * 100),
      mortgageBalanceAsOfDate: input.answer.currentMortgageBalanceUsd === undefined ? undefined : new Date().toISOString(),
      interestRateBps: Math.round(candidate.data.interestRatePct * 100),
      remainingTermMonths: Math.max(1, Math.round(candidate.data.remainingTermYears * 12)),
      monthlyPaymentCents: candidate.data.monthlyPaymentUsd === undefined ? undefined : Math.round(candidate.data.monthlyPaymentUsd * 100),
    });
    const nextContext = await getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR');
    captureId = input.idempotencyKey;
    capturedContextVersion = nextContext.contextVersion;
  }
  const operation = resolveAskOperation(execution.message);
  const result = await executeOperation({
    userId, sessionId: execution.sessionId, message: execution.message, propertyId: execution.propertyId, operation,
  });
  const canonicalOwner = execution.operationId === 'REFINANCE_ANALYSIS' ? 'PropertyFinancingProfile' : 'InventoryItem';
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion ?? capturedContextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, suggestions: result.suggestions }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await tx.askCaptureReceipt.create({
      data: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner,
        answerHash,
        contextVersion: result.contextVersion ?? capturedContextVersion,
      },
    });
    await tx.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId, captureKey: input.captureKey, canonicalOwner, resumedStatus: result.status }) },
    });
    return updated;
  });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function confirmAskExecution(userId: string, executionId: string, input: SubmitAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  if (execution.operationId !== 'REFINANCE_RATE_MONITOR' || execution.status !== 'NEEDS_CONFIRMATION') {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const previous = await prisma.askConfirmationReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId, idempotencyKey: input.idempotencyKey } },
  });
  if (previous) {
    if (previous.inputHash !== inputHash) {
      const error = new Error('The idempotency key was already used for a different confirmation.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const expectedVersion = parameters.confirmationVersion;
  const expiresAt = typeof parameters.confirmationExpiresAt === 'string' ? new Date(parameters.confirmationExpiresAt) : null;
  if (expectedVersion !== input.confirmationVersion || !expiresAt || expiresAt <= new Date()) {
    const error = new Error('This confirmation expired. Ask again to review current monitor settings.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_EXPIRED';
    throw error;
  }
  const thresholdPct = parameters.thresholdPct;
  const product = parameters.product;
  if (typeof thresholdPct !== 'number' || (product !== 'FIXED_30_YEAR' && product !== 'FIXED_15_YEAR')) {
    const error = new Error('The monitor settings are invalid.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const monitor = await createOrUpdateRefinanceRateMonitor({
    userId, propertyId: execution.propertyId, thresholdPct,
    product: product as RefinanceRateMonitorProduct,
    cadence: NotificationCadence.IMMEDIATE,
    quietStart: typeof parameters.quietStart === 'string' ? parameters.quietStart : null,
    quietEnd: typeof parameters.quietEnd === 'string' ? parameters.quietEnd : null,
    timezone: typeof parameters.timezone === 'string' ? parameters.timezone : 'UTC',
  });
  const radarHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/tools/mortgage-refinance-radar?section=alerts`;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'RATE_MONITOR_ACTIVE',
    blocks: [{
      type: 'MONITOR', id: `rate-monitor-${monitor.id}`, monitorId: monitor.id,
      title: 'Mortgage-rate monitor is active', status: monitor.status,
      threshold: `${monitor.thresholdPct.toFixed(3)}% or lower`,
      product: monitor.product === 'FIXED_15_YEAR' ? '15-year fixed national benchmark' : '30-year fixed national benchmark',
      channel: 'Email plus in-app', cadence: monitor.cadence,
      quietHours: monitor.quietStart && monitor.quietEnd ? `${monitor.quietStart}–${monitor.quietEnd} (${monitor.timezone})` : null,
      sourceBoundary: 'Evaluates governed national benchmark snapshots; this is not a personalized lender offer.',
      actions: [
        { id: 'edit-monitor', label: 'Edit settings', href: radarHref, style: 'PRIMARY' },
        { id: 'pause-monitor', label: 'Pause', href: `${radarHref}&monitorAction=pause`, style: 'SECONDARY' },
        { id: 'stop-monitor', label: 'Stop', href: `${radarHref}&monitorAction=stop`, style: 'QUIET' },
      ],
    }],
    confirmation: null, suggestions: ['Is refinancing worth reviewing now?'],
  };
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.askExecution.update({
      where: { id: execution.id },
      data: { status: result.status, reasonCode: result.reasonCode, resultJson: asInputJson({ blocks: result.blocks, captureRequests: [], confirmation: null, suggestions: result.suggestions }), completedAt: new Date() },
    });
    await tx.askConfirmationReceipt.create({
      data: { executionId, idempotencyKey: input.idempotencyKey, confirmationVersion: input.confirmationVersion, artifactType: 'REFINANCE_RATE_MONITOR', artifactId: monitor.id, inputHash },
    });
    await tx.askExecutionEvent.create({ data: { executionId, eventType: 'CONFIRMED', metadataJson: asInputJson({ artifactType: 'REFINANCE_RATE_MONITOR', artifactId: monitor.id }) } });
    return updated;
  });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function cancelAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.status !== 'NEEDS_CONFIRMATION') return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  const blocks: AskPresentationBlock[] = [{ type: 'SUMMARY', id: 'confirmation-cancelled', title: 'Monitor not created', body: 'The pending mortgage-rate monitor was cancelled. No notification preference or threshold was changed.', tone: 'DEFAULT', actions: [] }];
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: { status: 'CANCELLED', reasonCode: 'USER_CANCELLED', resultJson: asInputJson({ blocks, captureRequests: [], confirmation: null, suggestions: ['Set a different rate threshold'] }), completedAt: new Date() },
  });
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED' } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function getAskSession(userId: string, sessionId: string): Promise<AskExecutionResponse[]> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!session) return [];
  const executions = await prisma.askExecution.findMany({ where: { sessionId, userId }, orderBy: { createdAt: 'asc' } });
  const propertyIds = [...new Set(executions.map((execution) => execution.propertyId).filter((value): value is string => Boolean(value)))];
  const properties = await prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true, address: true, city: true, state: true } });
  const labels = new Map(properties.map((property) => [property.id, { id: property.id, label: propertyLabel(property) }]));
  return executions.map((execution) => mapPersistedExecution(execution, execution.propertyId ? labels.get(execution.propertyId) ?? null : null));
}
