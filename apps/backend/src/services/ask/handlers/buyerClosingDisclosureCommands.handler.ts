// The buyer's Closing Disclosure revisions and funds readiness inside Ask (register P2 "Buyer Closing"; FRD v1.351). Reached only by the declared actions on
// the disclosure and funds readiness answer. Every write is BuyerClosingDisclosureService's own method (the routes' calls), behind a review and a
// confirmation bound to the workspace. Wire-fraud sensitive: per-figure confirmation, no blanket confirm, a draft before funds readiness, a named
// trusted channel before instructions can be marked verified, and every review carries the wire safety text.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerClosingDisclosureService } from '../../buyerClosingDisclosure.service';
import {
  CD_CAPTURE_KEYS, CD_FIELD_KEYS, CD_FIELD_LABELS, CD_FIELD_VALUES, CD_MESSAGES, FUNDS_METHOD_LABELS, VERIFICATION_CHANNEL_LABELS, WIRE_SAFETY_TEXT,
  cdKindFromMessage, hasValue, parseCdAnswer, type CdFormKind, type CdKind,
} from '../support/buyerClosingDisclosureCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'buyer-cd-back', label: 'Back to my Closing Disclosure', interactionType: 'START_WORKFLOW' as const, message: 'What changed in my Closing Disclosure?', operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-cd-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const wireBoundary = { type: 'BOUNDARY' as const, id: 'buyer-cd-wire-boundary', title: 'Wire-fraud protection', body: WIRE_SAFETY_TEXT, severity: 'CAUTION' as const, suggestions: [] };
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const percentText = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const isoNoon = (day: string) => new Date(`${day}T12:00:00.000Z`).toISOString();

interface Revision {
  id: string; status: string; revisionNumber: number; updatedAt: string; issuedDate: string | null; loanAmountCents: number | null; noteRateBps: number | null;
  aprBps: number | null; estimatedTotalMonthlyPaymentCents: number | null; loanCostsCents: number | null; lenderCreditsCents: number | null;
  prepaidAndEscrowCents: number | null; sellerCreditsCents: number | null; cashToCloseCents: number | null; cashToCloseDirection: string | null; changeExplanation: string | null;
}
interface Workspace {
  id: string; updatedAt: string; fundsMethod: string; fundsExpectedAt: string | null; fundsReady: boolean; instructionsVerified: boolean;
  verificationChannel: string; questions: string[]; questionsResolved: boolean; revisions: Revision[];
}
interface Snapshot { workspace: Workspace | null; selected: Record<string, unknown> | null }
async function load(userId: string, propertyId: string): Promise<Snapshot> {
  const data = await BuyerClosingDisclosureService.get(userId, propertyId);
  return { workspace: (data.workspace as unknown as Workspace | null) ?? null, selected: (data.selectedLoanEstimate as unknown as Record<string, unknown>) ?? null };
}
const draftOf = (s: Snapshot) => s.workspace?.revisions.find((r) => r.status === 'DRAFT') ?? null;
const confirmedOf = (s: Snapshot) => s.workspace?.revisions.find((r) => r.status === 'CONFIRMED') ?? null;
const version = (s: Snapshot) => {
  const w = s.workspace;
  return sha(`buyer-cd:${w ? `${w.updatedAt}|${w.fundsMethod}|${w.fundsExpectedAt ?? ''}|${w.fundsReady}|${w.instructionsVerified}|${w.verificationChannel}|${w.questionsResolved}|${w.questions.length}|${w.revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join(',')}` : 'none'}`);
};
const valueText = (key: string, revision: Revision) => {
  const raw = (revision as unknown as Record<string, unknown>)[CD_FIELD_VALUES[key]];
  if (!hasValue(raw)) return 'Not recorded';
  if (key === 'ISSUED_DATE') return humanDate(new Date(`${raw}T12:00:00.000Z`)) ?? String(raw);
  if (key === 'NOTE_RATE' || key === 'APR') return percentText(Number(raw));
  return dollars(Number(raw));
};

function formCapture(kind: CdFormKind, contextVersion: string, draft: Revision | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const day = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const money = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const percent = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 50 } });
  const yesNo = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } });
  const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ label, value }));
  const specs = {
    DRAFT_EDIT: { title: 'Edit your Closing Disclosure draft', question: 'Enter the figures as they appear on the document. Leave the rest blank.', seed: {}, fields: [
      day('issuedDate', 'Issued date'), money('loanAmount', 'Loan amount ($)'), percent('noteRate', 'Interest rate (%)'), percent('apr', 'APR (%)'),
      money('monthlyPayment', 'Estimated total monthly payment ($)'), money('loanCosts', 'Loan costs ($)'), money('lenderCredits', 'Lender credits ($)'),
      money('prepaidAndEscrow', 'Prepaids and escrow ($)'), money('sellerCredits', 'Seller credits ($)'), money('cashToClose', 'Cash to close ($)'),
      { key: 'cashToCloseDirection', label: 'Cash to close is', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Paid by me', value: 'FROM_BORROWER' }, { label: 'Paid to me', value: 'TO_BORROWER' }] } },
      { key: 'changeExplanation', label: 'What changed since the last version', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 4000 } },
    ] },
    CONFIRM: { title: 'Which figures did you check against your Closing Disclosure?', question: 'Check each figure against the document. Every figure is required before this can be confirmed.', seed: { fields: [] }, fields: [
      { key: 'fields', label: 'Figures you checked', required: true, inputSchema: { type: 'MULTI_SELECT' as const, maxItems: CD_FIELD_KEYS.length,
        options: CD_FIELD_KEYS.map((value) => ({ label: draft ? `${CD_FIELD_LABELS[value]}: ${valueText(value, draft)}` : CD_FIELD_LABELS[value], value })) } },
    ] },
    FUNDS_UPDATE: { title: 'Update your closing funds readiness', question: 'What changed? Leave the rest blank. Never enter account or routing numbers.', seed: {}, fields: [
      { key: 'fundsMethod', label: 'How you will bring funds', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: options(FUNDS_METHOD_LABELS) } },
      day('fundsExpectedDate', 'Date funds are expected'), yesNo('fundsReady', 'Funds are ready'),
      { key: 'verificationChannel', label: 'How you verified the instructions', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: options(VERIFICATION_CHANNEL_LABELS) } },
      yesNo('instructionsVerified', 'I verified the transfer instructions myself'), yesNo('questionsResolved', 'My questions are resolved'),
      { key: 'newQuestion', label: 'Add a question to ask', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 500 } },
    ] },
  } as const;
  const spec = specs[kind];
  return {
    requirementId: `buyer-cd-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: CD_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'ContractToCozy does not review your Closing Disclosure and never stores account or routing numbers. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

const toCents = (dollarsValue: unknown) => Math.round(Number(dollarsValue) * 100);
/** The revision fields a DRAFT_EDIT answer sets (the service's own update shape). */
function editPatch(d: Record<string, unknown>) {
  return {
    ...(d.issuedDate ? { issuedDate: String(d.issuedDate) } : {}),
    ...(d.loanAmount !== undefined ? { loanAmountCents: toCents(d.loanAmount) } : {}),
    ...(d.noteRate !== undefined ? { noteRateBps: Math.round(Number(d.noteRate) * 100) } : {}),
    ...(d.apr !== undefined ? { aprBps: Math.round(Number(d.apr) * 100) } : {}),
    ...(d.monthlyPayment !== undefined ? { estimatedTotalMonthlyPaymentCents: toCents(d.monthlyPayment) } : {}),
    ...(d.loanCosts !== undefined ? { loanCostsCents: toCents(d.loanCosts) } : {}),
    ...(d.lenderCredits !== undefined ? { lenderCreditsCents: toCents(d.lenderCredits) } : {}),
    ...(d.prepaidAndEscrow !== undefined ? { prepaidAndEscrowCents: toCents(d.prepaidAndEscrow) } : {}),
    ...(d.sellerCredits !== undefined ? { sellerCreditsCents: toCents(d.sellerCredits) } : {}),
    ...(d.cashToClose !== undefined ? { cashToCloseCents: toCents(d.cashToClose) } : {}),
    ...(d.cashToCloseDirection ? { cashToCloseDirection: d.cashToCloseDirection } : {}),
    ...(d.changeExplanation ? { changeExplanation: String(d.changeExplanation) } : {}),
  };
}
const FIELD_FOR_PATCH: Array<[string, string, (v: number) => string]> = [
  ['loanAmount', 'LOAN_AMOUNT', (v) => dollars(toCents(v))], ['noteRate', 'NOTE_RATE', (v) => percentText(Math.round(v * 100))], ['apr', 'APR', (v) => percentText(Math.round(v * 100))],
  ['monthlyPayment', 'MONTHLY_PAYMENT', (v) => dollars(toCents(v))], ['loanCosts', 'LOAN_COSTS', (v) => dollars(toCents(v))], ['lenderCredits', 'LENDER_CREDITS', (v) => dollars(toCents(v))],
  ['prepaidAndEscrow', 'PREPAID_ESCROW', (v) => dollars(toCents(v))], ['sellerCredits', 'SELLER_CREDITS', (v) => dollars(toCents(v))], ['cashToClose', 'CASH_TO_CLOSE', (v) => dollars(toCents(v))],
];
/** The funds fields a FUNDS_UPDATE answer sets, validated against what is already recorded. Returns the problem when the combination is unsafe. */
function fundsPatch(w: Workspace, d: Record<string, unknown>) {
  const channel = (d.verificationChannel as string | undefined) ?? w.verificationChannel;
  const verified = d.instructionsVerified === undefined ? w.instructionsVerified : d.instructionsVerified === 'YES';
  if (verified && channel === 'UNKNOWN') return { problem: 'Name how you verified the instructions (a number you already knew, in person, or a secure portal) before marking them verified.' };
  const questions = d.newQuestion ? [...w.questions, String(d.newQuestion)] : null;
  if (questions && questions.length > 25) return { problem: 'You already have 25 questions recorded. Resolve some first.' };
  return {
    patch: {
      ...(d.fundsMethod ? { fundsMethod: d.fundsMethod } : {}),
      ...(d.fundsExpectedDate ? { fundsExpectedAt: isoNoon(String(d.fundsExpectedDate)) } : {}),
      ...(d.fundsReady !== undefined ? { fundsReady: d.fundsReady === 'YES' } : {}),
      ...(d.verificationChannel ? { verificationChannel: d.verificationChannel } : {}),
      ...(d.instructionsVerified !== undefined ? { instructionsVerified: d.instructionsVerified === 'YES' } : {}),
      ...(d.questionsResolved !== undefined ? { questionsResolved: d.questionsResolved === 'YES' } : {}),
      ...(questions ? { questions } : {}),
    },
  };
}

export async function cdCommandResult(
  userId: string, propertyId: string, launch: { kind: CdKind; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-cd-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  let snap: Snapshot;
  try {
    snap = await load(userId, propertyId);
  } catch (error) {
    if ((error as { code?: unknown }).code === 'CLOSING_DISCLOSURE_REQUIRES_SELECTED_LOAN_ESTIMATE') {
      return unavailable('BUYER_CD_REQUIRES_LOAN_ESTIMATE', 'Select a Loan Estimate first', 'A Closing Disclosure is reviewed against your selected, confirmed Loan Estimate. Nothing has changed.');
    }
    throw error;
  }
  const contextVersion = version(snap);
  const draft = draftOf(snap);
  const confirmed = confirmedOf(snap);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared purchase record.';
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `buyer-cd-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'DRAFT_START') {
    if (draft) return unavailable('BUYER_CD_DRAFT_EXISTS', 'You already have a draft', 'Edit or confirm that draft first. Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_CD_DRAFT_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { cdCommand: { kind }, cdContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'buyer-cd-start-review', title: 'Start a Closing Disclosure revision?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }, wireBoundary],
      confirmation: confirmation(`start-${sha(contextVersion).slice(0, 12)}`, 'Start a Closing Disclosure revision?',
        'This opens a draft you can fill in from the document and then confirm figure by figure. Nothing is confirmed, sent or paid by starting it.', 'Start the draft',
        [{ label: 'Based on', value: confirmed ? `Confirmed revision ${confirmed.revisionNumber} (issued date left blank to re-enter)` : 'A blank draft' }]),
      suggestions: [],
    };
  }
  if (kind === 'FUNDS_UPDATE') {
    if (!snap.workspace) return unavailable('BUYER_CD_DRAFT_REQUIRED', 'Save a Closing Disclosure draft first', 'Funds readiness is recorded against a Closing Disclosure. Start a revision first. Nothing has changed.');
  } else if (!draft) {
    return unavailable('BUYER_CD_NO_DRAFT', 'There is no draft to change', 'Start a revision first. Nothing has changed.');
  }
  const formKind = kind as CdFormKind;
  if (kind === 'CONFIRM') {
    const missing = CD_FIELD_KEYS.filter((key) => !hasValue((draft as unknown as Record<string, unknown>)[CD_FIELD_VALUES[key]]));
    if (missing.length) return unavailable('BUYER_CD_INCOMPLETE', 'The draft is not complete', `Fill in: ${missing.map((key) => CD_FIELD_LABELS[key]).join(', ')}. Nothing has changed.`);
  }
  if (!supplied) {
    const w = snap.workspace;
    const body = kind === 'FUNDS_UPDATE' && w
      ? `Now: funds ${FUNDS_METHOD_LABELS[w.fundsMethod] ?? w.fundsMethod}, ${w.fundsReady ? 'ready' : 'not ready'}, instructions ${w.instructionsVerified ? 'verified by you' : 'not verified'}. ${WIRE_SAFETY_TEXT}`
      : 'Nothing has been saved yet; you will review the change first.';
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_CD_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { cdLaunch: { kind, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-cd-input', title: draft ? `Closing Disclosure revision ${draft.revisionNumber} (draft)` : 'Closing funds readiness', body, tone: kind === 'FUNDS_UPDATE' ? 'CAUTION' : 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, draft)], suggestions: [],
    };
  }
  const parsed = parseCdAnswer(formKind, supplied);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '';
    return unavailable('BUYER_CD_INPUT_INVALID', 'Check the details',
      /account or routing/.test(message) ? 'Do not enter account or routing numbers. Nothing has changed.'
        : /Check every figure/.test(message) ? 'Check every figure against the document. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  }
  const d = parsed.data as Record<string, unknown>;
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  let spec: ReturnType<typeof confirmation>;
  if (formKind === 'DRAFT_EDIT') {
    const rev = draft as Revision;
    const fields: Array<{ label: string; value: string }> = [
      ...(d.issuedDate ? [{ label: 'Issued date', value: `${valueText('ISSUED_DATE', rev)} → ${humanDate(new Date(isoNoon(String(d.issuedDate)))) ?? d.issuedDate}` }] : []),
      ...FIELD_FOR_PATCH.filter(([key]) => d[key] !== undefined).map(([key, field, show]) => ({ label: CD_FIELD_LABELS[field], value: `${valueText(field, rev)} → ${show(Number(d[key]))}` })),
      ...(d.cashToCloseDirection ? [{ label: 'Cash to close is', value: d.cashToCloseDirection === 'FROM_BORROWER' ? 'Paid by you' : 'Paid to you' }] : []),
      ...(d.changeExplanation ? [{ label: 'What changed', value: 'Updated' }] : []),
    ];
    spec = confirmation(id, 'Save these figures to the draft?', 'This changes the draft only. It is not your current Closing Disclosure until you confirm each figure against the document.', 'Save to the draft', fields);
  } else if (formKind === 'CONFIRM') {
    const rev = draft as Revision;
    const selected = snap.selected ?? {};
    const fields = CD_FIELD_KEYS.map((key) => {
      const field = CD_FIELD_VALUES[key];
      const now = (rev as unknown as Record<string, unknown>)[field];
      const le = selected[field];
      const delta = typeof now === 'number' && typeof le === 'number' && key !== 'ISSUED_DATE' && now !== le
        ? ` (${now > le ? '+' : '−'}${key === 'NOTE_RATE' || key === 'APR' ? percentText(Math.abs(now - le)) : dollars(Math.abs(now - le))} vs your selected Loan Estimate)` : '';
      return { label: CD_FIELD_LABELS[key], value: `${valueText(key, rev)}${delta}` };
    });
    spec = confirmation(id, 'Confirm this Closing Disclosure revision?',
      `You are saying you checked all ${CD_FIELD_KEYS.length} figures against the Closing Disclosure document. Confirming makes this your current revision and updates your closing-disclosure review step. ${WIRE_SAFETY_TEXT} ContractToCozy does not review your Closing Disclosure, and this is not lending, settlement or legal advice.`,
      'Confirm the revision', fields);
  } else {
    const w = snap.workspace as Workspace;
    const result = fundsPatch(w, d);
    if (result.problem) return unavailable('BUYER_CD_FUNDS_UNSAFE', 'Check how you verified the instructions', `${result.problem} Nothing has changed.`);
    const rows: Array<{ label: string; value: string }> = [
      ...(d.fundsMethod ? [{ label: 'How you will bring funds', value: `${FUNDS_METHOD_LABELS[w.fundsMethod]} → ${FUNDS_METHOD_LABELS[String(d.fundsMethod)]}` }] : []),
      ...(d.fundsExpectedDate ? [{ label: 'Date funds are expected', value: `${w.fundsExpectedAt ? humanDate(new Date(w.fundsExpectedAt)) : 'Not set'} → ${humanDate(new Date(isoNoon(String(d.fundsExpectedDate)))) ?? d.fundsExpectedDate}` }] : []),
      ...(d.fundsReady !== undefined ? [{ label: 'Funds are ready', value: `${w.fundsReady ? 'Yes' : 'No'} → ${d.fundsReady === 'YES' ? 'Yes' : 'No'}` }] : []),
      ...(d.verificationChannel ? [{ label: 'How you verified', value: `${VERIFICATION_CHANNEL_LABELS[w.verificationChannel]} → ${VERIFICATION_CHANNEL_LABELS[String(d.verificationChannel)]}` }] : []),
      ...(d.instructionsVerified !== undefined ? [{ label: 'You verified the instructions', value: `${w.instructionsVerified ? 'Yes' : 'No'} → ${d.instructionsVerified === 'YES' ? 'Yes' : 'No'}` }] : []),
      ...(d.questionsResolved !== undefined ? [{ label: 'Questions resolved', value: `${w.questionsResolved ? 'Yes' : 'No'} → ${d.questionsResolved === 'YES' ? 'Yes' : 'No'}` }] : []),
      ...(d.newQuestion ? [{ label: 'New question', value: String(d.newQuestion) }] : []),
    ];
    spec = confirmation(id, 'Record these funds readiness changes?',
      `${WIRE_SAFETY_TEXT} This records your own statement; nothing is sent, paid or verified for you.${confirmed ? '' : ' Funds readiness only counts once a current Closing Disclosure revision is confirmed.'}`,
      'Record this', rows);
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_CD_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { cdCommand: { kind }, cdForm: supplied, cdContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'buyer-cd-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: kind === 'DRAFT_EDIT' ? 'DEFAULT' : 'CAUTION', actions: [] }, wireBoundary],
    confirmation: spec, captureRequests: [formCapture(formKind, contextVersion, draft, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-closing-disclosure.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = cdKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'BUYER_CLOSING_DISCLOSURE_COMMAND' || launch.surface === 'ASK_REFRESH') {
    return unavailable('ASK_BUYER_CD_NOT_DIRECTLY_ROUTABLE', 'Open your Closing Disclosure first', 'A Closing Disclosure is changed from your disclosure and funds readiness answer. Nothing has changed.');
  }
  return cdCommandResult(envelope.userId, envelope.propertyId!, { kind, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmCd(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.cdCommand as { kind?: unknown } | undefined;
  const kind = command?.kind as CdKind | undefined;
  if (!kind || !(kind in CD_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  try {
    const snap = await load(userId, propertyId);
    if (parameters.cdContextVersion !== version(snap)) throw stale('Your Closing Disclosure changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const draft = draftOf(snap);
    if (kind === 'DRAFT_START') {
      if (draft) throw stale('You already have a draft.');
      const from = confirmedOf(snap);
      await BuyerClosingDisclosureService.createRevision(userId, propertyId, {
        sourceType: 'MANUAL',
        ...(from?.loanAmountCents != null ? { loanAmountCents: from.loanAmountCents } : {}),
        ...(from?.noteRateBps != null ? { noteRateBps: from.noteRateBps } : {}),
        ...(from?.aprBps != null ? { aprBps: from.aprBps } : {}),
        ...(from?.estimatedTotalMonthlyPaymentCents != null ? { estimatedTotalMonthlyPaymentCents: from.estimatedTotalMonthlyPaymentCents } : {}),
        ...(from?.loanCostsCents != null ? { loanCostsCents: from.loanCostsCents } : {}),
        ...(from?.lenderCreditsCents != null ? { lenderCreditsCents: from.lenderCreditsCents } : {}),
        ...(from?.prepaidAndEscrowCents != null ? { prepaidAndEscrowCents: from.prepaidAndEscrowCents } : {}),
        ...(from?.sellerCreditsCents != null ? { sellerCreditsCents: from.sellerCreditsCents } : {}),
        ...(from?.cashToCloseCents != null ? { cashToCloseCents: from.cashToCloseCents } : {}),
        ...(from?.cashToCloseDirection ? { cashToCloseDirection: from.cashToCloseDirection } : {}),
      } as never);
      title = 'Draft started';
    } else {
      const parsed = parseCdAnswer(kind, parameters.cdForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data as Record<string, unknown>;
      if (kind === 'FUNDS_UPDATE') {
        if (!snap.workspace) throw stale('Save a Closing Disclosure draft before recording funds readiness.');
        const result = fundsPatch(snap.workspace, d);
        if (!result.patch) throw stale(result.problem ?? 'The details to save are invalid.');
        await BuyerClosingDisclosureService.updateFundsReadiness(userId, propertyId, result.patch as never);
        title = 'Funds readiness recorded';
      } else {
        if (!draft) throw stale('There is no draft to change.');
        if (kind === 'DRAFT_EDIT') {
          await BuyerClosingDisclosureService.updateDraft(userId, propertyId, draft.id, editPatch(d) as never);
          title = 'Draft updated';
        } else {
          if (!CD_FIELD_KEYS.every((key) => hasValue((draft as unknown as Record<string, unknown>)[CD_FIELD_VALUES[key]]))) throw stale('The draft is no longer complete.');
          await BuyerClosingDisclosureService.confirm(userId, propertyId, draft.id);
          title = 'Revision confirmed';
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_CD_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `buyer-cd-${kind.toLowerCase()}-${propertyId}`, title, status: 'COMPLETED',
      description: kind === 'CONFIRM' ? 'It is now your current Closing Disclosure revision. Nothing was sent, paid or told to anyone.'
        : kind === 'FUNDS_UPDATE' ? 'Your statement is recorded. Nothing was sent or paid, and Ask has not verified any instructions.' : 'It is on your Closing Disclosure draft. Nothing is confirmed yet.',
      details: [], actions: [{ ...back, style: 'PRIMARY' as const }],
    }, wireBoundary],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-cd-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_CLOSING_DISCLOSURE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-closing-disclosure.command', confirmCd);
