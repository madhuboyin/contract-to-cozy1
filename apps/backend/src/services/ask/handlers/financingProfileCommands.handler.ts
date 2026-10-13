// Editing the financing profile inside Ask (owner ruling 2026-10-13; FRD v1.333). Owner only. Reached only by the declared "Update my mortgage and
// purchase details" action on the Financing answer. The write is the canonical financingProfileWriter's: owner-only inside the writer, bound to the
// version of the profile the person was shown, NO_MORTGAGE clearing atomic, a field-level change log.
//
// The confirmation shows the EXACT before and after value of every field that would change (and every loan fact a "no mortgage" would clear); the
// conversation receipt is redacted: it names the fields that changed and never repeats an amount, a rate or a date. A current balance above the original is a caution the confirmation states
// and the owner's confirmation acknowledges; it is never inferred.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { getProfile } from '../../financing.service';
import { planFinancingProfileChange, updateFinancingProfile, type FinancingProfileField } from '../../financingProfile/financingProfileWriter';
import {
  FIELD_LABELS, FINANCING_PROFILE_CAPTURE_KEY, FINANCING_PROFILE_COMMAND_MESSAGE, FINANCING_PROFILE_ENTITY_TYPE, MORTGAGE_STATUS_CHOICES, MORTGAGE_STATUS_CHOICE_LABELS,
  MORTGAGE_TYPE_CHOICES, MORTGAGE_TYPE_CHOICE_LABELS, parseFinancingProfileAnswer,
} from '../support/financingProfileCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export interface FinancingProfileLaunch { entityId: string; sourceExecutionId: string | null }

const backToFinancing = { id: 'financing-profile-back', label: 'Back to financing', interactionType: 'START_WORKFLOW' as const, message: 'Show my financing', operationId: 'FINANCING_OVERVIEW' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'financing-profile-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'financing-profile-unavailable', title, body, tone: 'DEFAULT', actions: [backToFinancing] }], suggestions: [],
});

const versionOf = (propertyId: string, profile: { updatedAt: Date } | null) => sha(`financing-profile:${propertyId}:${profile ? profile.updatedAt.toISOString() : 'none'}`);

/** The exact value a field holds, for the confirmation (the receipt never uses this). */
function show(field: FinancingProfileField, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  switch (field) {
    case 'purchasePriceCents': case 'originalMortgageBalanceCents': case 'currentMortgageBalanceCents': case 'monthlyPaymentCents': case 'secondMortgageBalanceCents':
      return money(Number(value) / 100);
    case 'interestRateBps': return `${Number((Number(value) / 100).toFixed(2))}%`;
    case 'remainingTermMonths': return `${Number((Number(value) / 12).toFixed(1))} years (${value} months)`;
    case 'purchaseDate': case 'mortgageBalanceAsOfDate': return humanDate(new Date(String(value))) ?? String(value);
    case 'hasSecondMortgage': case 'hasPMI': return value ? 'Yes' : 'No';
    case 'mortgageStatus': return MORTGAGE_STATUS_CHOICE_LABELS[String(value)] ?? String(value);
    case 'mortgageType': return MORTGAGE_TYPE_CHOICE_LABELS[String(value)] ?? String(value);
    default: return String(value);
  }
}

function formCapture(contextVersion: string, current: Record<string, unknown>, entered?: Record<string, unknown>): AskCaptureRequest {
  const select = (key: string, label: string, values: readonly string[], labels: Record<string, string>) =>
    ({ key, label, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
  const money$ = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const date$ = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } });
  const yesNo = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } });
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : null);
  const seed = entered ?? {
    mortgageStatus: current.mortgageStatus, mortgageType: current.mortgageType,
    purchasePrice: typeof current.purchasePriceCents === 'number' ? current.purchasePriceCents / 100 : null, purchaseDate: iso(current.purchaseDate),
    originalBalance: typeof current.originalMortgageBalanceCents === 'number' ? current.originalMortgageBalanceCents / 100 : null,
    currentBalance: typeof current.currentMortgageBalanceCents === 'number' ? current.currentMortgageBalanceCents / 100 : null, balanceAsOf: iso(current.mortgageBalanceAsOfDate),
    ratePct: typeof current.interestRateBps === 'number' ? current.interestRateBps / 100 : null,
    remainingYears: typeof current.remainingTermMonths === 'number' ? Number((current.remainingTermMonths / 12).toFixed(2)) : null,
    monthlyPayment: typeof current.monthlyPaymentCents === 'number' ? current.monthlyPaymentCents / 100 : null,
    hasSecondMortgage: current.hasSecondMortgage === true ? 'YES' : current.hasSecondMortgage === false ? 'NO' : null,
    secondBalance: typeof current.secondMortgageBalanceCents === 'number' ? current.secondMortgageBalanceCents / 100 : null, hasPMI: current.hasPMI === true ? 'YES' : current.hasPMI === false ? 'NO' : null,
  };
  return {
    requirementId: 'financing-profile-update-inputs', captureKey: FINANCING_PROFILE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Your mortgage and purchase details', question: 'What should change?',
    helpText: 'These are the home’s recorded mortgage and purchase facts; only an owner can change them. Change only what is wrong; a blank keeps what is recorded. You will see the exact before and after, and nothing is saved until you confirm. Cozy does not contact your lender.',
    inputSchema: { type: 'GROUP', fields: [
      select('mortgageStatus', 'Mortgage', MORTGAGE_STATUS_CHOICES, MORTGAGE_STATUS_CHOICE_LABELS), select('mortgageType', 'Mortgage type', MORTGAGE_TYPE_CHOICES, MORTGAGE_TYPE_CHOICE_LABELS),
      money$('purchasePrice', 'Purchase price ($)'), date$('purchaseDate', 'Purchase date'),
      money$('originalBalance', 'Original balance ($)'), money$('currentBalance', 'Current balance ($)'), date$('balanceAsOf', 'Balance as of'),
      { key: 'ratePct', label: 'Interest rate (%)', required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 50 } },
      { key: 'remainingYears', label: 'Remaining term (years)', required: false, inputSchema: { type: 'NUMBER' as const, min: 0.1, max: 50 } },
      money$('monthlyPayment', 'Monthly payment ($)'), yesNo('hasSecondMortgage', 'Second mortgage'), money$('secondBalance', 'Second mortgage balance ($)'), yesNo('hasPMI', 'Private mortgage insurance (PMI)'),
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(seed).filter(([, v]) => v !== null && v !== undefined && v !== '')),
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function financingProfileCommandResult(userId: string, propertyId: string, launch: FinancingProfileLaunch, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role !== HouseholdRole.OWNER) {
    return blocked('ASK_OWNER_REQUIRED', 'Only an owner can change the financing profile', 'The mortgage and purchase facts feed equity, refinance and sale analysis, so changing them is an owner’s decision. Nothing has changed.');
  }
  const profile = await getProfile(propertyId);
  const contextVersion = versionOf(propertyId, profile);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'FINANCING_PROFILE_INPUT_REQUIRED', contextVersion,
      parameters: { financingProfileLaunch: { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'financing-profile-input', title: 'Your mortgage and purchase details', body: 'The form shows what is recorded. Change what is wrong, then review the exact before and after. Nothing has been saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(contextVersion, (profile ?? {}) as Record<string, unknown>)], suggestions: [],
    };
  }
  const parsed = parseFinancingProfileAnswer(supplied);
  if (!parsed.success) return unavailable('FINANCING_PROFILE_NOTHING_TO_CHANGE', 'Nothing to change', 'Fill in at least one thing that should change. Nothing has changed.');

  // Dry run through the canonical planner: the same rules the write will apply, with no write.
  let plan; let caution = false;
  try {
    try {
      plan = planFinancingProfileChange(profile as never, parsed.changes);
    } catch (error) {
      if ((error as { code?: string }).code !== 'BALANCE_EXCEEDS_ORIGINAL') throw error;
      caution = true;
      plan = planFinancingProfileChange(profile as never, parsed.changes, { acknowledgeBalanceExceedsOriginal: true });
    }
  } catch (error) {
    return unavailable('FINANCING_PROFILE_CONFLICT', 'That combination cannot be saved', `${(error as Error).message} Nothing has changed.`);
  }
  if (!plan.diff.length) return unavailable('FINANCING_PROFILE_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  const clearing = plan.diff.some((d) => d.field === 'mortgageStatus' && d.after === 'NO_MORTGAGE');
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const description = [
    'This changes the home’s financing profile, which feeds equity, refinance and sale analysis. Cozy does not contact your lender.',
    clearing ? 'Recording no mortgage also clears every loan detail listed below, in the same save.' : null,
    caution ? 'Caution: the current balance is higher than the original balance. That can be right, for example with capitalized interest. Confirming says it is intended.' : null,
  ].filter(Boolean).join(' ');
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'FINANCING_PROFILE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      financingProfileForm: supplied, financingProfileCommand: { entityId: launch.entityId }, financingProfileContextVersion: contextVersion,
      financingProfileExpectedUpdatedAt: profile?.updatedAt.toISOString() ?? null, financingProfileBalanceAcknowledged: caution,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'financing-profile-review', title: 'Review the exact changes', body: 'Nothing is saved until you confirm.', tone: caution ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `financing-profile-${sha(`${propertyId}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1,
      title: `Save ${plan.diff.length} change${plan.diff.length === 1 ? '' : 's'} to your financing profile?`, description,
      fields: plan.diff.map((d) => ({ label: FIELD_LABELS[d.field], value: `${show(d.field, d.before)} → ${show(d.field, d.after)}` })),
      editableFields: [], confirmLabel: 'Save to financing profile',
      consentText: caution ? 'I confirm the current balance is higher than the original balance on purpose, and I authorize these changes to the shared home record.' : 'I authorize these changes to the shared home record.',
      expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(contextVersion, (profile ?? {}) as Record<string, unknown>, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('financing-profile.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== FINANCING_PROFILE_COMMAND_MESSAGE || launch?.operationId !== 'FINANCING_PROFILE_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId
    || launch.entityType !== FINANCING_PROFILE_ENTITY_TYPE) {
    return unavailable('ASK_FINANCING_PROFILE_NOT_DIRECTLY_ROUTABLE', 'Open your financing first', 'Your mortgage and purchase details are changed from your financing answer. Nothing has changed.');
  }
  return financingProfileCommandResult(envelope.userId, envelope.propertyId!, { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmFinancingProfile(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role !== HouseholdRole.OWNER) throw stale('Only an owner can change the financing profile.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  const parsed = parseFinancingProfileAnswer(parameters.financingProfileForm);
  if (!parsed.success) throw stale('The details to save are invalid.');
  const profile = await getProfile(propertyId);
  if (parameters.financingProfileContextVersion !== versionOf(propertyId, profile)) {
    throw stale('Your financing profile changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  let changedFields: Array<{ field: FinancingProfileField }> = [];
  try {
    const out = await updateFinancingProfile({
      propertyId, actor: { kind: 'USER', userId, role: ctx.access.role as HouseholdRole }, surface: 'ASK', changes: parsed.changes,
      expectedUpdatedAt: typeof parameters.financingProfileExpectedUpdatedAt === 'string' ? parameters.financingProfileExpectedUpdatedAt : null,
      // Only when the confirmation the owner saw stated the caution.
      acknowledgeBalanceExceedsOriginal: parameters.financingProfileBalanceAcknowledged === true,
    });
    changedFields = out.changedFields;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FINANCING_PROFILE_STALE') throw stale((error as Error).message, 'ASK_CONTEXT_VERSION_CONFLICT');
    if (error instanceof Error && (!code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const names = changedFields.map((c) => FIELD_LABELS[c.field]);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'FINANCING_PROFILE_UPDATED',
    // Redacted: the fields that changed, never their values.
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `financing-profile-updated-${propertyId}`, title: 'Financing profile updated', status: 'COMPLETED',
      description: names.length ? `Changed: ${names.join(', ')}. The change is recorded in the profile’s history, which owners can review.` : 'Nothing needed to change.',
      details: [], actions: [{ ...backToFinancing, label: 'See my financing', style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `financing-profile-refresh-failed-${propertyId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'PROPERTY_FINANCING_PROFILE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('financing-profile.command', confirmFinancingProfile);
