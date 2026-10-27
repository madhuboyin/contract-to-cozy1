// The ownership transition on a closed sale, inside Ask (register P2 "Seller Prep"; FRD v1.444). Reached only through SELLER_PREP_CASE_COMMAND's declared
// actions, so it shares that command's role floor, routing and confirmation. Every write is PropertySaleCaseService's (recordTransition, updateTransition,
// completeTransition), the routes' own calls, behind a review and a confirmation. Nothing here sends the buyer package or contacts anyone: the buyer
// package is a Property Brief share the household already made, and "accepted" comes only from its recipient opening it.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { PropertySaleCaseService } from '../../propertySaleCase.service';
import { listPropertyBriefs } from '../../../propertyBrief/propertyBrief.service';
import {
  RETENTION_DECISION_LABELS, SALE_CASE_FORM_CAPTURE_KEYS, SALE_TRANSITION_NO_PACKAGE, parseSaleCaseAnswer, type SaleCaseFormKind, type SaleCaseKind,
} from '../support/sellerPrepCaseCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToChecklist = { id: 'seller-prep-back', label: 'Back to my checklist', interactionType: 'START_WORKFLOW' as const, message: 'Show my seller prep checklist', operationId: 'SELLER_PREP_CHECKLIST' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'seller-prep-transition-unavailable', title, body, tone: 'DEFAULT', actions: [backToChecklist] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

interface ShareOption { shareId: string; briefTitle: string; purpose: string; recipientName: string | null; accepted: boolean; acceptedAt: Date | null }
interface TransitionRow { id: string; sellerRetentionDecision: string | null; sellerRetentionNotes: string | null; buyerPackageId: string | null; acceptedAt: Date | null; completedAt: Date | null; updatedAt: Date }
interface TransitionState {
  saleCase: { id: string; status: string; updatedAt?: Date } | null; transition: TransitionRow | null; buyerShares: ShareOption[]; revocable: ShareOption[];
}

/** The page's own reads: the case with its newest transition, and the active Property Brief shares split into buyer packages and the rest (the ones that can be stopped at completion). */
async function loadState(userId: string, propertyId: string, withShares: boolean): Promise<TransitionState> {
  const overview = await PropertySaleCaseService.getCase(userId, propertyId);
  const transition = ((overview.transitions ?? [])[0] ?? null) as TransitionRow | null;
  let active: ShareOption[] = [];
  if (withShares && transition && !transition.completedAt) {
    const briefs = await listPropertyBriefs(propertyId);
    active = briefs.flatMap((brief) => brief.shares.filter((share) => share.status === 'ACTIVE').map((share) => ({
      shareId: share.id, briefTitle: brief.title, purpose: brief.purpose, recipientName: share.recipientName ?? null, accepted: Boolean(share.acceptedAt), acceptedAt: share.acceptedAt ?? null,
    })));
  }
  return {
    saleCase: overview.saleCase as TransitionState['saleCase'], transition,
    buyerShares: active.filter((share) => share.purpose === 'PROSPECTIVE_BUYER'), revocable: active.filter((share) => share.purpose !== 'PROSPECTIVE_BUYER'),
  };
}
const versionOf = (kind: SaleCaseKind, state: TransitionState, propertyId: string) => sha([
  'sale-transition', kind, state.saleCase?.id ?? propertyId, state.saleCase?.status ?? 'none',
  state.transition ? `${state.transition.id}:${state.transition.updatedAt.toISOString()}:${state.transition.completedAt?.toISOString() ?? ''}` : 'no-transition',
  state.buyerShares.map((share) => `${share.shareId}=${share.accepted ? 1 : 0}`).sort().join(','), state.revocable.map((share) => share.shareId).sort().join(','),
].join(':'));
const shareLabel = (share: ShareOption) => `${share.briefTitle}${share.recipientName ? ` — ${share.recipientName}` : ''}`;
const packageLabel = (share: ShareOption) => `${shareLabel(share)} (${share.accepted ? 'accepted' : 'not yet accepted'})`;

function formCapture(kind: Extract<SaleCaseFormKind, 'TRANSITION' | 'COMPLETE'>, contextVersion: string, state: TransitionState): AskCaptureRequest {
  const t = state.transition!;
  const spec = kind === 'TRANSITION'
    ? {
      title: 'Buyer hand-off', question: 'What is the buyer getting, and what are you keeping or sharing?',
      help: 'A blank keeps what is saved. The package is a Property Brief share you already made for a buyer; this does not send it to anyone.',
      fields: [
        { key: 'buyerPackageId', label: 'Buyer hand-off package', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'None selected', value: SALE_TRANSITION_NO_PACKAGE }, ...state.buyerShares.map((share) => ({ label: packageLabel(share).slice(0, 120), value: share.shareId }))] } },
        { key: 'sellerRetentionDecision', label: 'Seller retention decision', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(RETENTION_DECISION_LABELS).map(([value, label]) => ({ label, value })) } },
        { key: 'sellerRetentionNotes', label: 'Notes (optional)', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 1000 } },
      ],
      seed: { buyerPackageId: t.buyerPackageId ?? SALE_TRANSITION_NO_PACKAGE, sellerRetentionDecision: t.sellerRetentionDecision ?? undefined, sellerRetentionNotes: t.sellerRetentionNotes ?? undefined },
    }
    : {
      title: 'Stop access on completion', question: 'Which shares should stop working when the transition completes?',
      help: 'These are your other active Property Brief shares (agents, professionals). Each one you tick stops working at once for anyone with its link. Leave all unticked to keep them.',
      fields: [{ key: 'revokeShareIds', label: 'Shares to stop', required: false, inputSchema: { type: 'MULTI_SELECT' as const, maxItems: 20, options: state.revocable.map((share) => ({ label: `${shareLabel(share)} (${share.purpose.replace(/_/g, ' ').toLowerCase()})`.slice(0, 120), value: share.shareId })) } }],
      seed: {},
    };
  return {
    requirementId: `seller-prep-transition-${kind.toLowerCase()}-inputs`, captureKey: SALE_CASE_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.question, helpText: spec.help,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(spec.seed).filter(([, v]) => v !== null && v !== undefined)), allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function saleTransitionResult(userId: string, propertyId: string, launch: { kind: 'TRANSITION_START' | 'TRANSITION' | 'COMPLETE'; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'seller-prep-transition-permission', title: 'A contributor or owner can change the ownership transition', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const state = await loadState(userId, propertyId, kind !== 'TRANSITION_START');
  if (!state.saleCase) return unavailable('SELLER_PREP_NO_ACTIVE_CASE', 'There is no sale case yet', 'Nothing has changed.');
  if (state.saleCase.status !== 'CLOSED') return unavailable('SELLER_PREP_TRANSITION_CASE_NOT_CLOSED', 'The sale is not closed yet', 'The ownership transition is recorded after the sale closes. Nothing has changed.');
  const contextVersion = versionOf(kind, state, propertyId);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `seller-prep-transition-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'TRANSITION_START') {
    if (state.transition) return unavailable('SELLER_PREP_TRANSITION_EXISTS', 'An ownership transition already exists', 'Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'SELLER_PREP_TRANSITION_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { saleCaseCommand: { kind, entityId: propertyId }, saleCaseContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'seller-prep-transition-start-review', title: 'Start the ownership transition?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`start-${sha(propertyId).slice(0, 12)}`, {
        title: 'Start the ownership transition?', confirmLabel: 'Start the transition',
        description: 'This opens the record of how ownership transferred: the buyer hand-off, what you keep or share, and access cleanup. It sends nothing and contacts no one.', fields: [{ label: 'Sale', value: 'Closed' }],
      }),
      suggestions: [],
    };
  }

  const t = state.transition;
  if (!t) return unavailable('SELLER_PREP_NO_TRANSITION', 'Start the ownership transition first', 'Nothing has changed.');
  if (t.completedAt) return unavailable('SELLER_PREP_TRANSITION_COMPLETE', 'The transition is already complete', 'A completed transition cannot be edited. Nothing has changed.');
  const formKind = kind as 'TRANSITION' | 'COMPLETE';

  if (formKind === 'COMPLETE') {
    if (!t.sellerRetentionDecision) return unavailable('SELLER_PREP_TRANSITION_RETENTION_MISSING', 'Choose a retention decision first', 'Record whether you keep the history private or share selected history, then complete the transition. Nothing has changed.');
    const linked = t.buyerPackageId ? state.buyerShares.find((share) => share.shareId === t.buyerPackageId) : null;
    if (t.buyerPackageId && !linked) return unavailable('SELLER_PREP_TRANSITION_PACKAGE_UNAVAILABLE', 'The linked buyer package is no longer active', 'Choose an active buyer package, or none, in the buyer hand-off first. Nothing has changed.');
    if (linked && !linked.accepted) return unavailable('SELLER_PREP_TRANSITION_PACKAGE_NOT_ACCEPTED', 'The buyer has not opened the package yet', 'The transition can be completed once the recipient has opened the linked buyer package. Nothing has changed.');
  }
  // Completing with no other active shares has nothing to ask: review straight away.
  const answer = supplied ?? (formKind === 'COMPLETE' && !state.revocable.length ? { revokeShareIds: [] } : undefined);
  if (!answer) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `SELLER_PREP_TRANSITION_${kind}_INPUT_REQUIRED`, contextVersion, parameters: { saleCaseLaunch: { kind, entityId: propertyId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'seller-prep-transition-input', title: 'Ownership transition', body: 'Nothing has been saved yet.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, state)], suggestions: [],
    };
  }
  const parsed = parseSaleCaseAnswer(formKind, answer);
  if (!parsed.success) return unavailable('SELLER_PREP_TRANSITION_INPUT_INVALID', 'Check the details', 'Fill in what changes. Nothing has changed.');
  const d = parsed.data;
  let spec: Parameters<typeof confirmation>[1];
  if (formKind === 'TRANSITION') {
    const packageId = typeof d.buyerPackageId === 'string' ? (d.buyerPackageId === SALE_TRANSITION_NO_PACKAGE ? null : d.buyerPackageId) : undefined;
    const chosen = packageId ? state.buyerShares.find((share) => share.shareId === packageId) : null;
    if (packageId && !chosen) return unavailable('SELLER_PREP_BUYER_PACKAGE_NOT_AVAILABLE', 'That buyer package is not available', 'Only an active buyer-purpose Property Brief share can be linked. Nothing has changed.');
    const current = t.buyerPackageId ? state.buyerShares.find((share) => share.shareId === t.buyerPackageId) : null;
    const fields: Array<{ label: string; value: string }> = [];
    if (packageId !== undefined && packageId !== t.buyerPackageId) fields.push({ label: 'Buyer package', value: `${current ? packageLabel(current) : t.buyerPackageId ? 'A package no longer active' : 'None'} → ${chosen ? packageLabel(chosen) : 'None'}` });
    if (typeof d.sellerRetentionDecision === 'string' && d.sellerRetentionDecision !== t.sellerRetentionDecision) fields.push({ label: 'Retention decision', value: `${t.sellerRetentionDecision ? RETENTION_DECISION_LABELS[t.sellerRetentionDecision] : 'Not set'} → ${RETENTION_DECISION_LABELS[d.sellerRetentionDecision]}` });
    if (typeof d.sellerRetentionNotes === 'string' && d.sellerRetentionNotes !== (t.sellerRetentionNotes ?? '')) fields.push({ label: 'Notes', value: d.sellerRetentionNotes.length > 200 ? `${d.sellerRetentionNotes.slice(0, 200)}…` : d.sellerRetentionNotes });
    if (!fields.length) return unavailable('SELLER_PREP_TRANSITION_UNCHANGED', 'Nothing would change', 'That is already what is saved. Nothing has changed.');
    spec = {
      title: 'Save the buyer hand-off?', confirmLabel: 'Save hand-off',
      description: 'This records the hand-off on your closed sale. It does not send the package or contact the buyer: a package counts as accepted only when its recipient opens it.', fields,
    };
  } else {
    const ids = (d.revokeShareIds as string[] | undefined) ?? [];
    const stopping = ids.map((id) => state.revocable.find((share) => share.shareId === id));
    if (stopping.some((share) => !share)) return unavailable('SELLER_PREP_SHARE_NOT_AVAILABLE', 'One of those shares is no longer active', 'Choose again from the current list. Nothing has changed.');
    const linked = t.buyerPackageId ? state.buyerShares.find((share) => share.shareId === t.buyerPackageId) : null;
    spec = {
      title: 'Complete the ownership transition?', confirmLabel: 'Complete the transition',
      description: `This records that ownership has transferred and locks the hand-off: a completed transition cannot be edited.${ids.length ? ' Each share you chose stops working at once for anyone holding its link.' : ''} It sends nothing to anyone.`,
      fields: [
        { label: 'Retention decision', value: RETENTION_DECISION_LABELS[t.sellerRetentionDecision!] },
        { label: 'Buyer package', value: linked ? `${shareLabel(linked)}, accepted${linked.acceptedAt ? ` ${humanDate(linked.acceptedAt)}` : ''}` : 'None linked' },
        { label: 'Shares to stop', value: stopping.length ? (stopping as ShareOption[]).map(shareLabel).join('; ').slice(0, 300) : 'None' },
      ],
    };
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SELLER_PREP_TRANSITION_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { saleCaseForm: answer, saleCaseCommand: { kind, entityId: propertyId }, saleCaseContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'seller-prep-transition-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: formKind === 'COMPLETE' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(JSON.stringify(answer)).slice(0, 12)}`, spec),
    captureRequests: formKind === 'TRANSITION' || state.revocable.length ? [formCapture(formKind, contextVersion, state)] : [], suggestions: [],
  };
}

export async function confirmSaleTransition(ctx: ConfirmCapabilityContext, kind: 'TRANSITION_START' | 'TRANSITION' | 'COMPLETE'): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  let title: string;
  const limitations: Array<{ id: string; title: string; body: string }> = [];
  try {
    const state = await loadState(userId, propertyId, kind !== 'TRANSITION_START');
    if (parameters.saleCaseContextVersion !== versionOf(kind, state, propertyId)) throw stale('Your ownership transition changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (!state.saleCase || state.saleCase.status !== 'CLOSED') throw stale('The sale is not closed.');
    if (kind === 'TRANSITION_START') {
      if (state.transition) throw stale('An ownership transition already exists.');
      await PropertySaleCaseService.recordTransition(userId, propertyId, {});
      title = 'Ownership transition started';
    } else {
      const t = state.transition;
      if (!t || t.completedAt) throw stale('There is no open ownership transition.');
      const parsed = parseSaleCaseAnswer(kind, parameters.saleCaseForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data;
      if (kind === 'TRANSITION') {
        const packageId = typeof d.buyerPackageId === 'string' ? (d.buyerPackageId === SALE_TRANSITION_NO_PACKAGE ? null : d.buyerPackageId) : undefined;
        if (packageId && !state.buyerShares.some((share) => share.shareId === packageId)) throw stale('That buyer package is no longer active.');
        await PropertySaleCaseService.updateTransition(userId, propertyId, t.id, {
          ...(packageId !== undefined ? { buyerPackageId: packageId } : {}),
          ...(typeof d.sellerRetentionDecision === 'string' ? { sellerRetentionDecision: d.sellerRetentionDecision as never } : {}),
          ...(typeof d.sellerRetentionNotes === 'string' ? { sellerRetentionNotes: d.sellerRetentionNotes } : {}),
        });
        title = 'Buyer hand-off saved';
      } else {
        const ids = (d.revokeShareIds as string[] | undefined) ?? [];
        if (ids.some((id) => !state.revocable.some((share) => share.shareId === id))) throw stale('One of those shares is no longer active.');
        const done = await PropertySaleCaseService.completeTransition(userId, propertyId, t.id, { revokeShareIds: ids });
        const failed = done.revokeResults.filter((result) => !result.revoked);
        title = failed.length ? 'Transition completed; some shares were not stopped' : 'Ownership transition completed';
        if (failed.length) limitations.push({ id: 'seller-prep-transition-revoke-failed', title: `${failed.length} share${failed.length === 1 ? ' was' : 's were'} not stopped`, body: 'The transition is complete, but these links still work. Stop them from Property Brief.' });
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SELLER_PREP_TRANSITION_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `seller-prep-transition-${kind.toLowerCase()}-${propertyId}`, title, status: 'COMPLETED', description: 'It is on your sale case. Nothing was sent to the buyer or anyone else.', details: [], actions: [{ ...backToChecklist, label: 'See my checklist', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  for (const item of limitations) result.blocks.push({ type: 'LIMITATION', id: item.id, severity: 'CAUTION', title: item.title, body: item.body });
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `seller-prep-transition-refresh-failed-${propertyId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_SALE_CASE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
