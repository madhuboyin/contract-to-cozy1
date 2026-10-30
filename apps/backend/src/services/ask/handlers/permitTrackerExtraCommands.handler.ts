// More permit steps inside Ask (register "Permits"; FRD v1.488). Reached only by declared actions on the Permit Tracker answer, through the existing
// PERMIT_TRACKER_COMMAND capability, so its contributor floor, mutation impact and governance already apply. Every write is the canonical service's own call
// (the one the matching route makes, including its project-compliance gate), behind a review and a confirmation bound to what the household was looking at.
// Nothing is filed with, or sent to, a permitting authority. An OFFICIAL status, a flag's closing statuses, photo readiness checks and the disclosure
// export are not here (see support/permitTrackerExtra.ts).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { permitTrackerService } from '../../permitTracker.service';
import { permitFetchService } from '../../permitFetch.service';
import { permitDetectionService } from '../../permitDetection.service';
import { assertProjectComplianceApplicable } from '../../projectCompliance/context';
import { PERMIT_FLAG_STATUS_LABELS, PERMIT_WORK_TYPE_LABELS } from '../support/permitTrackerRead';
import { PERMIT_WORK_TYPES, PERMIT_WORK_TYPE_OPTION_LABELS } from '../support/permitTrackerCommand';
import {
  FLAG_ORIGINS, FLAG_ORIGIN_LABELS, FLAG_RISKS, FLAG_RISK_LABELS, FLAG_STAGES, FLAG_STAGE_LABELS, INSPECTION_STAGE_LABELS, INSPECTION_STAGE_TYPES, INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS, FLAG_OUTCOMES, FLAG_OUTCOME_LABELS, OFFICIAL_SOURCE_LABELS, OFFICIAL_SOURCE_TYPES, OFFICIAL_STATUSES, OFFICIAL_STATUS_LABELS, OFFICIAL_TRUTH_LABELS, OFFICIAL_TRUTH_LAYERS,
  PERMIT_DISCLOSURE_STATUS_ACTION_ID, PERMIT_DISCLOSURE_STATUS_MESSAGE, PERMIT_FETCH_STATUS_ACTION_ID, PERMIT_FETCH_STATUS_MESSAGE, flagResolveBody, flagResolveProblems, officialStatusBody, officialStatusProblems,
  PERMIT_EXTRA_CAPTURE_KEY, PERMIT_EXTRA_MESSAGES, PERMIT_EXTRA_TARGETS, PERMIT_EXTRA_ACTION_IDS as IDS, parseInspectionEntityId, parsePermitExtraForm,
  permitExtraNeedsForm, permitFlagCreateBody, permitInspectionCreateBody, permitInspectionUpdateBody, type PermitExtraActionId,
} from '../support/permitTrackerExtra';

const database = prisma as any;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const backToPermits = { id: 'permit-tracker-back', label: 'Back to my permits', interactionType: 'START_WORKFLOW' as const, message: 'Show my permits', operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'PRIMARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'permit-extra-unavailable', title, body, tone: 'DEFAULT', actions: [{ ...backToPermits, style: 'SECONDARY' as const }] }], suggestions: [],
});

export interface PermitExtraLaunch { actionId: PermitExtraActionId; entityId: string; sourceExecutionId: string | null }

interface FlagRow { id: string; status: string; workType: string; remediationCaseId: string | null; evidenceDocumentIds: string[]; updatedAt: Date }
type Choice = { label: string; value: string };
const EVIDENCE_PICK_LIMIT = 30;
const TERMINAL_FLAG_STATUSES = ['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED', 'REMEDIATED', 'DISMISSED'];
interface MilestoneRow { id: string; permitRecordId: string; stageName: string; status: string; scheduledDate: Date | null; inspectedDate: Date | null; updatedAt: Date }
const loadFlag = (propertyId: string, id: string): Promise<FlagRow | null> =>
  database.permitUnpermittedFlag.findFirst({ where: { id, propertyId }, select: { id: true, status: true, workType: true, remediationCaseId: true, evidenceDocumentIds: true, updatedAt: true } });
const loadPermitStamp = (propertyId: string, id: string): Promise<{ id: string; updatedAt: Date } | null> =>
  database.propertyPermitRecord.findFirst({ where: { id, propertyId, isActive: true }, select: { id: true, updatedAt: true } });
const loadMilestone = (propertyId: string, permitId: string, id: string): Promise<MilestoneRow | null> =>
  database.permitInspectionMilestone.findFirst({ where: { id, permitRecordId: permitId, propertyId, permitRecord: { isActive: true } }, select: { id: true, permitRecordId: true, stageName: true, status: true, scheduledDate: true, inspectedDate: true, updatedAt: true } });

/** This home's own records the service accepts as evidence (it checks they belong to the property), newest first. */
const evidenceChoices = async (propertyId: string): Promise<Choice[]> =>
  (await database.document.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: EVIDENCE_PICK_LIMIT, select: { id: true, name: true } })).map((doc: { id: string; name: string }) => ({ label: doc.name, value: doc.id }));
/** Permits the service accepts as a match: from the authority's own data or verified by an official record. */
const authorityPermitChoices = async (propertyId: string): Promise<Choice[]> =>
  (await database.propertyPermitRecord.findMany({ where: { propertyId, isActive: true, OR: [{ isVerified: true }, { source: 'OPEN_DATA_API' }] }, orderBy: { updatedAt: 'desc' }, take: EVIDENCE_PICK_LIMIT, select: { id: true, permitNumber: true, category: true } }))
    .map((permit: { id: string; permitNumber: string | null; category: string }) => ({ label: `${permit.category.toLowerCase()} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`, value: permit.id }));
const flagVersion = (row: FlagRow) => sha(`permit-flag:${row.id}:${row.status}:${row.remediationCaseId ?? ''}:${row.updatedAt.toISOString()}`);
const milestoneVersion = (row: MilestoneRow) => sha(`permit-inspection:${row.id}:${row.status}:${row.updatedAt.toISOString()}`);
const propertyVersion = (actionId: string, propertyId: string) => sha(`permit-extra:${actionId}:${propertyId}`);
const disclosureVersion = (propertyId: string, summary: { totalPermits?: number; openFlags?: number }) => sha(`permit-disclosure:${propertyId}:${summary.totalPermits}:${summary.openFlags}`);
const permitVersion = (row: { id: string; updatedAt: Date }) => sha(`permit-extra-permit:${row.id}:${row.updatedAt.toISOString()}`);
const day = (value: Date | null) => (value ? humanDate(value) ?? value.toISOString().slice(0, 10) : null);

const select = (key: string, label: string, values: readonly string[], labels: Record<string, string>, required: boolean) =>
  ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
const dateField = (key: string, label: string, allowFuture: boolean) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture } });

const choiceSelect = (key: string, label: string, options: Choice[], required: boolean) => ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options } });
function formCapture(actionId: PermitExtraActionId, contextVersion: string, entered?: Record<string, unknown>, documents: Choice[] = [], permits: Choice[] = []): AskCaptureRequest {
  const fields = actionId === IDS.FLAG_RESOLVE ? [
    select('outcome', 'What did you find out?', FLAG_OUTCOMES, FLAG_OUTCOME_LABELS, true),
    ...(permits.length ? [choiceSelect('matchedPermit', 'The permit that matches (preferred)', permits, false)] : []),
    ...(documents.length ? [choiceSelect('evidence', 'The record that shows it', documents, false)] : []),
    { key: 'sourceReference', label: 'Where you got it (office, person, reference number)', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 1000 } },
    dateField('observedAt', 'Date you got it', false),
    { key: 'notes', label: 'Why (required if it does not apply)', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 4000 } },
  ] : actionId === IDS.OFFICIAL_STATUS ? [
    select('status', 'The authority’s status', OFFICIAL_STATUSES, OFFICIAL_STATUS_LABELS, true),
    select('truthLayer', 'How sure are you?', OFFICIAL_TRUTH_LAYERS, OFFICIAL_TRUTH_LABELS, true),
    select('sourceType', 'Where it came from', OFFICIAL_SOURCE_TYPES, OFFICIAL_SOURCE_LABELS, true),
    { key: 'sourceReference', label: 'Where exactly (portal page, email date, person)', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 1000 } },
    dateField('observedAt', 'Date you saw it', false),
    ...(documents.length ? [choiceSelect('evidence', 'The record that shows it', documents, false)] : []),
    { key: 'authorityReferenceNumber', label: 'The authority’s reference number', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 240 } },
    dateField('issueDate', 'Issued', false), dateField('expirationDate', 'Expires', true), dateField('finaledDate', 'Finaled', false),
  ] : actionId === IDS.FLAG_ADD ? [
    select('workType', 'The work', PERMIT_WORK_TYPES, PERMIT_WORK_TYPE_OPTION_LABELS, true),
    select('disclosureRisk', 'How risky would it be to disclose?', FLAG_RISKS, FLAG_RISK_LABELS, true),
    select('workOrigin', 'Who did the work?', FLAG_ORIGINS, FLAG_ORIGIN_LABELS, true),
    select('workStage', 'How far did it get?', FLAG_STAGES, FLAG_STAGE_LABELS, true),
    dateField('workStartedAt', 'Started', false), dateField('workCompletedAt', 'Finished', false),
    { key: 'flagReason', label: 'What you know', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
  ] : actionId === IDS.INSPECTION_ADD ? [
    { key: 'stageName', label: 'Name of the inspection', required: true, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 100 } },
    select('stageType', 'Kind of inspection', INSPECTION_STAGE_TYPES, INSPECTION_STAGE_LABELS, true),
    dateField('scheduledDate', 'Scheduled for (if it is)', true),
  ] : [
    select('status', 'Where it stands', INSPECTION_STATUSES, INSPECTION_STATUS_LABELS, true),
    dateField('scheduledDate', 'Scheduled for', true), dateField('inspectedDate', 'Inspected on', false),
    { key: 'inspectorNotes', label: 'Inspector notes', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1000 } },
  ];
  const title = actionId === IDS.FLAG_RESOLVE ? 'Close out this flag' : actionId === IDS.OFFICIAL_STATUS ? 'Record the official status' : actionId === IDS.FLAG_ADD ? 'Record work you may not have a permit for' : actionId === IDS.INSPECTION_ADD ? 'Add an inspection step' : 'Update this inspection step';
  return {
    requirementId: `permit-extra-${actionId}-inputs`, captureKey: PERMIT_EXTRA_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL', title,
    question: actionId === IDS.FLAG_RESOLVE ? 'What have you found, and what shows it?' : actionId === IDS.OFFICIAL_STATUS ? 'What does the permitting office’s record say?' : actionId === IDS.FLAG_ADD ? 'What work was done?' : actionId === IDS.INSPECTION_ADD ? 'What inspection does this permit need?' : 'What changed?',
    helpText: actionId === IDS.FLAG_RESOLVE || actionId === IDS.OFFICIAL_STATUS
      ? 'This needs proof, not a guess: pick the record from this home that shows it. It does not file or send anything to the permitting office. You will review it before it is saved.'
      : 'This records what you know. It does not file or send anything to the permitting office. You will review it before it is saved.',
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: Object.fromEntries(Object.entries(entered ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '')),
    allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function permitExtraCommandResult(userId: string, propertyId: string, launch: PermitExtraLaunch, supplied?: unknown): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'permit-extra-permission', title: 'A contributor or owner can change permit records', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const actionId = launch.actionId;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const launchParameters = { permitExtraLaunch: { actionId, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const confirm = (contextVersion: string, input: unknown, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>, consent: string, extra: Record<string, unknown> = {}): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PERMIT_EXTRA_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { permitExtraCommand: { actionId, entityId: launch.entityId, input: input ?? null }, permitExtraContextVersion: contextVersion, ...launchParameters, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'permit-extra-review', title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `permit-extra-${actionId}-${sha(`${launch.entityId}:${contextVersion}:${JSON.stringify(input ?? null)}`).slice(0, 12)}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString() },
    suggestions: [], ...extra,
  });
  const needsInput = (contextVersion: string, title: string, entered?: Record<string, unknown>, documents: Choice[] = [], permits: Choice[] = [], note?: string): AskOperationResult => ({
    status: 'NEEDS_CONTEXT', reasonCode: 'PERMIT_EXTRA_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
    blocks: [{ type: 'SUMMARY', id: 'permit-extra-input', title, body: note ?? 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: note ? 'CAUTION' : 'DEFAULT', actions: [] }],
    captureRequests: [formCapture(actionId, contextVersion, entered, documents, permits)], suggestions: [],
  });
  /** No record of this home can serve as evidence yet: say so, and offer to add one (the household then asks again). */
  const noEvidence = (what: string): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode: 'PERMIT_EXTRA_NO_EVIDENCE',
    blocks: [{ type: 'SUMMARY', id: 'permit-extra-no-evidence', title: 'A record is needed first', body: `${what} Add the letter, email or printout to your home records, then ask again. Nothing has changed.`, tone: 'DEFAULT',
      actions: [{ id: 'document-add-first', label: 'Add a record', interactionType: 'OPEN_FILE_INTAKE' as const, style: 'PRIMARY' as const }, { ...backToPermits, style: 'SECONDARY' as const }] }],
    suggestions: [],
  });
  const target = PERMIT_EXTRA_TARGETS[actionId];

  if (target === 'PROPERTY') {
    // The report is a snapshot of the records as they are now, so its confirmation is bound to the counts the household reviewed.
    const summary: { totalPermits?: number; openFlags?: number } = actionId === IDS.DISCLOSURE_EXPORT ? await permitTrackerService.getPermitSummary(propertyId) : {};
    const contextVersion = actionId === IDS.DISCLOSURE_EXPORT ? disclosureVersion(propertyId, summary) : propertyVersion(actionId, propertyId);
    if (actionId === IDS.DISCLOSURE_EXPORT) {
      const open = summary.openFlags ?? 0;
      return confirm(contextVersion, null, 'Create a permit disclosure report?',
        'This prepares a PDF of your permit records and flags as they are right now, with the standard disclaimer. It does not change any record, and it is not a legal opinion about what you must disclose. A new report is made each time; older ones are kept until they expire.', 'Create the report',
        [{ label: 'Permit records', value: String(summary.totalPermits ?? 0) }, { label: 'Open flags', value: open ? `${open} still unresolved` : 'None unresolved' }, { label: 'As of', value: humanDate(new Date()) ?? 'today' },
          { label: 'Includes', value: 'Permit records, open and closed flags, the proof basis for each, and a disclaimer' }], 'I authorize creating this report from the shared home record.');
    }
    if (actionId === IDS.FETCH) {
      return confirm(contextVersion, null, 'Look for permit records from your local permit office?', 'Cozy asks the public permit data for this address and adds any records it finds. It may take a few minutes depending on the local source. Nothing is filed or sent to the permitting office.', 'Look for records', [], 'I authorize searching public permit records for this home.');
    }
    if (actionId === IDS.SCAN) {
      return confirm(contextVersion, null, 'Check for possible unpermitted work?', 'Cozy compares your home record (such as systems and replacements) with your permit records and flags work that may have needed a permit and has none on file. A flag is a prompt to look into it, not a finding.', 'Check my home', [], 'I authorize this check of the shared home record.');
    }
    // FLAG_ADD
    if (supplied === undefined) return needsInput(contextVersion, 'Record work you may not have a permit for');
    const parsed = parsePermitExtraForm(actionId, supplied);
    if (!parsed.success) return { ...needsInput(contextVersion, 'Record work you may not have a permit for', supplied as Record<string, unknown>), reasonCode: 'PERMIT_EXTRA_INPUT_INVALID' };
    const f = parsed.data;
    return confirm(contextVersion, supplied, 'Record this work?', 'This adds a flag for you to research. It does not say the work was or was not permitted, and nothing is sent to the permitting office.', 'Record it',
      [{ label: 'Work', value: PERMIT_WORK_TYPE_OPTION_LABELS[f.workType] ?? f.workType }, { label: 'Disclosure risk', value: FLAG_RISK_LABELS[f.disclosureRisk] }, { label: 'Done by', value: FLAG_ORIGIN_LABELS[f.workOrigin] }, { label: 'How far', value: FLAG_STAGE_LABELS[f.workStage] },
        ...(f.workStartedAt ? [{ label: 'Started', value: f.workStartedAt }] : []), ...(f.workCompletedAt ? [{ label: 'Finished', value: f.workCompletedAt }] : []), ...(f.flagReason ? [{ label: 'What you know', value: f.flagReason }] : [])],
      'I authorize adding this to the shared home record.');
  }

  if (target === 'FLAG') {
    const flag = await loadFlag(propertyId, launch.entityId);
    if (!flag) return unavailable('PERMIT_FLAG_NOT_FOUND', 'That flag is no longer available', 'It may have been removed. Nothing has changed.');
    const contextVersion = flagVersion(flag);
    const work = PERMIT_WORK_TYPE_LABELS(flag.workType);
    if (actionId === IDS.FLAG_RESOLVE) {
      if (TERMINAL_FLAG_STATUSES.includes(flag.status)) return unavailable('PERMIT_FLAG_CLOSED', 'This flag is already closed out', `It is marked “${PERMIT_FLAG_STATUS_LABELS[flag.status] ?? flag.status}”. Nothing has changed.`);
      const [documents, permits] = await Promise.all([evidenceChoices(propertyId), authorityPermitChoices(propertyId)]);
      if (!documents.length && !permits.length) return noEvidence('Closing out a flag needs proof, such as a permit from the permitting office or a letter that shows the answer.');
      const title = `Close out the ${work} flag`;
      if (supplied === undefined) return needsInput(contextVersion, title, undefined, documents, permits);
      const parsed = parsePermitExtraForm(actionId, supplied);
      const f = parsed.success ? parsed.data : null;
      if (!f || (f.evidence && !documents.some((d) => d.value === f.evidence)) || (f.matchedPermit && !permits.some((p) => p.value === f.matchedPermit))) {
        return { ...needsInput(contextVersion, title, supplied as Record<string, unknown>, documents, permits), reasonCode: 'PERMIT_EXTRA_INPUT_INVALID' };
      }
      const problems = flagResolveProblems(f as any, flag);
      if (problems.length) return { ...needsInput(contextVersion, title, supplied as Record<string, unknown>, documents, permits, problems.join(' ')), reasonCode: 'PERMIT_EXTRA_EVIDENCE_MISSING' };
      const docName = documents.find((d) => d.value === f.evidence)?.label; const permitName = permits.find((p) => p.value === f.matchedPermit)?.label;
      return confirm(contextVersion, supplied, `Close out the ${work} flag as: ${FLAG_OUTCOME_LABELS[f.outcome]}?`,
        'This changes the flag’s status and keeps the proof with it. It is recorded in the flag’s history and cannot be undone from Ask. Nothing is filed with or sent to the permitting office, and what must be disclosed to a buyer depends on local rules.', 'Close it out',
        [{ label: 'Work', value: work }, { label: 'Outcome', value: FLAG_OUTCOME_LABELS[f.outcome] },
          ...(permitName ? [{ label: 'Matching permit', value: permitName }] : []), ...(docName ? [{ label: 'Proof', value: docName }] : []),
          ...(f.sourceReference ? [{ label: 'From', value: f.sourceReference }] : []), ...(f.observedAt ? [{ label: 'Date', value: f.observedAt }] : []), ...(f.notes ? [{ label: 'Why', value: f.notes }] : [])],
        'I authorize this change to the shared home record.');
    }
    if (actionId === IDS.FLAG_RESEARCH) {
      if (!['UNKNOWN', 'FLAGGED'].includes(flag.status)) return unavailable('PERMIT_FLAG_NOT_OPEN', 'This flag is already being handled', `It is marked “${PERMIT_FLAG_STATUS_LABELS[flag.status] ?? flag.status}”. Nothing has changed.`);
      return confirm(contextVersion, null, `Mark the ${work} flag as being researched?`, 'This only changes its status so you can track it. Closing a flag as permitted, unpermitted, fixed or dismissed needs evidence and is done from the permit records page.', 'Mark as researching',
        [{ label: 'Work', value: work }, { label: 'Now', value: PERMIT_FLAG_STATUS_LABELS[flag.status] ?? flag.status }], 'I authorize this change to the shared home record.');
    }
    // FLAG_REMEDIATE
    if (flag.remediationCaseId) return unavailable('PERMIT_FLAG_HAS_PLAN', 'A plan already exists for this flag', 'Nothing has changed.');
    return confirm(contextVersion, null, `Start a plan for the ${work} flag?`, 'This opens a research case in the shared home record to find the authority’s determination and sort out any fix that is needed. It does not start work, apply for a permit or contact anyone.', 'Start the plan',
      [{ label: 'Work', value: work }], 'I authorize adding this case to the shared home record.');
  }

  if (target === 'PERMIT') {
    const permit = await loadPermitStamp(propertyId, launch.entityId);
    if (!permit) return unavailable('PERMIT_NOT_FOUND', 'That permit is no longer available', 'It may have been removed. Nothing has changed.');
    const contextVersion = permitVersion(permit);
    if (actionId === IDS.OFFICIAL_STATUS) {
      const documents = await evidenceChoices(propertyId);
      const title = 'Record the official status';
      if (supplied === undefined) return needsInput(contextVersion, title, undefined, documents);
      const parsed = parsePermitExtraForm(actionId, supplied);
      const f = parsed.success ? parsed.data : null;
      if (!f || (f.evidence && !documents.some((d) => d.value === f.evidence))) return { ...needsInput(contextVersion, title, supplied as Record<string, unknown>, documents), reasonCode: 'PERMIT_EXTRA_INPUT_INVALID' };
      const problems = officialStatusProblems(f as any);
      if (problems.length) {
        if (!documents.length && problems.some((p) => p.startsWith('Pick the record'))) return noEvidence('The permitting office’s status needs proof unless it comes straight from its public data or portal.');
        return { ...needsInput(contextVersion, title, supplied as Record<string, unknown>, documents, [], problems.join(' ')), reasonCode: 'PERMIT_EXTRA_EVIDENCE_MISSING' };
      }
      const docName = documents.find((d) => d.value === f.evidence)?.label;
      return confirm(contextVersion, supplied, `Record “${OFFICIAL_STATUS_LABELS[f.status]}” as the official status?`,
        'This records what the permitting office says, separately from the status you reported, and marks the permit verified. It does not change anything with the authority. Only record what the authority itself told you or published.', 'Record it',
        [{ label: 'Official status', value: OFFICIAL_STATUS_LABELS[f.status] }, { label: 'Certainty', value: OFFICIAL_TRUTH_LABELS[f.truthLayer] }, { label: 'Source', value: `${OFFICIAL_SOURCE_LABELS[f.sourceType]}: ${f.sourceReference}` }, { label: 'Date seen', value: f.observedAt },
          ...(docName ? [{ label: 'Proof', value: docName }] : []), ...(f.authorityReferenceNumber ? [{ label: 'Authority reference', value: f.authorityReferenceNumber }] : []),
          ...(f.issueDate ? [{ label: 'Issued', value: f.issueDate }] : []), ...(f.expirationDate ? [{ label: 'Expires', value: f.expirationDate }] : []), ...(f.finaledDate ? [{ label: 'Finaled', value: f.finaledDate }] : [])],
        'I authorize adding this to the shared home record.');
    }
    if (supplied === undefined) return needsInput(contextVersion, 'Add an inspection step');
    const parsed = parsePermitExtraForm(actionId, supplied);
    if (!parsed.success) return { ...needsInput(contextVersion, 'Add an inspection step', supplied as Record<string, unknown>), reasonCode: 'PERMIT_EXTRA_INPUT_INVALID' };
    const f = parsed.data;
    return confirm(contextVersion, supplied, `Add “${f.stageName}” to this permit?`, 'This adds a step to track on the permit. It does not book an inspection with the authority.', 'Add inspection step',
      [{ label: 'Inspection', value: f.stageName }, { label: 'Kind', value: INSPECTION_STAGE_LABELS[f.stageType] }, ...(f.scheduledDate ? [{ label: 'Scheduled', value: f.scheduledDate }] : [])], 'I authorize adding this to the shared home record.');
  }

  // INSPECTION: update or remove
  const ids = parseInspectionEntityId(launch.entityId);
  const milestone = ids ? await loadMilestone(propertyId, ids.permitId, ids.milestoneId) : null;
  if (!milestone) return unavailable('PERMIT_INSPECTION_NOT_FOUND', 'That inspection step is no longer available', 'It may have been removed. Nothing has changed.');
  const contextVersion = milestoneVersion(milestone);
  if (actionId === IDS.INSPECTION_REMOVE) {
    return confirm(contextVersion, null, `Remove “${milestone.stageName}”?`, 'The step leaves the permit. Nothing is cancelled with the authority.', 'Remove step',
      [{ label: 'Inspection', value: milestone.stageName }, { label: 'Now', value: INSPECTION_STATUS_LABELS[milestone.status] ?? milestone.status }], 'I authorize removing this from the shared home record.');
  }
  if (supplied === undefined) return needsInput(contextVersion, `Update “${milestone.stageName}”`, { status: milestone.status });
  const parsed = parsePermitExtraForm(actionId, supplied);
  if (!parsed.success) return { ...needsInput(contextVersion, `Update “${milestone.stageName}”`, supplied as Record<string, unknown>), reasonCode: 'PERMIT_EXTRA_INPUT_INVALID' };
  const f = parsed.data;
  return confirm(contextVersion, supplied, `Update “${milestone.stageName}”?`, 'This records where the inspection stands. It does not book or cancel anything with the authority.', 'Save',
    [{ label: 'Inspection', value: milestone.stageName }, { label: 'Now', value: `${INSPECTION_STATUS_LABELS[milestone.status] ?? milestone.status} → ${INSPECTION_STATUS_LABELS[f.status]}` },
      ...(f.scheduledDate ? [{ label: 'Scheduled', value: f.scheduledDate }] : []), ...(f.inspectedDate ? [{ label: 'Inspected', value: f.inspectedDate }] : []), ...(f.inspectorNotes ? [{ label: 'Notes', value: f.inspectorNotes }] : [])],
    'I authorize this change to the shared home record.');
}

export async function confirmPermitExtraCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (ctx.access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to do this.', 'ASK_PERMISSION_REQUIRED');
  const propertyId = execution.propertyId;
  const stored = parameters.permitExtraCommand as { actionId?: unknown; entityId?: unknown; input?: unknown } | undefined;
  const actionId = stored?.actionId as PermitExtraActionId | undefined;
  const entityId = typeof stored?.entityId === 'string' ? stored.entityId : '';
  if (!actionId || !(actionId in PERMIT_EXTRA_MESSAGES) || !entityId) throw stale('The change to make is invalid.');
  const target = PERMIT_EXTRA_TARGETS[actionId];
  const version = parameters.permitExtraContextVersion;
  const conflict = (what: string) => stale(`${what} changed while the confirmation was open. Review it again and try again.`, 'ASK_CONTEXT_VERSION_CONFLICT');
  let title: string; let description: string; let artifactType = 'PERMIT_RECORD'; let artifactId = entityId; let actions: any[] = [{ ...backToPermits, label: 'See my permits' }]; const details: Array<{ label: string; value: string }> = [];
  try {
    const form = permitExtraNeedsForm(actionId) ? parsePermitExtraForm(actionId, stored?.input) : null;
    if (permitExtraNeedsForm(actionId) && !form?.success) throw stale('The details to save are invalid.');
    if (target === 'PROPERTY') {
      let expected = propertyVersion(actionId, propertyId);
      if (actionId === IDS.DISCLOSURE_EXPORT) { const summary: { totalPermits?: number; openFlags?: number } = await permitTrackerService.getPermitSummary(propertyId); expected = disclosureVersion(propertyId, summary); }
      if (version !== expected) throw conflict('Your permit records');
      if (actionId === IDS.FETCH) {
        await assertProjectComplianceApplicable(propertyId, userId, 'PERMIT_TRACKER', {}, 'permitTracking');
        await permitFetchService.triggerFetch(propertyId, 'USER_REQUEST');
        title = 'Permit-record search started'; description = 'The search has started. It may take a few minutes depending on the local source. Check on it when you like; records it finds are added to your permits.'; actions = [{ id: PERMIT_FETCH_STATUS_ACTION_ID, label: 'Check search status', interactionType: 'START_WORKFLOW' as const, message: PERMIT_FETCH_STATUS_MESSAGE, operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'PRIMARY' as const }];
      } else if (actionId === IDS.DISCLOSURE_EXPORT) {
        await assertProjectComplianceApplicable(propertyId, userId, 'PERMIT_TRACKER', {}, 'permitTracking');
        const requested: any = await permitTrackerService.requestDisclosureExport(propertyId, userId);
        artifactType = 'PERMIT_DISCLOSURE_EXPORT'; artifactId = String(requested.exportId ?? entityId);
        title = 'Permit disclosure report requested'; description = 'The report is being prepared as of now. Check on it when you like; when it is ready you can download it here.';
        actions = [{ id: PERMIT_DISCLOSURE_STATUS_ACTION_ID, label: 'Check on the report', interactionType: 'START_WORKFLOW' as const, message: PERMIT_DISCLOSURE_STATUS_MESSAGE, operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'PRIMARY' as const }];
      } else if (actionId === IDS.SCAN) {
        await assertProjectComplianceApplicable(propertyId, userId, 'PERMIT_TRACKER', {}, 'permitTracking');
        const created = await permitDetectionService.detectUnpermittedWork(propertyId);
        const count = typeof created === 'number' ? created : 0;
        title = count ? `${count} possible unpermitted ${count === 1 ? 'item' : 'items'} flagged` : 'Nothing new to flag'; description = count ? 'Each flag is a prompt to look into it, not a finding.' : 'No work in your home record needed a flag that is not already covered.';
      } else {
        const flag: any = await permitTrackerService.createManualFlag(propertyId, userId, permitFlagCreateBody((form as any).data));
        artifactType = 'PERMIT_UNPERMITTED_FLAG'; artifactId = String(flag.id ?? entityId);
        title = 'Work recorded'; description = 'It is on your list of flags to look into. Nothing was sent to the permitting office.';
        details.push({ label: 'Work', value: PERMIT_WORK_TYPE_OPTION_LABELS[(form as any).data.workType] ?? (form as any).data.workType });
      }
    } else if (target === 'FLAG') {
      const flag = await loadFlag(propertyId, entityId);
      if (!flag) throw stale('That flag is no longer available.');
      if (version !== flagVersion(flag)) throw conflict('This flag');
      artifactType = 'PERMIT_UNPERMITTED_FLAG';
      details.push({ label: 'Work', value: PERMIT_WORK_TYPE_LABELS(flag.workType) });
      if (actionId === IDS.FLAG_RESOLVE) {
        const f = (form as any).data;
        if (TERMINAL_FLAG_STATUSES.includes(flag.status)) throw stale('That flag is already closed out.');
        if (flagResolveProblems(f, flag).length) throw stale('The proof for this outcome is incomplete.');
        await permitTrackerService.updateFlag(flag.id, propertyId, userId, flagResolveBody(f, flag.evidenceDocumentIds ?? []));
        title = 'Flag closed out'; description = `It is marked “${FLAG_OUTCOME_LABELS[f.outcome]}”, with its proof kept in the flag’s history.`;
      } else if (actionId === IDS.FLAG_RESEARCH) {
        await permitTrackerService.updateFlag(flag.id, propertyId, userId, { status: 'INVESTIGATING' });
        title = 'Flag marked as being researched'; description = 'It stays on your list until you close it with evidence.';
      } else {
        const created: any = await permitTrackerService.createRemediationCase(flag.id, propertyId, userId, {});
        artifactType = 'RENOVATION_CASE'; artifactId = String(created.id ?? flag.id);
        title = 'Plan started'; description = 'A research case is in the shared home record. Nothing has been applied for or started.';
      }
    } else if (target === 'PERMIT') {
      const permit = await loadPermitStamp(propertyId, entityId);
      if (!permit) throw stale('That permit is no longer available.');
      if (version !== permitVersion(permit)) throw conflict('This permit');
      if (actionId === IDS.OFFICIAL_STATUS) {
        const f = (form as any).data;
        if (officialStatusProblems(f).length) throw stale('The proof for this status is incomplete.');
        await permitTrackerService.recordOfficialStatus(permit.id, propertyId, userId, officialStatusBody(f), ctx.access.role);
        title = 'Official status recorded'; description = `The permit now shows “${OFFICIAL_STATUS_LABELS[f.status]}” as the permitting office’s status, apart from the status you reported.`;
        details.push({ label: 'Official status', value: OFFICIAL_STATUS_LABELS[f.status] });
      } else {
      const milestone: any = await permitTrackerService.addInspectionMilestone(permit.id, propertyId, permitInspectionCreateBody((form as any).data));
      artifactType = 'PERMIT_INSPECTION_MILESTONE'; artifactId = String(milestone.id ?? permit.id);
      title = 'Inspection step added'; description = 'It is on the permit. Nothing was booked with the authority.';
      details.push({ label: 'Inspection', value: (form as any).data.stageName });
      }
    } else {
      const ids = parseInspectionEntityId(entityId);
      const milestone = ids ? await loadMilestone(propertyId, ids.permitId, ids.milestoneId) : null;
      if (!ids || !milestone) throw stale('That inspection step is no longer available.');
      if (version !== milestoneVersion(milestone)) throw conflict('This inspection step');
      artifactType = 'PERMIT_INSPECTION_MILESTONE'; artifactId = milestone.id;
      details.push({ label: 'Inspection', value: milestone.stageName });
      if (actionId === IDS.INSPECTION_REMOVE) {
        await permitTrackerService.deleteInspectionMilestone(milestone.id, ids.permitId, propertyId);
        title = 'Inspection step removed'; description = 'It left the permit. Nothing was cancelled with the authority.';
      } else {
        await permitTrackerService.updateInspectionMilestone(milestone.id, ids.permitId, propertyId, permitInspectionUpdateBody((form as any).data));
        title = 'Inspection step updated'; description = 'The permit shows where it stands now.';
      }
    }
  } catch (error) {
    if (error instanceof APIError) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PERMIT_EXTRA_UPDATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `permit-extra-${actionId}-${artifactId}`, title, status: 'COMPLETED', description, details, actions }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `permit-extra-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
