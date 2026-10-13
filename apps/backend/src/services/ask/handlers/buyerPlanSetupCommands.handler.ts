// Three small buyer setup records inside Ask (register P2 "Buyer Closing"; FRD v1.353): how the purchase is paid for, the inspection plan and the
// title or escrow contact. Reached only by the declared actions on the lender offers, inspection and title answers. Every write is the service's own
// method (the routes' calls), behind a review and a confirmation bound to the record. Ask never schedules an inspector or contacts anyone.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerAcquisitionService } from '../../buyerAcquisition.service';
import { BuyerPurchaseLoanEstimateService } from '../../buyerPurchaseLoanEstimate.service';
import { BuyerTitleEscrowService } from '../../buyerTitleEscrow.service';
import {
  CONTACT_ROLE_LABELS, PATH_LABELS, SETUP_CAPTURE_KEYS, SETUP_MESSAGES, SPECIALIST_SCOPE_VALUES, parseSetupAnswer, scopeLabel, setupKindFromMessage, type SetupKind,
} from '../support/buyerPlanSetupCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const BACK: Record<SetupKind, { label: string; message: string; operationId: 'BUYER_LOAN_ESTIMATES' | 'BUYER_INSPECTION_REVIEW' | 'BUYER_TITLE_ESCROW_READINESS' }> = {
  PATH_SET: { label: 'Back to my lender offers', message: 'Show my lender offers', operationId: 'BUYER_LOAN_ESTIMATES' },
  INSPECTION_PLAN: { label: 'Back to my inspection review', message: 'Which inspection findings still need a decision?', operationId: 'BUYER_INSPECTION_REVIEW' },
  TITLE_CONTACT: { label: 'Back to my title and escrow readiness', message: 'What is still open with title or escrow?', operationId: 'BUYER_TITLE_ESCROW_READINESS' },
};
const back = (kind: SetupKind) => ({ id: 'buyer-setup-back', interactionType: 'START_WORKFLOW' as const, style: 'SECONDARY' as const, ...BACK[kind] });
const unavailable = (kind: SetupKind, reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-setup-unavailable', title, body, tone: 'DEFAULT', actions: [back(kind)] }], suggestions: [],
});
const isoNoon = (day: string) => new Date(`${day}T12:00:00.000Z`).toISOString();
const dayText = (value: string | null | undefined) => (value ? humanDate(new Date(value.length === 10 ? isoNoon(value) : value)) ?? value : 'Not set');

interface InspectionPlan {
  updatedAt?: string; scheduledAt: string | null; appointmentCompletedAt: string | null; reportDueAt: string | null; contingencyDueAt: string | null; accessNotes: string | null;
  scopeNotes: string | null; specialistScopes: string[]; propertyQuestions: string[]; reinspectionRequired: boolean; reinspectionScheduledAt: string | null; reinspectionCompletedAt: string | null;
}
interface TitleContact { role: string; name: string; company: string | null; email: string | null; phone: string | null; notes: string | null; updatedAt?: string }
type Snapshot = { kind: 'PATH_SET'; purchasePath: string; selection: string | null }
  | { kind: 'INSPECTION_PLAN'; plan: InspectionPlan | null }
  | { kind: 'TITLE_CONTACT'; contact: TitleContact | null };
async function load(kind: SetupKind, userId: string, propertyId: string): Promise<Snapshot> {
  if (kind === 'PATH_SET') {
    const data = await BuyerPurchaseLoanEstimateService.list(userId, propertyId) as unknown as { purchasePath: string; selection: { revisionId: string } | null };
    return { kind, purchasePath: data.purchasePath, selection: data.selection?.revisionId ?? null };
  }
  if (kind === 'INSPECTION_PLAN') {
    const data = await BuyerAcquisitionService.getInspectionPlan(userId, propertyId) as unknown as { plan: Record<string, unknown> | null };
    const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null);
    const p = data.plan;
    return { kind, plan: p ? {
      updatedAt: iso(p.updatedAt) ?? undefined, scheduledAt: iso(p.scheduledAt), appointmentCompletedAt: iso(p.appointmentCompletedAt), reportDueAt: iso(p.reportDueAt),
      contingencyDueAt: iso(p.contingencyDueAt), accessNotes: (p.accessNotes as string | null) ?? null, scopeNotes: (p.scopeNotes as string | null) ?? null,
      specialistScopes: Array.isArray(p.specialistScopes) ? p.specialistScopes as string[] : [], propertyQuestions: Array.isArray(p.propertyQuestions) ? p.propertyQuestions as string[] : [],
      reinspectionRequired: Boolean(p.reinspectionRequired), reinspectionScheduledAt: iso(p.reinspectionScheduledAt), reinspectionCompletedAt: iso(p.reinspectionCompletedAt),
    } : null };
  }
  const data = await BuyerTitleEscrowService.get(userId, propertyId) as unknown as { contact: TitleContact | null };
  return { kind, contact: data.contact };
}
const version = (s: Snapshot) => sha(`buyer-setup:${JSON.stringify(s)}`);

function formCapture(snap: Snapshot, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const day = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const textField = (key: string, label: string, required: boolean, long = false, maxLength = 200) => ({ key, label, required, inputSchema: { type: long ? 'LONG_TEXT' as const : 'SHORT_TEXT' as const, maxLength } });
  const spec = snap.kind === 'PATH_SET' ? {
    title: 'How are you paying for this purchase?', question: 'Choose one. You can change it later.', seed: snap.purchasePath === 'CASH' || snap.purchasePath === 'FINANCED' ? { purchasePath: snap.purchasePath } : {},
    fields: [{ key: 'purchasePath', label: 'Payment path', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(PATH_LABELS).map(([value, label]) => ({ label, value })) } }],
  } : snap.kind === 'INSPECTION_PLAN' ? {
    title: 'Update your inspection plan', question: 'What changed? Leave the rest blank. Ask records dates, not times of day.', seed: { specialistScopes: snap.plan?.specialistScopes ?? [] },
    fields: [
      day('scheduledDate', 'Inspection date'), day('appointmentCompletedDate', 'Inspection completed on'), day('reportDueDate', 'Report due'), day('contingencyDueDate', 'Inspection contingency ends'),
      textField('accessNotes', 'Access notes', false, true, 4000), textField('scopeNotes', 'Scope notes', false, true, 4000),
      { key: 'specialistScopes', label: 'Specialist inspections to ask about', required: false, inputSchema: { type: 'MULTI_SELECT' as const, maxItems: 20, options: SPECIALIST_SCOPE_VALUES.map((value) => ({ label: scopeLabel(value), value })) } },
      textField('newQuestion', 'Add a question for the inspector', false, false, 500),
      { key: 'reinspectionRequired', label: 'A reinspection is needed', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
      day('reinspectionScheduledDate', 'Reinspection date'), day('reinspectionCompletedDate', 'Reinspection completed on'),
    ],
  } : {
    title: 'Update your title or escrow contact', question: 'This is shared with everyone in your household. Never enter account or routing numbers. Blank fields stay as they are.',
    seed: snap.contact ? { role: snap.contact.role, name: snap.contact.name, company: snap.contact.company ?? '', email: snap.contact.email ?? '', phone: snap.contact.phone ?? '', notes: snap.contact.notes ?? '' } : {},
    fields: [
      { key: 'role', label: 'Who they are', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => ({ label, value })) } },
      textField('name', 'Name', true), textField('company', 'Company', false), textField('email', 'Email', false, false, 320), textField('phone', 'Phone', false, false, 40), textField('notes', 'Notes', false, true, 2000),
    ],
  };
  return {
    requirementId: `buyer-setup-${snap.kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: SETUP_CAPTURE_KEYS[snap.kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'ContractToCozy does not contact anyone or accept bank details. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields, ...(snap.kind === 'INSPECTION_PLAN' ? { groups: [
      { id: 'dates', title: 'Dates', fieldKeys: ['scheduledDate', 'appointmentCompletedDate', 'reportDueDate', 'contingencyDueDate'] },
      { id: 'scope', title: 'Scope and questions', fieldKeys: ['accessNotes', 'scopeNotes', 'specialistScopes', 'newQuestion'] },
      { id: 'reinspection', title: 'Reinspection', fieldKeys: ['reinspectionRequired', 'reinspectionScheduledDate', 'reinspectionCompletedDate'] },
    ] } : {}) } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

/** The inspection-plan fields a form answer changes, skipping anything equal to what is recorded. */
function inspectionPatch(plan: InspectionPlan | null, d: Record<string, unknown>) {
  const sameDay = (recorded: string | null | undefined, day: unknown) => Boolean(recorded && day && recorded.slice(0, 10) === String(day));
  const scopes = d.specialistScopes as string[] | undefined;
  const current = plan?.specialistScopes ?? [];
  const scopesChanged = scopes !== undefined && (scopes.length !== current.length || scopes.some((s) => !current.includes(s)));
  const questions = d.newQuestion ? [...(plan?.propertyQuestions ?? []), String(d.newQuestion)] : null;
  return {
    patch: {
      ...(d.scheduledDate && !sameDay(plan?.scheduledAt, d.scheduledDate) ? { scheduledAt: isoNoon(String(d.scheduledDate)) } : {}),
      ...(d.appointmentCompletedDate && !sameDay(plan?.appointmentCompletedAt, d.appointmentCompletedDate) ? { appointmentCompletedAt: isoNoon(String(d.appointmentCompletedDate)) } : {}),
      ...(d.reportDueDate && !sameDay(plan?.reportDueAt, d.reportDueDate) ? { reportDueAt: isoNoon(String(d.reportDueDate)) } : {}),
      ...(d.contingencyDueDate && !sameDay(plan?.contingencyDueAt, d.contingencyDueDate) ? { contingencyDueAt: isoNoon(String(d.contingencyDueDate)) } : {}),
      ...(d.accessNotes && d.accessNotes !== plan?.accessNotes ? { accessNotes: String(d.accessNotes) } : {}),
      ...(d.scopeNotes && d.scopeNotes !== plan?.scopeNotes ? { scopeNotes: String(d.scopeNotes) } : {}),
      ...(scopesChanged ? { specialistScopes: scopes } : {}),
      ...(questions && questions.length <= 50 ? { propertyQuestions: questions } : {}),
      ...(d.reinspectionRequired !== undefined && (d.reinspectionRequired === 'YES') !== Boolean(plan?.reinspectionRequired) ? { reinspectionRequired: d.reinspectionRequired === 'YES' } : {}),
      ...(d.reinspectionScheduledDate && !sameDay(plan?.reinspectionScheduledAt, d.reinspectionScheduledDate) ? { reinspectionScheduledAt: isoNoon(String(d.reinspectionScheduledDate)) } : {}),
      ...(d.reinspectionCompletedDate && !sameDay(plan?.reinspectionCompletedAt, d.reinspectionCompletedDate) ? { reinspectionCompletedAt: isoNoon(String(d.reinspectionCompletedDate)) } : {}),
    } as Record<string, unknown>,
    tooManyQuestions: Boolean(questions && questions.length > 50),
  };
}

export async function setupCommandResult(
  userId: string, propertyId: string, launch: { kind: SetupKind; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-setup-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const snap = await load(kind, userId, propertyId);
  const contextVersion = version(snap);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_SETUP_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { setupLaunch: { kind, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-setup-input', title: kind === 'PATH_SET' ? 'How you are paying' : kind === 'INSPECTION_PLAN' ? 'Your inspection plan' : 'Your title or escrow contact', body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(snap, contextVersion)], suggestions: [],
    };
  }
  const parsed = parseSetupAnswer(kind, supplied);
  if (!parsed.success) {
    return unavailable(kind, 'BUYER_SETUP_INPUT_INVALID', 'Check the details',
      /account or routing/.test(parsed.error.issues[0]?.message ?? '') ? 'Do not enter account or routing numbers. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  }
  const d = parsed.data as Record<string, unknown>;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  let title: string; let description: string; let confirmLabel: string; let fields: Array<{ label: string; value: string }>;
  if (snap.kind === 'PATH_SET') {
    if (snap.purchasePath === d.purchasePath) return unavailable(kind, 'BUYER_SETUP_UNCHANGED', 'That is already recorded', 'Nothing has changed.');
    const clears = d.purchasePath === 'CASH' && snap.selection;
    title = 'Record how you are paying?';
    description = `This records your payment path for the purchase plan.${clears ? ' Switching to cash clears your selected lender offer and intent to proceed; the offers you recorded stay on file.' : ''} Nothing is sent to any lender.`;
    confirmLabel = 'Record this';
    fields = [{ label: 'Payment path', value: `${PATH_LABELS[snap.purchasePath] ?? 'Not set'} → ${PATH_LABELS[String(d.purchasePath)]}` }];
  } else if (snap.kind === 'INSPECTION_PLAN') {
    const { patch, tooManyQuestions } = inspectionPatch(snap.plan, d);
    if (tooManyQuestions) return unavailable(kind, 'BUYER_SETUP_TOO_MANY', 'Your question list is full', 'You already have 50 questions recorded. Nothing has changed.');
    if (!Object.keys(patch).length) return unavailable(kind, 'BUYER_SETUP_UNCHANGED', 'That is already recorded', 'Nothing has changed.');
    const p = snap.plan;
    title = 'Save these inspection plan changes?';
    description = 'This updates your inspection plan and the dates your purchase plan counts from. Ask records dates only; it does not schedule or contact an inspector.';
    confirmLabel = 'Save the plan';
    fields = [
      ...(patch.scheduledAt ? [{ label: 'Inspection date', value: `${dayText(p?.scheduledAt)} → ${dayText(String(patch.scheduledAt))}` }] : []),
      ...(patch.appointmentCompletedAt ? [{ label: 'Inspection completed on', value: `${dayText(p?.appointmentCompletedAt)} → ${dayText(String(patch.appointmentCompletedAt))}` }] : []),
      ...(patch.reportDueAt ? [{ label: 'Report due', value: `${dayText(p?.reportDueAt)} → ${dayText(String(patch.reportDueAt))}` }] : []),
      ...(patch.contingencyDueAt ? [{ label: 'Inspection contingency ends', value: `${dayText(p?.contingencyDueAt)} → ${dayText(String(patch.contingencyDueAt))}` }] : []),
      ...(patch.accessNotes ? [{ label: 'Access notes', value: 'Updated' }] : []),
      ...(patch.scopeNotes ? [{ label: 'Scope notes', value: 'Updated' }] : []),
      ...(patch.specialistScopes ? [{ label: 'Specialist inspections', value: (patch.specialistScopes as string[]).map(scopeLabel).join(', ') || 'None' }] : []),
      ...(patch.propertyQuestions ? [{ label: 'New question', value: String(d.newQuestion) }] : []),
      ...(patch.reinspectionRequired !== undefined ? [{ label: 'Reinspection needed', value: patch.reinspectionRequired ? 'Yes' : 'No' }] : []),
      ...(patch.reinspectionScheduledAt ? [{ label: 'Reinspection date', value: `${dayText(p?.reinspectionScheduledAt)} → ${dayText(String(patch.reinspectionScheduledAt))}` }] : []),
      ...(patch.reinspectionCompletedAt ? [{ label: 'Reinspection completed on', value: `${dayText(p?.reinspectionCompletedAt)} → ${dayText(String(patch.reinspectionCompletedAt))}` }] : []),
    ];
  } else {
    const c = snap.contact;
    title = 'Save this title or escrow contact?';
    description = 'This contact is shared with everyone in your household. Verify any payment instructions yourself by calling a number you already know; Ask never tells anyone to close and does not contact this person.';
    confirmLabel = 'Save the contact';
    fields = [
      { label: 'Who they are', value: `${c ? CONTACT_ROLE_LABELS[c.role] : 'Not set'} → ${CONTACT_ROLE_LABELS[String(d.role)]}` },
      { label: 'Name', value: `${c?.name ?? 'Not set'} → ${String(d.name)}` },
      ...(d.company ? [{ label: 'Company', value: String(d.company) }] : []), ...(d.email ? [{ label: 'Email', value: String(d.email) }] : []),
      ...(d.phone ? [{ label: 'Phone', value: String(d.phone) }] : []), ...(d.notes ? [{ label: 'Notes', value: 'Updated' }] : []),
    ];
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_SETUP_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { setupCommand: { kind }, setupForm: supplied, setupContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'buyer-setup-review', title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `buyer-setup-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel,
      consentText: 'I authorize this change to the shared purchase record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(snap, contextVersion, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-plan-setup.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = setupKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'BUYER_PLAN_SETUP_COMMAND' || launch.surface === 'ASK_REFRESH') {
    return unavailable('PATH_SET', 'ASK_BUYER_SETUP_NOT_DIRECTLY_ROUTABLE', 'Open your purchase answer first', 'This is changed from your lender offers, inspection or title answer. Nothing has changed.');
  }
  return setupCommandResult(envelope.userId, envelope.propertyId!, { kind, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmSetup(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.setupCommand as { kind?: unknown } | undefined;
  const kind = command?.kind as SetupKind | undefined;
  if (!kind || !(kind in SETUP_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  try {
    const snap = await load(kind, userId, propertyId);
    if (parameters.setupContextVersion !== version(snap)) throw stale('This changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const parsed = parseSetupAnswer(kind, parameters.setupForm);
    if (!parsed.success) throw stale('The details to save are invalid.');
    const d = parsed.data as Record<string, unknown>;
    if (snap.kind === 'PATH_SET') {
      await BuyerAcquisitionService.updatePurchaseFinancingPlan(userId, propertyId, { purchasePath: d.purchasePath as 'CASH' | 'FINANCED' });
      title = 'Payment path recorded';
    } else if (snap.kind === 'INSPECTION_PLAN') {
      const { patch } = inspectionPatch(snap.plan, d);
      if (!Object.keys(patch).length) throw stale('Nothing is left to change.');
      await BuyerAcquisitionService.updateInspectionPlan(userId, propertyId, patch as never);
      title = 'Inspection plan saved';
    } else {
      await BuyerTitleEscrowService.update(userId, propertyId, {
        contact: {
          role: d.role as 'ATTORNEY' | 'TITLE_ESCROW', name: String(d.name),
          ...(d.company ? { company: String(d.company) } : {}), ...(d.email ? { email: String(d.email) } : {}), ...(d.phone ? { phone: String(d.phone) } : {}), ...(d.notes ? { notes: String(d.notes) } : {}),
        },
      } as never);
      title = 'Contact saved';
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_SETUP_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-setup-${kind.toLowerCase()}-${propertyId}`, title, status: 'COMPLETED', description: 'It is recorded on your purchase plan. Nobody was contacted and nothing was scheduled.', details: [], actions: [{ ...back(kind), style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-setup-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: kind === 'PATH_SET' ? 'BUYER_PURCHASE_FINANCING_PLAN' : kind === 'INSPECTION_PLAN' ? 'BUYER_INSPECTION_PLAN' : 'BUYER_TITLE_ESCROW_CONTACT', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-plan-setup.command', confirmSetup);
