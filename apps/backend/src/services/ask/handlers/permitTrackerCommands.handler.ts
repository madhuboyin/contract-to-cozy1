// Add, change and remove a permit record inside Ask (register P0 "Permits", slice PM-B; FRD v1.315).
//
// Reached only by declared actions on the Permit Tracker answer: "Add a permit" (a summary action) and Change / Remove (row actions). Every write goes
// through permitTrackerOperations, the same functions the routes call (property-context feature gate, project-compliance applicability check, analytics
// and tool-lifecycle completion are shared, not copied), behind a review card and a confirmation. A homeowner records the REPORTED status; the official
// status is the authority's and is not set here. A permit imported from open data can have only its reported status and notes changed, as the service
// enforces, so the form and the review show only those.
//
// Not here (PM-C and later): recording an official status with evidence, inspections, flags and remediation, readiness checks (photo upload + AI), and the
// disclosure export. Removing a permit is a soft delete: it leaves the tracker and unlinks any flag it resolved.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { createManualPermitWithEffects, deletePermitWithEffects, updatePermitWithEffects } from '../../permitTrackerOperations';
import { PERMIT_CATEGORY_LABELS, PERMIT_REPORTED_STATUS_LABELS } from '../support/permitTrackerRead';
import {
  PERMIT_CATEGORIES, PERMIT_COMMAND_ACTION_IDS, PERMIT_COMMAND_MESSAGES, PERMIT_ENTITY_TYPE, PERMIT_FORM_CAPTURE_KEYS, PERMIT_PROPERTY_ENTITY_TYPE,
  PERMIT_REPORTED_STATUSES, PERMIT_WORK_TYPES, PERMIT_WORK_TYPE_OPTION_LABELS, parsePermitFormAnswer, permitCommandKindFromMessage, permitCommandTargetsProperty,
  permitCreateBody, permitEditChanges, permitUpdateBody, type PermitCommandKind, type PermitCurrentValues, type PermitFormInput,
} from '../support/permitTrackerCommand';
import { PERMIT_EXTRA_MESSAGES, PERMIT_EXTRA_TARGETS, PERMIT_FLAG_ENTITY_TYPE, PERMIT_INSPECTION_ENTITY_TYPE, isPermitExtraActionId } from '../support/permitTrackerExtra';
import { confirmPermitExtraCommand, permitExtraCommandResult } from './permitTrackerExtraCommands.handler';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface PermitCommandLaunch { kind: PermitCommandKind; entityId: string; sourceExecutionId: string | null }

const backToPermits = { id: 'permit-tracker-back', label: 'Back to my permits', interactionType: 'START_WORKFLOW' as const, message: 'Show my permits', operationId: 'PERMIT_TRACKER_STATUS' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'permit-command-permission', title: 'A contributor or owner can change permit records', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_PERMIT_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'permit-command-not-routable', title: 'Open your permits first', body: 'A permit is added, changed or removed from your permit list. Nothing has changed.', tone: 'DEFAULT', actions: [backToPermits] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'permit-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToPermits] }], suggestions: [],
});

type PermitRow = {
  id: string; permitNumber: string | null; category: string; workTypes: string[]; description: string | null; reportedStatus: string; source: string; contractorName: string | null;
  applicationDate: Date | null; issueDate: Date | null; expirationDate: Date | null; estimatedCostCents: number | null; notes: string | null; updatedAt: Date;
};
async function loadPermit(propertyId: string, permitId: string): Promise<PermitRow | null> {
  return database.propertyPermitRecord.findFirst({
    where: { id: permitId, propertyId, isActive: true },
    select: {
      id: true, permitNumber: true, category: true, workTypes: true, description: true, reportedStatus: true, source: true, contractorName: true,
      applicationDate: true, issueDate: true, expirationDate: true, estimatedCostCents: true, notes: true, updatedAt: true,
    },
  });
}
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const currentValues = (permit: PermitRow): PermitCurrentValues => ({
  category: permit.category, workType: permit.workTypes[0] ?? null, permitNumber: permit.permitNumber, description: permit.description, reportedStatus: permit.reportedStatus,
  contractorName: permit.contractorName, applicationDate: isoDate(permit.applicationDate), issueDate: isoDate(permit.issueDate), expirationDate: isoDate(permit.expirationDate),
  estimatedCostCents: permit.estimatedCostCents, notes: permit.notes,
});
const permitLabel = (permit: PermitRow) => `${PERMIT_CATEGORY_LABELS[permit.category] ?? permit.category} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`;
/** Bound to the permit's last change, so a confirmation opened before it changed is refused as out of date. */
export const permitCommandContextVersion = (kind: PermitCommandKind, id: string, permit?: PermitRow | null) =>
  sha(`permit-command:${kind}:${id}:${permit ? permit.updatedAt.toISOString() : ''}`);

function formCapture(kind: 'ADD' | 'EDIT', contextVersion: string, entered?: Record<string, unknown>, apiSourced = false, label?: string): AskCaptureRequest {
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const select = (key: string, name: string, values: readonly string[], labels: Record<string, string>, required: boolean) =>
    ({ key, label: name, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
  const dateField = (key: string, name: string) => ({ key, label: name, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const fields = apiSourced ? [
    select('reportedStatus', 'Where it stands (as you understand it)', PERMIT_REPORTED_STATUSES, PERMIT_REPORTED_STATUS_LABELS, true),
    { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
  ] : [
    select('category', 'Kind of permit', PERMIT_CATEGORIES, PERMIT_CATEGORY_LABELS, true),
    select('workType', 'The work', PERMIT_WORK_TYPES, PERMIT_WORK_TYPE_OPTION_LABELS, true),
    { key: 'permitNumber', label: 'Permit number', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 120 } },
    { key: 'description', label: 'What was permitted', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1000 } },
    select('reportedStatus', 'Where it stands (as you understand it)', PERMIT_REPORTED_STATUSES, PERMIT_REPORTED_STATUS_LABELS, false),
    { key: 'contractorName', label: 'Contractor', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 200 } },
    dateField('applicationDate', 'Applied'), dateField('issueDate', 'Issued'), dateField('expirationDate', 'Expires'),
    { key: 'estimatedCost', label: 'Estimated cost ($)', required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 100_000_000 } },
    { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 2000 } },
  ];
  return {
    requirementId: kind === 'ADD' ? 'permit-tracker-add-inputs' : 'permit-tracker-edit-inputs', captureKey: PERMIT_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: kind === 'ADD' ? 'Add a permit' : `Change ${label ?? 'this permit'}`,
    question: kind === 'ADD' ? 'What permit do you want to record?' : 'What should change?',
    helpText: kind === 'ADD'
      ? 'This records the permit as you know it. The official status comes from the permitting authority and is not set here. You will review it before it is saved.'
      : `Change only what is wrong; a blank keeps what is recorded.${apiSourced ? ' This permit came from public records, so only where it stands and the notes can be changed.' : ''}`,
    inputSchema: { type: 'GROUP', fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function permitCommandResult(userId: string, propertyId: string, launch: PermitCommandLaunch, supplied?: PermitFormInput): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { permitCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const row = (label: string, value: string | null) => (value ? [{ label, value }] : []);
  const date = (value: string | null) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);

  if (kind === 'ADD') {
    const contextVersion = permitCommandContextVersion('ADD', propertyId);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'PERMIT_ADD_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'permit-add-input', title: 'Add a permit', body: 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('ADD', contextVersion)], suggestions: [],
      };
    }
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'PERMIT_ADD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { permitAdd: formAnswer(supplied), permitCommand: { kind, entityId: propertyId }, permitCommandContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'permit-add-review', title: 'Review this permit', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `permit-add-${sha(`${propertyId}:${supplied.category}:${supplied.workType}:${supplied.permitNumber}`).slice(0, 12)}-1`, version: 1,
        title: `Add this ${PERMIT_CATEGORY_LABELS[supplied.category] ?? supplied.category} permit?`,
        description: 'This records the permit as you reported it. Its official status stays unconfirmed until the authority’s record is added, and nothing is filed or sent.',
        fields: [
          { label: 'Kind', value: PERMIT_CATEGORY_LABELS[supplied.category] ?? supplied.category }, { label: 'Work', value: PERMIT_WORK_TYPE_OPTION_LABELS[supplied.workType] ?? supplied.workType },
          ...row('Permit number', supplied.permitNumber), ...row('Description', supplied.description),
          { label: 'Reported status', value: PERMIT_REPORTED_STATUS_LABELS[supplied.reportedStatus] ?? supplied.reportedStatus },
          ...row('Contractor', supplied.contractorName), ...row('Applied', date(supplied.applicationDate)), ...row('Issued', date(supplied.issueDate)), ...row('Expires', date(supplied.expirationDate)),
          ...(supplied.estimatedCostCents !== null ? [{ label: 'Estimated cost', value: money(supplied.estimatedCostCents / 100) }] : []), ...row('Notes', supplied.notes),
        ],
        editableFields: [], confirmLabel: 'Add permit', consentText: 'I authorize adding this permit to the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [formCapture('ADD', contextVersion, formAnswer(supplied))], suggestions: [],
    };
  }

  const permit = await loadPermit(propertyId, launch.entityId);
  if (!permit) return unavailable('PERMIT_NOT_FOUND', 'That permit is no longer available', 'Ask could not find that permit record. It may have been removed. Nothing has changed.');
  const contextVersion = permitCommandContextVersion(kind, permit.id, permit);
  const label = permitLabel(permit);

  if (kind === 'REMOVE') {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'PERMIT_REMOVE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { permitCommand: { kind, entityId: permit.id }, permitCommandContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'permit-remove-review', title: `Remove this ${label}?`, body: 'It leaves the permit tracker. Nothing is filed with or sent to the authority.', tone: 'CAUTION', actions: [] }],
      confirmation: {
        confirmationId: `permit-remove-${sha(`${propertyId}:${permit.id}`).slice(0, 12)}-1`, version: 1, title: `Remove ${label}?`,
        description: 'The record leaves the tracker, and any flag that was resolved by it is reopened for review. This does not cancel anything with the authority.',
        fields: [{ label: 'Permit', value: label }, ...row('Description', permit.description)], editableFields: [], confirmLabel: 'Remove permit',
        consentText: 'I authorize removing this permit from the shared home record.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  // EDIT
  const apiSourced = permit.source === 'OPEN_DATA_API';
  const before = currentValues(permit);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PERMIT_EDIT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'permit-edit-input', title: `Change ${label}`, body: 'The form shows what is recorded. Change what is wrong, then review the changes before they are saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('EDIT', contextVersion, { ...before, estimatedCost: before.estimatedCostCents === null ? null : before.estimatedCostCents / 100 }, apiSourced, label)], suggestions: [],
    };
  }
  const changes = permitEditChanges(before, supplied, apiSourced);
  if (!changes.length) return unavailable('PERMIT_EDIT_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  const show = (change: { field: string; before: string | null; after: string | null }, side: 'before' | 'after') => {
    const raw = change[side];
    if (raw === null) return 'None';
    if (change.field === 'estimatedCostCents') return money(Number(raw) / 100);
    if (change.field === 'applicationDate' || change.field === 'issueDate' || change.field === 'expirationDate') return date(raw) ?? raw;
    if (change.field === 'reportedStatus') return PERMIT_REPORTED_STATUS_LABELS[raw] ?? raw;
    if (change.field === 'category') return PERMIT_CATEGORY_LABELS[raw] ?? raw;
    if (change.field === 'workType') return PERMIT_WORK_TYPE_OPTION_LABELS[raw] ?? raw;
    return raw;
  };
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PERMIT_EDIT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { permitEdit: formAnswer(supplied), permitCommand: { kind, entityId: permit.id }, permitCommandContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'permit-edit-review', title: `Review the changes to ${label}`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `permit-edit-${sha(`${propertyId}:${permit.id}:${JSON.stringify(changes)}`).slice(0, 12)}-1`, version: 1, title: `Save these changes to ${label}?`,
      description: 'This updates the recorded details. The permit’s official status is not changed, and nothing is filed or sent.',
      fields: changes.map((change) => ({ label: change.label, value: `${show(change, 'before')} → ${show(change, 'after')}` })),
      editableFields: [], confirmLabel: 'Save changes', consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture('EDIT', contextVersion, formAnswer(supplied), apiSourced, label)], suggestions: [],
  };
}

/** The form's own shape (dollars, not cents), so a stored review re-validates through the same schema as the form. */
function formAnswer(input: PermitFormInput) {
  return {
    category: input.category, workType: input.workType, permitNumber: input.permitNumber, description: input.description, reportedStatus: input.reportedStatus,
    contractorName: input.contractorName, applicationDate: input.applicationDate, issueDate: input.issueDate, expirationDate: input.expirationDate,
    estimatedCost: input.estimatedCostCents === null ? null : input.estimatedCostCents / 100, notes: input.notes,
  };
}

registerCapabilityHandler('permits.command', async (envelope) => {
  const launch = envelope.launchContext;
  // The extra permit steps (records lookup, flags, inspection steps; FRD v1.488) are declared actions of this same command.
  if (isPermitExtraActionId(launch?.actionId)) {
    const target = PERMIT_EXTRA_TARGETS[launch.actionId];
    const entityType = target === 'PROPERTY' ? PERMIT_PROPERTY_ENTITY_TYPE : target === 'PERMIT' ? PERMIT_ENTITY_TYPE : target === 'FLAG' ? PERMIT_FLAG_ENTITY_TYPE : PERMIT_INSPECTION_ENTITY_TYPE;
    if (launch.operationId !== 'PERMIT_TRACKER_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== entityType || envelope.message !== PERMIT_EXTRA_MESSAGES[launch.actionId]) return notRoutable();
    return permitExtraCommandResult(envelope.userId, envelope.propertyId!, { actionId: launch.actionId, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
  }
  const kind = permitCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'PERMIT_TRACKER_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  const entityType = permitCommandTargetsProperty(kind) ? PERMIT_PROPERTY_ENTITY_TYPE : PERMIT_ENTITY_TYPE;
  if (launch.entityType !== entityType) return notRoutable();
  return permitCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmPermitCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  if (parameters.permitExtraCommand) return confirmPermitExtraCommand(ctx);
  const command = parameters.permitCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as PermitCommandKind | undefined;
  if (!kind || !(kind in PERMIT_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = command.entityId;
  try {
    let title: string; let description: string; let artifactId = entityId; const details: Array<{ label: string; value: string }> = [];
    if (kind === 'ADD') {
      const checked = parsePermitFormAnswer(parameters.permitAdd);
      if (!checked.success) throw stale('The permit to add is invalid.');
      const permit = await createManualPermitWithEffects(propertyId, userId, permitCreateBody(checked.data));
      artifactId = String((permit as { id?: unknown }).id ?? entityId);
      title = 'Permit added'; description = 'It is saved as you reported it. Its official status is not confirmed, and nothing was filed or sent.';
      details.push({ label: 'Permit', value: `${PERMIT_CATEGORY_LABELS[checked.data.category] ?? checked.data.category}${checked.data.permitNumber ? ` ${checked.data.permitNumber}` : ''}` });
    } else {
      const permit = await loadPermit(propertyId, entityId);
      if (!permit) throw stale('That permit is no longer available.');
      if (parameters.permitCommandContextVersion !== permitCommandContextVersion(kind, permit.id, permit)) {
        throw stale('This permit changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      details.push({ label: 'Permit', value: permitLabel(permit) });
      if (kind === 'REMOVE') {
        await deletePermitWithEffects(propertyId, userId, permit.id);
        title = 'Permit removed'; description = 'It left the permit tracker. Nothing was cancelled with the authority.';
      } else {
        const checked = parsePermitFormAnswer(parameters.permitEdit);
        if (!checked.success) throw stale('The changes to save are invalid.');
        const changes = permitEditChanges(currentValues(permit), checked.data, permit.source === 'OPEN_DATA_API');
        if (!changes.length) throw stale('There is nothing to change.');
        await updatePermitWithEffects(propertyId, userId, permit.id, permitUpdateBody(changes, checked.data));
        title = 'Permit changed'; description = 'The recorded details are updated. The official status was not changed.';
      }
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `PERMIT_COMMAND_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `permit-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [{ ...backToPermits, label: 'See my permits', style: 'PRIMARY' as const }] }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `permit-command-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'PERMIT_RECORD', artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('permits.command', confirmPermitCommand);
