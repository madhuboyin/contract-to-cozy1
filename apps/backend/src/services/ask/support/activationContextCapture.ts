// The canonical activation Home Action asks only the context needed to continue its own decision: first the affected item (or an explicit whole-home
// choice), then symptoms/safety detail with optional evidence. The same focused capture is used by Ask and the Resolution Center's embedded Ask panel.

import { prisma } from '../../../lib/prisma';
import { createHash } from 'node:crypto';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { ACTIVATION_CONTEXT_SIGNAL, activationMissingGaps, type ActivationGapKey } from '../../activationContextGaps';
import { addTriggerEvidence } from '../../entryContext.service';

export const ACTIVATION_CONTEXT_CAPTURE_KEY = 'ACTIVATION_CONTEXT_INPUTS';
export const ACTIVATION_WHOLE_HOME_VALUE = 'PROPERTY';
export const ACTIVATION_EVIDENCE_KINDS = ['FREE_TEXT', 'CONVERSATION', 'DOCUMENT', 'QUOTE', 'INVOICE', 'PHOTO', 'EMAIL_PDF'] as const;
export type ActivationEvidenceKind = typeof ACTIVATION_EVIDENCE_KINDS[number];
const MAX_ITEM_OPTIONS = 40;

export const isActivationContextAction = (action: { id: string; signal: string }): boolean => action.id.startsWith('activation:') || action.signal === ACTIVATION_CONTEXT_SIGNAL;

interface ActivationState {
  activeTriggerId: string | null;
  activeTriggerLabel: string | null;
  triggerScopeConfirmedAt: Date | null;
  gaps: ActivationGapKey[];
  entityType: string | null;
  entityId: string | null;
  detail: string | null;
  evidenceCount: number;
}

function evidenceDetailPresent(json: unknown): boolean {
  return Array.isArray(json) && json.some((item) => item && typeof item === 'object' && typeof (item as { detail?: unknown }).detail === 'string' && (item as { detail: string }).detail.trim().length > 0);
}

export async function activationContextState(propertyId: string): Promise<ActivationState> {
  const onboarding = await prisma.propertyOnboarding.findUnique({ where: { propertyId }, select: { activeTriggerId: true, activeTriggerLabel: true, triggerEntityType: true, triggerEntityId: true, triggerScopeConfirmedAt: true, activeTriggerDetail: true, triggerEvidenceJson: true } });
  return {
    activeTriggerId: onboarding?.activeTriggerId ?? null,
    activeTriggerLabel: onboarding?.activeTriggerLabel ?? null,
    triggerScopeConfirmedAt: onboarding?.triggerScopeConfirmedAt ?? null,
    gaps: activationMissingGaps({
      triggerEntityId: onboarding?.triggerEntityId, triggerEntityType: onboarding?.triggerEntityType,
      triggerScopeConfirmedAt: onboarding?.triggerScopeConfirmedAt,
      triggerDetail: onboarding?.activeTriggerDetail, evidenceDetailPresent: evidenceDetailPresent(onboarding?.triggerEvidenceJson),
    }),
    entityType: onboarding?.triggerEntityType ?? null,
    entityId: onboarding?.triggerEntityId ?? null,
    detail: onboarding?.activeTriggerDetail ?? null,
    evidenceCount: Array.isArray(onboarding?.triggerEvidenceJson) ? (onboarding!.triggerEvidenceJson as unknown[]).length : 0,
  };
}

/** Changes whenever the trigger's item, detail or evidence changes, so a form opened before another save cannot overwrite it. */
export function activationContextVersion(state: Pick<ActivationState, 'activeTriggerId' | 'entityType' | 'entityId' | 'detail' | 'evidenceCount'> & { triggerScopeConfirmedAt?: Date | string | null }): string {
  return createHash('sha256').update(JSON.stringify([state.activeTriggerId ?? null, state.entityType, state.entityId, state.triggerScopeConfirmedAt, state.detail, state.evidenceCount])).digest('hex');
}

const base = { classification: 'ENHANCEMENT_ACCURACY' as const, state: 'UNKNOWN' as const, allowNotSure: false, sensitivity: 'STANDARD' as const, destinationLabel: 'Saved with this home plan', confirmationText: null };

async function itemRequest(propertyId: string, state: ActivationState, position: string): Promise<AskCaptureRequest> {
  const items = await prisma.inventoryItem.findMany({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, take: MAX_ITEM_OPTIONS, select: { id: true, name: true } });
  return {
    ...base, requirementId: 'activation-affected-item', captureKey: ACTIVATION_CONTEXT_CAPTURE_KEY, title: 'Identify what needs attention',
    question: state.activeTriggerLabel === 'Something needs repair' ? 'What needs repair?' : 'Which item or part of the home is this about?',
    helpText: `${position}Choose a recorded item, or select the whole home only when the issue is not tied to one item.`,
    inputSchema: { type: 'SINGLE_SELECT', options: [...items.map((item) => ({ label: item.name, value: item.id })), { label: 'The home as a whole', value: ACTIVATION_WHOLE_HOME_VALUE }] },
    expectedContextVersion: activationContextVersion(state),
  } as AskCaptureRequest;
}

async function detailRequest(propertyId: string, userId: string, state: ActivationState, position: string): Promise<AskCaptureRequest> {
  const [records, affectedItem] = await Promise.all([
    userId ? prisma.propertyRecord.findMany({
      where: { propertyId, createdByUserId: userId, lifecycleStatus: { not: 'TRASHED' } },
      orderBy: { updatedAt: 'desc' }, take: 40,
      select: { id: true, title: true, recordType: true },
    }) : Promise.resolve([]),
    state.entityType === 'INVENTORY_ITEM' && state.entityId
      ? prisma.inventoryItem.findFirst({ where: { id: state.entityId, propertyId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  const subject = affectedItem?.name ?? (state.entityType === 'PROPERTY' && state.triggerScopeConfirmedAt ? 'the home' : null);
  return {
    ...base, requirementId: 'activation-trigger-details', captureKey: ACTIVATION_CONTEXT_CAPTURE_KEY, title: 'Describe the problem',
    question: subject ? `What is happening with ${subject}?` : 'What is happening?',
    helpText: `${position}Describe the symptoms, when they started, and any active leak, gas smell, smoke, sparks, or immediate damage. A short note is enough.`,
    inputSchema: { type: 'GROUP', fields: [
      { key: 'detail', label: 'Symptoms and safety concerns', required: false, helpText: 'For example: “The water heater started leaking yesterday. There is no gas smell or smoke.”', inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
      { key: 'evidenceKind', label: 'Type of supporting evidence', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [
        { label: 'Free text', value: 'FREE_TEXT' }, { label: 'Conversation note', value: 'CONVERSATION' },
        { label: 'Document', value: 'DOCUMENT' }, { label: 'Contractor quote', value: 'QUOTE' },
        { label: 'Invoice', value: 'INVOICE' }, { label: 'Photo', value: 'PHOTO' }, { label: 'Email or PDF', value: 'EMAIL_PDF' },
      ] } },
      { key: 'recordIds', label: 'Supporting evidence', required: false, inputSchema: {
        type: 'DOCUMENT_MULTI_SELECT', options: records.map((record) => ({ value: record.id, label: `${record.title} (${record.recordType.toLowerCase().replace(/_/g, ' ')})` })),
        maxItems: 10, allowUpload: true, uploadLabel: 'Add evidence', uploadTarget: 'HOME_RECORDS',
        uploadRecord: {
          description: 'Supporting evidence for this home plan',
          notice: 'Adding evidence saves the file to this home’s shared Home Records and links it to this plan.',
          recordTypeFrom: { fieldKey: 'evidenceKind', byValue: { DOCUMENT: 'OTHER', QUOTE: 'OTHER', INVOICE: 'INVOICE', PHOTO: 'PHOTO', EMAIL_PDF: 'OTHER' } },
        },
      } },
    ], groups: [{ id: 'context', title: 'Your context', fieldKeys: ['detail', 'evidenceKind', 'recordIds'] }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: {},
    expectedContextVersion: activationContextVersion(state),
  } as AskCaptureRequest;
}

export interface ActivationCapture {
  request: AskCaptureRequest;
  /** Activation-owned cards save through this module, not Property Context. */
  feature: { featureKey: 'ASK_NEXT_ACTION'; operationKey: string } | null;
}

/** Requirement ids the homeowner dismissed in this Ask session (the card's dismiss button records a CAPTURE_DISMISSED event on the execution). */
export async function dismissedActivationRequirements(sessionId: string): Promise<Set<string>> {
  const events = await prisma.askExecutionEvent.findMany({
    where: { eventType: 'CAPTURE_DISMISSED', execution: { sessionId } },
    select: { metadataJson: true },
    take: 50,
  });
  const ids = new Set<string>();
  for (const event of events) {
    const requirementId = event.metadataJson && typeof event.metadataJson === 'object' && !Array.isArray(event.metadataJson) ? (event.metadataJson as { requirementId?: unknown }).requirementId : null;
    if (typeof requirementId === 'string') ids.add(requirementId);
  }
  return ids;
}

/**
 * The card for the first fact still missing, or null when none is. A Property Context fact that already has an answer there (so no
 * requirement is outstanding) is skipped rather than asked again, which also keeps a mismatch between the two sources from stalling the card.
 * A question the homeowner dismissed in this Ask session is skipped too; skipping lasts for the session only, so a new session asks again.
 */
export async function deriveActivationContextCapture(
  propertyId: string,
  _evaluate: (feature: { featureKey: 'ASK_NEXT_ACTION'; operationKey: string }) => Promise<{ requirements: readonly any[]; contextVersion: string }>,
  dismissed: ReadonlySet<string> = new Set(),
  userId = '',
): Promise<ActivationCapture | null> {
  const state = await activationContextState(propertyId);
  // Every askable question first, so "Question N of M" counts only what will actually be asked.
  const askable: Array<{ requirementId: string; build: (position: string) => Promise<ActivationCapture> | ActivationCapture }> = [];
  for (const gap of state.gaps) {
    if (gap === 'AFFECTED_ITEM') {
      if (!dismissed.has('activation-affected-item')) askable.push({ requirementId: 'activation-affected-item', build: async (position) => ({ request: await itemRequest(propertyId, state, position), feature: null }) });
    } else if (!dismissed.has('activation-trigger-details')) {
      askable.push({ requirementId: 'activation-trigger-details', build: async (position) => ({ request: await detailRequest(propertyId, userId, state, position), feature: null }) });
    }
  }
  if (!askable.length) return null;
  return askable[0].build(askable.length > 1 ? `Question 1 of ${askable.length}. ` : '');
}

export class ActivationCaptureError extends Error {
  constructor(message: string, readonly code: 'ASK_CAPTURE_VALIDATION_ERROR' | 'ASK_CONTEXT_VERSION_CONFLICT' | 'ASK_CAPTURE_NOT_ACTIVE') { super(message); }
}

/** Saves one answer from the item or detail card. Returns the version after the write. */
export async function saveActivationContextAnswer(input: { userId: string; propertyId: string; requirementId: string; answer: unknown; expectedContextVersion: string }): Promise<string> {
  const before = await activationContextState(input.propertyId);
  if (activationContextVersion(before) !== input.expectedContextVersion) {
    throw new ActivationCaptureError('This changed while the question was open. Review the refreshed card and answer again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const value = input.answer && typeof input.answer === 'object' && !Array.isArray(input.answer) ? (input.answer as { value?: unknown }).value : undefined;
  if (input.requirementId === 'activation-affected-item') {
    if (typeof value !== 'string' || !value) throw new ActivationCaptureError('Choose an item, or the home as a whole.', 'ASK_CAPTURE_VALIDATION_ERROR');
    if (value === ACTIVATION_WHOLE_HOME_VALUE) {
      await prisma.propertyOnboarding.update({ where: { propertyId: input.propertyId }, data: { triggerEntityType: 'PROPERTY', triggerEntityId: null, triggerScopeConfirmedAt: new Date() } });
    } else {
      const item = await prisma.inventoryItem.findFirst({ where: { id: value, propertyId: input.propertyId }, select: { id: true } });
      if (!item) throw new ActivationCaptureError('That item is not in this home’s inventory.', 'ASK_CAPTURE_VALIDATION_ERROR');
      await prisma.propertyOnboarding.update({ where: { propertyId: input.propertyId }, data: { triggerEntityType: 'INVENTORY_ITEM', triggerEntityId: item.id, triggerScopeConfirmedAt: new Date() } });
    }
  } else if (input.requirementId === 'activation-trigger-details') {
    const answer = input.answer && typeof input.answer === 'object' && !Array.isArray(input.answer) ? input.answer as { evidenceKind?: unknown; detail?: unknown; recordIds?: unknown } : {};
    const selectedEvidenceKind = typeof answer.evidenceKind === 'string' && (ACTIVATION_EVIDENCE_KINDS as readonly string[]).includes(answer.evidenceKind)
      ? answer.evidenceKind as ActivationEvidenceKind
      : null;
    const text = typeof answer.detail === 'string' ? answer.detail.trim() : '';
    const recordIds = Array.isArray(answer.recordIds) ? [...new Set(answer.recordIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))] : [];
    const evidenceKind = selectedEvidenceKind ?? (text && recordIds.length === 0 ? 'FREE_TEXT' : null);
    const fileBacked = evidenceKind != null && !['FREE_TEXT', 'CONVERSATION'].includes(evidenceKind);
    if (!evidenceKind || (!text && recordIds.length === 0) || text.length > 4000 || recordIds.length > 10 || (fileBacked && recordIds.length === 0) || (!fileBacked && recordIds.length > 0)) {
      throw new ActivationCaptureError('Add a short note, or choose a supporting-evidence type and attach a matching Home Record.', 'ASK_CAPTURE_VALIDATION_ERROR');
    }
    const records = recordIds.length ? await prisma.propertyRecord.findMany({ where: { id: { in: recordIds }, propertyId: input.propertyId, createdByUserId: input.userId, lifecycleStatus: { not: 'TRASHED' } }, select: { id: true, title: true, recordType: true } }) : [];
    if (records.length !== recordIds.length) throw new ActivationCaptureError('One or more evidence records are not available for this home.', 'ASK_CAPTURE_VALIDATION_ERROR');
    if (text && !fileBacked) await addTriggerEvidence(input.propertyId, input.userId, { kind: evidenceKind, label: evidenceKind === 'CONVERSATION' ? 'Conversation context' : 'Homeowner context', detail: text, documentId: null, observedAt: new Date().toISOString(), consentContext: 'Homeowner entered this in Ask for the active onboarding trigger.' });
    for (const record of records) await addTriggerEvidence(input.propertyId, input.userId, { kind: evidenceKind, label: record.title, detail: text || null, documentId: record.id, observedAt: new Date().toISOString(), consentContext: 'Homeowner selected or uploaded this Home Record in Ask for the active onboarding trigger.' });
  } else {
    throw new ActivationCaptureError('This question is no longer active.', 'ASK_CAPTURE_NOT_ACTIVE');
  }
  return activationContextVersion(await activationContextState(input.propertyId));
}

export const isActivationContextRequirement = (requirementId: string): boolean => requirementId === 'activation-affected-item' || requirementId === 'activation-trigger-details';
