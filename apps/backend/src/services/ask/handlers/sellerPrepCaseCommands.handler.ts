// The sale case inside Ask (register P2 "Seller Prep"; FRD v1.338). Reached only by the declared case actions on the seller-prep answer. Every write is
// PropertySaleCaseService's (createCase, updateTargetDates, updateBudgetRange, transitionStatus), the routes' own calls, behind a review and a
// confirmation. A stage change here records where the household's sale stands; it lists, contracts or closes nothing with anyone, and says so.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { PropertySaleCaseService } from '../../propertySaleCase.service';
import {
  BUDGET_RANGES, BUDGET_RANGE_LABELS, SALE_CASE_FORM_CAPTURE_KEYS, SALE_CASE_MESSAGES, SALE_STATUS_LABELS, legalNextStatuses, parseSaleCaseAnswer, saleCaseKindFromMessage,
  type SaleCaseFormKind, type SaleCaseKind,
} from '../support/sellerPrepCaseCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToChecklist = { id: 'seller-prep-back', label: 'Back to my checklist', interactionType: 'START_WORKFLOW' as const, message: 'Show my seller prep checklist', operationId: 'SELLER_PREP_CHECKLIST' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'seller-prep-case-unavailable', title, body, tone: 'DEFAULT', actions: [backToChecklist] }], suggestions: [],
});
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const day = (value: unknown) => (typeof value === 'string' ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
const versionOf = (c: { id?: string; status?: string; targetListDate?: Date | null; targetCloseDate?: Date | null; budgetRange?: string | null; updatedAt?: Date } | null, propertyId: string) =>
  sha(`sale-case:${c?.id ?? propertyId}:${c?.status ?? 'none'}:${iso(c?.targetListDate) ?? ''}:${iso(c?.targetCloseDate) ?? ''}:${c?.budgetRange ?? ''}:${c?.updatedAt?.toISOString() ?? ''}`);

function formCapture(kind: SaleCaseFormKind, contextVersion: string, saleCase: { status: string; targetListDate: Date | null; targetCloseDate: Date | null; budgetRange: string | null }): AskCaptureRequest {
  const date = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const forms = {
    DATES: { title: 'Target dates for the sale', question: 'When do you want to list and close?', help: 'A blank keeps the date as it is. These are your own targets, not dates anyone has agreed to.',
      fields: [date('targetListDate', 'Target listing date'), date('targetCloseDate', 'Target closing date')], seed: { targetListDate: iso(saleCase.targetListDate), targetCloseDate: iso(saleCase.targetCloseDate) } },
    BUDGET: { title: 'Prep budget range', question: 'About how much do you plan to spend getting the home ready?', help: 'It is used to prioritise the checklist. Nothing is spent or committed.',
      fields: [{ key: 'budgetRange', label: 'Budget range', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [...BUDGET_RANGES, 'NONE'].map((v) => ({ label: BUDGET_RANGE_LABELS[v], value: v })) } }], seed: { budgetRange: saleCase.budgetRange ?? 'NONE' } },
    STATUS: { title: 'Where does the sale stand?', question: 'Which stage has it reached?', help: 'This records where your sale stands. It lists, contracts or closes nothing with anyone.',
      fields: [{ key: 'status', label: 'Next stage', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: legalNextStatuses(saleCase.status).map((v) => ({ label: v === 'CANCELLED' ? 'Cancel the sale' : SALE_STATUS_LABELS[v], value: v })) } }], seed: {} },
  } as const;
  const spec = forms[kind];
  return {
    requirementId: `seller-prep-case-${kind.toLowerCase()}-inputs`, captureKey: SALE_CASE_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.question, helpText: spec.help,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(spec.seed).filter(([, v]) => v !== null && v !== undefined)), allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function saleCaseCommandResult(userId: string, propertyId: string, launch: { kind: SaleCaseKind; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'seller-prep-case-permission', title: 'A contributor or owner can change the sale case', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const overview = await PropertySaleCaseService.getCase(userId, propertyId);
  const saleCase = overview.saleCase as { id: string; status: string; targetListDate: Date | null; targetCloseDate: Date | null; budgetRange: string | null; updatedAt?: Date } | null;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `seller-prep-case-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  const contextVersion = versionOf(saleCase, propertyId);

  if (kind === 'START') {
    if (saleCase) return unavailable('SELLER_PREP_CASE_EXISTS', 'A sale case already exists', 'Nothing has changed.');
    if (!overview.canCreate) return unavailable('SELLER_PREP_CASE_NOT_AVAILABLE', 'A sale case is not available yet', 'A sale case can be started once this property is marked for sale. Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'SELLER_PREP_CASE_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { saleCaseCommand: { kind, entityId: propertyId }, saleCaseContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'seller-prep-case-start-review', title: 'Start a sale case?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`start-${sha(propertyId).slice(0, 12)}`, {
        title: 'Start a sale case for this home?', confirmLabel: 'Start the sale case',
        description: 'This opens a seller-prep checklist for this home, with repairs, records and presentation work prioritised. It does not list the home or contact anyone.', fields: [{ label: 'Home', value: 'This property' }],
      }),
      suggestions: [],
    };
  }
  if (!saleCase) return unavailable('SELLER_PREP_NO_ACTIVE_CASE', 'There is no sale case yet', 'Start a sale case first. Nothing has changed.');
  const formKind = kind as SaleCaseFormKind;
  if (kind === 'STATUS' && !legalNextStatuses(saleCase.status).length) return unavailable('SELLER_PREP_STATUS_FINAL', 'The sale is already finished', 'There is no next stage. Nothing has changed.');
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `SELLER_PREP_CASE_${kind}_INPUT_REQUIRED`, contextVersion, parameters: { saleCaseLaunch: { kind, entityId: propertyId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'seller-prep-case-input', title: 'Your sale case', body: `It is ${SALE_STATUS_LABELS[saleCase.status]?.toLowerCase() ?? saleCase.status.toLowerCase()}. Nothing has been saved yet.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, saleCase)], suggestions: [],
    };
  }
  const parsed = parseSaleCaseAnswer(formKind, supplied);
  if (!parsed.success) {
    return unavailable('SELLER_PREP_CASE_INPUT_INVALID', parsed.reason === 'ORDER' ? 'The closing date is before the listing date' : 'Check the details', parsed.reason === 'ORDER' ? 'Choose a closing date on or after the listing date. Nothing has changed.' : 'Fill in what changes. Nothing has changed.');
  }
  const d = parsed.data;
  let spec: Parameters<typeof confirmation>[1];
  if (formKind === 'DATES') {
    spec = {
      title: 'Save the target dates?', confirmLabel: 'Save dates', description: 'These are your own targets. They are not dates anyone has agreed to.',
      fields: [
        ...(d.targetListDate ? [{ label: 'Target listing date', value: `${humanDate(saleCase.targetListDate ?? null) ?? 'Not set'} → ${day(d.targetListDate)}` }] : []),
        ...(d.targetCloseDate ? [{ label: 'Target closing date', value: `${humanDate(saleCase.targetCloseDate ?? null) ?? 'Not set'} → ${day(d.targetCloseDate)}` }] : []),
      ],
    };
  } else if (formKind === 'BUDGET') {
    spec = {
      title: 'Save the prep budget range?', confirmLabel: 'Save range', description: 'It is used to prioritise the checklist. Nothing is spent or committed.',
      fields: [{ label: 'Prep budget', value: `${BUDGET_RANGE_LABELS[saleCase.budgetRange ?? 'NONE']} → ${BUDGET_RANGE_LABELS[String(d.budgetRange)]}` }],
    };
  } else {
    if (!legalNextStatuses(saleCase.status).includes(d.status as never)) return unavailable('SELLER_PREP_STATUS_NOT_ALLOWED', 'That is not the next stage', 'The sale moves one stage at a time, or can be cancelled. Nothing has changed.');
    spec = {
      title: d.status === 'CANCELLED' ? 'Cancel the sale?' : `Record the sale as ${SALE_STATUS_LABELS[String(d.status)].toLowerCase()}?`, confirmLabel: d.status === 'CANCELLED' ? 'Cancel the sale' : 'Record it',
      description: 'This records where your sale stands. It lists, contracts or closes nothing with anyone, and a finished or cancelled sale cannot be moved again.',
      fields: [{ label: 'Stage', value: `${SALE_STATUS_LABELS[saleCase.status]} → ${SALE_STATUS_LABELS[String(d.status)]}` }],
    };
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SELLER_PREP_CASE_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { saleCaseForm: supplied, saleCaseCommand: { kind, entityId: propertyId }, saleCaseContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'seller-prep-case-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: d.status === 'CANCELLED' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`, spec),
    captureRequests: [formCapture(formKind, contextVersion, saleCase)], suggestions: [],
  };
}

registerCapabilityHandler('seller-prep-case.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = saleCaseKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'SELLER_PREP_CASE_COMMAND' || launch.surface === 'ASK_REFRESH') {
    return unavailable('ASK_SELLER_PREP_CASE_NOT_DIRECTLY_ROUTABLE', 'Open your seller prep first', 'The sale case is changed from your seller-prep checklist. Nothing has changed.');
  }
  return saleCaseCommandResult(envelope.userId, envelope.propertyId!, { kind, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmSaleCase(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.saleCaseCommand as { kind?: unknown } | undefined;
  const kind = command?.kind as SaleCaseKind | undefined;
  if (!kind || !(kind in SALE_CASE_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  try {
    const overview = await PropertySaleCaseService.getCase(userId, propertyId);
    const saleCase = overview.saleCase as { status: string; targetListDate: Date | null; targetCloseDate: Date | null; budgetRange: string | null; updatedAt?: Date; id: string } | null;
    if (parameters.saleCaseContextVersion !== versionOf(saleCase, propertyId)) throw stale('Your sale case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'START') {
      if (saleCase) throw stale('A sale case already exists.');
      await PropertySaleCaseService.createCase(userId, propertyId); title = 'Sale case started';
    } else {
      if (!saleCase) throw stale('There is no sale case.');
      const parsed = parseSaleCaseAnswer(kind as SaleCaseFormKind, parameters.saleCaseForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data;
      if (kind === 'DATES') {
        await PropertySaleCaseService.updateTargetDates(userId, propertyId, {
          ...(typeof d.targetListDate === 'string' ? { targetListDate: new Date(`${d.targetListDate}T12:00:00.000Z`) } : {}),
          ...(typeof d.targetCloseDate === 'string' ? { targetCloseDate: new Date(`${d.targetCloseDate}T12:00:00.000Z`) } : {}),
        });
        title = 'Target dates saved';
      } else if (kind === 'BUDGET') {
        await PropertySaleCaseService.updateBudgetRange(userId, propertyId, d.budgetRange === 'NONE' ? null : (d.budgetRange as never));
        title = 'Prep budget range saved';
      } else {
        if (!legalNextStatuses(saleCase.status).includes(d.status as never)) throw stale('That is not the next stage for this sale.');
        await PropertySaleCaseService.transitionStatus(userId, propertyId, d.status as never);
        title = 'Sale stage recorded';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SELLER_PREP_CASE_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `seller-prep-case-${kind.toLowerCase()}-${propertyId}`, title, status: 'COMPLETED', description: 'It is on your sale case. Nothing was listed, contracted or closed with anyone.', details: [], actions: [{ ...backToChecklist, label: 'See my checklist', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `seller-prep-case-refresh-failed-${propertyId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_SALE_CASE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('seller-prep-case.command', confirmSaleCase);
