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
import { generateRequirementCandidates } from '../../renovationRequirement.service';
import { attachComplianceRecord, updateCondition } from '../../renovationComplianceWorkflow.service';
import { createRetroactiveRenovationCase, detectRetroactiveCandidates } from '../../../homeRenovationAdvisor/engine/retroactive/retroactiveCompliance.service';
import { authorityWriteResult, confirmAuthorityWrite, isAuthorityWriteKind } from './renovationAuthorityWrites.handler';
import { evaluateReadiness, governOverride, handoffToProject, loadHandoffPrefill, updateReadinessItem } from '../../renovationReadiness.service';
import {
  HANDOFF_FUNDING_LABELS, HANDOFF_PROJECT_TYPES, attachExclusionNote, attachRecordServiceInput, READINESS_COMMAND_MESSAGES, READINESS_FORM_CAPTURE_KEYS, handoffServiceInput, readinessCommandEntityType,
  readinessCommandKindFromMessage, readinessKindNeedsOwner, readinessServiceInput, parseReadinessFormAnswer, type ReadinessCommandKind, type ReadinessFormKind,
  type ReadinessFormValues, type ReadinessItemFormKind,
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
  where: { id: caseId, propertyId }, select: { id: true, name: true, updatedAt: true, readinessSummary: true, currentScopeVersionId: true },
}) as Promise<{ id: string; name: string; updatedAt: Date; readinessSummary: unknown; currentScopeVersionId: string | null } | null>;
const itemVersion = (kind: ReadinessCommandKind, item: ItemRow) => sha(`readiness:${kind}:${item.id}:${item.status}:${item.overrideAcknowledgedAt?.toISOString() ?? ''}:${item.updatedAt.toISOString()}`);
const titleCase = (value: string | null | undefined) => (value ?? 'unknown').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const ATTACH_OFFER_LIMIT = 25;
/**
 * The permits and HOA approvals a case could take: active records on this home that no renovation case holds yet. Stricter than the desktop picker, which
 * lists them all and lets the service refuse one held by another case; the service still re-checks. Capped, newest first, so a long list stays a choice.
 */
async function attachableRecords(propertyId: string, caseId: string) {
  const [permits, approvals] = await Promise.all([
    database.propertyPermitRecord.findMany({ where: { propertyId, isActive: true }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, permitNumber: true, category: true, status: true } }),
    database.hoaApprovalRecord.findMany({ where: { propertyId, isActive: true }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, workType: true, reportedStatus: true, decisionStatus: true } }),
  ]) as [Array<{ id: string; permitNumber: string | null; category: string | null; status: string | null }>, Array<{ id: string; workType: string | null; reportedStatus: string | null; decisionStatus: string | null }>];
  const held = await database.renovationCaseLink.findMany({
    where: { OR: [{ linkType: 'PERMIT', targetId: { in: permits.map((record) => record.id) } }, { linkType: 'HOA_APPROVAL', targetId: { in: approvals.map((record) => record.id) } }] },
    select: { linkType: true, targetId: true, renovationCaseId: true },
  }) as Array<{ linkType: string; targetId: string; renovationCaseId: string }>;
  const taken = new Set(held.map((link) => `${link.linkType}:${link.targetId}`));
  // Say why a record is missing, rather than leaving it out silently: on this case already, or on another case (named).
  const otherIds = [...new Set(held.filter((link) => link.renovationCaseId !== caseId).map((link) => link.renovationCaseId))];
  const otherCases = otherIds.length ? await database.renovationCase.findMany({ where: { id: { in: otherIds }, propertyId }, select: { id: true, name: true } }) as Array<{ id: string; name: string }> : [];
  const note = attachExclusionNote({
    thisCase: held.filter((link) => link.renovationCaseId === caseId).length, otherCases: held.filter((link) => link.renovationCaseId !== caseId).length,
    otherCaseNames: otherCases.map((entry) => entry.name),
  });
  const options = [
    ...permits.filter((record) => !taken.has(`PERMIT:${record.id}`)).map((record) => ({ value: `PERMIT:${record.id}`, label: `Permit ${record.permitNumber || titleCase(record.category)} (official: ${titleCase(record.status).toLowerCase()})` })),
    ...approvals.filter((record) => !taken.has(`HOA_APPROVAL:${record.id}`)).map((record) => ({ value: `HOA_APPROVAL:${record.id}`, label: `HOA approval, ${titleCase(record.workType).toLowerCase()} (decision: ${titleCase(record.decisionStatus).toLowerCase()}; reported: ${titleCase(record.reportedStatus).toLowerCase()})` })),
  ];
  return { options: options.slice(0, ATTACH_OFFER_LIMIT), total: options.length, note };
}
const retroactiveVersion = (candidate: { timelineEventId: string; existingRenovationCaseId: string | null }) => sha(`retroactive:REVIEW:${candidate.timelineEventId}:${candidate.existingRenovationCaseId ?? 'none'}`);
const findRetroactiveCandidate = async (propertyId: string, timelineEventId: string) => (await detectRetroactiveCandidates(propertyId, 25)).find((candidate) => candidate.timelineEventId === timelineEventId) ?? null;
const caseLinkCount = (caseId: string): Promise<number> => database.renovationCaseLink.count({ where: { renovationCaseId: caseId, linkType: { in: ['PERMIT', 'HOA_APPROVAL'] } } });
const attachVersion = (renovationCase: { id: string; updatedAt: Date }, scopeVersionId: string, linked: number) => sha(`compliance:ATTACH_RECORD:${renovationCase.id}:${scopeVersionId}:${linked}:${renovationCase.updatedAt.toISOString()}`);
function attachCapture(contextVersion: string, caseName: string, options: Array<{ value: string; label: string }>, entered: ReadinessFormValues = {}): AskCaptureRequest {
  return {
    requirementId: 'renovation-compliance-attach-record-inputs', captureKey: READINESS_FORM_CAPTURE_KEYS.ATTACH_RECORD, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Attach a record to ${caseName}`, question: 'Which permit or HOA approval belongs to this renovation?',
    helpText: 'Only records not already attached to a renovation case are listed. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'record', label: 'Record', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((option) => ({ label: option.label, value: option.value })) } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '')), allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this step; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

type ConditionRow = { id: string; renovationCaseId: string; title: string; status: string; isBlocking: boolean; updatedAt: Date };
const loadCondition = async (propertyId: string, conditionId: string): Promise<ConditionRow | null> => database.renovationComplianceCondition.findFirst({
  where: { id: conditionId, propertyId }, select: { id: true, renovationCaseId: true, title: true, status: true, isBlocking: true, updatedAt: true },
});
const conditionVersion = (condition: ConditionRow) => sha(`compliance:SATISFY_CONDITION:${condition.id}:${condition.status}:${condition.updatedAt.toISOString()}`);
/** Only an open condition can be satisfied; the service re-checks. The one place shared by the compliance answer's row action and the confirmation. */
export const conditionCanBeSatisfied = (condition: { status: string }) => condition.status === 'OPEN';
/** Requirements research is generated against the case's current scope; the count is part of the version so a confirmation made before another request researched it is stale. */
const currentRequirementCount = async (propertyId: string, caseId: string, scopeVersionId: string): Promise<number> => database.renovationRequirement.count({
  where: { renovationCaseId: caseId, propertyId, scopeVersionId, recordStatus: 'CURRENT' },
});
const requirementsVersion = (renovationCase: { id: string; updatedAt: Date }, scopeVersionId: string, count: number) => sha(`readiness:GENERATE:${renovationCase.id}:${scopeVersionId}:${count}:${renovationCase.updatedAt.toISOString()}`);
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

function formCapture(kind: ReadinessItemFormKind, contextVersion: string, label: string, entered: ReadinessFormValues = {}, options: NegotiationAttachCandidate[] = []): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const text = (key: string, name: string, help: string, max = 5000) => ({ key, label: name, helpText: help, required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: max } });
  const specs: Record<ReadinessItemFormKind, { title: string; question: string; helpText: string; fields: unknown[] }> = {
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
    SATISFY_CONDITION: {
      title: `Mark satisfied: ${label}`, question: 'Which document shows this condition is met, and what did you check?',
      helpText: 'A condition is satisfied only with a property document as evidence. Only documents your whole household can already see are listed, because everyone on this case can see its evidence. Nothing is saved until you confirm, and the document is not read or verified.',
      fields: [
        { key: 'evidenceDocumentId', label: 'Document', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: options.map((option) => ({ label: optionLabel(option), value: option.id })) } },
        text('notes', 'What you checked', 'It is kept with the condition.'),
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

const projectTypeLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
type HandoffPrefill = Awaited<ReturnType<typeof loadHandoffPrefill>>;

function handoffCapture(prefill: HandoffPrefill, contextVersion: string, entered: ReadinessFormValues = {}): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries({
    // A prefill is a suggestion from the scope or the selected quote, shown so it can be changed; nothing is saved until the review is confirmed.
    contractorName: prefill.contractorName, contractorLicense: prefill.contractorLicense,
    contractAmount: prefill.contractAmountCents === null ? null : prefill.contractAmountCents / 100, fundingMode: 'UNDECIDED', ...entered,
  }).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const provider = prefill.fulfillmentMode === 'PROVIDER';
  return {
    requirementId: 'renovation-readiness-handoff-inputs', captureKey: READINESS_FORM_CAPTURE_KEYS.HANDOFF, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Create the execution project for ${prefill.caseName}`, question: 'What should the project start with?',
    helpText: `The approved scope, open conditions and evidence requirements are carried into one Project. Nothing is saved until you review and confirm. ${BOUNDARY}`,
    inputSchema: { type: 'GROUP', fields: [
      { key: 'projectType', label: 'Project type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: HANDOFF_PROJECT_TYPES.map((value) => ({ label: projectTypeLabel(value), value })) } },
      { key: 'contractorName', label: provider ? 'Contractor or company' : 'Contractor or company (optional, you are doing this work)', required: provider,
        helpText: prefill.contractorName ? 'Prefilled from the quote selected for this case.' : undefined, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
      { key: 'contractorLicense', label: 'Contractor licence (optional)', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
      { key: 'contractAmount', label: 'Contract amount ($)', required: false,
        helpText: prefill.contractAmountSource
          ? `Prefilled from ${prefill.contractAmountSource === 'SCOPE' ? 'the approved scope' : 'the selected quote'}. Leave blank only if it is not known: it is then recorded as not set, not as $0.`
          : 'Leave blank if it is not known yet: it is recorded as not set, not as $0. Enter 0 only for a project with no cost.',
        inputSchema: { type: 'NUMBER', min: 0, max: 1_000_000_000 } },
      { key: 'fundingMode', label: 'How will it be paid for?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Object.entries(HANDOFF_FUNDING_LABELS).map(([value, label]) => ({ label, value })) } },
      { key: 'startDate', label: 'Start date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'expectedEndDate', label: 'Expected end date (optional)', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function readinessCommandResult(userId: string, propertyId: string, launch: ReadinessCommandLaunch, supplied?: ReadinessFormValues): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change readiness', 'Your role can view this home but not change it. Nothing has changed.');
  const kind = launch.kind;
  if (readinessKindNeedsOwner(kind) && access.role !== HouseholdRole.OWNER) {
    return kind === 'HANDOFF'
      ? blocked('ASK_OWNER_REQUIRED', 'Only an owner can create the project', 'Creating the execution project from a renovation case is an owner’s decision. Nothing has changed.')
      : blocked('ASK_OWNER_REQUIRED', 'Only an owner can acknowledge a risk', 'Accepting the risk of proceeding with an open item is an owner’s decision. Nothing has changed.');
  }
  // Confirming a jurisdiction, recording a determination and deciding an HOA reading have their own forms and checks (renovationAuthorityWrites.handler).
  if (isAuthorityWriteKind(kind)) return authorityWriteResult(userId, propertyId, access.role as HouseholdRole, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId }, supplied);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `renovation-readiness-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'RETROACTIVE_REVIEW') {
    const candidate = await findRetroactiveCandidate(propertyId, launch.entityId);
    if (!candidate) return unavailable('RENOVATION_RETROACTIVE_CANDIDATE_NOT_FOUND', 'That past work is no longer available', 'Ask could not find that completed improvement on your home timeline. Nothing has changed.');
    if (candidate.existingRenovationCaseId) return unavailable('RENOVATION_RETROACTIVE_ALREADY_STARTED', 'A review of this work has already been started', 'A historical review already exists for it, so there is nothing to start. Nothing has changed.');
    const contextVersion = retroactiveVersion(candidate);
    const when = humanDate(new Date(candidate.occurredAt)) ?? candidate.occurredAt.slice(0, 10);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_RETROACTIVE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessCommand: { kind, entityId: candidate.timelineEventId }, readinessContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-retroactive-review', title: `Start a historical review of ${candidate.eventTitle}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`retroactive-${sha(candidate.timelineEventId).slice(0, 12)}`, {
        title: `Start a historical review of ${candidate.eventTitle}?`, confirmLabel: 'Start the review',
        description: 'This creates a renovation case from this completed work, marked compliance sensitive and opened at historical research. Its first scope records only what your timeline says: the title, the date and the amount. It organizes the permit, tax, licensing, zoning and closeout questions; it does not decide that the work was or was not compliant, and nothing is applied for, filed or sent anywhere. Starting it again changes nothing.',
        fields: [{ label: 'Work', value: candidate.eventTitle }, { label: 'Completed', value: when }, ...(candidate.amount != null ? [{ label: 'Amount', value: `$${Math.round(candidate.amount).toLocaleString('en-US')}` }] : []), ...(candidate.suggestedRenovationLabel ? [{ label: 'Kind of work', value: candidate.suggestedRenovationLabel }] : [])],
      }),
      suggestions: [],
    };
  }

  if (kind === 'ATTACH_RECORD') {
    const renovationCase = await loadCase(propertyId, launch.entityId);
    if (!renovationCase) return unavailable('RENOVATION_CASE_NOT_FOUND', 'That renovation case is no longer available', 'Ask could not find that case. Nothing has changed.');
    if (!renovationCase.currentScopeVersionId) return unavailable('RENOVATION_SCOPE_MISSING', 'This case has no scope to attach records to', 'Records are attached to the case’s current scope, and this case does not have one. Defining scope is not currently available in Ask. Nothing has changed.');
    const offered = await attachableRecords(propertyId, renovationCase.id);
    if (!offered.options.length) return unavailable('RENOVATION_NO_ATTACHABLE_RECORD', 'There is no record to attach', offered.note ? `No permit or HOA approval can be attached right now. ${offered.note} Nothing has changed.` : 'No permit or HOA approval is recorded for this home, so there is nothing to attach. Nothing has changed.');
    const contextVersion = attachVersion(renovationCase, renovationCase.currentScopeVersionId, await caseLinkCount(renovationCase.id));
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_ATTACH_RECORD_INPUT_REQUIRED', contextVersion,
        parameters: { readinessCommandLaunch: { kind, entityId: renovationCase.id, sourceExecutionId: launch.sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'readiness-attach-input', title: `Attach a record to ${renovationCase.name}`, body: `${offered.total > offered.options.length ? `Showing the ${offered.options.length} most recent of ${offered.total} records that are not attached to a case. ` : ''}${offered.note ? `${offered.note} ` : ''}Nothing has been saved yet.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [attachCapture(contextVersion, renovationCase.name, offered.options)], suggestions: [],
      };
    }
    const chosen = offered.options.find((option) => option.value === supplied.record) ?? null;
    if (!chosen) return unavailable('RENOVATION_ATTACH_RECORD_NOT_OFFERED', 'Choose a record from the list', 'That record is not one that can be attached now. Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_ATTACH_RECORD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessForm: supplied, readinessCommand: { kind, entityId: renovationCase.id }, readinessContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-attach-review', title: `Attach this record to ${renovationCase.name}?`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`attach-${sha(`${renovationCase.id}:${chosen.value}`).slice(0, 12)}`, {
        title: `Attach this record to ${renovationCase.name}?`, confirmLabel: 'Attach the record',
        description: 'This links the record to this case’s current scope and marks it as belonging to this case, so it cannot be attached to another. For an HOA approval granted with conditions, those conditions are added as a blocking item to resolve before closeout. It does not change the record’s status, apply to an authority or contact anyone. Attaching it again changes nothing.',
        fields: [{ label: 'Case', value: renovationCase.name }, { label: 'Record', value: chosen.label }],
      }),
      captureRequests: [attachCapture(contextVersion, renovationCase.name, offered.options, supplied)], suggestions: [],
    };
  }

  if (kind === 'SATISFY_CONDITION') {
    const condition = await loadCondition(propertyId, launch.entityId);
    if (!condition) return unavailable('RENOVATION_CONDITION_NOT_FOUND', 'That condition is no longer available', 'Ask could not find that condition. Nothing has changed.');
    if (!conditionCanBeSatisfied(condition)) return unavailable('RENOVATION_CONDITION_STEP_NOT_AVAILABLE', 'That condition is not open', 'Only an open condition can be marked satisfied here. Nothing has changed.');
    const contextVersion = conditionVersion(condition);
    const evidence = await evidenceOptions(propertyId, access.role);
    if (!evidence.options.length) {
      return unavailable('RENOVATION_READINESS_NO_EVIDENCE_RECORD', 'There is no document to attach yet',
        `A condition is satisfied with a document on file that your whole household can see. ${evidence.excludedPrivate ? `${evidence.excludedPrivate} owner-only record${evidence.excludedPrivate === 1 ? ' is' : 's are'} not offered, because everyone on this case can see its evidence. ` : ''}Add the document to your Home Records first. Nothing has changed.`);
    }
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_CONDITION_SATISFY_INPUT_REQUIRED', contextVersion,
        parameters: { readinessCommandLaunch: { kind, entityId: condition.id, sourceExecutionId: launch.sourceExecutionId } },
        blocks: [{ type: 'SUMMARY', id: 'readiness-condition-input', title: condition.title, body: 'This condition is open. Nothing has been saved yet.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('SATISFY_CONDITION', contextVersion, condition.title, {}, evidence.options)], suggestions: [],
      };
    }
    const chosen = evidence.options.find((option) => option.id === supplied.evidenceDocumentId) ?? null;
    if (!chosen) return unavailable('RENOVATION_READINESS_EVIDENCE_NOT_OFFERED', 'Choose a document from the list', 'That document is not one your whole household can see. Nothing has changed.');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_CONDITION_SATISFY_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessForm: supplied, readinessCommand: { kind, entityId: condition.id }, readinessContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-condition-review', title: `Mark "${condition.title}" satisfied?`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`condition-${sha(`${condition.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, {
        title: `Mark "${condition.title}" satisfied?`, confirmLabel: 'Mark it satisfied',
        description: `This records that you checked this condition against the document below, which everyone on this case can see. Ask does not read or verify the file${condition.isBlocking ? ', and a satisfied condition no longer blocks closeout' : ''}. ${BOUNDARY}`,
        fields: [{ label: 'Condition', value: condition.title }, { label: 'Document', value: chosen.title }, { label: 'Kind', value: chosen.kindLabel }, { label: 'What you checked', value: String(supplied.notes) }],
      }),
      captureRequests: [formCapture('SATISFY_CONDITION', contextVersion, condition.title, supplied, evidence.options)], suggestions: [],
    };
  }

  if (kind === 'GENERATE') {
    const renovationCase = await loadCase(propertyId, launch.entityId);
    if (!renovationCase) return unavailable('RENOVATION_CASE_NOT_FOUND', 'That renovation case is no longer available', 'Ask could not find that case. Nothing has changed.');
    if (!renovationCase.currentScopeVersionId) return unavailable('RENOVATION_SCOPE_MISSING', 'This case has no scope to research', 'Requirements are researched against the case’s current scope, and this case does not have one. Defining scope is not currently available in Ask. Nothing has changed.');
    const existing = await currentRequirementCount(propertyId, renovationCase.id, renovationCase.currentScopeVersionId);
    if (existing > 0) return unavailable('RENOVATION_REQUIREMENTS_ALREADY_RESEARCHED', 'Requirements are already researched for this case', 'Research candidates already exist for the current scope, so there is nothing to generate. Nothing has changed.');
    const contextVersion = requirementsVersion(renovationCase, renovationCase.currentScopeVersionId, existing);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_REQUIREMENTS_GENERATE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessCommand: { kind, entityId: renovationCase.id }, readinessContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-generate-review', title: `Generate requirements research for ${renovationCase.name}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`generate-${sha(renovationCase.id).slice(0, 12)}`, {
        title: `Generate requirements research for ${renovationCase.name}?`, confirmLabel: 'Generate research',
        description: 'This creates research questions for permits, contractor licensing, zoning, HOA and similar rules, each marked as needing research. They are candidates, not requirements: nothing is applied for, nothing is confirmed, and no determination is recorded. Where a guidance service is configured, your city, state, ZIP and this case’s scope summary are sent to it to look up guidance. Repeating this never duplicates a question.',
        fields: [{ label: 'Case', value: renovationCase.name }, { label: 'Creates', value: 'Research questions for the current scope' }],
      }),
      suggestions: [],
    };
  }

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

  if (kind === 'HANDOFF') {
    let prefill: HandoffPrefill;
    try { prefill = await loadHandoffPrefill(propertyId, launch.entityId); } catch {
      return unavailable('RENOVATION_CASE_NOT_FOUND', 'That renovation case is no longer available', 'Ask could not find that case. Nothing has changed.');
    }
    if (prefill.project) {
      return unavailable('RENOVATION_PROJECT_ALREADY_CREATED', 'A project already exists for this case',
        `${prefill.project.name ? `“${prefill.project.name}” was` : 'A project was'} already created from this renovation case, so nothing new is applied. Nothing has changed.`);
    }
    if (prefill.readinessState === 'NOT_EVALUATED' || prefill.readinessStale) {
      return unavailable('RENOVATION_READINESS_NOT_CURRENT', 'Refresh readiness first',
        'The readiness check is out of date or has not been run for the current scope. Refresh it, then create the project. Nothing has changed.');
    }
    if (!['READY', 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'].includes(prefill.readinessState)) {
      return unavailable('RENOVATION_PROJECT_NOT_READY', 'Readiness has open blockers',
        'Resolve or explicitly acknowledge every permitted blocker before creating the project. Ask only creates a planned start; already-started and historical projects are created from the desktop. Nothing has changed.');
    }
    const contextVersion = prefill.version;
    const launchParameters = { readinessCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'RENOVATION_READINESS_HANDOFF_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'readiness-handoff-input', title: `Create the execution project for ${prefill.caseName}`, body: 'Nothing has been saved yet; you will review everything first.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [handoffCapture(prefill, contextVersion)], suggestions: [],
      };
    }
    const parsed = parseReadinessFormAnswer('HANDOFF', supplied);
    if (!parsed.success) return unavailable('RENOVATION_HANDOFF_INPUT_INVALID', 'Check the details', 'Fill in the project type, funding and a start date; the end date cannot be before the start. Nothing has changed.');
    const form = parsed.data;
    if (prefill.fulfillmentMode === 'PROVIDER' && typeof form.contractorName !== 'string') {
      return unavailable('RENOVATION_HANDOFF_CONTRACTOR_REQUIRED', 'Name the contractor', 'A provider-led project needs the contractor or company name. Nothing has changed.');
    }
    // The amount the project will actually carry: what was entered (or prefilled), else the scope, else the selected quote, else unknown (never zero).
    const resolvedCents = typeof form.contractAmount === 'number' ? Math.round(form.contractAmount * 100) : prefill.contractAmountCents;
    const amountSource = typeof form.contractAmount === 'number' ? 'Entered' : prefill.contractAmountSource === 'SCOPE' ? 'From the approved scope' : prefill.contractAmountSource === 'QUOTE' ? 'From the selected quote' : null;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'RENOVATION_READINESS_HANDOFF_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { readinessForm: supplied, readinessCommand: { kind, entityId: launch.entityId }, readinessContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'readiness-handoff-review', title: `Create the project for ${prefill.caseName}?`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`handoff-${sha(`${launch.entityId}:${JSON.stringify(supplied)}`).slice(0, 12)}`, {
        title: `Create the project for ${prefill.caseName}?`, confirmLabel: 'Create the project',
        description: `This creates one Project from the approved scope (version ${prefill.scopeVersion}) and links it to this case, in one step: its open conditions become blocked milestones and its open dependencies are carried over. No contractor is contacted and nothing is booked. Scope documents that are Home Records stay on the case. A project is created once per case; if one appears first, nothing you entered here is applied. ${BOUNDARY}`,
        fields: [
          { label: 'Case', value: prefill.caseName },
          { label: 'Project type', value: projectTypeLabel(String(form.projectType)) },
          { label: 'Work done by', value: prefill.fulfillmentMode === 'DIY' ? 'You (DIY)' : 'A provider' },
          ...(typeof form.contractorName === 'string' ? [{ label: 'Contractor', value: String(form.contractorName) }] : []),
          ...(typeof form.contractorLicense === 'string' ? [{ label: 'Licence', value: String(form.contractorLicense) }] : []),
          { label: 'Contract amount', value: resolvedCents === null ? 'Not set (recorded as unknown, not $0)' : `${dollars(resolvedCents)}${amountSource ? ` · ${amountSource}` : ''}` },
          { label: 'Funding', value: HANDOFF_FUNDING_LABELS[String(form.fundingMode)] ?? String(form.fundingMode) },
          { label: 'Start date', value: humanDate(new Date(`${form.startDate}T12:00:00.000Z`)) ?? String(form.startDate) },
          ...(typeof form.expectedEndDate === 'string' ? [{ label: 'Expected end', value: humanDate(new Date(`${form.expectedEndDate}T12:00:00.000Z`)) ?? String(form.expectedEndDate) }] : []),
          { label: 'Open conditions to block', value: String(prefill.openConditionCount) },
          { label: 'Open dependencies carried over', value: String(prefill.openDependencyCount) },
        ],
      }),
      captureRequests: [handoffCapture(prefill, contextVersion, supplied)], suggestions: [],
    };
  }

  const item = await loadItem(propertyId, launch.entityId);
  if (!item) return unavailable('RENOVATION_READINESS_ITEM_NOT_FOUND', 'That item is no longer available', 'Ask could not find that readiness item. Nothing has changed.');
  if (!readinessItemKinds(item).includes(kind)) return unavailable('RENOVATION_READINESS_STEP_NOT_AVAILABLE', 'That step is not available now', 'The item is not in a state that allows this, or its rules do not permit it. Nothing has changed.');
  const contextVersion = itemVersion(kind, item);
  const formKind = kind as ReadinessItemFormKind;
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
  if (isAuthorityWriteKind(kind)) return confirmAuthorityWrite(ctx, kind, command.entityId);
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactId = command.entityId; let artifactType = 'RENOVATION_READINESS_ITEM'; let workItemSynced: boolean | undefined; let backAction: typeof backToReadiness = backToReadiness;
  try {
    if (kind === 'RETROACTIVE_REVIEW') {
      const candidate = await findRetroactiveCandidate(propertyId, command.entityId);
      if (!candidate) throw stale('That past work is no longer available.');
      if (parameters.readinessContextVersion !== retroactiveVersion(candidate)) throw stale('This work changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (candidate.existingRenovationCaseId) throw stale('A review of this work has already been started.');
      // Idempotent by the service's own key (retroactive-home-event:<event>): repeating the same confirmation returns the case already made.
      const created: any = await createRetroactiveRenovationCase(propertyId, candidate.timelineEventId, userId);
      artifactId = created?.id ?? candidate.timelineEventId;
      backAction = { ...backToReadiness, label: 'See requirements', message: `Show the requirements for my renovation ${String(created?.name ?? candidate.eventTitle).slice(0, 120)}.` };
      title = 'Historical review started'; description = 'The case is open at historical research, with what your timeline says as its first scope. Nothing was applied for or sent anywhere.';
    } else if (kind === 'ATTACH_RECORD') {
      const renovationCase = await loadCase(propertyId, command.entityId);
      if (!renovationCase || !renovationCase.currentScopeVersionId) throw stale('That renovation case or its scope is no longer available.');
      if (parameters.readinessContextVersion !== attachVersion(renovationCase, renovationCase.currentScopeVersionId, await caseLinkCount(renovationCase.id))) throw stale('This case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      const checked = parseReadinessFormAnswer('ATTACH_RECORD', parameters.readinessForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      const offered = await attachableRecords(propertyId, renovationCase.id);
      if (!offered.options.some((option) => option.value === checked.data.record)) throw stale('That record can no longer be attached (it may already belong to a case). Review it again and try again.');
      await attachComplianceRecord(propertyId, renovationCase.id, userId, attachRecordServiceInput(checked.data));
      backAction = { ...backToReadiness, label: 'See approvals', message: `Show the compliance status for my renovation ${renovationCase.name.slice(0, 120)}.` };
      title = 'Record attached'; description = 'It is linked to this case’s current scope. Its status was not changed, and nothing was sent to an authority.';
    } else if (kind === 'SATISFY_CONDITION') {
      const condition = await loadCondition(propertyId, command.entityId);
      if (!condition) throw stale('That condition is no longer available.');
      if (parameters.readinessContextVersion !== conditionVersion(condition)) throw stale('This condition changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!conditionCanBeSatisfied(condition)) throw stale('That condition is not open now.');
      const checked = parseReadinessFormAnswer('SATISFY_CONDITION', parameters.readinessForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      const offered = await evidenceOptions(propertyId, ctx.access.role);
      if (!offered.options.some((option) => option.id === checked.data.evidenceDocumentId)) throw stale('That document is no longer one your whole household can see. Review it again and try again.');
      await updateCondition(propertyId, condition.renovationCaseId, condition.id, userId, readinessServiceInput('SATISFY_CONDITION', checked.data), ctx.access.role);
      artifactId = condition.id;
      const owningCase = await loadCase(propertyId, condition.renovationCaseId);
      backAction = { ...backToReadiness, label: 'See approvals', message: `Show the compliance status for my renovation ${(owningCase?.name ?? '').slice(0, 120)}.`.replace(' .', '.') };
      title = 'Condition marked satisfied'; description = `It is recorded with the document you chose${condition.isBlocking ? ', and it no longer blocks closeout' : ''}. Nothing was read or verified.`;
    } else if (kind === 'GENERATE') {
      const renovationCase = await loadCase(propertyId, command.entityId);
      if (!renovationCase || !renovationCase.currentScopeVersionId) throw stale('That renovation case or its scope is no longer available.');
      const existing = await currentRequirementCount(propertyId, renovationCase.id, renovationCase.currentScopeVersionId);
      if (parameters.readinessContextVersion !== requirementsVersion(renovationCase, renovationCase.currentScopeVersionId, existing)) throw stale('This case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      // Idempotent by the service's own requirement keys: a repeat creates only the questions that are missing.
      await generateRequirementCandidates(propertyId, renovationCase.id, userId, {});
      title = 'Requirements research generated'; description = 'The questions are recorded as research candidates for this case’s current scope. Nothing is determined yet, and nothing was applied for.';
    } else if (kind === 'REFRESH') {
      const renovationCase = await loadCase(propertyId, command.entityId);
      if (!renovationCase) throw stale('That renovation case is no longer available.');
      if (parameters.readinessContextVersion !== caseVersion(renovationCase)) throw stale('This case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await evaluateReadiness(propertyId, renovationCase.id, userId, parameters.readinessMode === 'DIY' ? 'DIY' : 'PROVIDER');
      title = 'Readiness refreshed'; description = 'Every item is re-evaluated from the case’s current records.';
    } else if (kind === 'HANDOFF') {
      const prefill = await loadHandoffPrefill(propertyId, command.entityId);
      if (parameters.readinessContextVersion !== prefill.version) {
        throw stale('This case changed while the confirmation was open (its readiness, scope, selected quote or project). Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const checked = parseReadinessFormAnswer('HANDOFF', parameters.readinessForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      // One key per execution: a repeat of this same confirmation is an idempotent replay, never a second request (owner ruling on D-H8).
      const outcome: any = await handoffToProject(propertyId, command.entityId, userId, handoffServiceInput(checked.data, prefill.fulfillmentMode, `ask:${execution.id}:handoff`));
      const handoff = outcome?.handoff as { outcome?: string; workItemSynced?: boolean } | undefined;
      artifactType = 'PROJECT_RECORD'; artifactId = String(outcome?.id ?? command.entityId);
      if (handoff?.outcome === 'ALREADY_CREATED') {
        title = 'A project already existed';
        description = 'It was created before this request, so nothing you entered here was applied. The project is as it was first created.';
      } else if (handoff?.outcome === 'IDEMPOTENT_REPLAY') {
        title = 'Project already created by this request';
        description = 'This confirmation had already created the project; nothing was changed again.';
      } else {
        title = 'Project created and linked';
        description = 'The approved scope, its open conditions and its evidence requirements are carried into the project, and the case is linked to it. No contractor was contacted.';
      }
      workItemSynced = handoff?.workItemSynced;
    } else {
      const item = await loadItem(propertyId, command.entityId);
      if (!item) throw stale('That readiness item is no longer available.');
      if (parameters.readinessContextVersion !== itemVersion(kind, item)) throw stale('This item changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (!readinessItemKinds(item).includes(kind)) throw stale('That step is not available for this item now.');
      const formKind = kind as ReadinessItemFormKind;
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
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `readiness-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backAction, label: kind === 'RETROACTIVE_REVIEW' ? 'See requirements' : kind === 'SATISFY_CONDITION' || kind === 'ATTACH_RECORD' ? 'See approvals' : 'See readiness', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `readiness-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  if (workItemSynced === false) {
    result.blocks.push({
      type: 'LIMITATION', id: `readiness-handoff-work-item-${artifactId}`, severity: 'CAUTION', title: 'The project is created; its work item is not synchronized yet',
      body: 'The project and its link were saved. The Home Operations work item could not be created just now; repeating this request retries it, and nothing else needs to be redone.',
    });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('renovation-readiness.command', confirmReadinessCommand);
