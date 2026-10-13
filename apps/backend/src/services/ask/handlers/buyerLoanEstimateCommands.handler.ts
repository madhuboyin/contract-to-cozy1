// The buyer's purchase Loan Estimates inside Ask (register P2 "Buyer Closing"; FRD v1.352). Reached only by the declared actions on the lender offers
// answer. Every write is BuyerPurchaseLoanEstimateService's own method (the routes' calls), behind a review and a confirmation bound to the offers.
// Confirmation is per figure (no blanket confirm); selecting an offer is a planning record with intent to proceed as a separate explicit note.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerPurchaseLoanEstimateService } from '../../buyerPurchaseLoanEstimate.service';
import {
  LE_CAPTURE_KEYS, LE_ENTITY_TYPE, LE_FIELD_KEYS, LE_FIELD_LABELS, LE_FIELD_VALUES, LE_MESSAGES, LOAN_TYPE_LABELS, LOCK_STATUS_LABELS, hasValue, leKindFromMessage,
  parseLeAnswer, type LeFormKind, type LeKind,
} from '../support/buyerLoanEstimateCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'buyer-le-back', label: 'Back to my lender offers', interactionType: 'START_WORKFLOW' as const, message: 'Show my lender offers', operationId: 'BUYER_LOAN_ESTIMATES' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-le-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const percentText = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const toCents = (value: unknown) => Math.round(Number(value) * 100);
const dayText = (day: string) => humanDate(new Date(`${day}T12:00:00.000Z`)) ?? day;

interface Revision {
  id: string; status: string; revisionNumber: number; updatedAt: string; issuedDate: string | null; loanAmountCents: number | null; loanTermMonths: number | null; loanType: string | null;
  noteRateBps: number | null; aprBps: number | null; monthlyPrincipalAndInterestCents: number | null; monthlyMortgageInsuranceCents: number | null;
  estimatedTotalMonthlyPaymentCents: number | null; loanCostsCents: number | null; lenderCreditsCents: number | null; discountPointsBps: number | null;
  discountPointsCents: number | null; prepaidAndEscrowCents: number | null; cashToCloseCents: number | null; cashToCloseDirection: string | null;
  rateLockStatus: string | null; rateLockExpirationDate: string | null;
}
interface Offer { id: string; lenderName: string; updatedAt: string; revisions: Revision[] }
interface Snapshot { purchasePath: string; selection: { offerId: string; revisionId: string } | null; offers: Offer[] }
const load = async (userId: string, propertyId: string) => (await BuyerPurchaseLoanEstimateService.list(userId, propertyId)) as unknown as Snapshot;
const version = (s: Snapshot) => sha(`buyer-le:${s.purchasePath}|${s.selection?.revisionId ?? ''}|${s.offers.map((o) => `${o.id}:${o.revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join(',')}`).join('|')}`);
const findRevision = (s: Snapshot, id: string | null) => {
  for (const offer of s.offers) { const revision = offer.revisions.find((r) => r.id === id); if (revision) return { offer, revision }; }
  return null;
};
const valueText = (key: string, revision: Revision) => {
  const raw = (revision as unknown as Record<string, unknown>)[LE_FIELD_VALUES[key]];
  if (!hasValue(raw)) return 'Not recorded';
  if (key === 'TERM') return `${Number(raw) / 12} years`;
  if (key === 'LOAN_TYPE') return LOAN_TYPE_LABELS[String(raw)] ?? String(raw);
  if (key === 'NOTE_RATE' || key === 'APR') return percentText(Number(raw));
  return dollars(Number(raw));
};

function formCapture(kind: LeFormKind, contextVersion: string, revision: Revision | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const day = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const money = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const percent = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 50 } });
  const select = (key: string, label: string, required: boolean, options: Array<{ label: string; value: string }>) => ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options } });
  const figureFields = [
    day('issuedDate', 'Issued date'), money('loanAmount', 'Loan amount ($)'), { key: 'termYears', label: 'Loan term (years)', required: false, inputSchema: { type: 'NUMBER' as const, min: 1, max: 50 } },
    select('loanType', 'Loan type', false, Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => ({ label, value }))),
    percent('noteRate', 'Interest rate (%)'), percent('apr', 'APR (%)'), money('principalAndInterest', 'Monthly principal and interest ($)'),
    money('mortgageInsurance', 'Monthly mortgage insurance ($)'), money('monthlyPayment', 'Estimated total monthly payment ($)'), money('loanCosts', 'Loan costs ($)'),
    money('lenderCredits', 'Lender credits ($)'), percent('discountPointsPct', 'Discount points (%)'), money('discountPoints', 'Discount points ($)'),
    money('prepaidAndEscrow', 'Prepaids and escrow ($)'), money('cashToClose', 'Cash to close ($)'),
    select('cashToCloseDirection', 'Cash to close is', false, [{ label: 'Paid by me', value: 'FROM_BORROWER' }, { label: 'Paid to me', value: 'TO_BORROWER' }]),
    select('rateLockStatus', 'Rate lock', false, Object.entries(LOCK_STATUS_LABELS).map(([value, label]) => ({ label, value }))), day('rateLockExpirationDate', 'Rate lock expires'),
  ];
  const specs = {
    OFFER_ADD: { title: 'Add a lender offer', question: 'Enter the lender and the figures from the Loan Estimate. Leave anything you do not have blank.', seed: {}, fields: [
      { key: 'lenderName', label: 'Lender', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } }, ...figureFields,
    ] },
    DRAFT_EDIT: { title: 'Edit your Loan Estimate draft', question: 'Enter the figures as they appear on the document. Leave the rest blank.', seed: {}, fields: figureFields },
    CONFIRM: { title: 'Which figures did you check against the Loan Estimate?', question: 'Check each figure against the document. Every figure is required before this can be confirmed.', seed: { fields: [] }, fields: [
      { key: 'fields', label: 'Figures you checked', required: true, inputSchema: { type: 'MULTI_SELECT' as const, maxItems: LE_FIELD_KEYS.length,
        options: LE_FIELD_KEYS.map((value) => ({ label: revision ? `${LE_FIELD_LABELS[value]}: ${valueText(value, revision)}` : LE_FIELD_LABELS[value], value })) } },
    ] },
    SELECT: { title: 'Select this offer', question: 'Do you want to note that you intend to proceed with this lender? This is only your own note; nothing is sent to the lender.', seed: { intentToProceed: 'NO' }, fields: [
      select('intentToProceed', 'Intent to proceed', true, [{ label: 'No, planning only', value: 'NO' }, { label: 'Yes, note my intent to proceed', value: 'YES' }]),
    ] },
  } as const;
  const spec = specs[kind];
  return {
    requirementId: `buyer-le-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: LE_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'ContractToCozy does not review your Loan Estimate or contact any lender. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

/** The revision fields a form answer sets (the service's own input shape). */
function figurePatch(d: Record<string, unknown>) {
  return {
    ...(d.issuedDate ? { issuedDate: String(d.issuedDate) } : {}),
    ...(d.loanAmount !== undefined ? { loanAmountCents: toCents(d.loanAmount) } : {}),
    ...(d.termYears !== undefined ? { loanTermMonths: Math.round(Number(d.termYears) * 12) } : {}),
    ...(d.loanType ? { loanType: d.loanType } : {}),
    ...(d.noteRate !== undefined ? { noteRateBps: Math.round(Number(d.noteRate) * 100) } : {}),
    ...(d.apr !== undefined ? { aprBps: Math.round(Number(d.apr) * 100) } : {}),
    ...(d.principalAndInterest !== undefined ? { monthlyPrincipalAndInterestCents: toCents(d.principalAndInterest) } : {}),
    ...(d.mortgageInsurance !== undefined ? { monthlyMortgageInsuranceCents: toCents(d.mortgageInsurance) } : {}),
    ...(d.monthlyPayment !== undefined ? { estimatedTotalMonthlyPaymentCents: toCents(d.monthlyPayment) } : {}),
    ...(d.loanCosts !== undefined ? { loanCostsCents: toCents(d.loanCosts) } : {}),
    ...(d.lenderCredits !== undefined ? { lenderCreditsCents: toCents(d.lenderCredits) } : {}),
    ...(d.discountPointsPct !== undefined ? { discountPointsBps: Math.round(Number(d.discountPointsPct) * 100) } : {}),
    ...(d.discountPoints !== undefined ? { discountPointsCents: toCents(d.discountPoints) } : {}),
    ...(d.prepaidAndEscrow !== undefined ? { prepaidAndEscrowCents: toCents(d.prepaidAndEscrow) } : {}),
    ...(d.cashToClose !== undefined ? { cashToCloseCents: toCents(d.cashToClose) } : {}),
    ...(d.cashToCloseDirection ? { cashToCloseDirection: d.cashToCloseDirection } : {}),
    ...(d.rateLockStatus ? { rateLockStatus: d.rateLockStatus } : {}),
    ...(d.rateLockExpirationDate ? { rateLockExpirationDate: String(d.rateLockExpirationDate) } : {}),
  };
}
const FIGURE_ROWS: Array<[string, string, (v: number) => string]> = [
  ['loanAmount', 'Loan amount', (v) => dollars(toCents(v))], ['termYears', 'Loan term', (v) => `${v} years`], ['noteRate', 'Interest rate', (v) => percentText(Math.round(v * 100))],
  ['apr', 'APR', (v) => percentText(Math.round(v * 100))], ['principalAndInterest', 'Monthly principal and interest', (v) => dollars(toCents(v))],
  ['mortgageInsurance', 'Monthly mortgage insurance', (v) => dollars(toCents(v))], ['monthlyPayment', 'Estimated total monthly payment', (v) => dollars(toCents(v))],
  ['loanCosts', 'Loan costs', (v) => dollars(toCents(v))], ['lenderCredits', 'Lender credits', (v) => dollars(toCents(v))],
  ['discountPointsPct', 'Discount points', (v) => percentText(Math.round(v * 100))], ['discountPoints', 'Discount points paid', (v) => dollars(toCents(v))],
  ['prepaidAndEscrow', 'Prepaids and escrow', (v) => dollars(toCents(v))], ['cashToClose', 'Cash to close', (v) => dollars(toCents(v))],
];
const figureRows = (d: Record<string, unknown>) => [
  ...(d.issuedDate ? [{ label: 'Issued date', value: dayText(String(d.issuedDate)) }] : []),
  ...FIGURE_ROWS.filter(([key]) => d[key] !== undefined).map(([key, label, show]) => ({ label, value: show(Number(d[key])) })),
  ...(d.loanType ? [{ label: 'Loan type', value: LOAN_TYPE_LABELS[String(d.loanType)] }] : []),
  ...(d.cashToCloseDirection ? [{ label: 'Cash to close is', value: d.cashToCloseDirection === 'FROM_BORROWER' ? 'Paid by you' : 'Paid to you' }] : []),
  ...(d.rateLockStatus ? [{ label: 'Rate lock', value: LOCK_STATUS_LABELS[String(d.rateLockStatus)] }] : []),
  ...(d.rateLockExpirationDate ? [{ label: 'Rate lock expires', value: dayText(String(d.rateLockExpirationDate)) }] : []),
];

export async function leCommandResult(
  userId: string, propertyId: string, launch: { kind: LeKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-le-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const snap = await load(userId, propertyId);
  if (snap.purchasePath !== 'FINANCED') return unavailable('BUYER_LE_NOT_FINANCED', 'Financing is not set up yet', 'Loan Estimates are recorded once your purchase is set up as financed. Nothing has changed.');
  const contextVersion = version(snap);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared purchase record.';
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `buyer-le-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
  });
  const entityKey = kind === 'OFFER_ADD' ? null : launch.entityId;
  const target = entityKey ? findRevision(snap, entityKey) : null;
  if (kind !== 'OFFER_ADD' && !target) return unavailable('BUYER_LE_NOT_FOUND', 'That Loan Estimate is no longer there', 'Nothing has changed.');
  const revision = target?.revision ?? null;
  const offer = target?.offer ?? null;
  if (kind === 'DRAFT_EDIT' && revision!.status !== 'DRAFT') return unavailable('BUYER_LE_NOT_DRAFT', 'Only a draft can be edited', 'Start a new revision to change a confirmed offer. Nothing has changed.');
  if (kind === 'CONFIRM') {
    if (revision!.status !== 'DRAFT') return unavailable('BUYER_LE_NOT_DRAFT', 'Only a draft can be confirmed', 'Nothing has changed.');
    const missing = LE_FIELD_KEYS.filter((key) => !hasValue((revision as unknown as Record<string, unknown>)[LE_FIELD_VALUES[key]]));
    if (missing.length) return unavailable('BUYER_LE_INCOMPLETE', 'The draft is not complete', `Fill in: ${missing.map((key) => LE_FIELD_LABELS[key]).join(', ')}. Nothing has changed.`);
  }
  if (kind === 'SELECT' && revision!.status !== 'CONFIRMED') return unavailable('BUYER_LE_NOT_CONFIRMED', 'Only a confirmed Loan Estimate can be selected', 'Confirm its figures first. Nothing has changed.');
  if (kind === 'REVISION_START') {
    if (offer!.revisions.some((r) => r.status === 'DRAFT')) return unavailable('BUYER_LE_DRAFT_EXISTS', 'This lender already has a draft', 'Edit or confirm that draft first. Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_LE_REVISION_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { leCommand: { kind, entityId: entityKey }, leContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'buyer-le-start-review', title: 'Start a new revision?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`start-${sha(`${contextVersion}${entityKey}`).slice(0, 12)}`, `Start a new revision for ${offer!.lenderName}?`,
        'This opens a draft copied from the latest figures that you can edit and confirm against the new document. Your confirmed offer stays as it is until you confirm the draft.', 'Start the draft',
        [{ label: 'Lender', value: offer!.lenderName }]),
      suggestions: [],
    };
  }
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_LE_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { leLaunch: { kind, entityId: entityKey, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-le-input', title: offer ? `${offer.lenderName}, revision ${revision!.revisionNumber}` : 'A new lender offer', body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(kind as LeFormKind, contextVersion, revision)], suggestions: [],
    };
  }
  const parsed = parseLeAnswer(kind as LeFormKind, supplied);
  if (!parsed.success) {
    return unavailable('BUYER_LE_INPUT_INVALID', 'Check the details',
      /Check every figure/.test(parsed.error.issues[0]?.message ?? '') ? 'Check every figure against the document. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  }
  const d = parsed.data as Record<string, unknown>;
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  let spec: ReturnType<typeof confirmation>;
  if (kind === 'OFFER_ADD') {
    spec = confirmation(id, 'Add this lender offer?', 'This adds a draft Loan Estimate. It is not part of your comparison until you confirm its figures, and nothing is sent to the lender.', 'Add the offer',
      [{ label: 'Lender', value: String(d.lenderName) }, ...figureRows(d)]);
  } else if (kind === 'DRAFT_EDIT') {
    spec = confirmation(id, 'Save these figures to the draft?', 'This changes the draft only. It is not part of your comparison until you confirm each figure against the document.', 'Save to the draft',
      [{ label: 'Lender', value: offer!.lenderName }, ...figureRows(d)]);
  } else if (kind === 'CONFIRM') {
    const isSelected = snap.selection?.offerId === offer!.id;
    spec = confirmation(id, 'Confirm this Loan Estimate?',
      `You are saying you checked all ${LE_FIELD_KEYS.length} figures against the Loan Estimate document. Confirming makes this ${offer!.lenderName}'s current offer for your comparison.${isSelected ? ' This lender is your selected offer; confirming a new revision clears that selection and you will need to select it again, and the Closing Disclosure is compared against the selected offer.' : ''} ContractToCozy does not review your Loan Estimate or contact any lender.`,
      'Confirm the figures', LE_FIELD_KEYS.map((key) => ({ label: LE_FIELD_LABELS[key], value: valueText(key, revision!) })));
  } else {
    const intent = d.intentToProceed === 'YES';
    const changed = snap.selection?.revisionId !== revision!.id;
    const lockExpired = revision!.rateLockStatus === 'LOCKED' && revision!.rateLockExpirationDate && new Date(`${revision!.rateLockExpirationDate}T23:59:59.000Z`) < new Date();
    spec = confirmation(id, `Select ${offer!.lenderName}'s offer?`,
      `This records which offer you chose for planning${intent ? ' and notes your intent to proceed' : ''}. It does not apply for a loan, lock a rate or contact the lender. ${changed && snap.selection ? 'Choosing a different offer resets your appraisal tracking so you can record its timing and conditions. ' : ''}${lockExpired ? 'The rate lock recorded on this offer has expired. ' : ''}Your Closing Disclosure is later compared against this offer.`,
      'Select this offer', [
        { label: 'Lender', value: offer!.lenderName }, { label: 'Revision', value: String(revision!.revisionNumber) },
        { label: 'Interest rate', value: valueText('NOTE_RATE', revision!) }, { label: 'APR', value: valueText('APR', revision!) }, { label: 'Cash to close', value: valueText('CASH_TO_CLOSE', revision!) },
        { label: 'Intent to proceed', value: intent ? 'Noted' : 'Not noted (planning only)' },
      ]);
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_LE_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { leCommand: { kind, entityId: entityKey }, leForm: supplied, leContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'buyer-le-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: kind === 'CONFIRM' || kind === 'SELECT' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: spec, captureRequests: [formCapture(kind as LeFormKind, contextVersion, revision, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-loan-estimate.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = leKindFromMessage(envelope.message);
  const needsEntity = kind !== null && kind !== 'OFFER_ADD';
  if (!kind || launch?.operationId !== 'BUYER_LOAN_ESTIMATE_COMMAND' || launch.surface === 'ASK_REFRESH' || (needsEntity && (launch.entityType !== LE_ENTITY_TYPE || !launch.entityId))) {
    return unavailable('ASK_BUYER_LE_NOT_DIRECTLY_ROUTABLE', 'Open your lender offers first', 'A Loan Estimate is changed from your lender offers answer. Nothing has changed.');
  }
  return leCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: needsEntity ? launch.entityId! : null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmLe(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.leCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as LeKind | undefined;
  if (!kind || !(kind in LE_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = typeof command?.entityId === 'string' ? command.entityId : null;
  let title: string;
  try {
    const snap = await load(userId, propertyId);
    if (parameters.leContextVersion !== version(snap)) throw stale('Your lender offers changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (snap.purchasePath !== 'FINANCED') throw stale('Financing is not set up yet.');
    const target = entityId ? findRevision(snap, entityId) : null;
    if (kind === 'OFFER_ADD') {
      const parsed = parseLeAnswer('OFFER_ADD', parameters.leForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const { lenderName, ...rest } = parsed.data as Record<string, unknown>;
      await BuyerPurchaseLoanEstimateService.createOffer(userId, propertyId, { lenderName: String(lenderName), sourceType: 'MANUAL', ...figurePatch(rest) } as never);
      title = 'Offer added';
    } else {
      if (!target) throw stale('That Loan Estimate is no longer there.');
      const { offer, revision } = target;
      if (kind === 'REVISION_START') {
        if (offer.revisions.some((r) => r.status === 'DRAFT')) throw stale('This lender already has a draft.');
        const from = offer.revisions.find((r) => r.status === 'CONFIRMED') ?? revision;
        await BuyerPurchaseLoanEstimateService.addRevision(userId, propertyId, offer.id, {
          sourceType: 'MANUAL',
          ...(from.loanAmountCents != null ? { loanAmountCents: from.loanAmountCents } : {}), ...(from.loanTermMonths != null ? { loanTermMonths: from.loanTermMonths } : {}),
          ...(from.loanType ? { loanType: from.loanType } : {}), ...(from.noteRateBps != null ? { noteRateBps: from.noteRateBps } : {}), ...(from.aprBps != null ? { aprBps: from.aprBps } : {}),
          ...(from.monthlyPrincipalAndInterestCents != null ? { monthlyPrincipalAndInterestCents: from.monthlyPrincipalAndInterestCents } : {}),
          ...(from.monthlyMortgageInsuranceCents != null ? { monthlyMortgageInsuranceCents: from.monthlyMortgageInsuranceCents } : {}),
          ...(from.estimatedTotalMonthlyPaymentCents != null ? { estimatedTotalMonthlyPaymentCents: from.estimatedTotalMonthlyPaymentCents } : {}),
          ...(from.loanCostsCents != null ? { loanCostsCents: from.loanCostsCents } : {}), ...(from.lenderCreditsCents != null ? { lenderCreditsCents: from.lenderCreditsCents } : {}),
          ...(from.discountPointsBps != null ? { discountPointsBps: from.discountPointsBps } : {}), ...(from.discountPointsCents != null ? { discountPointsCents: from.discountPointsCents } : {}),
          ...(from.prepaidAndEscrowCents != null ? { prepaidAndEscrowCents: from.prepaidAndEscrowCents } : {}), ...(from.cashToCloseCents != null ? { cashToCloseCents: from.cashToCloseCents } : {}),
          ...(from.cashToCloseDirection ? { cashToCloseDirection: from.cashToCloseDirection } : {}),
        } as never);
        title = 'Revision started';
      } else {
        const parsed = parseLeAnswer(kind, parameters.leForm);
        if (!parsed.success) throw stale('The details to save are invalid.');
        const d = parsed.data as Record<string, unknown>;
        if (kind === 'DRAFT_EDIT') {
          if (revision.status !== 'DRAFT') throw stale('Only a draft can be edited.');
          await BuyerPurchaseLoanEstimateService.updateDraft(userId, propertyId, revision.id, figurePatch(d) as never);
          title = 'Draft updated';
        } else if (kind === 'CONFIRM') {
          if (revision.status !== 'DRAFT') throw stale('Only a draft can be confirmed.');
          if (!LE_FIELD_KEYS.every((key) => hasValue((revision as unknown as Record<string, unknown>)[LE_FIELD_VALUES[key]]))) throw stale('The draft is no longer complete.');
          await BuyerPurchaseLoanEstimateService.confirm(userId, propertyId, revision.id);
          title = 'Figures confirmed';
        } else {
          if (revision.status !== 'CONFIRMED') throw stale('Only a confirmed Loan Estimate can be selected.');
          await BuyerPurchaseLoanEstimateService.selectOffer(userId, propertyId, { revisionId: revision.id, intentToProceed: d.intentToProceed === 'YES' });
          title = 'Offer selected';
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_LE_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `buyer-le-${kind.toLowerCase()}-${entityId ?? propertyId}`, title, status: 'COMPLETED',
      description: kind === 'SELECT' ? 'It is recorded as your selected offer. Nothing was applied for, locked or sent to the lender.'
        : kind === 'CONFIRM' ? 'It is now this lender\'s current offer in your comparison. Nothing was sent to the lender.' : 'It is on your lender offers as a draft. Nothing is confirmed or sent.',
      details: [], actions: [{ ...back, style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-le-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_LOAN_ESTIMATE', artifactId: entityId ?? propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-loan-estimate.command', confirmLe);
