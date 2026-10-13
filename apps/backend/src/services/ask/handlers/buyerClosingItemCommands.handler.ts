// Lender conditions and title or escrow issues inside Ask (register P2 "Buyer Closing"; FRD v1.346). Reached only by the declared actions on the financing
// and title readiness answers. Every write is the buyer service's own method (the routes' calls), behind a review with before and after and a confirmation
// bound to the tracker's items. The services enforce the contributor floor and, for lender conditions, the selected loan estimate.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerPurchaseLenderReadinessService } from '../../buyerPurchaseLenderReadiness.service';
import { BuyerTitleEscrowService } from '../../buyerTitleEscrow.service';
import {
  CLOSING_ITEM_CAPTURE_KEYS, CLOSING_ITEM_ENTITY_TYPES, CLOSING_ITEM_MESSAGES, LENDER_CATEGORIES, LENDER_STATUS_LABELS, TITLE_CATEGORIES, TITLE_STATUS_LABELS,
  closingItemKindFromMessage, closingItemTracker, closingItemUpdatable, isUpdateKind, parseClosingItemAnswer, type ClosingItemKind,
} from '../support/buyerClosingItemCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const pairsOf = (kind: ClosingItemKind) => (closingItemTracker(kind) === 'LENDER' ? LENDER_CATEGORIES : TITLE_CATEGORIES);
const statusLabels = (kind: ClosingItemKind) => (closingItemTracker(kind) === 'LENDER' ? LENDER_STATUS_LABELS : TITLE_STATUS_LABELS);
const readinessAction = (kind: ClosingItemKind) => closingItemTracker(kind) === 'LENDER'
  ? { id: 'buyer-closing-item-back', label: 'Back to financing readiness', interactionType: 'START_WORKFLOW' as const, message: 'Show my financing readiness', operationId: 'BUYER_FINANCING_READINESS' as const, style: 'SECONDARY' as const }
  : { id: 'buyer-closing-item-back', label: 'Back to title and escrow readiness', interactionType: 'START_WORKFLOW' as const, message: 'Show my title and escrow readiness', operationId: 'BUYER_TITLE_ESCROW_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (kind: ClosingItemKind, reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-closing-item-unavailable', title, body, tone: 'DEFAULT', actions: [readinessAction(kind)] }], suggestions: [],
});

interface Item { id: string; title: string; category: string; status: string; blocking: boolean; dueAt: string | null; notes: string | null; updatedAt: string }
/** The tracker's items now, and for a lender condition whether a selected loan estimate makes adding possible. */
async function loadTracker(userId: string, propertyId: string, kind: ClosingItemKind): Promise<{ items: Item[]; canAdd: boolean; reason: string | null }> {
  if (closingItemTracker(kind) === 'LENDER') {
    const data = await BuyerPurchaseLenderReadinessService.get(userId, propertyId);
    const readiness = data.readiness as unknown as { conditions: Item[] } | null;
    if (data.purchasePath === 'CASH') return { items: [], canAdd: false, reason: 'This purchase is recorded as cash, so there are no lender conditions.' };
    if (!data.selectedRevisionId) return { items: readiness?.conditions ?? [], canAdd: false, reason: 'Select a confirmed Loan Estimate first; conditions are tracked against it.' };
    return { items: readiness?.conditions ?? [], canAdd: true, reason: null };
  }
  const data = await BuyerTitleEscrowService.get(userId, propertyId);
  const workspace = data.workspace as unknown as { issues: Item[] } | null;
  return { items: workspace?.issues ?? [], canAdd: true, reason: null };
}
const trackerVersion = (kind: ClosingItemKind, items: Item[]) => sha(`closing-${closingItemTracker(kind)}:${items.map((i) => `${i.id}:${i.status}:${i.updatedAt}`).sort().join('|')}`);

function formCapture(kind: ClosingItemKind, contextVersion: string, item: Item | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const labels = statusLabels(kind);
  const sel = (key: string, label: string, opts: ReadonlyArray<{ label: string; value: string }>, required = true) => ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: opts } });
  const fields = isUpdateKind(kind)
    ? [
      sel('status', 'Where it stands', Object.entries(labels).map(([value, label]) => ({ label, value }))),
      { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
    ]
    : [
      sel('category', 'What kind', pairsOf(kind).map(([value, label]) => ({ label, value }))),
      { key: 'title', label: 'In a few words', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } },
      { key: 'notes', label: 'Details', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
      { key: 'dueDate', label: 'Due date', required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      sel('blocking', 'Holds up closing', [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }]),
    ];
  return {
    requirementId: `buyer-closing-item-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: CLOSING_ITEM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: isUpdateKind(kind) ? `Where does ${item?.title ?? 'this'} stand?` : closingItemTracker(kind) === 'LENDER' ? 'Add a lender condition' : 'Add a title or escrow issue',
    question: isUpdateKind(kind) ? 'Choose where it stands now.' : 'What did your lender or title professional ask for?',
    helpText: 'This records your own reading. Your lender or title professional decides; Ask never tells you whether to close.',
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? (isUpdateKind(kind) ? { status: item?.status ?? 'OPEN' } : { blocking: 'NO' }), allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function closingItemResult(
  userId: string, propertyId: string, launch: { kind: ClosingItemKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const kind = launch.kind;
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-closing-item-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const tracker = await loadTracker(userId, propertyId, kind);
  const contextVersion = trackerVersion(kind, tracker.items);
  const item = launch.entityId ? tracker.items.find((i) => i.id === launch.entityId) ?? null : null;
  if (isUpdateKind(kind)) {
    if (!item) return unavailable(kind, 'BUYER_CLOSING_ITEM_NOT_FOUND', 'That item is no longer available', 'Nothing has changed.');
    if (!closingItemUpdatable(closingItemTracker(kind), item.status)) return unavailable(kind, 'BUYER_CLOSING_ITEM_SETTLED', 'That item is already settled', 'Nothing has changed.');
  } else if (!tracker.canAdd) {
    return unavailable(kind, 'BUYER_CLOSING_ITEM_NOT_AVAILABLE', 'That cannot be added yet', `${tracker.reason ?? ''} Nothing has changed.`.trim());
  }
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_CLOSING_ITEM_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { closingItemLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-closing-item-input', title: closingItemTracker(kind) === 'LENDER' ? 'Lender conditions' : 'Title and escrow issues', body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(kind, contextVersion, item)], suggestions: [],
    };
  }
  const parsed = parseClosingItemAnswer(kind, supplied);
  if (!parsed.success) return unavailable(kind, 'BUYER_CLOSING_ITEM_INPUT_INVALID', 'Check the details', 'Fill in what the form asks for. Nothing has changed.');
  const d = parsed.data;
  const labels = statusLabels(kind);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const fields = isUpdateKind(kind)
    ? [{ label: closingItemTracker(kind) === 'LENDER' ? 'Condition' : 'Issue', value: item!.title }, { label: 'Where it stands', value: `${labels[item!.status] ?? item!.status} → ${labels[d.status!]}` }]
    : [
      { label: closingItemTracker(kind) === 'LENDER' ? 'Condition' : 'Issue', value: d.title! },
      { label: 'Kind', value: pairsOf(kind).find(([k]) => k === d.category)?.[1] ?? d.category! },
      ...(d.dueDate ? [{ label: 'Due', value: humanDate(new Date(`${d.dueDate}T12:00:00.000Z`)) ?? d.dueDate }] : []),
      { label: 'Holds up closing', value: d.blocking === 'YES' ? 'Yes' : 'No' },
    ];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_CLOSING_ITEM_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: {
      closingItemCommand: { kind, entityId: launch.entityId }, closingItemForm: supplied, closingItemContextVersion: contextVersion,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'buyer-closing-item-review', title: isUpdateKind(kind) ? 'Record where it stands?' : 'Add this?', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `buyer-closing-${kind.toLowerCase().replace(/_/g, '-')}-${sha(JSON.stringify(supplied)).slice(0, 12)}-1`, version: 1,
      title: isUpdateKind(kind) ? 'Record where it stands?' : 'Add this to your closing tracker?',
      description: 'This records your own reading. Your lender or title professional decides, and Ask contacts no one and does not tell you whether to close.',
      fields, editableFields: [], confirmLabel: isUpdateKind(kind) ? 'Record it' : 'Add it',
      consentText: 'I authorize this change to the shared purchase record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(kind, contextVersion, item, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-closing-item.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = closingItemKindFromMessage(envelope.message);
  const update = kind ? isUpdateKind(kind) : false;
  const expectedType = kind && closingItemTracker(kind) === 'LENDER' ? CLOSING_ITEM_ENTITY_TYPES.LENDER : CLOSING_ITEM_ENTITY_TYPES.TITLE;
  if (!kind || launch?.operationId !== 'BUYER_CLOSING_ITEM_COMMAND' || launch.surface === 'ASK_REFRESH' || (update && (launch.entityType !== expectedType || !launch.entityId))) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'ASK_BUYER_CLOSING_ITEM_NOT_DIRECTLY_ROUTABLE',
      blocks: [{ type: 'SUMMARY', id: 'buyer-closing-item-not-routable', title: 'Open your readiness first', body: 'Lender conditions and title issues are changed from your financing or title readiness. Nothing has changed.', tone: 'DEFAULT', actions: [] }], suggestions: [],
    };
  }
  return closingItemResult(envelope.userId, envelope.propertyId!, { kind, entityId: update ? launch.entityId! : null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmClosingItem(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.closingItemCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as ClosingItemKind | undefined;
  if (!kind || !(kind in CLOSING_ITEM_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = typeof command?.entityId === 'string' ? command.entityId : null;
  const tracker = closingItemTracker(kind);
  let title: string;
  try {
    const state = await loadTracker(userId, propertyId, kind);
    if (parameters.closingItemContextVersion !== trackerVersion(kind, state.items)) throw stale('This changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const parsed = parseClosingItemAnswer(kind, parameters.closingItemForm);
    if (!parsed.success) throw stale('The details to save are invalid.');
    const d = parsed.data;
    const dueAt = d.dueDate ? new Date(`${d.dueDate}T12:00:00.000Z`).toISOString() : undefined;
    if (isUpdateKind(kind)) {
      const item = state.items.find((i) => i.id === entityId);
      if (!item || !closingItemUpdatable(tracker, item.status)) throw stale('That item is no longer open.');
      const patch = { status: d.status, ...(d.notes ? { notes: d.notes } : {}) } as never;
      if (tracker === 'LENDER') await BuyerPurchaseLenderReadinessService.updateCondition(userId, propertyId, item.id, patch);
      else await BuyerTitleEscrowService.updateIssue(userId, propertyId, item.id, patch);
      title = 'Recorded';
    } else {
      if (!state.canAdd) throw stale(state.reason ?? 'That cannot be added yet.');
      const input = { category: d.category, title: d.title, blocking: d.blocking === 'YES', ...(d.notes ? { notes: d.notes } : {}), ...(dueAt ? { dueAt } : {}) } as never;
      if (tracker === 'LENDER') await BuyerPurchaseLenderReadinessService.createCondition(userId, propertyId, input);
      else await BuyerTitleEscrowService.createIssue(userId, propertyId, input);
      title = 'Added';
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_CLOSING_ITEM_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-closing-item-${kind.toLowerCase()}-${entityId ?? propertyId}`, title, status: 'COMPLETED', description: 'It is on your closing tracker. Nobody was contacted.', details: [], actions: [{ ...readinessAction(kind), style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-closing-item-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_CLOSING_ITEM', artifactId: entityId ?? propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-closing-item.command', confirmClosingItem);
