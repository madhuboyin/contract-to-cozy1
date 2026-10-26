// Recurring-cost setup inside Ask (parity with the desktop "Recurring costs" tab). Two declared steps on the savings answer, both kinds of the existing
// SAVINGS_BENEFIT_COMMAND: PLAN saves the household's current plan for one category, and CHECK re-runs the comparison for one category or all of them.
// Both go through the same HomeSavingsService the routes call, behind a review card and a confirmation. The service serves the home's primary owner only,
// and Ask says so. Saving a plan makes the service re-run that category's comparison, so PLAN is also a check. The comparison is a benchmark computed from
// the plan and this home's details: it contacts no provider and is never a quote.
import { createHash } from 'node:crypto';
import { HomeSavingsRunTrigger, HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { HomeSavingsService } from '../../homeSavings.service';
import {
  SAVINGS_BILLING_CADENCES, SAVINGS_BILLING_CADENCE_LABELS, SAVINGS_RATE_TYPES, SAVINGS_RECURRING_ALL, SAVINGS_RECURRING_LABELS, SAVINGS_RECURRING_PLAN_CAPTURE_KEY,
  formatPlanAmount, SAVINGS_SOURCE_LABELS, isSavingsRecurringCategory, parseSavingsPlanAnswer, savingsPlanFields, savingsPlanPayload, type SavingsPlanForm, type SavingsRecurringCategory,
} from '../support/savingsRecurringSetup';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;
const homeSavingsService = new HomeSavingsService();

export interface RecurringSetupLaunch { kind: 'PLAN' | 'CHECK'; entityId: string; sourceExecutionId: string | null }

const backToSavings = { id: 'savings-benefit-back', label: 'Back to my savings', interactionType: 'START_WORKFLOW' as const, message: 'Show my savings opportunities', operationId: 'SAVINGS_OPPORTUNITIES' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'savings-recurring-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'savings-recurring-unavailable', title, body, tone: 'DEFAULT', actions: [backToSavings] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));

interface AccountRow { canonicalSource: 'INSURANCE_POLICY' | 'WARRANTY' | null; id: string; providerName: string | null; planName: string | null; billingCadence: string; amount: unknown; renewalDate: Date | null; contractEndDate: Date | null; usageJson: unknown; planDetailsJson: unknown; updatedAt: Date }
/**
 * The saved plan, and whether its facts really live on a linked insurance policy or warranty record. The comparison reads those records and ignores the
 * account row's own values for a linked account, so a plan saved over one here would change nothing; Ask says so instead of saving it.
 */
const loadAccount = async (propertyId: string, category: SavingsRecurringCategory): Promise<AccountRow | null> => {
  const row = await database.homeSavingsAccount.findFirst({
    where: { propertyId, categoryKey: category }, orderBy: { updatedAt: 'desc' },
    select: {
      id: true, providerName: true, planName: true, billingCadence: true, amount: true, renewalDate: true, contractEndDate: true, usageJson: true, planDetailsJson: true, updatedAt: true,
      insurancePolicyId: true, warrantyId: true, insurancePolicy: { select: { id: true } }, warranty: { select: { id: true } },
    },
  });
  if (!row) return null;
  const { insurancePolicyId, warrantyId, insurancePolicy, warranty, ...own } = row;
  return { ...own, canonicalSource: insurancePolicyId && insurancePolicy ? 'INSURANCE_POLICY' : warrantyId && warranty ? 'WARRANTY' : null };
};
const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** A saved plan, as the form's own answer, so Update opens with what is already on file. */
function prefill(category: SavingsRecurringCategory, account: AccountRow | null): Record<string, unknown> {
  if (!account) return {};
  const usage = record(account.usageJson); const details = record(account.planDetailsJson);
  return {
    providerName: account.providerName ?? '', planName: account.planName ?? '', billingCadence: account.billingCadence,
    amount: account.amount == null ? '' : Number(account.amount), renewalDate: day(account.renewalDate), contractEndDate: day(account.contractEndDate),
    ...(category === 'INTERNET' ? { speedTier: typeof usage.speedTier === 'string' ? usage.speedTier : '' } : {}),
    ...(category === 'ELECTRICITY_GAS' ? { rateType: typeof details.rateType === 'string' ? details.rateType : '', usageKwh: typeof usage.kwhMonthly === 'number' ? usage.kwhMonthly : '' } : {}),
  };
}

const planVersion = (category: SavingsRecurringCategory, account: AccountRow | null) => sha(`savings:PLAN:${category}:${account?.id ?? 'none'}:${account?.updatedAt.toISOString() ?? ''}`);
async function checkVersion(propertyId: string, entityId: string): Promise<string> {
  const accounts = await database.homeSavingsAccount.findMany({ where: { propertyId, ...(entityId === SAVINGS_RECURRING_ALL ? {} : { categoryKey: entityId }) }, select: { id: true, updatedAt: true } }) as Array<{ id: string; updatedAt: Date }>;
  return sha(`savings:CHECK:${entityId}:${accounts.map((account) => `${account.id}@${account.updatedAt.toISOString()}`).sort().join(',')}`);
}

function planCapture(category: SavingsRecurringCategory, contextVersion: string, entered: Record<string, unknown>): AskCaptureRequest {
  const allowed = savingsPlanFields(category);
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const text = (key: string, label: string, max: number, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const number = (key: string, label: string, required: boolean, help?: string) => ({ key, label, ...(help ? { helpText: help } : {}), required, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000 } });
  const date = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const label = SAVINGS_RECURRING_LABELS[category];
  return {
    requirementId: 'savings-recurring-plan-inputs', captureKey: SAVINGS_RECURRING_PLAN_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Your current ${label.toLowerCase()} plan`, question: 'What do you pay now?',
    helpText: 'Ask compares this with benchmarks for your area. It is an estimate, never a quote, and nothing is sent to a provider. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      text('providerName', 'Provider', 200), text('planName', 'Plan name', 200),
      { key: 'billingCadence', label: 'How often you are billed', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: SAVINGS_BILLING_CADENCES.map((value) => ({ label: SAVINGS_BILLING_CADENCE_LABELS[value], value })) } },
      number('amount', 'Amount per billing period ($)', true, 'What you pay each time you are billed.'),
      ...(allowed.renewalDate ? [date('renewalDate', 'Renewal date')] : []),
      ...(allowed.contractEndDate ? [date('contractEndDate', 'Contract end date')] : []),
      ...(allowed.speedTier ? [text('speedTier', 'Speed tier', 120, 'For example 500 Mbps.')] : []),
      ...(allowed.rateType ? [{ key: 'rateType', label: 'Rate type', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: SAVINGS_RATE_TYPES.map((value) => ({ label: value === 'FIXED' ? 'Fixed' : 'Variable', value })) } }] : []),
      ...(allowed.usageKwh ? [number('usageKwh', 'Monthly usage (kWh)', false, 'Optional.')] : []),
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this plan; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function recurringSetupResult(userId: string, propertyId: string, launch: RecurringSetupLaunch, supplied?: SavingsPlanForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change savings records', 'Your role can view this home but not change it. Nothing has changed.');
  if (!await isPrimaryOwner(userId, propertyId)) {
    return blocked('SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY', 'Only the home’s primary owner can set up recurring costs', 'Recurring-cost plans are kept for the home’s primary account holder. Nothing has changed.');
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `savings-recurring-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });

  if (launch.kind === 'CHECK') {
    if (launch.entityId !== SAVINGS_RECURRING_ALL && !isSavingsRecurringCategory(launch.entityId)) return unavailable('SAVINGS_CATEGORY_NOT_FOUND', 'That cost is not one Ask can check', 'Nothing has changed.');
    const all = launch.entityId === SAVINGS_RECURRING_ALL;
    const label = all ? 'all your recurring costs' : SAVINGS_RECURRING_LABELS[launch.entityId as SavingsRecurringCategory].toLowerCase();
    const contextVersion = await checkVersion(propertyId, launch.entityId);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'SAVINGS_RECURRING_CHECK_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { savingsCommand: { kind: 'CHECK', entityId: launch.entityId }, savingsContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'savings-recurring-check-review', title: `Check ${label} for savings?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`check-${sha(launch.entityId).slice(0, 12)}`, {
        title: `Check ${label} for savings?`, confirmLabel: 'Check for savings',
        description: 'This compares the plans you saved with benchmarks for this home and area, and refreshes your savings list. The results are estimates, not quotes, and nothing is sent to a provider. A cost with no saved plan is compared on the home’s details alone.',
        fields: [{ label: 'Checking', value: all ? 'Every recurring cost' : SAVINGS_RECURRING_LABELS[launch.entityId as SavingsRecurringCategory] }],
      }),
      suggestions: [],
    };
  }

  if (!isSavingsRecurringCategory(launch.entityId)) return unavailable('SAVINGS_CATEGORY_NOT_FOUND', 'That cost is not one Ask can set up', 'Nothing has changed.');
  const category = launch.entityId;
  const label = SAVINGS_RECURRING_LABELS[category];
  const account = await loadAccount(propertyId, category);
  if (account?.canonicalSource) {
    const source = SAVINGS_SOURCE_LABELS[account.canonicalSource];
    return unavailable('SAVINGS_PLAN_FROM_RECORD', `Your ${label.toLowerCase()} plan comes from your ${source}`,
      `The provider, price and dates for this cost are read from your ${source}, and the comparison uses that record, so a plan saved here would change nothing. ${account.canonicalSource === 'WARRANTY' ? 'Update the warranty record itself and the comparison follows it.' : 'Ask cannot edit an insurance policy yet; the comparison uses the policy as recorded.'} Nothing has changed.`);
  }
  const contextVersion = planVersion(category, account);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'SAVINGS_RECURRING_PLAN_INPUT_REQUIRED', contextVersion,
      parameters: { savingsCommandLaunch: { kind: 'PLAN', entityId: category, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'savings-recurring-plan-input', title: account ? `Update your ${label.toLowerCase()} plan` : `Set up your ${label.toLowerCase()} plan`, body: account ? 'Your saved plan is filled in. Nothing changes until you confirm.' : 'Nothing has been saved yet.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [planCapture(category, contextVersion, prefill(category, account))], suggestions: [],
    };
  }
  const date = (value: string | null | undefined) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
  const row = (name: string, value: string | null) => (value ? [{ label: name, value }] : []);
  // What a blank answer removes from the saved plan, named so the review never looks like it kept a value it will clear.
  const allowed = savingsPlanFields(category);
  const before = prefill(category, account);
  const cleared = [
    ...(before.providerName && !supplied.providerName ? ['Provider'] : []), ...(before.planName && !supplied.planName ? ['Plan name'] : []),
    ...(allowed.renewalDate && before.renewalDate && !supplied.renewalDate ? ['Renewal date'] : []), ...(allowed.contractEndDate && before.contractEndDate && !supplied.contractEndDate ? ['Contract end date'] : []),
  ];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'SAVINGS_RECURRING_PLAN_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { savingsPlan: supplied, savingsCommand: { kind: 'PLAN', entityId: category }, savingsContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'savings-recurring-plan-review', title: `Review your ${label.toLowerCase()} plan`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(`plan-${sha(`${category}:${JSON.stringify(supplied)}`).slice(0, 12)}`, {
      title: `${account ? 'Update' : 'Save'} your ${label.toLowerCase()} plan?`, confirmLabel: account ? 'Update the plan' : 'Save the plan',
      description: `This saves the plan to the shared home record and compares it with benchmarks for this home and area, which refreshes your savings list. The result is an estimate, not a quote, and nothing is sent to a provider.${account ? ' A field you leave blank is cleared from the saved plan.' : ''}`,
      fields: [
        { label: 'Cost', value: label }, ...row('Provider', supplied.providerName ?? null), ...row('Plan', supplied.planName ?? null),
        { label: 'You pay', value: `${formatPlanAmount(supplied.amount)} ${SAVINGS_BILLING_CADENCE_LABELS[supplied.billingCadence].toLowerCase()}` },
        ...row('Renews', date(supplied.renewalDate)), ...row('Contract ends', date(supplied.contractEndDate)), ...row('Speed', supplied.speedTier ?? null),
        ...row('Clearing', cleared.length ? cleared.join(', ') : null), ...row('Rate type', supplied.rateType ? (supplied.rateType === 'FIXED' ? 'Fixed' : 'Variable') : null), ...row('Monthly usage', supplied.usageKwh != null ? `${supplied.usageKwh} kWh` : null),
      ],
    }),
    captureRequests: [planCapture(category, contextVersion, supplied as unknown as Record<string, unknown>)], suggestions: [],
  };
}

export async function confirmRecurringSetup(ctx: ConfirmCapabilityContext, kind: 'PLAN' | 'CHECK', entityId: string): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  if (!await isPrimaryOwner(userId, propertyId)) throw stale('Only the home’s primary owner can change savings records.', 'ASK_PERMISSION_REQUIRED');
  let title: string; let description: string; let limitation: string | null = null;
  try {
    if (kind === 'PLAN') {
      if (!isSavingsRecurringCategory(entityId)) throw stale('The change to make is invalid.');
      const account = await loadAccount(propertyId, entityId);
      if (account?.canonicalSource) throw stale('This plan now comes from a linked record, so it cannot be changed here.');
      if (parameters.savingsContextVersion !== planVersion(entityId, account)) throw stale('This plan changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const checked = parseSavingsPlanAnswer(entityId, parameters.savingsPlan);
      if (!checked.success) throw stale('The details to save are invalid.');
      try {
        await homeSavingsService.upsertAccount(propertyId, entityId, userId, savingsPlanPayload(entityId, checked.data) as never);
      } catch (error) {
        // The service saves the plan first and can then fail to queue the wider re-evaluation; the plan is saved, so say so rather than fail the step.
        if (error instanceof Error && /^Account saved/.test(error.message)) limitation = error.message;
        else throw error;
      }
      title = account ? 'Plan updated' : 'Plan saved';
      description = 'Your savings list is refreshed from it. The result is a benchmark estimate, not a quote.';
    } else {
      if (entityId !== SAVINGS_RECURRING_ALL && !isSavingsRecurringCategory(entityId)) throw stale('The change to make is invalid.');
      if (parameters.savingsContextVersion !== await checkVersion(propertyId, entityId)) throw stale('Your saved plans changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await homeSavingsService.runComparison(propertyId, userId, entityId === SAVINGS_RECURRING_ALL ? {} : { categoryKey: entityId } as never, HomeSavingsRunTrigger.MANUAL);
      title = 'Savings checked'; description = 'Your savings list is refreshed. The results are benchmark estimates, not quotes.';
    }
  } catch (error) {
    // The service's refusals are written for a person; Ask codes pass through.
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SAVINGS_RECURRING_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `savings-recurring-${kind.toLowerCase()}-${entityId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToSavings, label: 'See my savings', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  if (limitation) result.blocks.push({ type: 'LIMITATION', id: `savings-recurring-limitation-${entityId}`, severity: 'CAUTION', title: 'Saved; one follow-up did not finish', body: limitation });
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `savings-recurring-refresh-failed-${entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'SAVINGS_BENEFIT_ACTION', artifactId: entityId, refreshedExecutions: refresh.refreshedExecutions };
}
