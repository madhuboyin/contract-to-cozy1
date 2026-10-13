// The buyer's closing insurance inside Ask (register P2 "Buyer Closing"; FRD v1.348). Reached only by the declared actions on the closing insurance
// answer. Every write is BuyerInsuranceService's own method (the routes' calls), behind a review and a confirmation bound to the workspace. Ask never buys,
// binds or cancels coverage: recording a binding says the buyer bound it with their insurer, and only then creates the policy record.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerInsuranceService } from '../../buyerInsurance.service';
import {
  INSURANCE_CAPTURE_KEYS, INSURANCE_ENTITY_TYPES, INSURANCE_MESSAGES, PROOF_LABELS, QUOTE_STATUS_LABELS, REQUIREMENT_CATEGORIES, REQUIREMENT_STATUS_LABELS, bindBlocker,
  insuranceKindFromMessage, parseInsuranceAnswer, quoteSelectable, requirementUpdatable, type InsuranceFormKind, type InsuranceKind,
} from '../support/buyerInsuranceCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'buyer-insurance-back', label: 'Back to closing insurance', interactionType: 'START_WORKFLOW' as const, message: 'Show my insurance quotes for closing', operationId: 'BUYER_INSURANCE_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const dollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const isoDay = (day: string) => new Date(`${day}T12:00:00.000Z`).toISOString();

interface Workspace {
  updatedAt: string; selectedQuoteId: string | null; boundPolicyId: string | null; lenderProofStatus: string; closingProofStatus: string;
  quotes: Array<{ id: string; carrierName: string; status: string; annualPremiumCents: number | null; validUntil: string | null; updatedAt: string }>;
  requirements: Array<{ id: string; title: string; status: string; updatedAt: string }>;
}
async function load(userId: string, propertyId: string): Promise<Workspace | null> {
  return (await BuyerInsuranceService.get(userId, propertyId)).workspace as unknown as Workspace | null;
}
const version = (w: Workspace | null) => sha(`buyer-insurance:${w?.updatedAt ?? 'none'}:${w?.selectedQuoteId ?? ''}:${w?.boundPolicyId ?? ''}:${w?.lenderProofStatus ?? ''}:${w?.closingProofStatus ?? ''}:`
  + `${(w?.quotes ?? []).map((q) => `${q.id}:${q.status}:${q.updatedAt}`).join('|')}:${(w?.requirements ?? []).map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join('|')}`);

function formCapture(kind: InsuranceFormKind, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const sel = (key: string, label: string, options: Array<{ label: string; value: string }>, required = true) => ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options } });
  const money = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 100_000_000 } });
  const day = (key: string, label: string, required = false) => ({ key, label, required, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const long = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } });
  const proof = Object.entries(PROOF_LABELS).map(([value, label]) => ({ label, value }));
  const specs = {
    REQUIREMENT_ADD: { title: 'Add an insurance requirement', question: 'What does your lender or insurer need?', fields: [
      sel('category', 'What kind', REQUIREMENT_CATEGORIES.map(([value, label]) => ({ label, value }))), { key: 'title', label: 'In a few words', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } },
      long('notes', 'Details'), day('dueDate', 'Due date'), sel('blocking', 'Holds up closing', [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }]),
    ], seed: { blocking: 'NO' } },
    REQUIREMENT_UPDATE: { title: 'Where does it stand?', question: 'Choose where it stands now.', fields: [
      sel('status', 'Where it stands', Object.entries(REQUIREMENT_STATUS_LABELS).map(([value, label]) => ({ label, value }))), long('notes', 'Notes'),
    ], seed: {} },
    QUOTE_ADD: { title: 'Record a quote', question: 'What did the insurer quote?', fields: [
      { key: 'carrierName', label: 'Insurer', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } }, money('annualPremium', 'Annual premium ($)'),
      money('deductible', 'Deductible ($)'), day('validUntilDate', 'Quote valid until'), long('exclusionsNotes', 'What it excludes'),
    ], seed: {} },
    BIND: { title: 'Record that your insurance was bound', question: 'What is the policy?', fields: [
      { key: 'policyNumber', label: 'Policy number', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 160 } }, day('effectiveDate', 'Effective date', true), day('expiresDate', 'Expiration date', true),
    ], seed: {} },
    PROOF: { title: 'Update the proof of insurance', question: 'Where does each stand?', fields: [sel('lenderProofStatus', 'Proof for your lender', proof, false), sel('closingProofStatus', 'Proof for closing', proof, false)], seed: {} },
  } as const;
  const spec = specs[kind];
  return {
    requirementId: `buyer-insurance-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: INSURANCE_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'This records what you did with your insurer. Ask never buys, binds or cancels coverage. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function insuranceCommandResult(
  userId: string, propertyId: string, launch: { kind: InsuranceKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const w = await load(userId, propertyId);
  const contextVersion = version(w);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared purchase record.';
  const confirm = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `buyer-insurance-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
  });
  const requirement = launch.entityId ? w?.requirements.find((r) => r.id === launch.entityId) ?? null : null;
  const quote = launch.entityId ? w?.quotes.find((q) => q.id === launch.entityId) ?? null : null;
  const chosen = w?.quotes.find((q) => q.id === w.selectedQuoteId && q.status === 'SELECTED') ?? null;

  if (kind === 'QUOTE_SELECT') {
    if (!quote) return unavailable('BUYER_INSURANCE_QUOTE_NOT_FOUND', 'That quote is no longer available', 'Nothing has changed.');
    if (!quoteSelectable(quote.status) || w?.boundPolicyId) return unavailable('BUYER_INSURANCE_QUOTE_NOT_SELECTABLE', 'That quote cannot be chosen now', w?.boundPolicyId ? 'A bound policy is already recorded. Nothing has changed.' : 'Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_INSURANCE_QUOTE_SELECT_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { insuranceCommand: { kind, entityId: quote.id }, insuranceContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-select-review', title: `Choose ${quote.carrierName}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirm(`select-${sha(quote.id).slice(0, 12)}`, `Choose the ${quote.carrierName} quote?`,
        'This marks it as the quote you are going with and releases any quote you chose before. It does not buy or bind coverage; you do that with the insurer.', 'Choose this quote',
        [{ label: 'Quote', value: quote.carrierName }, { label: 'Status', value: `${QUOTE_STATUS_LABELS[quote.status]} → Chosen` }]),
      suggestions: [],
    };
  }
  if (kind === 'REQUIREMENT_UPDATE') {
    if (!requirement) return unavailable('BUYER_INSURANCE_REQUIREMENT_NOT_FOUND', 'That requirement is no longer available', 'Nothing has changed.');
    if (!requirementUpdatable(requirement.status)) return unavailable('BUYER_INSURANCE_REQUIREMENT_SETTLED', 'That requirement is already settled', 'Nothing has changed.');
  }
  if (kind === 'BIND') {
    const blocker = bindBlocker({ selectedQuoteId: w?.selectedQuoteId ?? null, boundPolicyId: w?.boundPolicyId ?? null }, chosen, new Date());
    if (blocker) return unavailable('BUYER_INSURANCE_BIND_NOT_READY', 'It cannot be recorded as bound yet', `${blocker} Nothing has changed.`);
  }
  const formKind = kind as InsuranceFormKind;
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_INSURANCE_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { insuranceLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-input', title: 'Closing insurance', body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion)], suggestions: [],
    };
  }
  const parsed = parseInsuranceAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('BUYER_INSURANCE_INPUT_INVALID', 'Check the details', 'Fill in what the form asks for; the expiration must be after the effective date. Nothing has changed.');
  const d = parsed.data;
  let spec: ReturnType<typeof confirm>;
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  if (formKind === 'REQUIREMENT_ADD') {
    spec = confirm(id, 'Add this requirement?', 'This adds it to your closing insurance tracker. It contacts no one.', 'Add it', [
      { label: 'Requirement', value: String(d.title) }, { label: 'Kind', value: REQUIREMENT_CATEGORIES.find(([k]) => k === d.category)?.[1] ?? String(d.category) },
      ...(d.dueDate ? [{ label: 'Due', value: humanDate(new Date(isoDay(String(d.dueDate)))) ?? String(d.dueDate) }] : []), { label: 'Holds up closing', value: d.blocking === 'YES' ? 'Yes' : 'No' },
    ]);
  } else if (formKind === 'REQUIREMENT_UPDATE') {
    spec = confirm(id, 'Record where it stands?', 'This records your own reading. Your lender or insurer decides.', 'Record it', [
      { label: 'Requirement', value: requirement!.title }, { label: 'Where it stands', value: `${REQUIREMENT_STATUS_LABELS[requirement!.status]} → ${REQUIREMENT_STATUS_LABELS[String(d.status)]}` },
    ]);
  } else if (formKind === 'QUOTE_ADD') {
    spec = confirm(id, 'Record this quote?', 'This saves the quote you received. It does not buy coverage or contact the insurer.', 'Record it', [
      { label: 'Insurer', value: String(d.carrierName) }, ...(d.annualPremium !== undefined ? [{ label: 'Annual premium', value: dollars(Number(d.annualPremium)) }] : []),
      ...(d.deductible !== undefined ? [{ label: 'Deductible', value: dollars(Number(d.deductible)) }] : []),
      ...(d.validUntilDate ? [{ label: 'Valid until', value: humanDate(new Date(isoDay(String(d.validUntilDate)))) ?? String(d.validUntilDate) }] : []),
    ]);
  } else if (formKind === 'BIND') {
    spec = confirm(id, 'Record that your insurance was bound?', 'This records that you bound this policy with your insurer, and creates the policy record on your home. Ask did not buy or bind it, and cannot cancel it.', 'Record the binding', [
      { label: 'Insurer', value: chosen!.carrierName }, { label: 'Policy number', value: String(d.policyNumber) },
      { label: 'In effect', value: `${humanDate(new Date(isoDay(String(d.effectiveDate))))} to ${humanDate(new Date(isoDay(String(d.expiresDate))))}` },
    ]);
  } else {
    spec = confirm(id, 'Update the proof of insurance?', 'This records whether proof has been delivered. It sends nothing to anyone.', 'Record it', [
      ...(d.lenderProofStatus ? [{ label: 'Proof for your lender', value: `${PROOF_LABELS[w?.lenderProofStatus ?? 'PENDING'] ?? w?.lenderProofStatus} → ${PROOF_LABELS[String(d.lenderProofStatus)]}` }] : []),
      ...(d.closingProofStatus ? [{ label: 'Proof for closing', value: `${PROOF_LABELS[w?.closingProofStatus ?? 'PENDING'] ?? w?.closingProofStatus} → ${PROOF_LABELS[String(d.closingProofStatus)]}` }] : []),
    ]);
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_INSURANCE_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { insuranceCommand: { kind, entityId: launch.entityId }, insuranceForm: supplied, insuranceContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: spec, captureRequests: [formCapture(formKind, contextVersion, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-insurance.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = insuranceKindFromMessage(envelope.message);
  const entityType = kind === 'REQUIREMENT_UPDATE' ? INSURANCE_ENTITY_TYPES.REQUIREMENT : kind === 'QUOTE_SELECT' ? INSURANCE_ENTITY_TYPES.QUOTE : null;
  if (!kind || launch?.operationId !== 'BUYER_INSURANCE_COMMAND' || launch.surface === 'ASK_REFRESH' || (entityType && (launch.entityType !== entityType || !launch.entityId))) {
    return unavailable('ASK_BUYER_INSURANCE_NOT_DIRECTLY_ROUTABLE', 'Open your closing insurance first', 'Insurance is changed from your closing insurance answer. Nothing has changed.');
  }
  return insuranceCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: entityType ? launch.entityId! : null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmInsurance(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.insuranceCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as InsuranceKind | undefined;
  if (!kind || !(kind in INSURANCE_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = typeof command?.entityId === 'string' ? command.entityId : null;
  let title: string;
  try {
    const w = await load(userId, propertyId);
    if (parameters.insuranceContextVersion !== version(w)) throw stale('This changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'QUOTE_SELECT') {
      const q = w?.quotes.find((x) => x.id === entityId);
      if (!q || !quoteSelectable(q.status) || w?.boundPolicyId) throw stale('That quote can no longer be chosen.');
      await BuyerInsuranceService.selectQuote(userId, propertyId, q.id);
      title = 'Quote chosen';
    } else {
      const parsed = parseInsuranceAnswer(kind, parameters.insuranceForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data;
      if (kind === 'REQUIREMENT_ADD') {
        await BuyerInsuranceService.createRequirement(userId, propertyId, {
          category: d.category, title: d.title, blocking: d.blocking === 'YES', ...(d.notes ? { notes: d.notes } : {}), ...(d.dueDate ? { dueAt: isoDay(String(d.dueDate)) } : {}),
        } as never);
        title = 'Requirement added';
      } else if (kind === 'REQUIREMENT_UPDATE') {
        const r = w?.requirements.find((x) => x.id === entityId);
        if (!r || !requirementUpdatable(r.status)) throw stale('That requirement is already settled.');
        await BuyerInsuranceService.updateRequirement(userId, propertyId, r.id, { status: d.status, ...(d.notes ? { notes: d.notes } : {}) } as never);
        title = 'Recorded';
      } else if (kind === 'QUOTE_ADD') {
        await BuyerInsuranceService.createQuote(userId, propertyId, {
          carrierName: d.carrierName,
          ...(d.annualPremium !== undefined ? { annualPremiumCents: Math.round(Number(d.annualPremium) * 100) } : {}),
          ...(d.deductible !== undefined ? { deductibleCents: Math.round(Number(d.deductible) * 100) } : {}),
          ...(d.validUntilDate ? { validUntil: isoDay(String(d.validUntilDate)) } : {}), ...(d.exclusionsNotes ? { exclusionsNotes: d.exclusionsNotes } : {}),
        } as never);
        title = 'Quote recorded';
      } else if (kind === 'BIND') {
        const chosen = w?.quotes.find((x) => x.id === w.selectedQuoteId && x.status === 'SELECTED') ?? null;
        const blocker = bindBlocker({ selectedQuoteId: w?.selectedQuoteId ?? null, boundPolicyId: w?.boundPolicyId ?? null }, chosen, new Date());
        if (blocker || !chosen) throw stale(blocker ?? 'Choose the quote you bound first.');
        await BuyerInsuranceService.bind(userId, propertyId, { quoteId: chosen.id, policyNumber: String(d.policyNumber), effectiveAt: isoDay(String(d.effectiveDate)), expiresAt: isoDay(String(d.expiresDate)) } as never);
        title = 'Binding recorded';
      } else {
        await BuyerInsuranceService.update(userId, propertyId, {
          ...(d.lenderProofStatus ? { lenderProofStatus: d.lenderProofStatus } : {}), ...(d.closingProofStatus ? { closingProofStatus: d.closingProofStatus } : {}),
        } as never);
        title = 'Proof updated';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_INSURANCE_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-insurance-${kind.toLowerCase()}-${entityId ?? propertyId}`, title, status: 'COMPLETED', description: 'It is on your closing insurance record. Nothing was bought, bound or sent.', details: [], actions: [{ ...back, style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-insurance-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_INSURANCE', artifactId: entityId ?? propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-insurance.command', confirmInsurance);
