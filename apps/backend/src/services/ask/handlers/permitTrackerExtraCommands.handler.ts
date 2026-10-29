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
  INSPECTION_STATUS_LABELS, PERMIT_EXTRA_CAPTURE_KEY, PERMIT_EXTRA_MESSAGES, PERMIT_EXTRA_TARGETS, PERMIT_EXTRA_ACTION_IDS as IDS, parseInspectionEntityId, parsePermitExtraForm,
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

interface FlagRow { id: string; status: string; workType: string; remediationCaseId: string | null; updatedAt: Date }
interface MilestoneRow { id: string; permitRecordId: string; stageName: string; status: string; scheduledDate: Date | null; inspectedDate: Date | null; updatedAt: Date }
const loadFlag = (propertyId: string, id: string): Promise<FlagRow | null> =>
  database.permitUnpermittedFlag.findFirst({ where: { id, propertyId }, select: { id: true, status: true, workType: true, remediationCaseId: true, updatedAt: true } });
const loadPermitStamp = (propertyId: string, id: string): Promise<{ id: string; updatedAt: Date } | null> =>
  database.propertyPermitRecord.findFirst({ where: { id, propertyId, isActive: true }, select: { id: true, updatedAt: true } });
const loadMilestone = (propertyId: string, permitId: string, id: string): Promise<MilestoneRow | null> =>
  database.permitInspectionMilestone.findFirst({ where: { id, permitRecordId: permitId, propertyId, permitRecord: { isActive: true } }, select: { id: true, permitRecordId: true, stageName: true, status: true, scheduledDate: true, inspectedDate: true, updatedAt: true } });

const flagVersion = (row: FlagRow) => sha(`permit-flag:${row.id}:${row.status}:${row.remediationCaseId ?? ''}:${row.updatedAt.toISOString()}`);
const milestoneVersion = (row: MilestoneRow) => sha(`permit-inspection:${row.id}:${row.status}:${row.updatedAt.toISOString()}`);
const propertyVersion = (actionId: string, propertyId: string) => sha(`permit-extra:${actionId}:${propertyId}`);
const permitVersion = (row: { id: string; updatedAt: Date }) => sha(`permit-extra-permit:${row.id}:${row.updatedAt.toISOString()}`);
const day = (value: Date | null) => (value ? humanDate(value) ?? value.toISOString().slice(0, 10) : null);

const select = (key: string, label: string, values: readonly string[], labels: Record<string, string>, required: boolean) =>
  ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
const dateField = (key: string, label: string, allowFuture: boolean) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture } });

function formCapture(actionId: PermitExtraActionId, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const fields = actionId === IDS.FLAG_ADD ? [
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
  const title = actionId === IDS.FLAG_ADD ? 'Record work you may not have a permit for' : actionId === IDS.INSPECTION_ADD ? 'Add an inspection step' : 'Update this inspection step';
  return {
    requirementId: `permit-extra-${actionId}-inputs`, captureKey: PERMIT_EXTRA_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL', title,
    question: actionId === IDS.FLAG_ADD ? 'What work was done?' : actionId === IDS.INSPECTION_ADD ? 'What inspection does this permit need?' : 'What changed?',
    helpText: 'This records what you know. It does not file or send anything to the permitting office. You will review it before it is saved.',
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
  const needsInput = (contextVersion: string, title: string, entered?: Record<string, unknown>): AskOperationResult => ({
    status: 'NEEDS_CONTEXT', reasonCode: 'PERMIT_EXTRA_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
    blocks: [{ type: 'SUMMARY', id: 'permit-extra-input', title, body: 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
    captureRequests: [formCapture(actionId, contextVersion, entered)], suggestions: [],
  });
  const target = PERMIT_EXTRA_TARGETS[actionId];

  if (target === 'PROPERTY') {
    const contextVersion = propertyVersion(actionId, propertyId);
    if (actionId === IDS.FETCH) {
      return confirm(contextVersion, null, 'Look for permit records from your local permit office?', 'Cozy asks the public permit data for this address and adds any records it finds. They arrive in a moment, and nothing is filed or sent to the permitting office.', 'Look for records', [], 'I authorize searching public permit records for this home.');
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
  let title: string; let description: string; let artifactType = 'PERMIT_RECORD'; let artifactId = entityId; const details: Array<{ label: string; value: string }> = [];
  try {
    const form = permitExtraNeedsForm(actionId) ? parsePermitExtraForm(actionId, stored?.input) : null;
    if (permitExtraNeedsForm(actionId) && !form?.success) throw stale('The details to save are invalid.');
    if (target === 'PROPERTY') {
      if (version !== propertyVersion(actionId, propertyId)) throw conflict('This');
      if (actionId === IDS.FETCH) {
        await assertProjectComplianceApplicable(propertyId, userId, 'PERMIT_TRACKER', {}, 'permitTracking');
        await permitFetchService.triggerFetch(propertyId, 'USER_REQUEST');
        title = 'Looking for permit records'; description = 'The search is running. Records it finds are added to your permits; ask to see your permits again in a moment.';
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
      if (actionId === IDS.FLAG_RESEARCH) {
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
      const milestone: any = await permitTrackerService.addInspectionMilestone(permit.id, propertyId, permitInspectionCreateBody((form as any).data));
      artifactType = 'PERMIT_INSPECTION_MILESTONE'; artifactId = String(milestone.id ?? permit.id);
      title = 'Inspection step added'; description = 'It is on the permit. Nothing was booked with the authority.';
      details.push({ label: 'Inspection', value: (form as any).data.stageName });
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
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `permit-extra-${actionId}-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [{ ...backToPermits, label: 'See my permits' }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `permit-extra-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
