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
import { assignWorkItemOwner } from '../../../modules/homeOperations/application/assignOwner.usecase';
import { addWatcher, removeWatcher } from '../../../modules/homeOperations/application/watchers.usecase';
import { recordDuplicateDecision, reverseDuplicateDecision } from '../../../modules/homeOperations/application/recordDuplicateDecision.usecase';
import { approveMaterialWork, MaterialApprovalRequestError } from '../../../modules/homeOperations/application/approveMaterialWork.usecase';
import { assertMaterialApprovalEvidenceSatisfiesPolicy, MaterialApprovalEvidencePolicyViolationError } from '../../homeOperationsMaterialApprovalEvidence.service';
import { evidencePolicyFor } from '../../homeActionCompletion.service';
import { HouseholdService } from '../../household.service';
import { assertUserWorkItemTransition } from '../../../modules/homeOperations/domain/userGovernance';
import {
  APPROVAL_RESULT_LABELS, OWNER_NO_ONE, SNOOZE_CHOICES, workItemAwaitsApproval, WORK_ITEM_ACTION_IDS, WORK_ITEM_BATCH_MAX, WORK_ITEM_ENTITY_TYPE, WORK_ITEM_FORM_CAPTURE_KEYS, WORK_ITEM_MESSAGES, parseWorkItemAnswer, snoozeUntil, workItemBatchEligible,
  workItemChangeable, workItemKindFromMessage, WORK_ITEM_FORM_ERRORS, formatEvidenceRef, parseEvidenceRef, WORK_ITEM_ATTACH_KINDS, type WorkEvidenceRefType, type WorkItemCommandKind, type WorkItemFormKind,
} from '../support/homeWorkItemCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToList = { id: 'home-work-items-back', label: 'Back to my work items', interactionType: 'START_WORKFLOW' as const, message: 'Show my home operations work items', operationId: 'HOME_WORK_ITEMS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-work-item-unavailable', title, body, tone: 'DEFAULT', actions: [backToList] }], suggestions: [],
});
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : '');
const dayOf = (value: string) => humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value;

interface ItemRow { id: string; propertyId: string; title: string; state: OperationalWorkItemState; safetyTier: RecommendationSafetyTier; dueAt: Date | null; dueWindowStart: Date | null; dueWindowEnd: Date | null; snoozedUntil: Date | null; supersededByWorkItemId: string | null; ownerUserId: string | null; watchers?: Array<{ userId: string }>; materialApprovalRequired?: boolean; materialApprovedAt?: Date | null; evidence?: Array<{ id: string; evidenceType: string; evidenceEntityId: string; verificationStatus: string }>; legalNextStates: OperationalWorkItemState[]; closureDispositionRule: 'REQUIRED' | 'FORBIDDEN' | 'OPTIONAL' | null }
const itemVersion = (kind: string, item: ItemRow) =>
  sha(`work-item:${kind}:${kind === 'APPROVE_MATERIAL' ? `${iso(item.materialApprovedAt)}:${(item.evidence ?? []).map((e) => `${e.id}=${e.verificationStatus}`).sort().join(',')}:` : ''}${item.id}:${item.state}:${iso(item.dueAt)}:${iso(item.dueWindowStart)}:${iso(item.dueWindowEnd)}:${iso(item.snoozedUntil)}:${item.supersededByWorkItemId ?? ''}:${item.ownerUserId ?? ''}:${(item.watchers ?? []).map((w) => w.userId).sort().join(',')}`);
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
const EVIDENCE_TYPE_LABEL: Record<string, string> = { DOCUMENT: 'Document', HOME_EVENT: 'Timeline event', PROPERTY_FACT: 'Home fact', DOMAIN_COMPLETION_RECORD: 'Completion record', USER_ATTESTATION: 'Your confirmation', SYSTEM_DERIVATION: 'System record' };
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

/** The evidence already on this work, for the owner's confirmation: any kind and status, newest first. */
async function approvalChoices(item: ItemRow): Promise<Choice[]> {
  const rows = await prisma.operationalWorkEvidence.findMany({ where: { workItemId: item.id }, orderBy: { observedAt: 'desc' }, take: 20 });
  const documentIds = rows.filter((row) => row.evidenceType === 'DOCUMENT').map((row) => row.evidenceEntityId);
  const eventIds = rows.filter((row) => row.evidenceType === 'HOME_EVENT').map((row) => row.evidenceEntityId);
  const [events, documents] = await Promise.all([
    eventIds.length ? prisma.homeEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true } }) : [],
    documentIds.length ? prisma.document.findMany({ where: { id: { in: documentIds } }, select: { id: true, name: true } }) : [],
  ]);
  const names = new Map<string, string>([...events.map((e) => [e.id, e.title] as const), ...documents.map((d) => [d.id, d.name] as const)]);
  return rows.map((row) => {
    const name = names.get(row.evidenceEntityId);
    return { label: `${EVIDENCE_TYPE_LABEL[row.evidenceType] ?? 'Evidence'}${name ? ` · ${name}` : ''} (${humanDate(row.observedAt) ?? 'undated'})`, value: row.id };
  });
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


// ---- people and duplicates (FRD v1.454): the household's members and the property's other open work, re-read on every use ----------------------------------
type Member = { userId: string; name: string };
async function householdMembers(propertyId: string): Promise<Member[]> {
  const rows = await new HouseholdService().listMembers(propertyId) as unknown as Array<{ userId: string; displayName?: string | null; user: { firstName: string; lastName: string } }>;
  return rows.map((row) => ({ userId: row.userId, name: row.displayName || `${row.user.firstName} ${row.user.lastName}`.trim() }));
}
const DUPLICATE_PICK_LIMIT = 25;
async function duplicateChoices(propertyId: string, item: ItemRow): Promise<Choice[]> {
  const all = await listWorkItems({ propertyId }) as unknown as Array<ItemRow>;
  return all.filter((other) => other.id !== item.id && workItemChangeable(other)).slice(0, DUPLICATE_PICK_LIMIT)
    .map((other) => ({ label: `${other.title}${other.dueAt ? ` · due ${humanDate(other.dueAt)}` : ''}`, value: other.id }));
}
async function peopleChoices(kind: WorkItemFormKind, propertyId: string, item: ItemRow): Promise<Choice[]> {
  if (kind === 'MARK_DUPLICATE') return duplicateChoices(propertyId, item);
  const members = await householdMembers(propertyId);
  const watching = new Set((item.watchers ?? []).map((w) => w.userId));
  if (kind === 'ASSIGN_OWNER') return [{ label: 'No one', value: OWNER_NO_ONE }, ...members.map((m) => ({ label: m.userId === item.ownerUserId ? `${m.name} (current owner)` : m.name, value: m.userId }))];
  if (kind === 'ADD_WATCHER') return members.filter((m) => !watching.has(m.userId)).map((m) => ({ label: m.name, value: m.userId }));
  return members.filter((m) => watching.has(m.userId)).map((m) => ({ label: m.name, value: m.userId }));
}
const PEOPLE_KINDS: readonly WorkItemFormKind[] = ['ASSIGN_OWNER', 'ADD_WATCHER', 'REMOVE_WATCHER', 'MARK_DUPLICATE'];

function formCapture(kind: WorkItemFormKind, contextVersion: string, item: ItemRow, choices: Choice[] = []): AskCaptureRequest {
  const spec = kind === 'ATTACH_EXISTING' || kind === 'SUBMIT_COMPLETION_EVIDENCE'
    ? { title: kind === 'SUBMIT_COMPLETION_EVIDENCE' ? `Submit completion evidence for ${item.title}` : `Attach a record to ${item.title}`,
        question: kind === 'SUBMIT_COMPLETION_EVIDENCE' ? 'Which record shows this work was done?' : 'Which record should count as evidence for this work?',
        help: 'It is added as pending evidence and reviewed by the record that governs this work. Nothing is saved until you confirm.',
        fields: [{ key: 'record', label: 'Record', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'REMOVE_EVIDENCE'
    ? { title: `Remove evidence from ${item.title}`, question: 'Which evidence should be removed?', help: 'Only evidence you added that has not been verified can be removed. To replace it, remove it and add the new one.',
        fields: [{ key: 'evidence', label: 'Evidence', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'ASSIGN_OWNER'
    ? { title: `Who owns ${item.title}?`, question: 'Choose the household member responsible for it.', help: 'The owner is shown on the work item. Nobody is notified or scheduled. Nothing is saved until you confirm.',
        fields: [{ key: 'member', label: 'Owner', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: { member: item.ownerUserId ?? OWNER_NO_ONE } }
    : kind === 'ADD_WATCHER'
    ? { title: `Add a watcher to ${item.title}`, question: 'Who should follow this work?', help: 'A watcher follows the work item. Nothing is saved until you confirm.',
        fields: [{ key: 'member', label: 'Watcher', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'REMOVE_WATCHER'
    ? { title: `Remove a watcher from ${item.title}`, question: 'Who should stop following this work?', help: 'Nothing is saved until you confirm.',
        fields: [{ key: 'member', label: 'Watcher', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'MARK_DUPLICATE'
    ? { title: `What does ${item.title} repeat?`, question: 'Choose the work item that covers the same thing.', help: 'This item is set aside in favor of the one you pick. It is not deleted, and you can undo it. Nothing is saved until you confirm.',
        fields: [{ key: 'target', label: 'Repeats', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } }], seed: {} }
    : kind === 'APPROVE_MATERIAL'
    ? { title: `Confirm the result of ${item.title}`, question: 'Which record shows it is done, and what did you find?',
        help: `This affects ${item.safetyTier === 'SAFETY_EMERGENCY' ? 'safety' : item.safetyTier === 'REGULATED_COVERAGE' ? 'coverage' : 'a big expense'}, so it needs a quick check. Nothing is saved until you confirm.`,
        fields: [
          { key: 'evidence', label: 'Evidence', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: choices } },
          { key: 'note', label: 'What did you find?', required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1000 } },
          ...(evidencePolicyFor(item.safetyTier).costOrObservedResult === 'REQUIRED' ? [
            { key: 'cost', label: 'Cost ($), if known', required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000 } },
            { key: 'observedResult', label: 'How does it look?', required: false, inputSchema: { type: 'SINGLE_SELECT' as const, options: (Object.entries(APPROVAL_RESULT_LABELS) as Array<[string, string]>).map(([value, label]) => ({ label, value })) } },
          ] : []),
        ], seed: {} }
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
    : { title: 'Change due date', question: item.title, help: item.dueAt ? `Current due date: ${humanDate(item.dueAt)}` : 'No due date is currently recorded.',
        fields: [{ key: 'dueAt', label: 'New due date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } }],
        seed: item.dueAt ? { dueAt: item.dueAt.toISOString().slice(0, 10) } : {} };
  return {
    requirementId: `home-work-item-${kind.toLowerCase()}-inputs`, captureKey: WORK_ITEM_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.question, helpText: spec.help,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: kind === 'RESCHEDULE' ? 'You’ll review this change before saving' : 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
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
  if (kind === 'UNDO_DUPLICATE') {
    if (!item.supersededByWorkItemId || FINISHED.has(item.state)) return unavailable('HOME_WORK_ITEM_NOT_DUPLICATE', 'That work item is not set aside as a duplicate', 'Nothing has changed.');
    const contextVersion = itemVersion(kind, item);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_WORK_ITEM_UNDO_DUPLICATE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { workItemCommand: { kind, entityId: item.id }, workItemChange: {}, workItemContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'home-work-item-review', title: item.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `home-work-undo-duplicate-${sha(item.id).slice(0, 12)}-1`, version: 1, title: 'Bring this work item back?', description: 'It returns to your list as its own work item. Nothing is deleted.',
        fields: [{ label: 'Work item', value: item.title }, { label: 'Duplicate decision', value: 'Set aside → Back on the list' }], editableFields: [], confirmLabel: 'Bring it back', consentText: consent, expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }
  if (!workItemChangeable(item)) return unavailable('HOME_WORK_ITEM_FINISHED', 'That work is already finished', 'Finished or replaced work is not changed here. Nothing has changed.');
  if (kind === 'UPDATE_STATUS' && item.legalNextStates.length === 0) return unavailable('HOME_WORK_ITEM_NO_STATUS_CHANGES', 'No status changes are available', 'This work is controlled by its linked workflow or has no homeowner-managed next state. Nothing has changed.');
  if (kind === 'APPROVE_MATERIAL') {
    if (access.role !== HouseholdRole.OWNER) {
      return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-work-item-approve-permission', title: 'Only the home’s owner can confirm this result', body: 'Confirming the result of safety or big-expense work is reserved for the owner. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
    }
    if (!workItemAwaitsApproval(item)) return unavailable('HOME_WORK_ITEM_NOT_AWAITING_APPROVAL', 'This work is not waiting for your confirmation', 'It is either not reported done, does not need approval, or was already confirmed. Nothing has changed.');
  }
  if (kind === 'OPTIONS') {
    const members = await householdMembers(propertyId);
    const name = (id: string | null | undefined) => members.find((m) => m.userId === id)?.name ?? 'Someone in the household';
    const watchers = item.watchers ?? [];
    // One row: a row's id is the work item the launch carries, so the people and duplicate controls share it.
    const actions = [
      { id: WORK_ITEM_ACTION_IDS.ASSIGN_OWNER, label: item.ownerUserId ? 'Change the owner' : 'Assign an owner', message: WORK_ITEM_MESSAGES.ASSIGN_OWNER },
      { id: WORK_ITEM_ACTION_IDS.ADD_WATCHER, label: 'Add a watcher', message: WORK_ITEM_MESSAGES.ADD_WATCHER },
      ...(watchers.length ? [{ id: WORK_ITEM_ACTION_IDS.REMOVE_WATCHER, label: 'Remove a watcher', message: WORK_ITEM_MESSAGES.REMOVE_WATCHER }] : []),
      { id: WORK_ITEM_ACTION_IDS.MARK_DUPLICATE, label: 'Mark as a duplicate', message: WORK_ITEM_MESSAGES.MARK_DUPLICATE },
    ].map((a) => ({ ...a, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const }));
    const rows = [{
      id: item.id, title: item.title, status: null, href: null, entityType: WORK_ITEM_ENTITY_TYPE, meta: [],
      description: `Owner: ${item.ownerUserId ? name(item.ownerUserId) : 'no one'}. Watching: ${watchers.length ? watchers.map((w) => name(w.userId)).join(', ') : 'no one'}.`,
      actions,
    }];
    return {
      status: 'ANSWERED', reasonCode: 'HOME_WORK_ITEM_OPTIONS_READY', contextVersion: itemVersion(kind, item),
      blocks: [
        { type: 'SUMMARY', id: 'home-work-item-options', title: `More for ${item.title}`, body: 'Each change is reviewed before it is saved. Nobody is notified or scheduled.', tone: 'DEFAULT', actions: [backToList] },
        { type: 'GROUPED_LIST', filters: [], id: 'home-work-item-options-list', title: 'People and duplicates', description: 'Marking a duplicate sets this item aside in favor of another; it can be undone.', sections: [{ id: 'options', title: 'This work item', count: 1, items: rows }], actions: [] },
      ],
      suggestions: [],
    };
  }
  const contextVersion = itemVersion(kind, item);
  const formKind = kind as WorkItemFormKind;
  const evidenceKind = WORK_ITEM_ATTACH_KINDS.includes(formKind) || formKind === 'REMOVE_EVIDENCE';
  const peopleKind = PEOPLE_KINDS.includes(formKind);
  const approveKind = formKind === 'APPROVE_MATERIAL';
  const choices = approveKind ? await approvalChoices(item) : evidenceKind
    ? (formKind === 'REMOVE_EVIDENCE' ? await removeChoices(item.id) : await attachChoices(propertyId, access.role, userId, item.id))
    : peopleKind ? await peopleChoices(formKind, propertyId, item) : [];
  if (peopleKind && choices.length === 0) {
    return unavailable('HOME_WORK_ITEM_NO_CHOICES', formKind === 'MARK_DUPLICATE' ? 'No other work items to choose from' : formKind === 'REMOVE_WATCHER' ? 'No one is watching this' : 'Everyone is already watching this',
      'Nothing has changed.');
  }
  if (approveKind && choices.length === 0) {
    return unavailable('HOME_WORK_ITEM_NO_EVIDENCE_TO_CONFIRM', 'Add a photo or document first', 'Add evidence to this work with its Add evidence action, then come back to confirm. Nothing has changed.');
  }
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
  let spec: { title: string; description: string; confirmLabel: string; field: { label: string; value: string }; extraFields?: Array<{ label: string; value: string }>; stored: Record<string, unknown> };
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
  } else if (peopleKind) {
    const pick = answer.member ?? answer.target;
    const picked = choices.find((choice) => choice.value === pick);
    if (!picked) return unavailable('HOME_WORK_ITEM_CHOICE_NOT_AVAILABLE', 'That choice is not available', 'It may have changed since the form was opened. Nothing has changed.');
    const label = picked.label.replace(/ \(current owner\)$/, '');
    spec = formKind === 'ASSIGN_OWNER'
      ? { title: pick === OWNER_NO_ONE ? 'Clear the owner?' : 'Assign this owner?', confirmLabel: pick === OWNER_NO_ONE ? 'Clear the owner' : 'Assign them', description: 'The owner is shown on the work item. Nobody is notified, scheduled or contacted.',
          field: { label: 'Owner', value: `${item.ownerUserId ? (await householdMembers(propertyId)).find((m) => m.userId === item.ownerUserId)?.name ?? 'Someone' : 'No one'} → ${label}` }, stored: { ownerUserId: pick === OWNER_NO_ONE ? null : pick } }
      : formKind === 'ADD_WATCHER'
      ? { title: 'Add this watcher?', confirmLabel: 'Add them', description: 'A watcher follows the work item. Nobody is scheduled or contacted.', field: { label: 'Watcher', value: label }, stored: { watcherUserId: pick } }
      : formKind === 'REMOVE_WATCHER'
      ? { title: 'Remove this watcher?', confirmLabel: 'Remove them', description: 'They stop following the work item. Nothing else changes.', field: { label: 'Watcher', value: label }, stored: { watcherUserId: pick } }
      : { title: 'Set this aside as a duplicate?', confirmLabel: 'Mark as duplicate', description: 'This work item is set aside in favor of the one you picked. It is not deleted, and the receipt lets you undo it.', field: { label: 'Repeats', value: label }, stored: { duplicateOfWorkItemId: pick } };
  } else if (formKind === 'APPROVE_MATERIAL') {
    const picked = choices.find((choice) => choice.value === answer.evidence);
    const evidenceRow = (item.evidence ?? []).find((row) => row.id === answer.evidence);
    if (!picked || !evidenceRow) return unavailable('HOME_WORK_ITEM_EVIDENCE_NOT_AVAILABLE', 'That evidence is not available', 'It may have changed since the form was opened. Nothing has changed.');
    const costCents = answer.cost !== undefined && answer.cost !== null ? Math.round(Number(answer.cost) * 100) : null;
    const observedResult = answer.observedResult || null;
    // The route's own policy gate, run now so a record that cannot be approved is said so before anything is confirmed; it runs again when you confirm.
    try {
      await assertMaterialApprovalEvidenceSatisfiesPolicy(item as unknown as Parameters<typeof assertMaterialApprovalEvidenceSatisfiesPolicy>[0], access.role, evidenceRow as Parameters<typeof assertMaterialApprovalEvidenceSatisfiesPolicy>[2], { costCents, observedResult });
    } catch (error) {
      if (error instanceof MaterialApprovalEvidencePolicyViolationError) return unavailable('HOME_WORK_ITEM_APPROVAL_POLICY_NOT_MET', 'This cannot be confirmed with that evidence', `${error.message} Nothing has changed.`);
      throw error;
    }
    spec = {
      title: 'Confirm this result?', confirmLabel: 'Confirm the result',
      description: 'This approves the work and marks the chosen evidence as verified. It records your note and the outcome. Nobody is contacted.',
      field: { label: 'Evidence', value: picked.label },
      extraFields: [
        { label: 'Your note', value: answer.note },
        ...(costCents !== null ? [{ label: 'Cost', value: `$${(costCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}` }] : []),
        ...(observedResult ? [{ label: 'Result', value: APPROVAL_RESULT_LABELS[observedResult as keyof typeof APPROVAL_RESULT_LABELS] ?? observedResult }] : []),
        { label: 'Work becomes', value: 'Approved and done' },
      ],
      stored: { evidenceId: picked.value, decisionNote: answer.note, costCents, observedResult },
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
      fields: [{ label: 'Work item', value: item.title }, spec.field, ...(spec.extraFields ?? [])], editableFields: [], confirmLabel: spec.confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
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

const FINISHED = new Set(['CLOSED', 'VERIFIED']);
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmWorkItemCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access: confirmAccess } = ctx;
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
      if (kind !== 'UNDO_DUPLICATE' && !workItemChangeable(item)) throw stale('That work is already finished.');
      const change = (parameters.workItemChange ?? {}) as Record<string, unknown>;
      if (kind === 'UNDO_DUPLICATE') {
        if (!item.supersededByWorkItemId || FINISHED.has(item.state)) throw stale('That work item is not set aside as a duplicate.');
        await reverseDuplicateDecision({ workItemId: item.id, actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-duplicate-undo` });
        title = 'Back on your list';
        description = 'The duplicate decision was undone. Nothing was deleted.';
      } else if (kind === 'UPDATE_STATUS') {
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
      } else if (kind === 'APPROVE_MATERIAL') {
        if (confirmAccess.role !== HouseholdRole.OWNER) throw stale('Only the home’s owner can confirm this result.', 'ASK_PERMISSION_REQUIRED');
        if (!workItemAwaitsApproval(item)) throw stale('This work is no longer waiting for your confirmation.');
        const observed = change.observedResult;
        if (typeof change.evidenceId !== 'string' || typeof change.decisionNote !== 'string' || (change.costCents !== null && typeof change.costCents !== 'number') || (observed !== null && typeof observed !== 'string')) throw stale('The confirmation to apply is invalid.');
        try {
          await approveMaterialWork({ item: item as unknown as Parameters<typeof approveMaterialWork>[0]['item'], role: confirmAccess.role, actorUserId: userId, evidenceId: change.evidenceId, decisionNote: change.decisionNote, costCents: change.costCents as number | null, observedResult: observed as string | null });
        } catch (error) {
          if (error instanceof MaterialApprovalRequestError || error instanceof MaterialApprovalEvidencePolicyViolationError) throw stale(error.message);
          throw error;
        }
        title = 'Result confirmed';
        description = 'The work is approved and the evidence is verified. Nobody was contacted.';
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
      } else if (kind === 'ASSIGN_OWNER' || kind === 'ADD_WATCHER' || kind === 'REMOVE_WATCHER') {
        const memberId = kind === 'ASSIGN_OWNER' ? change.ownerUserId : change.watcherUserId;
        if (memberId !== null && typeof memberId !== 'string') throw stale('The person to apply is invalid.');
        const members = await householdMembers(propertyId);
        if (memberId !== null && !members.some((m) => m.userId === memberId)) throw stale('That person is not in this household.');
        if (kind === 'ASSIGN_OWNER') {
          await assignWorkItemOwner({ workItemId: item.id, ownerUserId: memberId as string | null, actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-owner` });
          title = memberId ? 'Owner assigned' : 'Owner cleared';
          description = 'It is on the work item. Nobody was notified or scheduled.';
        } else if (kind === 'ADD_WATCHER') {
          if (!memberId) throw stale('The person to apply is invalid.');
          if (!(item.watchers ?? []).some((w) => w.userId === memberId)) await addWatcher({ workItemId: item.id, userId: memberId as string, addedByUserId: userId, idempotencyKey: `ask:${execution.id}:work-watcher-add` });
          title = 'Watcher added';
          description = 'They follow this work item. Nobody was scheduled or contacted.';
        } else {
          if (!memberId) throw stale('The person to apply is invalid.');
          await removeWatcher({ workItemId: item.id, userId: memberId as string, actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-watcher-remove` });
          title = 'Watcher removed';
          description = 'They no longer follow this work item.';
        }
      } else if (kind === 'MARK_DUPLICATE') {
        const targetId = change.duplicateOfWorkItemId;
        if (typeof targetId !== 'string' || targetId === item.id) throw stale('The work item to merge into is invalid.');
        const target = await loadItem(propertyId, targetId);
        if (!target || !workItemChangeable(target)) throw stale('That work item is no longer available.');
        await recordDuplicateDecision({ workItemId: item.id, supersededByWorkItemId: targetId, actorUserId: userId, idempotencyKey: `ask:${execution.id}:work-duplicate` });
        title = 'Marked as a duplicate';
        description = 'It is set aside in favor of the other work item. Nothing was deleted, and you can undo it.';
      } else if (kind === 'OPTIONS') {
        throw stale('The change to make is invalid.');
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
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-work-item-${kind.toLowerCase()}-${typeof command?.entityId === 'string' ? command.entityId : 'batch'}`, title, status: 'COMPLETED', description, details: [], actions: [...(kind === 'MARK_DUPLICATE' && typeof command?.entityId === 'string' ? [{ id: WORK_ITEM_ACTION_IDS.UNDO_DUPLICATE, label: 'Undo: bring it back', message: WORK_ITEM_MESSAGES.UNDO_DUPLICATE, entityType: WORK_ITEM_ENTITY_TYPE, entityId: command.entityId, operationId: 'HOME_WORK_ITEM_COMMAND' as const, interactionType: 'START_WORKFLOW' as const, style: 'SECONDARY' as const }] : []), { ...backToList, label: 'See my work items', style: 'PRIMARY' as const }] }],
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
