// Renovation start-readiness controls inside Ask (register P1 "Renovation Risk Advisor"; FRD v1.324). Reached only by declared actions on the renovation
// readiness answer: "Refresh readiness" (a summary action) and the row actions on an item. Every write goes through renovationReadiness.service, the same
// functions the routes call (evaluateReadiness, updateReadinessItem, governOverride), behind a review card and a confirmation. Acknowledging a risk is an
// owner's decision, as the route is. Readiness organizes the household's records and never establishes that work is compliant, and each review says so.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { listPropertyDocuments } from '../../propertyDocuments/propertyDocumentInventory.service';
import { offerableNegotiationDocuments, type NegotiationAttachCandidate } from '../support/negotiationShieldAttach';
import { humanDate } from '../askFormatting';
import { evaluateReadiness, governOverride, updateReadinessItem } from '../../renovationReadiness.service';
import {
  READINESS_COMMAND_MESSAGES, READINESS_FORM_CAPTURE_KEYS, readinessCommandEntityType, readinessCommandKindFromMessage, readinessKindNeedsOwner, readinessServiceInput,
  parseReadinessFormAnswer, type ReadinessCommandKind, type ReadinessFormKind, type ReadinessFormValues,
} from '../support/renovationReadinessCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface ReadinessCommandLaunch { kind: ReadinessCommandKind; entityId: string; sourceExecutionId: string | null }

const backToReadiness = { id: 'renovation-readiness-back', label: 'Back to readiness', interactionType: 'START_WORKFLOW' as const, message: 'Show my renovation permit readiness', operationId: 'RENOVATION_PERMIT_READINESS' as const, style: 'SECONDARY' as const };
const BOUNDARY = 'Readiness organizes your project records; it does not establish that the work is compliant or permitted.';

const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'readiness-command-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'readiness-command-not-routable', title: 'Open your renovation readiness first', body: 'A readiness item is changed from the readiness list. Nothing has changed.', tone: 'DEFAULT', actions: [backToReadiness] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'readiness-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToReadiness] }], suggestions: [],
});

type ItemRow = {
  id: string; renovationCaseId: string; title: string; status: string; isBlocking: boolean; overrideAllowed: boolean; manualSatisfactionAllowed: boolean;
  overrideAcknowledgedAt: Date | null; manuallySatisfiedAt: Date | null; updatedAt: Date; reason: string | null;
};
const loadItem = async (propertyId: string, itemId: string): Promise<ItemRow | null> => database.renovationStartReadinessItem.findFirst({
  where: { id: itemId, propertyId },
  select: { id: true, renovationCaseId: true, title: true, status: true, isBlocking: true, overrideAllowed: true, manualSatisfactionAllowed: true, overrideAcknowledgedAt: true, manuallySatisfiedAt: true, updatedAt: true, reason: true },
});
const loadCase = async (propertyId: string, caseId: string) => database.renovationCase.findFirst({
  where: { id: caseId, propertyId }, select: { id: true, name: true, updatedAt: true, readinessSummary: true },
}) as Promise<{ id: string; name: string; updatedAt: Date; readinessSummary: unknown } | null>;
const itemVersion = (kind: ReadinessCommandKind, item: ItemRow) => sha(`readiness:${kind}:${item.id}:${item.status}:${item.overrideAcknowledgedAt?.toISOString() ?? ''}:${item.updatedAt.toISOString()}`);
const caseVersion = (renovationCase: { id: string; updatedAt: Date }) => sha(`readiness:REFRESH:${renovationCase.id}:${renovationCase.updatedAt.toISOString()}`);

/** What an item allows now (the service re-checks): the one place shared by the answer's row actions and the confirmation. */
export function readinessItemKinds(item: Pick<ItemRow, 'status' | 'overrideAllowed' | 'overrideAcknowledgedAt' | 'manualSatisfactionAllowed' | 'manuallySatisfiedAt'>): ReadinessCommandKind[] {
  if (item.status === 'OPEN' && item.overrideAllowed) return [...(item.manualSatisfactionAllowed ? ['SATISFY' as const] : []), ...(item.overrideAcknowledgedAt ? ['REVOKE' as const] : ['ACKNOWLEDGE' as const])];
  if (item.status === 'OPEN' && item.manualSatisfactionAllowed) return ['SATISFY'];
  if (item.status === 'SATISFIED' && item.manualSatisfactionAllowed && item.manuallySatisfiedAt) return ['REOPEN'];
  return [];
}

/** Home Records the whole household can see: a readiness case is shared, so an owner-only record is never offered, even to an owner. */
async function evidenceOptions(propertyId: string, role: HouseholdRole) {
  const inventory = await listPropertyDocuments({ propertyId, role });
  const candidates: NegotiationAttachCandidate[] = inventory.items.filter((entry) => entry.source === 'HOME_RECORD').map((entry) => ({
    id: entry.id, title: entry.title, kind: entry.kind, kindLabel: entry.kindLabel, addedAt: entry.addedAt, sensitivity: entry.sensitivity, visibility: entry.visibility, lifecycle: entry.lifecycle,
  }));
  return offerableNegotiationDocuments(candidates, new Set());
}
const optionLabel = (option: NegotiationAttachCandidate) => `${option.title} (${option.kindLabel}, added ${humanDate(option.addedAt) ?? 'earlier'})`;

function formCapture(kind: ReadinessFormKind, contextVersion: string, label: string, entered: ReadinessFormValues = {}, options: NegotiationAttachCandidate[] = []): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const text = (key: string, name: string, help: string, max = 5000) => ({ key, label: name, helpText: help, required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: max } });
  const specs: Record<ReadinessFormKind, { title: string; question: string; helpText: string; fields: unknown[] }> = {
    ACKNOWLEDGE: {
      title: `Acknowledge the risk: ${label}`, question: 'Why are you proceeding with this open?',
      helpText: 'This records that you are going ahead with this item still open and accept the risk. It does not make the item satisfied or the work compliant.',
      fields: [text('reason', 'Your reason (at least 20 characters)', 'Be specific; this is kept with the case.'),
        { key: 'riskAcknowledged', label: 'I understand the risk', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: 'Yes, I accept the risk of proceeding with this open', value: 'YES' }] } }],
    },
    REVOKE: {
      title: `Withdraw the acknowledgement: ${label}`, question: 'Why are you withdrawing it?',
      helpText: 'The item goes back to being an open blocker.', fields: [text('reason', 'Your reason (at least 10 characters)', 'It is kept with the case.')],
    },
    REOPEN: {
      title: `Reopen: ${label}`, question: 'What changed?',
      helpText: 'The item goes back to open and its evidence no longer counts until it is satisfied again.', fields: [text('notes', 'What changed', 'It is kept with the item.')],
    },
    SATISFY: {
      title: `Mark satisfied: ${label}`, question: 'Which document shows this is done, and what did you check?',
      helpText: 'Only documents your whole household can already see are listed, because everyone on this case can see its evidence. Nothing is saved until you confirm, and the document is not read or verified.',
      fields: [
        { key: 'evidenceDocumentId', label: 'Document', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((option) => ({ label: optionLabel(option), value: option.id })) } },
        text('notes', 'What you checked', 'It is kept with the item.'),
      ],
    },
  };
  const spec = specs[kind];
  return {
    requirementId: `renovation-readiness-${kind.toLowerCase()}-inputs`, captureKey: READINESS_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: spec.helpText, inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this step; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function readinessCommandResult(userId: string, propertyId: string, launch: ReadinessCommandLaunch, supplied?: ReadinessFormValues): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change readiness', 'Your role can view this home but not change it. Nothing has changed.');
  const kind = launch.kind;
  if (readinessKindNeedsOwner(kind) && access.role !== HouseholdRole.OWNER) {
    return blocked('ASK_OWNER_REQUIRED', 'Only an owner can acknowledge a risk', 'Accepting the risk of proceeding with an open item is an owner’s decision. Nothing has changed.');
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `renovation-readiness-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'REFRESH') {
    const renovationCase = await loadCase(propertyId, launch.entityId);
    if (!renovationCase) return unavailable('RENOVATION_CASE_NOT_FOUND', 'That renovation case is no longer available', 'Ask could not find that case. Nothing has changed.');
    const contextVersion = caseVersion(renovationCase);
    const mode = (renovationCase.readinessSummary as { fulfillmentMode?: string } | null)?.fulfillmentMode === 'DIY' ? 'DIY' : 'PROVIDER';
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_READINESS_REFRESH_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessCommand: { kind, entityId: renovationCase.id }, readinessContextVersion: contextVersion, readinessMode: mode, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-refresh-review', title: `Refresh readiness for ${renovationCase.name}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`refresh-${sha(renovationCase.id).slice(0, 12)}`, {
        title: `Refresh readiness for ${renovationCase.name}?`, confirmLabel: 'Refresh readiness',
        description: `This re-evaluates every item from the case’s current scope, requirements, quote, schedule and evidence. Acknowledgements you recorded stay unless the item is now satisfied. ${BOUNDARY}`,
        fields: [{ label: 'Case', value: renovationCase.name }, { label: 'Work done by', value: mode === 'DIY' ? 'You (DIY)' : 'A provider' }],
      }),
      suggestions: [],
    };
  }

  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('RENOVATION_READINESS_ITEM_NOT_FOUND', 'That item is no longer available', 'Ask could not find that readiness item. Nothing has changed.');
  if (!readinessItemKinds(item).includes(kind)) return unavailable('RENOVATION_READINESS_STEP_NOT_AVAILABLE', 'That step is not available now', 'The item is not in a state that allows this, or its rules do not permit it. Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const formKind = kind as ReadinessFormKind;
  const evidence = kind === 'SATISFY' ? await evidenceOptions(propertyId, access.role) : null;
  if (evidence && !evidence.options.length) {
    return unavailable('RENOVATION_READINESS_NO_EVIDENCE_RECORD', 'There is no document to attach yet',
      `A readiness item is satisfied with a document on file that your whole household can see. ${evidence.excludedPrivate ? `${evidence.excludedPrivate} owner-only record${evidence.excludedPrivate === 1 ? ' is' : 's are'} not offered. ` : ''}Add the document to your home records first. Nothing has changed.`);
  }
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `RENOVATION_READINESS_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { readinessCommandLaunch: { kind, entityId: item.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'readiness-step-input', title: item.title, body: `${item.reason ?? 'This item is open.'} Nothing has been saved yet.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, item.title, {}, evidence?.options ?? [])], suggestions: [],
    };
  }
  const chosen = evidence ? evidence.options.find((option) => option.id === supplied.evidenceDocumentId) ?? null : null;
  if (evidence && !chosen) return unavailable('RENOVATION_READINESS_EVIDENCE_NOT_OFFERED', 'Choose a document from the list', 'That document is not one your whole household can see. Nothing has changed.');
  const spec = kind === 'SATISFY' && chosen
    ? {
      title: `Mark "${item.title}" satisfied?`, confirmLabel: 'Mark it satisfied',
      description: `This records that you checked this item against the document below, which everyone on this case can see. Ask does not read or verify the file. ${BOUNDARY}`,
      fields: [{ label: 'Item', value: item.title }, { label: 'Document', value: chosen.title }, { label: 'Kind', value: chosen.kindLabel }, { label: 'What you checked', value: String(supplied.notes) }],
    }
    : kind === 'ACKNOWLEDGE'
    ? {
      title: `Acknowledge the risk of "${item.title}"?`, confirmLabel: 'Acknowledge the risk',
      description: `This records that you are proceeding with this item still open and accept the risk. It does not satisfy the item, and ${BOUNDARY.charAt(0).toLowerCase()}${BOUNDARY.slice(1)}`,
      fields: [{ label: 'Item', value: item.title }, { label: 'Your reason', value: String(supplied.reason) }],
    }
    : kind === 'REVOKE'
      ? {
        title: `Withdraw the acknowledgement on "${item.title}"?`, confirmLabel: 'Withdraw it',
        description: 'The item goes back to being an open blocker.', fields: [{ label: 'Item', value: item.title }, { label: 'Your reason', value: String(supplied.reason) }],
      }
      : {
        title: `Reopen "${item.title}"?`, confirmLabel: 'Reopen it',
        description: 'The item goes back to open and its evidence no longer counts until it is satisfied again.', fields: [{ label: 'Item', value: item.title }, { label: 'What changed', value: String(supplied.notes) }],
      };
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `RENOVATION_READINESS_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { readinessForm: supplied, readinessCommand: { kind, entityId: item.id }, readinessContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'readiness-step-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: kind === 'ACKNOWLEDGE' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(`${item.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, spec),
    captureRequests: [formCapture(formKind, contextVersion, item.title, supplied, evidence?.options ?? [])], suggestions: [],
  };
}

registerCapabilityHandler('renovation-readiness.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = readinessCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'RENOVATION_READINESS_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  if (launch.entityType !== readinessCommandEntityType(kind)) return notRoutable();
  return readinessCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmReadinessCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.readinessCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as ReadinessCommandKind | undefined;
  if (!kind || !(kind in READINESS_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  if (readinessKindNeedsOwner(kind) && ctx.access.role !== HouseholdRole.OWNER) throw stale('Only an owner can acknowledge a risk.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactId = command.entityId;
  try {
    if (kind === 'REFRESH') {
      const renovationCase = await loadCase(propertyId, command.entityId);
      if (!renovationCase) throw stale('That renovation case is no longer available.');
      if (parameters.readinessContextVersion !== caseVersion(renovationCase)) throw stale('This case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await evaluateReadiness(propertyId, renovationCase.id, userId, parameters.readinessMode === 'DIY' ? 'DIY' : 'PROVIDER');
      title = 'Readiness refreshed'; description = 'Every item is re-evaluated from the case’s current records.';
    } else {
      const item = await loadItem(propertyId, command.entityId);
      if (!item) throw stale('That readiness item is no longer available.');
      if (parameters.readinessContextVersion !== itemVersion(kind, item)) throw stale('This item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!readinessItemKinds(item).includes(kind)) throw stale('That step is not available for this item now.');
      const formKind = kind as ReadinessFormKind;
      const checked = parseReadinessFormAnswer(formKind, parameters.readinessForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      if (kind === 'SATISFY') {
        const offered = await evidenceOptions(propertyId, ctx.access.role);
        if (!offered.options.some((option) => option.id === checked.data.evidenceDocumentId)) throw stale('That document is no longer one your whole household can see. Review it again and try again.');
      }
      const input = readinessServiceInput(formKind, checked.data);
      if (kind === 'REOPEN' || kind === 'SATISFY') await updateReadinessItem(propertyId, item.renovationCaseId, item.id, userId, input);
      else await governOverride(propertyId, item.renovationCaseId, item.id, userId, input);
      artifactId = item.id;
      title = kind === 'ACKNOWLEDGE' ? 'Risk acknowledged' : kind === 'REVOKE' ? 'Acknowledgement withdrawn' : kind === 'SATISFY' ? 'Item marked satisfied' : 'Item reopened';
      description = kind === 'ACKNOWLEDGE' ? 'It is recorded with your reason. The item is still open.' : kind === 'REVOKE' ? 'The item is an open blocker again.' : kind === 'SATISFY' ? 'It is recorded with the document you chose. Nothing was read or verified.' : 'The item is open again.';
    }
  } catch (error) {
    // The service's refusals (APIError) are written for a person; Ask codes pass through.
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    if (error instanceof Error && (error as { statusCode?: unknown }).statusCode) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `RENOVATION_READINESS_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `readiness-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToReadiness, label: 'See readiness', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `readiness-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'RENOVATION_READINESS_ITEM', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('renovation-readiness.command', confirmReadinessCommand);
