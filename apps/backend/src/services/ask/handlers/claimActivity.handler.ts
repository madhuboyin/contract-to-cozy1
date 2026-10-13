// Claim checklist and notes inside Ask (register P2 "Claims"; FRD v1.337). Two operations. CLAIM_CHECKLIST_VIEW is a read: a claim's checklist with each
// item's status and what it asks for, launched from a claim row. CLAIM_ACTIVITY_COMMAND is the confirmed write: tick or reopen an item, or add a note to
// the claim's timeline, through ClaimsService.updateChecklistItem and addTimelineEvent, the routes' own calls. Uploading and attaching documents and
// regenerating a checklist (which deletes its progress) are not offered.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ClaimsService } from '../../claims/claims.service';
import {
  CHECKLIST_STATUS_FOR_KIND, CLAIM_ACTIVITY_ACTION_IDS, CLAIM_ACTIVITY_MESSAGES, CLAIM_CHECKLIST_ITEM_ENTITY_TYPE, CLAIM_CHECKLIST_MESSAGE, CLAIM_ENTITY_TYPE, CLAIM_NOTE_CAPTURE_KEY,
  claimActivityEntityType, claimActivityKindFromMessage, claimChecklistKinds, parseClaimNoteAnswer, type ClaimActivityKind,
} from '../support/claimActivityCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;
const STATUS_LABELS: Record<string, string> = { OPEN: 'To do', DONE: 'Done', NOT_APPLICABLE: 'Not applicable' };

const backToClaims = { id: 'claims-back', label: 'Back to my claims', interactionType: 'START_WORKFLOW' as const, message: 'Show my claims', operationId: 'INCIDENT_CLAIM_STATUS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'claim-activity-unavailable', title, body, tone: 'DEFAULT', actions: [backToClaims] }], suggestions: [],
});

async function loadClaim(propertyId: string, claimId: string) {
  return database.claim.findFirst({ where: { id: claimId, propertyId }, select: { id: true, title: true, status: true, lastActivityAt: true } }) as Promise<{ id: string; title: string; status: string; lastActivityAt: Date | null } | null>;
}
async function loadItem(propertyId: string, itemId: string) {
  return database.claimChecklistItem.findFirst({
    where: { id: itemId, claim: { propertyId } },
    select: { id: true, claimId: true, title: true, status: true, completedAt: true, claim: { select: { title: true } } },
  }) as Promise<{ id: string; claimId: string; title: string; status: string; completedAt: Date | null; claim: { title: string } } | null>;
}
const itemVersion = (kind: ClaimActivityKind, item: { id: string; status: string; completedAt: Date | null }) => sha(`claim-item:${kind}:${item.id}:${item.status}:${item.completedAt?.toISOString() ?? ''}`);
const noteVersion = (claim: { id: string; lastActivityAt: Date | null }) => sha(`claim-note:${claim.id}:${claim.lastActivityAt?.toISOString() ?? ''}`);

// ── the read ────────────────────────────────────────────────────────────────────────────────────────────────────
export function claimChecklistFromRows(claim: { id: string; title: string }, items: ReadonlyArray<{ id: string; title: string; description: string | null; required: boolean; status: string }>, canChange: boolean): AskOperationResult {
  const done = items.filter((item) => item.status === 'DONE').length;
  const open = items.filter((item) => item.status === 'OPEN').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'claim-checklist-summary', title: items.length ? `${done} of ${items.length} checklist items done` : 'This claim has no checklist items',
    body: items.length
      ? `${open ? `${open} still to do. ` : 'Nothing is left to do on the checklist. '}A checklist helps you gather what an insurer or provider usually asks for; it does not decide the claim.`
      : 'A checklist is created when a claim is filed. Nothing is listed for this one.',
    tone: 'DEFAULT',
    actions: canChange ? [{
      id: CLAIM_ACTIVITY_ACTION_IDS.NOTE, label: 'Add a note', interactionType: 'START_WORKFLOW' as const, message: CLAIM_ACTIVITY_MESSAGES.NOTE,
      operationId: 'CLAIM_ACTIVITY_COMMAND' as const, entityType: CLAIM_ENTITY_TYPE, entityId: claim.id, style: 'SECONDARY' as const,
    }] : [],
  }];
  if (items.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'claim-checklist-items', title: claim.title,
      description: 'In order. Attaching documents to an item is done where the documents are uploaded.',
      sections: [{
        id: 'claim-checklist', title: 'Checklist', count: items.length,
        items: items.map((item) => ({
          id: item.id, title: item.title, description: item.description, meta: [item.required ? 'Required' : 'Optional'],
          status: STATUS_LABELS[item.status] ?? item.status, href: null, entityType: CLAIM_CHECKLIST_ITEM_ENTITY_TYPE,
          actions: canChange ? claimChecklistKinds(item.status).map((kind) => ({
            id: CLAIM_ACTIVITY_ACTION_IDS[kind], label: kind === 'DONE' ? 'Mark done' : kind === 'NOT_APPLICABLE' ? 'Not applicable' : 'Reopen',
            message: CLAIM_ACTIVITY_MESSAGES[kind], operationId: 'CLAIM_ACTIVITY_COMMAND' as const, interactionType: 'MUTATE_RECORD' as const, style: kind === 'DONE' ? 'PRIMARY' as const : 'QUIET' as const,
          })) : [],
        })),
      }],
      actions: [],
    });
  }
  return { status: 'ANSWERED', reasonCode: items.length ? 'CLAIM_CHECKLIST_READY' : 'CLAIM_CHECKLIST_EMPTY', blocks, suggestions: [] };
}

registerCapabilityHandler('claim-checklist.view', async (envelope, deps) => {
  const launch = envelope.launchContext;
  if (envelope.message !== CLAIM_CHECKLIST_MESSAGE || launch?.entityType !== CLAIM_ENTITY_TYPE || !launch.entityId) {
    return unavailable('CLAIM_CHECKLIST_TARGET_REQUIRED', 'Choose a claim first', 'A checklist is opened from a claim in your claims list. Nothing has changed.');
  }
  const access = await (deps.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const claim = await loadClaim(envelope.propertyId!, launch.entityId);
  if (!claim) return unavailable('CLAIM_NOT_FOUND', 'That claim is no longer available', 'Ask could not find that claim.');
  const items = await database.claimChecklistItem.findMany({
    where: { claimId: claim.id }, orderBy: { orderIndex: 'asc' }, take: 50, select: { id: true, title: true, description: true, required: true, status: true },
  });
  return claimChecklistFromRows(claim, items, access.role !== HouseholdRole.VIEWER);
});

// ── the writes ──────────────────────────────────────────────────────────────────────────────────────────────────
function noteCapture(contextVersion: string, title: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'claim-note-inputs', captureKey: CLAIM_NOTE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: `Add a note to ${title}`, question: 'What happened, or what do you want to remember?',
    helpText: 'It is added to the claim’s timeline for the household. It is not sent to an insurer. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'note', label: 'Note', required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this note; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function claimActivityResult(userId: string, propertyId: string, launch: { kind: ClaimActivityKind; entityId: string; sourceExecutionId: string | null }, supplied?: { note: string }): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'claim-activity-permission', title: 'A contributor or owner can change a claim', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  if (kind === 'NOTE') {
    const claim = await loadClaim(propertyId, launch.entityId);
    if (!claim) return unavailable('CLAIM_NOT_FOUND', 'That claim is no longer available', 'Ask could not find that claim. Nothing has changed.');
    const contextVersion = noteVersion(claim);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'CLAIM_NOTE_INPUT_REQUIRED', contextVersion, parameters: { claimActivityLaunch: { kind, entityId: claim.id, sourceExecutionId: launch.sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'claim-note-input', title: claim.title, body: 'Nothing has been saved yet; you will review the note first.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [noteCapture(contextVersion, claim.title)], suggestions: [],
      };
    }
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'CLAIM_NOTE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { claimNote: supplied, claimActivityCommand: { kind, entityId: claim.id }, claimActivityContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'claim-note-review', title: 'Review the note', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `claim-note-${sha(`${claim.id}:${supplied.note}`).slice(0, 12)}-1`, version: 1, title: `Add this note to ${claim.title}?`,
        description: 'It is added to the claim’s timeline for the household. It is not sent to an insurer or provider.',
        fields: [{ label: 'Claim', value: claim.title }, { label: 'Note', value: supplied.note }], editableFields: [], confirmLabel: 'Add note',
        consentText: 'I authorize adding this note to the shared claim record.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [noteCapture(contextVersion, claim.title, supplied)], suggestions: [],
    };
  }
  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('CLAIM_CHECKLIST_ITEM_NOT_FOUND', 'That item is no longer on the checklist', 'Ask could not find that checklist item. Nothing has changed.');
  if (!claimChecklistKinds(item.status).includes(kind)) return unavailable('CLAIM_CHECKLIST_STEP_NOT_AVAILABLE', 'That is already how it is', 'Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const verb = kind === 'DONE' ? 'Mark this done' : kind === 'NOT_APPLICABLE' ? 'Mark this not applicable' : 'Reopen this item';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `CLAIM_CHECKLIST_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { claimActivityCommand: { kind, entityId: item.id }, claimActivityContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'claim-checklist-review', title: item.title, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `claim-checklist-${kind.toLowerCase()}-${sha(item.id).slice(0, 12)}-1`, version: 1, title: `${verb}?`,
      description: 'This updates the claim’s checklist and its completion percentage, and adds a line to the claim’s timeline. Nothing is sent to an insurer or provider.',
      fields: [{ label: 'Claim', value: item.claim.title }, { label: 'Item', value: item.title }, { label: 'Status', value: `${STATUS_LABELS[item.status] ?? item.status} → ${STATUS_LABELS[CHECKLIST_STATUS_FOR_KIND[kind]]}` }],
      editableFields: [], confirmLabel: kind === 'DONE' ? 'Mark done' : kind === 'NOT_APPLICABLE' ? 'Not applicable' : 'Reopen',
      consentText: 'I authorize this change to the shared claim record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('claim-activity.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = claimActivityKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'CLAIM_ACTIVITY_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== claimActivityEntityType(kind)) {
    return unavailable('ASK_CLAIM_ACTIVITY_NOT_DIRECTLY_ROUTABLE', 'Open the claim checklist first', 'A checklist item is changed from the claim’s checklist. Nothing has changed.');
  }
  return claimActivityResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmClaimActivity(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.claimActivityCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as ClaimActivityKind | undefined;
  if (!kind || !(kind in CLAIM_ACTIVITY_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  try {
    if (kind === 'NOTE') {
      const claim = await loadClaim(propertyId, command.entityId);
      if (!claim) throw stale('That claim is no longer available.');
      if (parameters.claimActivityContextVersion !== noteVersion(claim)) throw stale('This claim changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const note = parseClaimNoteAnswer(parameters.claimNote);
      if (!note.success) throw stale('The note to add is invalid.');
      await ClaimsService.addTimelineEvent(propertyId, claim.id, userId, { type: 'NOTE', title: 'Note', description: note.data.note, occurredAt: new Date().toISOString() } as never);
      title = 'Note added';
    } else {
      const item = await loadItem(propertyId, command.entityId);
      if (!item) throw stale('That checklist item is no longer available.');
      if (parameters.claimActivityContextVersion !== itemVersion(kind, item)) throw stale('This item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!claimChecklistKinds(item.status).includes(kind)) throw stale('That step is not available for this item now.');
      await ClaimsService.updateChecklistItem(propertyId, item.claimId, item.id, userId, { status: CHECKLIST_STATUS_FOR_KIND[kind] } as never);
      title = kind === 'DONE' ? 'Marked done' : kind === 'NOT_APPLICABLE' ? 'Marked not applicable' : 'Item reopened';
    }
  } catch (error) {
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `CLAIM_ACTIVITY_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `claim-activity-${kind.toLowerCase()}-${command.entityId}`, title, status: 'COMPLETED', description: 'It is on the claim’s record.', details: [], actions: [{ ...backToClaims, label: 'See my claims', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `claim-activity-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'CLAIM', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('claim-activity.command', confirmClaimActivity);
