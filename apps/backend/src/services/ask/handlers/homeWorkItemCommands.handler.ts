// Snooze, reschedule and bulk-accept Home Operations work inside Ask (register P2 "Maintenance and Home Operations"; FRD v1.342). Reached only by the
// declared actions on the work-items answer. The writes are the routes' own usecases (snoozeWorkItem, rescheduleWorkItem, batchTransitionWorkItems),
// behind a review that names what changes and a confirmation bound to the item (or, for the batch, the exact eligible set).
import crypto, { createHash } from 'node:crypto';
import { HouseholdRole, type OperationalWorkItemDisposition, type OperationalWorkItemState, type RecommendationSafetyTier } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getWorkItem as loadWorkItem } from '../../../modules/homeOperations/application/getWorkItem.usecase';
import { listWorkItems } from '../../../modules/homeOperations/application/listWorkItems.usecase';
import { snoozeWorkItem } from '../../../modules/homeOperations/application/snoozeWorkItem.usecase';
import { rescheduleWorkItem } from '../../../modules/homeOperations/application/rescheduleWorkItem.usecase';
import { recordEvidence } from '../../../modules/homeOperations/application/recordEvidence.usecase';
import { EvidenceNotWithdrawableError, HOMEOWNER_WITHDRAWABLE_EVIDENCE, removeEvidence } from '../../../modules/homeOperations/application/removeEvidence.usecase';
import { listPropertyDocuments, resolvePropertyDocuments } from '../../propertyDocuments/propertyDocumentInventory.service';
import { batchTransitionWorkItems } from '../../../modules/homeOperations/application/batchTransitionWorkItems.usecase';
import { transitionWorkItem } from '../../../modules/homeOperations/application/transitionWorkItem.usecase';
import { assertUserWorkItemTransition } from '../../../modules/homeOperations/domain/userGovernance';
import {
  SNOOZE_CHOICES, WORK_ITEM_BATCH_MAX, WORK_ITEM_ENTITY_TYPE, WORK_ITEM_FORM_CAPTURE_KEYS, WORK_ITEM_MESSAGES, parseWorkItemAnswer, snoozeUntil, workItemBatchEligible,
  workItemChangeable, workItemKindFromMessage, WORK_ITEM_FORM_ERRORS, formatEvidenceRef, parseEvidenceRef, WORK_ITEM_ATTACH_KINDS, type WorkEvidenceRefType, type WorkItemCommandKind, type WorkItemFormKind,
} from '../support/homeWorkItemCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToList = { id: 'home-work-items-back', label: 'Back to my work items', interactionType: 'START_WORKFLOW' as const, message: 'Show my home operations work items', operationId: 'HOME_WORK_ITEMS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-work-item-unavailable', title, body, tone: 'DEFAULT', actions: [backToList] }], suggestions: [],
});
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : '');
const dayOf = (value: string) => humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value;

interface ItemRow { id: string; propertyId: string; title: string; state: OperationalWorkItemState; safetyTier: RecommendationSafetyTier; dueAt: Date | null; dueWindowStart: Date | null; dueWindowEnd: Date | null; snoozedUntil: Date | null; supersededByWorkItemId: string | null; ownerUserId: string | null; legalNextStates: OperationalWorkItemState[]; closureDispositionRule: 'REQUIRED' | 'FORBIDDEN' | 'OPTIONAL' | null }
const itemVersion = (kind: string, item: ItemRow) =>
  sha(`work-item:${kind}:${item.id}:${item.state}:${iso(item.dueAt)}:${iso(item.dueWindowStart)}:${iso(item.dueWindowEnd)}:${iso(item.snoozedUntil)}:${item.supersededByWorkItemId ?? ''}`);
const batchVersion = (items: Array<{ id: string; state: string }>) => sha(`work-batch:${items.map((i) => `${i.id}:${i.state}`).sort().join('|')}`);

async function loadItem(propertyId: string, id: string): Promise<ItemRow | null> {
  const item = await loadWorkItem(id) as unknown as ItemRow | null;
  return item && item.propertyId === propertyId ? item : null;
}
async function eligibleBatch(propertyId: string) {
  const all = await listWorkItems({ propertyId }) as unknown as Array<ItemRow>;
  return all.filter(workItemBatchEligible).slice(0, WORK_ITEM_BATCH_MAX);
}

type Choice = { label: string; value: string };
const EVIDENCE_TYPE_LABEL: Record<string, string> = { DOCUMENT: 'Document', HOME_EVENT: 'Timeline event', PROPERTY_FACT: 'Home fact' };
const humanFactKey = (key: string) => {
  const words = key.replace(/[._-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Home fact';
};
const EVIDENCE_PICK_LIMIT = 25;
const STATUS_LABELS: Record<OperationalWorkItemState, string> = {
  CANDIDATE: 'Suggested', ACCEPTED: 'On your list', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', IN_GUIDANCE: 'Working through it',
  IN_PROJECT: 'Part of a project', BLOCKED: 'Waiting on something', DEFERRED: 'Put off for now', REPORTED_COMPLETE: 'Done — being confirmed',
  REOPENED: 'Back on your list', VERIFIED: 'Done', FOLLOW_UP_DUE: 'Time for a follow-up', CLOSED: 'Closed',
};
const DISPOSITION_CHOICES = [
  { label: 'Not relevant', value: 'NOT_RELEVANT' }, { label: 'Duplicate', value: 'DUPLICATE' },
  { label: 'Expired', value: 'EXPIRED' }, { label: 'Dismissed', value: 'DISMISSED' },
];

/** What a homeowner may attach right now: this home's own documents, timeline events and current facts, minus what is already on the work. Bounded and re-read. */
async function attachChoices(propertyId: string, role: HouseholdRole, userId: string, workItemId: string): Promise<Choice[]> {
  const attached = await prisma.operationalWorkEvidence.findMany({ where: { workItemId }, select: { evidenceType: true, evidenceEntityId: true } });
  const has = new Set(attached.map((row) => `${row.evidenceType}:${row.evidenceEntityId}`));
  const [documents, events, facts] = await Promise.all([
    listPropertyDocuments({ propertyId, role, includeLegacy: true }),
    prisma.homeEvent.findMany({
      where: { propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }] },
      orderBy: { occurredAt: 'desc' }, take: EVIDENCE_PICK_LIMIT, select: { id: true, title: true, occurredAt: true },
    }),
    prisma.propertyFactEvidence.findMany({
      where: { propertyId, supersededAt: null }, orderBy: { observedAt: 'desc' }, take: EVIDENCE_PICK_LIMIT * 2, select: { id: true, factKey: true, observedAt: true },
    }),
  ]);
  const seenFacts = new Set<string>();
  const factChoices = facts.filter((fact) => (seenFacts.has(fact.factKey) ? false : (seenFacts.add(fact.factKey), true))).slice(0, EVIDENCE_PICK_LIMIT);
  return [
    ...documents.items.slice(0, EVIDENCE_PICK_LIMIT).map((doc) => ({ label: `${EVIDENCE_TYPE_LABEL.DOCUMENT} · ${doc.title}`, value: formatEvidenceRef('DOCUMENT', doc.id) })),
    ...events.map((event) => ({ label: `${EVIDENCE_TYPE_LABEL.HOME_EVENT} · ${event.title} (${humanDate(event.occurredAt) ?? 'undated'})`, value: formatEvidenceRef('HOME_EVENT', event.id) })),
    ...factChoices.map((fact) => ({ label: `${EVIDENCE_TYPE_LABEL.PROPERTY_FACT} · ${humanFactKey(fact.factKey)}`, value: formatEvidenceRef('PROPERTY_FACT', fact.id) })),
  ].filter((choice) => !has.has(choice.value));
}

/** Evidence the homeowner may withdraw: their own kinds, not yet verified. */
async function removeChoices(workItemId: string): Promise<Choice[]> {
  const rows = await prisma.operationalWorkEvidence.findMany({
    where: { workItemId, evidenceType: { in: [...HOMEOWNER_WITHDRAWABLE_EVIDENCE] }, verificationStatus: { not: 'VERIFIED' } }, orderBy: { observedAt: 'desc' }, take: 20,
  });
  const documentIds = rows.filter((row) => row.evidenceType === 'DOCUMENT').map((row) => row.evidenceEntityId);
  const eventIds = rows.filter((row) => row.evidenceType === 'HOME_EVENT').map((row) => row.evidenceEntityId);
  const [events] = await Promise.all([eventIds.length ? prisma.homeEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true } }) : []]);
  const documents = documentIds.length ? await prisma.document.findMany({ where: { id: { in: documentIds } }, select: { id: true, name: true } }) : [];
  const names = new Map<string, string>([...events.map((e) => [e.id, e.title] as const), ...documents.map((d) => [d.id, d.name] as const)]);
  return rows.map((row) => ({ label: `${EVIDENCE_TYPE_LABEL[row.evidenceType] ?? 'Evidence'} · ${names.get(row.evidenceEntityId) ?? 'Record'}`, value: row.id }));
}

/** Resolves a picked record to its display name, scoped to this home; null when it is not (or no longer) there. */
async function resolveEvidenceRef(propertyId: string, role: HouseholdRole, userId: string, ref: { type: WorkEvidenceRefType; id: string }): Promise<string | null> {
  if (ref.type === 'DOCUMENT') return (await resolvePropertyDocuments({ propertyId, role, ids: [ref.id], includeLegacy: true }))[0]?.title ?? null;
  if (ref.type === 'HOME_EVENT') {
    const event = await prisma.homeEvent.findFirst({ where: { id: ref.id, propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: userId }] }, select: { title: true } });
    return event?.title ?? null;
  }
  const fact = await prisma.propertyFactEvidence.findFirst({ where: { id: ref.id, propertyId, supersededAt: null }, select: { factKey: true } });
  return fact ? humanFactKey(fact.factKey) : null;
}

function formCapture(kind: WorkItemFormKind, contextVersion: string, item: ItemRow, choices: Choice[] = []): AskCaptureRequest {
  const spec = kind === 'ATTACH_EXISTING' || kind === 'SUBMIT_COMPLETION_EVIDENCE'
    ? { title: kind === 'SUBMIT_COMPLETION_EVIDENCE' ? `Submit completion evidence for ${item.title}` : `Attach a record to ${item.title}`,
        question: kind === 'SUBMIT_COMPLETION_EVIDENCE' ? 'Which record shows this work was done?' : 'Which record should count as evidence for this work?',
        help: 'It is added as pending evidence and reviewed by the record that governs this work. Nothing is saved until you confirm.',
        fields: [{ key: 'record', label: 'Record', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'REMOVE_EVIDENCE'
    ? { title: `Remove evidence from ${item.title}`, question: 'Which evidence should be removed?', help: 'Only evidence you added that has not been verified can be removed. To replace it, remove it and add the new one.',
        fields: [{ key: 'evidence', label: 'Evidence', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'UPDATE_STATUS'
    ? { title: `Update the status of ${item.title}`, question: 'What should happen next?', help: 'Only changes currently allowed for this work are shown. A reason is required when removing a suggestion.',
        fields: [
          { key: 'status', label: 'New status', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: item.legalNextStates.map((state) => ({ label: STATUS_LABELS[state], value: state })) } },
          ...(item.legalNextStates.includes('CLOSED') && item.closureDispositionRule !== 'FORBIDDEN'
            ? [{ key: 'disposition', label: item.closureDispositionRule === 'REQUIRED' ? 'Reason' : 'Reason (if closing)', required: item.closureDispositionRule === 'REQUIRED', inputSchema: { type: 'SINGLE_SELECT' as const, options: DISPOSITION_CHOICES } }]
            : []),
        ], seed: {} }
    : kind === 'SNOOZE'
    ? { title: `Snooze ${item.title}`, question: 'How long should reminders for this wait?', help: 'Snoozing only hides reminders. It does not change the state or the due date.',
        fields: [{ key: 'snooze', label: 'Snooze for', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: SNOOZE_CHOICES.map((c) => ({ label: c.label, value: c.value })) } }], seed: {} }
    : { title: `Change the due date of ${item.title}`, question: 'When is it now due?', help: 'This replaces the date it is due. Nothing is saved until you confirm.',
        fields: [{ key: 'dueAt', label: 'New due date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } }],
        seed: item.dueAt ? { dueAt: item.dueAt.toISOString().slice(0, 10) } : {} };
  return {
    requirementId: `home-work-item-${kind.toLowerCase()}-inputs`, captureKey: WORK_ITEM_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.question, helpText: spec.help,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function workItemCommandResult(
  userId: string, propertyId: string, launch: { kind: WorkItemCommandKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-work-item-permission', title: 'A contributor or owner can change work items', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared home record.';

  if (kind === 'ACCEPT_ROUTINE') {
    const batch = await eligibleBatch(propertyId);
    if (batch.length === 0) return unavailable('HOME_WORK_ITEMS_NO_ROUTINE_CANDIDATES', 'No routine suggestions to accept', 'Nothing is waiting that can be accepted together. Nothing has changed.');
    const contextVersion = batchVersion(batch);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_WORK_ITEMS_ACCEPT_ROUTINE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { workItemCommand: { kind, entityId: null }, workItemBatchIds: batch.map((b) => b.id), workItemContextVersion: contextVersion, ...base },
      blocks: [
        { type: 'SUMMARY', id: 'home-work-item-batch-review', title: `Accept ${batch.length} routine suggestion${batch.length === 1 ? '' : 's'}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] },
        { type: 'GROUPED_LIST', filters: [], id: 'home-work-item-batch-items', title: 'These will be accepted', description: null, sections: [{
          id: 'batch', title: 'Routine low-risk work', count: batch.length,
          items: batch.map((item) => ({ id: item.id, title: item.title, description: null, meta: [], status: 'Suggested', href: null, entityType: WORK_ITEM_ENTITY_TYPE, actions: [] as never[] })),
        }], actions: [] },
      ],
      confirmation: {
        confirmationId: `home-work-batch-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: `Accept ${batch.length} routine suggestion${batch.length === 1 ? '' : 's'}?`,
        description: 'These low-risk suggestions become accepted work on your list. It does not schedule anyone or contact anyone, and it does not set due dates.',
        fields: [{ label: 'Suggestions to accept', value: String(batch.length) }], editableFields: [], confirmLabel: 'Accept them', consentText: consent, expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  if (!launch.entityId) return unavailable('HOME_WORK_ITEM_TARGET_REQUIRED', 'Choose a work item first', 'A change is made from an item in your work list. Nothing has changed.');
  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('HOME_WORK_ITEM_NOT_FOUND', 'That work item is no longer available', 'Ask could not find that work item. Nothing has changed.');
  if (!workItemChangeable(item)) return unavailable('HOME_WORK_ITEM_FINISHED', 'That work is already finished', 'Finished or replaced work is not changed here. Nothing has changed.');
  if (kind === 'UPDATE_STATUS' && item.legalNextStates.length === 0) return unavailable('HOME_WORK_ITEM_NO_STATUS_CHANGES', 'No status changes are available', 'This work is controlled by its linked workflow or has no homeowner-managed next state. Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const formKind = kind as WorkItemFormKind;
  const evidenceKind = WORK_ITEM_ATTACH_KINDS.includes(formKind) || formKind === 'REMOVE_EVIDENCE';
  const choices = evidenceKind
    ? (formKind === 'REMOVE_EVIDENCE' ? await removeChoices(item.id) : await attachChoices(propertyId, access.role, userId, item.id))
    : [];
  if (evidenceKind && choices.length === 0) {
    return unavailable(formKind === 'REMOVE_EVIDENCE' ? 'HOME_WORK_ITEM_NO_REMOVABLE_EVIDENCE' : 'HOME_WORK_ITEM_NO_RECORDS_TO_ATTACH',
      formKind === 'REMOVE_EVIDENCE' ? 'No evidence can be removed' : 'No other records to attach',
      formKind === 'REMOVE_EVIDENCE' ? 'Only evidence you added that has not been verified can be removed. Nothing has changed.' : 'This home has no other documents, timeline events or facts that are not already on this work. You can upload a file instead. Nothing has changed.');
  }
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `HOME_WORK_ITEM_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { workItemLaunch: { kind, entityId: item.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'home-work-item-input', title: item.title, body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, item, choices)], suggestions: [],
    };
  }
  const parsed = parseWorkItemAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('HOME_WORK_ITEM_INPUT_INVALID', 'Check the details', `${WORK_ITEM_FORM_ERRORS[formKind]} Nothing has changed.`);
  const answer = parsed.data as Record<string, string>;
  let spec: { title: string; description: string; confirmLabel: string; field: { label: string; value: string }; stored: Record<string, unknown> };
  if (formKind === 'UPDATE_STATUS') {
    const status = answer.status as OperationalWorkItemState;
    const disposition = answer.disposition as OperationalWorkItemDisposition | undefined;
    if (status !== 'CLOSED' && disposition) return unavailable('HOME_WORK_ITEM_STATUS_REASON_NOT_APPLICABLE', 'Remove the closing reason', 'A closing reason is used only when closing a work item. Nothing has changed.');
    try { assertUserWorkItemTransition(item, status, disposition); } catch (error) {
      return unavailable('HOME_WORK_ITEM_STATUS_NOT_AVAILABLE', 'That status is not available', `${error instanceof Error ? error.message : 'Choose one of the available statuses.'} Nothing has changed.`);
    }
    spec = {
      title: `Change status to ${STATUS_LABELS[status]}?`, confirmLabel: 'Update status',
      description: 'Ask will recheck the work item and its allowed transitions before saving.',
      field: { label: 'Status', value: `${STATUS_LABELS[item.state]} → ${STATUS_LABELS[status]}` },
      stored: { status, disposition: disposition ?? null },
    };
  } else if (formKind === 'SNOOZE') {
    const until = snoozeUntil(answer.snooze, new Date());
    spec = {
      title: until ? 'Snooze this work item?' : 'Stop snoozing this work item?', confirmLabel: until ? 'Snooze it' : 'Stop snoozing',
      description: 'Snoozing only hides reminders. It does not change the work item’s state or due date.',
      field: { label: 'Reminders', value: `${item.snoozedUntil ? `Snoozed until ${humanDate(item.snoozedUntil)}` : 'Not snoozed'} → ${until ? `Snoozed until ${humanDate(until)}` : 'Not snoozed'}` },
      stored: { snoozedUntil: until ? until.toISOString() : null },
    };
  } else if (WORK_ITEM_ATTACH_KINDS.includes(formKind)) {
    const ref = parseEvidenceRef(answer.record);
    const name = ref && choices.some((choice) => choice.value === answer.record) ? await resolveEvidenceRef(propertyId, access.role, userId, ref) : null;
    if (!ref || !name) return unavailable('HOME_WORK_ITEM_RECORD_NOT_AVAILABLE', 'That record is not available', 'It may have been removed or is already on this work. Nothing has changed.');
    const submit = formKind === 'SUBMIT_COMPLETION_EVIDENCE';
    spec = {
      title: submit ? 'Submit this as completion evidence?' : 'Attach this record as evidence?', confirmLabel: submit ? 'Submit evidence' : 'Attach record',
      description: 'It is added as pending evidence and reviewed by the record that governs this work. It does not mark the work complete.',
      field: { label: EVIDENCE_TYPE_LABEL[ref.type], value: name }, stored: { evidenceType: ref.type, evidenceEntityId: ref.id },
    };
  } else if (formKind === 'REMOVE_EVIDENCE') {
    const picked = choices.find((choice) => choice.value === answer.evidence);
    if (!picked) return unavailable('HOME_WORK_ITEM_EVIDENCE_NOT_AVAILABLE', 'That evidence cannot be removed', 'It may already be gone or verified. Nothing has changed.');
    spec = {
      title: 'Remove this evidence?', confirmLabel: 'Remove evidence', description: 'The record itself is not deleted; it just stops counting as evidence for this work. The removal stays in the work’s history.',
      field: { label: 'Evidence', value: picked.label }, stored: { evidenceId: picked.value },
    };
  } else {
    const date = answer.dueAt;
    spec = {
      title: 'Change the due date?', confirmLabel: 'Change the date', description: 'This replaces the date the work is due. It does not schedule anyone or contact anyone.',
      field: { label: 'Due', value: `${item.dueAt ? humanDate(item.dueAt) : 'No due date'} → ${dayOf(date)}` }, stored: { dueAt: new Date(`${date}T12:00:00.000Z`).toISOString() },
    };
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_WORK_ITEM_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { workItemCommand: { kind, entityId: item.id }, workItemChange: spec.stored, workItemContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'home-work-item-review', title: item.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-work-${kind.toLowerCase()}-${sha(`${item.id}:${JSON.stringify(spec.stored)}`).slice(0, 12)}-1`, version: 1, title: spec.title, description: spec.description,
      fields: [{ label: 'Work item', value: item.title }, spec.field], editableFields: [], confirmLabel: spec.confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(formKind, contextVersion, item, choices)], suggestions: [],
  };
}

registerCapabilityHandler('home-work-item.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = workItemKindFromMessage(envelope.message);
  const entityOk = kind === 'ACCEPT_ROUTINE' || (launch?.entityType === WORK_ITEM_ENTITY_TYPE && Boolean(launch.entityId));
  if (!kind || launch?.operationId !== 'HOME_WORK_ITEM_COMMAND' || launch.surface === 'ASK_REFRESH' || !entityOk) {
    return unavailable('ASK_HOME_WORK_ITEM_NOT_DIRECTLY_ROUTABLE', 'Open your work items first', 'Work is changed from your list of work items. Nothing has changed.');
  }
  return workItemCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId ?? null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmWorkItemCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.workItemCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as WorkItemCommandKind | undefined;
  if (!kind || !(kind in WORK_ITEM_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string;
  let description: string;
  try {
    if (kind === 'ACCEPT_ROUTINE') {
      const ids = Array.isArray(parameters.workItemBatchIds) ? parameters.workItemBatchIds.filter((id): id is string => typeof id === 'string') : [];
      const current = await eligibleBatch(propertyId);
      if (!ids.length || parameters.workItemContextVersion !== batchVersion(current) || ids.join('|') !== current.map((c) => c.id).join('|')) {
        throw stale('Your suggestions changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const results = await batchTransitionWorkItems({ propertyId, workItemIds: ids, actorUserId: userId });
      const accepted = results.filter((r) => r.success).length;
      title = `${accepted} suggestion${accepted === 1 ? '' : 's'} accepted`;
      description = results.length === accepted ? 'They are accepted work on your list.' : `${results.length - accepted} could not be accepted and were left as they are.`;
    } else {
      if (typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
      const item = await loadItem(propertyId, command.entityId);
      if (!item) throw stale('That work item is no longer available.');
      if (parameters.workItemContextVersion !== itemVersion(kind, item)) throw stale('This work item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!workItemChangeable(item)) throw stale('That work is already finished.');
      const change = (parameters.workItemChange ?? {}) as Record<string, unknown>;
      if (kind === 'UPDATE_STATUS') {
        const status = change.status as OperationalWorkItemState | undefined;
        const disposition = change.disposition as OperationalWorkItemDisposition | null | undefined;
        if (!status) throw stale('The status to apply is invalid.');
        assertUserWorkItemTransition(item, status, disposition ?? undefined);
        await transitionWorkItem({ workItemId: item.id, to: status, disposition: disposition ?? undefined, actorType: 'USER', actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-status` });
        title = `Status changed to ${STATUS_LABELS[status]}`;
        description = 'The governed work record and its history were updated.';
      } else if (kind === 'SNOOZE') {
        if (!('snoozedUntil' in change) || (change.snoozedUntil !== null && typeof change.snoozedUntil !== 'string')) throw stale('The snooze to apply is invalid.');
        await snoozeWorkItem({ workItemId: item.id, snoozedUntil: change.snoozedUntil ? new Date(change.snoozedUntil as string) : null, actorUserId: userId, idempotencyKey: crypto.randomUUID() });
        title = change.snoozedUntil ? 'Snoozed' : 'Snooze removed';
        description = 'Reminders for it were updated. Its state and due date are unchanged.';
      } else if (kind === 'ATTACH_EXISTING' || kind === 'SUBMIT_COMPLETION_EVIDENCE') {
        const type = change.evidenceType;
        const entityId = change.evidenceEntityId;
        const ref = typeof type === 'string' && typeof entityId === 'string' ? parseEvidenceRef(`${type}:${entityId}`) : null;
        if (!ref) throw stale('The record to attach is invalid.');
        const access = await ensurePropertyAccess(userId, propertyId);
        if (!(await resolveEvidenceRef(propertyId, access.role, userId, ref))) throw stale('That record is no longer available to attach.');
        const already = await prisma.operationalWorkEvidence.findFirst({ where: { workItemId: item.id, evidenceType: ref.type, evidenceEntityId: ref.id }, select: { id: true } });
        if (!already) {
          await recordEvidence({ workItemId: item.id, evidenceType: ref.type, evidenceEntityId: ref.id, verificationStatus: 'PENDING', observedAt: new Date(), actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-evidence-ref` });
        }
        title = already ? 'Already on this work' : kind === 'SUBMIT_COMPLETION_EVIDENCE' ? 'Completion evidence submitted' : 'Evidence attached';
        description = 'It is pending review by the record that governs this work. The work itself is unchanged.';
      } else if (kind === 'REMOVE_EVIDENCE') {
        if (typeof change.evidenceId !== 'string') throw stale('The evidence to remove is invalid.');
        try {
          const removed = await removeEvidence({ workItemId: item.id, evidenceId: change.evidenceId, actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-evidence-remove` });
          title = removed.removed ? 'Evidence removed' : 'Already removed';
        } catch (error) {
          if (error instanceof EvidenceNotWithdrawableError) throw stale(error.message);
          throw error;
        }
        description = 'It no longer counts as evidence for this work. The removal stays in the work’s history.';
      } else {
        if (typeof change.dueAt !== 'string') throw stale('The due date to apply is invalid.');
        await rescheduleWorkItem({ workItemId: item.id, dueAt: new Date(change.dueAt), actorUserId: userId, idempotencyKey: crypto.randomUUID() });
        title = 'Due date changed';
        description = 'It is on the work item. Nobody was scheduled or contacted.';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_WORK_ITEM_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-work-item-${kind.toLowerCase()}-${typeof command?.entityId === 'string' ? command.entityId : 'batch'}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToList, label: 'See my work items', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'home-work-item-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'OPERATIONAL_WORK_ITEM', artifactId: typeof command?.entityId === 'string' ? command.entityId : propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-work-item.command', confirmWorkItemCommand);
