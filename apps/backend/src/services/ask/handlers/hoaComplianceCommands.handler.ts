// HOA Compliance writes inside Ask (register P2 "HOA Compliance"; FRD v1.328). Reached only by declared actions on the HOA answer: set up or update the
// association, add an approval request, report a violation (summary actions) and change or remove an approval request (row actions). Every write goes
// through hoaCompliance.service and hoaComplianceOperations, the same functions the routes call (the property-context gate, the project-compliance check,
// analytics and tool lifecycle are shared, not copied), behind a review card and a confirmation. The household records its own REPORTED status; an
// association's decision, with its source and evidence, stays on the page.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { hoaComplianceService } from '../../hoaCompliance.service';
import { createHoaApprovalRecordWithEffects, reportHoaViolationWithEffects, upsertHoaAssociationWithEffects } from '../../hoaComplianceOperations';
import {
  HOA_COMMAND_MESSAGES, HOA_DUES_FREQUENCIES, HOA_DUES_LABELS, HOA_FORM_CAPTURE_KEYS, HOA_REPORTED_STATUSES, HOA_REPORTED_STATUS_LABELS, HOA_SEVERITIES, HOA_SEVERITY_LABELS,
  HOA_WORK_TYPES, HOA_WORK_TYPE_LABELS, hoaCommandEntityType, hoaCommandKindFromMessage, hoaServiceBody, parseHoaFormAnswer,
  type HoaCommandKind, type HoaFormKind, type HoaFormValues,
} from '../support/hoaComplianceCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface HoaCommandLaunch { kind: HoaCommandKind; entityId: string; sourceExecutionId: string | null }

const backToHoa = { id: 'hoa-back', label: 'Back to HOA', interactionType: 'START_WORKFLOW' as const, message: 'Show my HOA compliance', operationId: 'HOA_COMPLIANCE_STATUS' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'hoa-command-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'hoa-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToHoa] }], suggestions: [],
});
const notRoutable = (): AskOperationResult => unavailable('ASK_HOA_COMMAND_NOT_DIRECTLY_ROUTABLE', 'Open your HOA records first', 'An HOA record is changed from your HOA list. Nothing has changed.');

type ApprovalRow = { id: string; workType: string; description: string | null; reportedStatus: string; submittedDate: Date | null; expirationDate: Date | null; notes: string | null; decisionStatus: string | null; updatedAt: Date };
const loadApproval = async (propertyId: string, id: string): Promise<ApprovalRow | null> => database.hoaApprovalRecord.findFirst({
  where: { id, propertyId, isActive: true },
  select: { id: true, workType: true, description: true, reportedStatus: true, submittedDate: true, expirationDate: true, notes: true, decisionStatus: true, updatedAt: true },
});
const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const approvalVersion = (kind: HoaCommandKind, r: ApprovalRow) => sha(`hoa:${kind}:${r.id}:${r.updatedAt.toISOString()}`);
const approvalLabel = (r: ApprovalRow) => `${HOA_WORK_TYPE_LABELS[r.workType] ?? r.workType} request`;
const day = (value: unknown) => (typeof value === 'string' ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);

function formCapture(kind: HoaFormKind, contextVersion: string, entered: HoaFormValues, label?: string): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const select = (key: string, name: string, values: readonly string[], labels: Record<string, string>, required: boolean) =>
    ({ key, label: name, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
  const short = (key: string, name: string, max: number, required = false) => ({ key, label: name, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const long = (key: string, name: string, max: number, required = false) => ({ key, label: name, required, inputSchema: { type: 'LONG_TEXT' as const, maxLength: max } });
  const date = (key: string, name: string, future = true) => ({ key, label: name, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: future } });
  const amount = (key: string, name: string) => ({ key, label: name, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 100_000_000 } });
  const specs: Record<HoaFormKind, { title: string; question: string; help: string; fields: unknown[] }> = {
    ASSOCIATION: {
      title: 'Your HOA details', question: 'Who is your association, and what do you pay?', help: 'A blank keeps what is recorded. Nothing is saved until you confirm.',
      fields: [short('name', 'Association name', 200, true), short('managementCompany', 'Management company', 200), short('contactName', 'Contact name', 200), short('contactEmail', 'Contact email', 200),
        short('contactPhone', 'Contact phone', 60), amount('duesAmount', 'Dues ($)'), select('duesFrequency', 'How often', HOA_DUES_FREQUENCIES, HOA_DUES_LABELS, false), date('nextDueDate', 'Next due'),
        long('notes', 'Notes', 2000)],
    },
    APPROVAL_ADD: {
      title: 'Add an HOA approval request', question: 'What work needs the association’s approval?',
      help: 'This records the request and where it stands as you understand it. Recording an association’s decision, which needs its source and evidence, is not currently available in Ask.',
      fields: [select('workType', 'The work', HOA_WORK_TYPES, HOA_WORK_TYPE_LABELS, true), long('description', 'What you are asking for', 1000),
        select('reportedStatus', 'Where it stands', HOA_REPORTED_STATUSES, HOA_REPORTED_STATUS_LABELS, false), date('submittedDate', 'Submitted on', false), date('expirationDate', 'Approval expires'), long('notes', 'Notes', 2000)],
    },
    APPROVAL_EDIT: {
      title: `Change ${label ?? 'this request'}`, question: 'What should change?', help: 'Change only what is wrong; a blank keeps what is recorded. The association’s decision is not changed here.',
      fields: [select('workType', 'The work', HOA_WORK_TYPES, HOA_WORK_TYPE_LABELS, false), long('description', 'What you are asking for', 1000),
        select('reportedStatus', 'Where it stands', HOA_REPORTED_STATUSES, HOA_REPORTED_STATUS_LABELS, false), date('submittedDate', 'Submitted on', false), date('expirationDate', 'Approval expires'), long('notes', 'Notes', 2000)],
    },
    VIOLATION: {
      title: 'Report an HOA violation notice', question: 'What does the notice say?', help: 'This opens a violation record and guidance for it. It does not respond to the association.',
      fields: [short('summary', 'What the notice is about', 200, true), select('workType', 'Related to', HOA_WORK_TYPES, HOA_WORK_TYPE_LABELS, false), long('description', 'Details', 2000),
        date('cureDeadline', 'Fix by'), amount('fine', 'Fine ($)'), select('severity', 'How urgent', HOA_SEVERITIES, HOA_SEVERITY_LABELS, false)],
    },
  };
  const spec = specs[kind];
  return {
    requirementId: `hoa-${kind.toLowerCase().replace('_', '-')}-inputs`, captureKey: HOA_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: spec.help, inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function hoaCommandResult(userId: string, propertyId: string, launch: HoaCommandLaunch, supplied?: HoaFormValues): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change HOA records', 'Your role can view this home but not change it. Nothing has changed.');
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { hoaCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const row = (label: string, value: string | null | undefined) => (value ? [{ label, value }] : []);
  const confirmation = (id: string, spec: { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> }) => ({
    confirmationId: `hoa-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  const ask = (formKind: HoaFormKind, contextVersion: string, title: string, body: string, current: HoaFormValues, label?: string): AskOperationResult => ({
    status: 'NEEDS_CONTEXT', reasonCode: `HOA_${kind}_INPUT_REQUIRED`, contextVersion, parameters: launchParameters,
    blocks: [{ type: 'SUMMARY', id: 'hoa-input', title, body, tone: 'DEFAULT', actions: [] }], captureRequests: [formCapture(formKind, contextVersion, current, label)], suggestions: [],
  });
  const review = (id: string, contextVersion: string, params: Record<string, unknown>, spec: Parameters<typeof confirmation>[1], formKind: HoaFormKind, label?: string): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOA_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { hoaForm: supplied, hoaCommand: { kind, entityId: launch.entityId }, hoaContextVersion: contextVersion, ...params, ...base },
    blocks: [{ type: 'SUMMARY', id: 'hoa-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(id, spec), captureRequests: supplied ? [formCapture(formKind, contextVersion, supplied, label)] : undefined, suggestions: [],
  });

  if (kind === 'ASSOCIATION') {
    const association: any = await hoaComplianceService.getAssociation(propertyId);
    const contextVersion = sha(`hoa:ASSOCIATION:${propertyId}:${association ? association.updatedAt?.toISOString?.() ?? association.id : 'none'}`);
    if (!supplied) {
      return ask('ASSOCIATION', contextVersion, association ? 'Update your HOA details' : 'Set up your HOA', 'Nothing has been saved yet.', association ? {
        name: association.name, managementCompany: association.managementCompany, contactName: association.contactName, contactEmail: association.contactEmail,
        contactPhone: association.contactPhone, duesAmount: association.duesAmountCents != null ? association.duesAmountCents / 100 : null, duesFrequency: association.duesFrequency,
        nextDueDate: iso(association.nextDueDate ?? null), notes: association.notes,
      } : {});
    }
    return review(`association-${sha(JSON.stringify(supplied)).slice(0, 12)}`, contextVersion, {}, {
      title: association ? 'Save these HOA details?' : 'Set up this HOA?', confirmLabel: 'Save HOA details',
      description: 'This records your association and what you pay. Nothing is sent to the association.',
      fields: [{ label: 'Association', value: String(supplied.name) }, ...row('Management company', supplied.managementCompany as string),
        ...row('Contact', [supplied.contactName, supplied.contactEmail, supplied.contactPhone].filter(Boolean).join(' · ')),
        ...(typeof supplied.duesAmount === 'number' ? [{ label: 'Dues', value: `${money(supplied.duesAmount)}${supplied.duesFrequency ? ` ${HOA_DUES_LABELS[String(supplied.duesFrequency)].toLowerCase()}` : ''}` }] : []),
        ...row('Next due', day(supplied.nextDueDate)), ...row('Notes', supplied.notes as string)],
    }, 'ASSOCIATION');
  }

  if (kind === 'APPROVAL_ADD') {
    const association = await hoaComplianceService.getAssociation(propertyId);
    if (!association) return unavailable('HOA_ASSOCIATION_REQUIRED', 'Set up your HOA first', 'An approval request is kept under your association. Add the association details first. Nothing has changed.');
    const contextVersion = sha(`hoa:APPROVAL_ADD:${propertyId}:${(association as any).id}`);
    if (!supplied) return ask('APPROVAL_ADD', contextVersion, 'Add an HOA approval request', 'Nothing has been saved yet.', {});
    return review(`approval-add-${sha(JSON.stringify(supplied)).slice(0, 12)}`, contextVersion, {}, {
      title: `Add this ${HOA_WORK_TYPE_LABELS[String(supplied.workType)] ?? 'approval'} request?`, confirmLabel: 'Add request',
      description: 'This records the request as you reported it. It is not an association approval, and nothing is sent to the association.',
      fields: [{ label: 'Work', value: HOA_WORK_TYPE_LABELS[String(supplied.workType)] ?? String(supplied.workType) },
        { label: 'Where it stands', value: HOA_REPORTED_STATUS_LABELS[String(supplied.reportedStatus ?? 'NOT_SUBMITTED')] ?? String(supplied.reportedStatus) },
        ...row('Request', supplied.description as string), ...row('Submitted', day(supplied.submittedDate)), ...row('Expires', day(supplied.expirationDate)), ...row('Notes', supplied.notes as string)],
    }, 'APPROVAL_ADD');
  }

  if (kind === 'VIOLATION') {
    const contextVersion = sha(`hoa:VIOLATION:${propertyId}`);
    if (!supplied) return ask('VIOLATION', contextVersion, 'Report an HOA violation notice', 'Nothing has been saved yet.', {});
    return review(`violation-${sha(JSON.stringify(supplied)).slice(0, 12)}`, contextVersion, {}, {
      title: 'Open a violation record?', confirmLabel: 'Report it',
      description: 'This opens a violation record with guidance for it. It does not respond to, dispute or pay anything to the association.',
      fields: [{ label: 'Notice', value: String(supplied.summary) }, ...row('Related to', supplied.workType ? HOA_WORK_TYPE_LABELS[String(supplied.workType)] : null),
        ...row('Fix by', day(supplied.cureDeadline)), ...(typeof supplied.fine === 'number' ? [{ label: 'Fine', value: money(supplied.fine) }] : []),
        ...row('Urgency', supplied.severity ? HOA_SEVERITY_LABELS[String(supplied.severity)] : null), ...row('Details', supplied.description as string)],
    }, 'VIOLATION');
  }

  const record = await loadApproval(propertyId, launch.entityId);
  if (!record) return unavailable('HOA_APPROVAL_NOT_FOUND', 'That request is no longer available', 'Ask could not find that approval request. It may have been removed. Nothing has changed.');
  const contextVersion = approvalVersion(kind, record);
  const label = approvalLabel(record);
  if (kind === 'APPROVAL_REMOVE') {
    return review(`approval-remove-${sha(record.id).slice(0, 12)}`, contextVersion, {}, {
      title: `Remove this ${label}?`, confirmLabel: 'Remove request',
      description: 'The request leaves your HOA list. Nothing is withdrawn with the association.', fields: [{ label: 'Request', value: label }, ...row('Where it stands', HOA_REPORTED_STATUS_LABELS[record.reportedStatus])],
    }, 'APPROVAL_EDIT');
  }
  if (!supplied) {
    return ask('APPROVAL_EDIT', contextVersion, label, 'The form shows what is recorded. Change what is wrong, then review it.', {
      workType: record.workType, description: record.description, reportedStatus: record.reportedStatus, submittedDate: iso(record.submittedDate), expirationDate: iso(record.expirationDate), notes: record.notes,
    }, label);
  }
  const before: Record<string, string | null> = {
    workType: record.workType, description: record.description, reportedStatus: record.reportedStatus, submittedDate: iso(record.submittedDate), expirationDate: iso(record.expirationDate), notes: record.notes,
  };
  const names: Record<string, string> = { workType: 'Work', description: 'Request', reportedStatus: 'Where it stands', submittedDate: 'Submitted', expirationDate: 'Expires', notes: 'Notes' };
  const show = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return 'None';
    if (key === 'workType') return HOA_WORK_TYPE_LABELS[String(value)] ?? String(value);
    if (key === 'reportedStatus') return HOA_REPORTED_STATUS_LABELS[String(value)] ?? String(value);
    if (key === 'submittedDate' || key === 'expirationDate') return day(value) ?? String(value);
    return String(value);
  };
  const changes = Object.keys(names).filter((key) => supplied[key] !== undefined && supplied[key] !== before[key]);
  if (!changes.length) return unavailable('HOA_APPROVAL_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  return review(`approval-edit-${sha(`${record.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, contextVersion, {}, {
    title: `Save these changes to ${label}?`, confirmLabel: 'Save changes',
    description: 'This updates what you reported. The association’s decision is not changed, and nothing is sent to the association.',
    fields: changes.map((key) => ({ label: names[key], value: `${show(key, before[key])} → ${show(key, supplied[key])}` })),
  }, 'APPROVAL_EDIT', label);
}

registerCapabilityHandler('hoa-compliance.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = hoaCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'HOA_COMPLIANCE_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== hoaCommandEntityType(kind)) return notRoutable();
  return hoaCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmHoaCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.hoaCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as HoaCommandKind | undefined;
  if (!kind || !(kind in HOA_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  let title: string; let description: string; let artifactId = command.entityId;
  try {
    if (kind === 'APPROVAL_REMOVE' || kind === 'APPROVAL_EDIT') {
      const record = await loadApproval(propertyId, command.entityId);
      if (!record) throw stale('That request is no longer available.');
      if (parameters.hoaContextVersion !== approvalVersion(kind, record)) throw stale('This request changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      artifactId = record.id;
      if (kind === 'APPROVAL_REMOVE') {
        await hoaComplianceService.deleteApprovalRecord(record.id, propertyId);
        title = 'Request removed'; description = 'It has left your HOA list.';
      } else {
        const checked = parseHoaFormAnswer('APPROVAL_EDIT', parameters.hoaForm);
        if (!checked.success) throw stale('The details to save are invalid.');
        await hoaComplianceService.updateApprovalRecord(record.id, propertyId, userId, hoaServiceBody('APPROVAL_EDIT', checked.data), ctx.access.role as HouseholdRole);
        title = 'Request updated'; description = 'It is saved as you reported it.';
      }
    } else {
      const formKind = kind as HoaFormKind;
      const checked = parseHoaFormAnswer(formKind, parameters.hoaForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      const body = hoaServiceBody(formKind, checked.data);
      if (kind === 'ASSOCIATION') {
        const association: any = await hoaComplianceService.getAssociation(propertyId);
        const version = sha(`hoa:ASSOCIATION:${propertyId}:${association ? association.updatedAt?.toISOString?.() ?? association.id : 'none'}`);
        if (parameters.hoaContextVersion !== version) throw stale('Your HOA details changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
        const saved: any = await upsertHoaAssociationWithEffects({ propertyId, userId, body });
        artifactId = saved.association?.id ?? propertyId;
        title = 'HOA details saved'; description = 'Your association is recorded.';
      } else if (kind === 'APPROVAL_ADD') {
        const association: any = await hoaComplianceService.getAssociation(propertyId);
        if (!association || parameters.hoaContextVersion !== sha(`hoa:APPROVAL_ADD:${propertyId}:${association.id}`)) {
          throw stale('Your HOA details changed while the confirmation was open. Review again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
        }
        const created: any = await createHoaApprovalRecordWithEffects({ propertyId, userId, role: ctx.access.role as HouseholdRole, body });
        artifactId = created.record?.id ?? propertyId;
        title = 'Request added'; description = 'It is recorded as you reported it; it is not an association approval.';
      } else {
        const incident: any = await reportHoaViolationWithEffects({ propertyId, userId, body });
        artifactId = incident?.id ?? propertyId;
        title = 'Violation reported'; description = 'A violation record is open, with guidance for it.';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOA_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `hoa-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToHoa, label: 'See my HOA', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `hoa-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'HOA_RECORD', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('hoa-compliance.command', confirmHoaCommand);
