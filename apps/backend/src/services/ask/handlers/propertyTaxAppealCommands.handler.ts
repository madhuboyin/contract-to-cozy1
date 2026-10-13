// Property tax appeal cases inside Ask (register P1 "Property Tax"; FRD v1.322). Reached only by declared actions on the appeal answer: "Start an appeal
// case" (a summary action) and the row actions on a case (prepare the packet, record the filing, a response or hearing, a reminder, the decision) and on a
// reminder (done, dismiss). Every write goes through propertyTaxAppealCaseService, the same methods the routes call, behind a review card and a
// confirmation. Cozy prepares and records; it never files with the authority, and each confirmation says so. The service serves the home's primary owner
// only (its case lookup is by homeowner profile), and Ask says that instead of erroring.
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
import { propertyTaxAppealCaseService } from '../../propertyTax/propertyTaxAppealCase.service';
import { propertyTaxAppealReadinessService } from '../../propertyTax/propertyTaxAppealReadiness.service';
import {
  APPEAL_COMMAND_MESSAGES, APPEAL_DETERMINATIONS, APPEAL_DETERMINATION_LABELS, APPEAL_FORM_CAPTURE_KEYS, APPEAL_GROUNDS, APPEAL_GROUND_LABELS,
  APPEAL_KIND_NEEDS_A_CASE_THAT_ALLOWS_IT, APPEAL_REMINDER_ENTITY_TYPE, APPEAL_STATUS_LABELS, PACKET_CHECKLIST_ITEMS, PACKET_PLACEHOLDER_LABELS,
  appealCaseAvailableKinds, appealCommandEntityType, appealCommandKindFromMessage, appealInstant, appealReminderKey, isAppealFormKind, parseAppealFormAnswer,
  type AppealCommandKind, type AppealFormKind, type AppealFormValues,
} from '../support/propertyTaxAppealCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface AppealCommandLaunch { kind: AppealCommandKind; entityId: string; sourceExecutionId: string | null }

const backToAppeal = { id: 'property-tax-appeal-back', label: 'Back to my appeal', interactionType: 'START_WORKFLOW' as const, message: 'Show my property tax appeal readiness', operationId: 'PROPERTY_TAX_APPEAL_READINESS' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'appeal-command-permission', title: 'A contributor or owner can change the appeal', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const primaryOwnerOnly = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'PROPERTY_TAX_APPEAL_PRIMARY_OWNER_ONLY',
  blocks: [{ type: 'SUMMARY', id: 'appeal-command-primary-owner', title: 'Only the home’s primary owner can manage the appeal', body: 'Appeal cases are kept for the home’s primary account holder, so they can’t be changed here. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_PROPERTY_TAX_APPEAL_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'appeal-command-not-routable', title: 'Open your appeal first', body: 'An appeal step is taken from your appeal case. Nothing has changed.', tone: 'DEFAULT', actions: [backToAppeal] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'appeal-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToAppeal] }], suggestions: [],
});

type CaseRow = {
  id: string; title: string; ground: string; status: string; filedAt: Date | null; updatedAt: Date; taxYear: number | null;
  packet: { status: string; narrative: string; completedChecklistJson: unknown; placeholderValuesJson: unknown; updatedAt: Date } | null;
  reminders: Array<{ id: string; title: string; status: string; updatedAt: Date }>;
};
async function loadCase(userId: string, propertyId: string, caseId: string): Promise<CaseRow | null> {
  return database.propertyTaxAppealCase.findFirst({
    where: { id: caseId, propertyId, property: { homeownerProfile: { userId } } },
    select: {
      id: true, title: true, ground: true, status: true, filedAt: true, updatedAt: true, taxYear: true,
      packet: { select: { status: true, narrative: true, completedChecklistJson: true, placeholderValuesJson: true, updatedAt: true } },
      reminders: { select: { id: true, title: true, status: true, updatedAt: true } },
    },
  });
}
async function loadReminder(userId: string, propertyId: string, reminderId: string) {
  return database.propertyTaxAppealReminder.findFirst({
    where: { id: reminderId, case: { propertyId, property: { homeownerProfile: { userId } } } },
    select: { id: true, title: true, status: true, updatedAt: true, caseId: true },
  }) as Promise<{ id: string; title: string; status: string; updatedAt: Date; caseId: string } | null>;
}
const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));

const caseVersion = (c: CaseRow) => sha(`appeal-case:${c.id}:${c.updatedAt.toISOString()}:${c.packet?.updatedAt.toISOString() ?? ''}:${c.reminders.map((r) => `${r.id}${r.status}${r.updatedAt.toISOString()}`).join(',')}`);
const reminderVersion = (r: { id: string; status: string; updatedAt: Date }) => sha(`appeal-reminder:${r.id}:${r.status}:${r.updatedAt.toISOString()}`);
const caseShape = (c: CaseRow) => ({ status: c.status, filedAt: c.filedAt, packetStatus: c.packet?.status ?? null });

const day = (value: unknown) => (typeof value === 'string' ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
const asNumber = (value: unknown) => (typeof value === 'number' ? value : null);

function formCapture(kind: AppealFormKind, contextVersion: string, entered: AppealFormValues = {}, label?: string): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  const select = (key: string, name: string, values: readonly string[], labels: Record<string, string>, required = true) =>
    ({ key, label: name, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
  const date = (key: string, name: string, required = true, allowFuture = false) =>
    ({ key, label: name, required, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture } });
  const shortText = (key: string, name: string, max: number, required = true) => ({ key, label: name, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const longText = (key: string, name: string, max: number, required = true) => ({ key, label: name, required, inputSchema: { type: 'LONG_TEXT' as const, maxLength: max } });
  const amount = (key: string, name: string) => ({ key, label: name, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const yesNo = (key: string, name: string, yes: string, no: string, required = true) =>
    ({ key, label: name, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: [{ label: yes, value: 'YES' }, { label: no, value: 'NO' }] } });
  const forms: Record<AppealFormKind, { title: string; question: string; helpText: string; fields: unknown[] }> = {
    START: {
      title: 'Start a property tax appeal case', question: 'What do you want to appeal?',
      helpText: 'Cozy prepares an appeal from your recorded tax facts and evidence; it does not file anything. If a revised assessment notice reset the deadline, add its date.',
      fields: [select('ground', 'The reason', APPEAL_GROUNDS, APPEAL_GROUND_LABELS), date('revisedNoticeDate', 'Revised notice date (if you got one)', false),
        yesNo('revisedNoticeQualifies', 'Does the revised notice reopen the appeal window?', 'Yes', 'No', false)],
    },
    PACKET: {
      title: `Prepare the packet${label ? ` for ${label}` : ''}`, question: 'Edit the narrative, tick what you have done, and say whether you have reviewed it.',
      helpText: 'Mark the packet reviewed only when you have checked every fact against the official form. It becomes ready to file only when every step is ticked, every blank below is filled and you have reviewed it.',
      fields: [longText('narrative', 'Narrative', 20_000),
        { key: 'checklist', label: 'Steps you have done', required: false, inputSchema: { type: 'MULTI_SELECT' as const, options: PACKET_CHECKLIST_ITEMS.map((item) => ({ label: item.label, value: item.code })), maxItems: 5 } },
        ...Object.entries(PACKET_PLACEHOLDER_LABELS).map(([key, name]) => shortText(key, name, 2000, false)),
        yesNo('reviewed', 'Have you reviewed this packet?', 'Yes, I have reviewed it', 'Not yet')],
    },
    FILING: {
      title: `Record the filing${label ? ` of ${label}` : ''}`, question: 'When did you file, and what is the confirmation number?',
      helpText: 'File on the official site first. This only records that you did; Cozy does not file for you.',
      fields: [date('filedOn', 'Filed on'), shortText('externalReference', 'Confirmation or reference number', 500)],
    },
    EVENT: {
      title: `Record a response or hearing${label ? ` for ${label}` : ''}`, question: 'What happened?',
      helpText: 'Record a response you received, or a hearing that was scheduled.',
      fields: [select('type', 'What happened', ['RESPONSE_RECEIVED', 'HEARING_SCHEDULED'], { RESPONSE_RECEIVED: 'I received a response', HEARING_SCHEDULED: 'A hearing was scheduled' }),
        date('occurredOn', 'Date (of the response, or of the hearing)', true, true), longText('summary', 'What it says', 2000), shortText('hearingLocation', 'Hearing location (if any)', 500, false)],
    },
    REMINDER_ADD: {
      title: `Add a reminder${label ? ` to ${label}` : ''}`, question: 'What should you be reminded to do, and by when?',
      helpText: 'A reminder with the same title replaces the earlier one.', fields: [shortText('title', 'Reminder', 200), date('dueOn', 'Due on', true, true)],
    },
    DETERMINATION: {
      title: `Record the decision${label ? ` on ${label}` : ''}`, question: 'What did the authority decide?',
      helpText: 'Enter the decision as the authority wrote it. Leave an amount blank if it does not apply; a blank is not recorded as zero.',
      fields: [select('determination', 'The decision', APPEAL_DETERMINATIONS, APPEAL_DETERMINATION_LABELS), date('determinedOn', 'Decision date'),
        shortText('reference', 'Decision reference', 500), longText('summary', 'What it says', 2000),
        amount('finalAssessedValue', 'Final assessed value ($)'), amount('refundAmount', 'Refund ($)'), amount('creditAmount', 'Credit ($)'),
        yesNo('closeCase', 'Is this case finished?', 'Yes, close the case', 'No, keep it open')],
    },
  };
  const spec = forms[kind];
  return {
    requirementId: `property-tax-appeal-${kind.toLowerCase()}-inputs`, captureKey: APPEAL_FORM_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: spec.helpText,
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this step; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

const NOT_FILED = 'Cozy does not file anything with the authority. This only records what you did.';

/** The review: what the household said, in plain terms, and what the step does and does not do. */
function review(kind: AppealFormKind, v: AppealFormValues, label: string): { title: string; description: string; confirmLabel: string; fields: Array<{ label: string; value: string }> } {
  const row = (name: string, value: string | null) => (value ? [{ label: name, value }] : []);
  const cash = (value: unknown) => (asNumber(value) === null ? null : money(asNumber(value) as number));
  if (kind === 'START') {
    return {
      title: 'Start this appeal case?', confirmLabel: 'Start the case',
      description: `Cozy starts preparing an appeal from your recorded tax facts and evidence. Nothing is filed, and starting a case does not predict that an appeal will succeed. ${NOT_FILED}`,
      fields: [{ label: 'Reason', value: APPEAL_GROUND_LABELS[String(v.ground)] ?? String(v.ground) }, ...row('Revised notice', day(v.revisedNoticeDate))],
    };
  }
  if (kind === 'PACKET') {
    const done = new Set((v.checklist as string[] | undefined) ?? []);
    const allSteps = PACKET_CHECKLIST_ITEMS.every((item) => done.has(item.code));
    const blanks = Object.keys(PACKET_PLACEHOLDER_LABELS).filter((key) => !String(v[key] ?? '').trim());
    const ready = allSteps && !blanks.length && v.reviewed === 'YES';
    return {
      title: `Save the packet for ${label}?`, confirmLabel: 'Save the packet',
      description: ready
        ? `This marks the packet ready for you to file on the official site. ${NOT_FILED}`
        : `This saves your progress. The packet is not ready to file until every step is done, every blank is filled and you have reviewed it. ${NOT_FILED}`,
      fields: [
        { label: 'Steps done', value: `${done.size} of ${PACKET_CHECKLIST_ITEMS.length}` },
        { label: 'Blanks still open', value: blanks.length ? blanks.map((key) => PACKET_PLACEHOLDER_LABELS[key as keyof typeof PACKET_PLACEHOLDER_LABELS]).join(', ') : 'None' },
        { label: 'Reviewed', value: v.reviewed === 'YES' ? 'Yes' : 'Not yet' }, { label: 'Result', value: ready ? 'Ready to file' : 'Saved as in progress' },
      ],
    };
  }
  if (kind === 'FILING') {
    return {
      title: `Record the filing of ${label}?`, confirmLabel: 'Record the filing',
      description: `This records that you filed the appeal on the official site and starts tracking the response. ${NOT_FILED}`,
      fields: [{ label: 'Filed on', value: day(v.filedOn) ?? String(v.filedOn) }, { label: 'Reference', value: String(v.externalReference) }],
    };
  }
  if (kind === 'EVENT') {
    return {
      title: v.type === 'HEARING_SCHEDULED' ? 'Record the hearing?' : 'Record the response?', confirmLabel: 'Record it',
      description: 'This adds it to the appeal’s timeline and the home’s history. Your reply or attendance is not handled by Cozy.',
      fields: [{ label: 'What happened', value: v.type === 'HEARING_SCHEDULED' ? 'A hearing was scheduled' : 'A response was received' }, { label: 'Date', value: day(v.occurredOn) ?? String(v.occurredOn) },
        { label: 'Summary', value: String(v.summary) }, ...row('Location', typeof v.hearingLocation === 'string' ? v.hearingLocation : null)],
    };
  }
  if (kind === 'REMINDER_ADD') {
    return { title: 'Add this reminder?', confirmLabel: 'Add the reminder', description: 'The reminder is kept with the appeal case.', fields: [{ label: 'Reminder', value: String(v.title) }, { label: 'Due', value: day(v.dueOn) ?? String(v.dueOn) }] };
  }
  return {
    title: `Record the decision on ${label}?`, confirmLabel: 'Record the decision',
    description: `This records the decision as you entered it${v.closeCase === 'YES' ? ' and closes the case' : ''}. Cozy does not check it against the authority’s record.`,
    fields: [
      { label: 'Decision', value: APPEAL_DETERMINATION_LABELS[String(v.determination)] ?? String(v.determination) }, { label: 'Decision date', value: day(v.determinedOn) ?? String(v.determinedOn) },
      { label: 'Reference', value: String(v.reference) }, { label: 'Summary', value: String(v.summary) },
      ...row('Final assessed value', cash(v.finalAssessedValue)), ...row('Refund', cash(v.refundAmount)), ...row('Credit', cash(v.creditAmount)),
      { label: 'Case', value: v.closeCase === 'YES' ? 'Closed' : 'Kept open' },
    ],
  };
}

export async function appealCommandResult(userId: string, propertyId: string, launch: AppealCommandLaunch, supplied?: AppealFormValues): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!await isPrimaryOwner(userId, propertyId)) return primaryOwnerOnly();
  const kind = launch.kind;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { propertyTaxAppealLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };
  const confirmation = (id: string, spec: ReturnType<typeof review>) => ({
    confirmationId: `property-tax-appeal-${id}-1`, version: 1, title: spec.title, description: spec.description, fields: spec.fields, editableFields: [] as never[],
    confirmLabel: spec.confirmLabel, consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });

  // A reminder's done / dismiss: no form, a direct review.
  if (kind === 'REMINDER_DONE' || kind === 'REMINDER_DISMISS') {
    const reminder = await loadReminder(userId, propertyId, launch.entityId);
    if (!reminder || reminder.status !== 'PENDING') return unavailable('APPEAL_REMINDER_NOT_PENDING', 'That reminder is not open', 'Ask could not find an open reminder. Nothing has changed.');
    const contextVersion = reminderVersion(reminder);
    const done = kind === 'REMINDER_DONE';
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: `APPEAL_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
      parameters: { appealCommand: { kind, entityId: reminder.id }, appealContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'appeal-reminder-review', title: `${done ? 'Mark done' : 'Dismiss'}: ${reminder.title}`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`${kind.toLowerCase()}-${sha(reminder.id).slice(0, 12)}`, {
        title: `${done ? 'Mark this reminder done' : 'Dismiss this reminder'}?`, confirmLabel: done ? 'Mark done' : 'Dismiss',
        description: done ? 'The reminder is kept as completed.' : 'The reminder is dismissed and will not come up again.', fields: [{ label: 'Reminder', value: reminder.title }],
      }),
      suggestions: [],
    };
  }

  if (kind === 'START') {
    const latest = await database.propertyTaxAppealCase.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
    const contextVersion = sha(`appeal-start:${propertyId}:${latest?.updatedAt?.toISOString() ?? ''}`);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'APPEAL_START_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'appeal-start-input', title: 'Start a property tax appeal case', body: 'Nothing has been saved yet. Choose what you want to appeal; Ask checks it is ready before it starts.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('START', contextVersion)], suggestions: [],
      };
    }
    const readiness: any = await propertyTaxAppealReadinessService.evaluate(propertyId, userId, supplied.ground as 'ASSESSED_VALUE' | 'TAX_CLASS' | 'EXEMPTION', new Date(), {
      revisedNoticeDate: typeof supplied.revisedNoticeDate === 'string' ? supplied.revisedNoticeDate : undefined,
      revisedNoticeQualifies: supplied.revisedNoticeQualifies === 'YES' ? true : supplied.revisedNoticeQualifies === 'NO' ? false : undefined,
    });
    if (readiness.status !== 'READY') {
      const gaps: string[] = Array.isArray(readiness.gaps) ? readiness.gaps : [];
      return {
        status: 'READY_WITH_LIMITATIONS', reasonCode: `PROPERTY_TAX_APPEAL_NOT_READY_${String(readiness.status)}`, contextVersion,
        blocks: [{
          type: 'SUMMARY', id: 'appeal-start-not-ready', title: 'This appeal cannot be started yet',
          body: `${readiness.reason ?? 'The recorded tax facts and evidence are not enough to prepare this appeal.'}${gaps.length ? ` Still needed: ${gaps.join('; ')}.` : ''} Nothing has been saved.`,
          tone: 'CAUTION', actions: [backToAppeal],
        }],
        suggestions: [],
      };
    }
    const spec = review('START', supplied, '');
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'APPEAL_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { appealForm: supplied, appealCommand: { kind, entityId: propertyId }, appealContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'appeal-start-review', title: 'Review before starting', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`start-${sha(`${propertyId}:${JSON.stringify(supplied)}`).slice(0, 12)}`, {
        ...spec, fields: [...spec.fields, ...(readiness.ruleProfile?.title ? [{ label: 'Jurisdiction rule', value: String(readiness.ruleProfile.title) }] : [])],
      }),
      captureRequests: [formCapture('START', contextVersion, supplied)], suggestions: [],
    };
  }

  const appealCase = await loadCase(userId, propertyId, launch.entityId);
  if (!appealCase) return unavailable('APPEAL_CASE_NOT_FOUND', 'That appeal case is no longer available', 'Ask could not find that appeal case. Nothing has changed.');
  if (!appealCaseAvailableKinds(caseShape(appealCase)).includes(kind)) return unavailable('APPEAL_STEP_NOT_AVAILABLE', 'That step is not available now', APPEAL_KIND_NEEDS_A_CASE_THAT_ALLOWS_IT);
  const contextVersion = caseVersion(appealCase);
  const formKind = kind as AppealFormKind;
  if (!isAppealFormKind(kind)) return notRoutable();
  const current: AppealFormValues = kind === 'PACKET' && appealCase.packet ? {
    narrative: appealCase.packet.narrative, checklist: Array.isArray(appealCase.packet.completedChecklistJson) ? appealCase.packet.completedChecklistJson : [],
    ...((appealCase.packet.placeholderValuesJson && typeof appealCase.packet.placeholderValuesJson === 'object') ? appealCase.packet.placeholderValuesJson as Record<string, unknown> : {}),
  } : {};
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `APPEAL_${kind}_INPUT_REQUIRED`, contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'appeal-step-input', title: appealCase.title, body: `${APPEAL_STATUS_LABELS[appealCase.status] ?? appealCase.status}. Nothing has been saved yet; you will review it before it is.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, current, appealCase.title)], suggestions: [],
    };
  }
  const spec = review(formKind, supplied, appealCase.title);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `APPEAL_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { appealForm: supplied, appealCommand: { kind, entityId: appealCase.id }, appealContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'appeal-step-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: confirmation(`${kind.toLowerCase()}-${sha(`${appealCase.id}:${JSON.stringify(supplied)}`).slice(0, 12)}`, spec),
    captureRequests: [formCapture(formKind, contextVersion, supplied, appealCase.title)], suggestions: [],
  };
}

registerCapabilityHandler('property-tax.appeal-command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = appealCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'PROPERTY_TAX_APPEAL_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  if (launch.entityType !== appealCommandEntityType(kind)) return notRoutable();
  return appealCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmAppealCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.appealCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as AppealCommandKind | undefined;
  if (!kind || !(kind in APPEAL_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = command.entityId;
  if (!await isPrimaryOwner(userId, propertyId)) throw stale('Only the home’s primary owner can change the appeal.', 'ASK_PERMISSION_REQUIRED');
  let title: string; let description: string; let artifactId = entityId;
  try {
    if (kind === 'REMINDER_DONE' || kind === 'REMINDER_DISMISS') {
      const reminder = await loadReminder(userId, propertyId, entityId);
      if (!reminder || reminder.status !== 'PENDING') throw stale('That reminder is no longer open.');
      if (parameters.appealContextVersion !== reminderVersion(reminder)) throw stale('This reminder changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await propertyTaxAppealCaseService.decideReminder({ caseId: reminder.caseId, propertyId, userId, reminderId: reminder.id, status: kind === 'REMINDER_DONE' ? 'COMPLETED' : 'DISMISSED' });
      title = kind === 'REMINDER_DONE' ? 'Reminder marked done' : 'Reminder dismissed'; description = 'It is updated on the appeal case.';
    } else {
      if (!isAppealFormKind(kind)) throw stale('The change to make is invalid.');
      const checked = parseAppealFormAnswer(kind, parameters.appealForm);
      if (!checked.success) throw stale('The details to save are invalid.');
      const v = checked.data;
      if (kind === 'START') {
        const latest = await database.propertyTaxAppealCase.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
        if (parameters.appealContextVersion !== sha(`appeal-start:${propertyId}:${latest?.updatedAt?.toISOString() ?? ''}`)) {
          throw stale('The appeal cases changed while the confirmation was open. Review again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
        }
        const created = await propertyTaxAppealCaseService.createOrResume({
          propertyId, userId, ground: v.ground as 'ASSESSED_VALUE' | 'TAX_CLASS' | 'EXEMPTION',
          ...(typeof v.revisedNoticeDate === 'string' ? { revisedNoticeDate: v.revisedNoticeDate } : {}),
          ...(v.revisedNoticeQualifies === 'YES' ? { revisedNoticeQualifies: true } : v.revisedNoticeQualifies === 'NO' ? { revisedNoticeQualifies: false } : {}),
        });
        artifactId = (created as { id: string }).id;
        title = 'Appeal case started'; description = 'Prepare the packet next. Nothing has been filed.';
      } else {
        const appealCase = await loadCase(userId, propertyId, entityId);
        if (!appealCase) throw stale('That appeal case is no longer available.');
        if (parameters.appealContextVersion !== caseVersion(appealCase)) throw stale('This appeal case changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
        if (!appealCaseAvailableKinds(caseShape(appealCase)).includes(kind)) throw stale(APPEAL_KIND_NEEDS_A_CASE_THAT_ALLOWS_IT);
        const common = { caseId: appealCase.id, propertyId, userId };
        if (kind === 'PACKET') {
          const placeholderValues = Object.fromEntries(Object.keys(PACKET_PLACEHOLDER_LABELS).map((key) => [key, String(v[key] ?? '')]).filter(([, value]) => value));
          await propertyTaxAppealCaseService.updatePacket({
            ...common, narrative: String(v.narrative), completedChecklist: (v.checklist as string[] | undefined) ?? [], placeholderValues, homeownerReviewed: v.reviewed === 'YES',
          });
          title = 'Packet saved'; description = 'Open it again to finish any step that is still open. Nothing has been filed.';
        } else if (kind === 'FILING') {
          await propertyTaxAppealCaseService.confirmExternalFiling({
            ...common, role: ctx.access.role as HouseholdRole, filedAt: new Date(appealInstant(String(v.filedOn))), externalReference: String(v.externalReference),
          });
          title = 'Filing recorded'; description = 'The appeal is now tracked as awaiting a response.';
        } else if (kind === 'EVENT') {
          await propertyTaxAppealCaseService.recordTrackingEvent({
            ...common, type: v.type as 'RESPONSE_RECEIVED' | 'HEARING_SCHEDULED', occurredAt: new Date(appealInstant(String(v.occurredOn))), summary: String(v.summary),
            ...(typeof v.hearingLocation === 'string' && v.hearingLocation ? { hearingLocation: v.hearingLocation } : {}),
          });
          title = v.type === 'HEARING_SCHEDULED' ? 'Hearing recorded' : 'Response recorded'; description = 'It is on the appeal’s timeline.';
        } else if (kind === 'REMINDER_ADD') {
          await propertyTaxAppealCaseService.upsertReminder({ ...common, reminderKey: appealReminderKey(String(v.title), sha), title: String(v.title), dueAt: new Date(`${String(v.dueOn)}T12:00:00.000Z`) });
          title = 'Reminder added'; description = 'It is kept with the appeal case.';
        } else {
          await propertyTaxAppealCaseService.recordDetermination({
            ...common, determination: v.determination as (typeof APPEAL_DETERMINATIONS)[number], determinationAt: new Date(appealInstant(String(v.determinedOn))),
            reference: String(v.reference), summary: String(v.summary),
            ...(asNumber(v.finalAssessedValue) !== null ? { finalAssessedValue: asNumber(v.finalAssessedValue) as number } : {}),
            ...(asNumber(v.refundAmount) !== null ? { refundAmount: asNumber(v.refundAmount) as number } : {}),
            ...(asNumber(v.creditAmount) !== null ? { creditAmount: asNumber(v.creditAmount) as number } : {}),
            closeCase: v.closeCase === 'YES',
          });
          title = 'Decision recorded'; description = v.closeCase === 'YES' ? 'The case is closed.' : 'The case is kept open.';
        }
        artifactId = appealCase.id;
      }
    }
  } catch (error) {
    // The service's own refusals are written for a person ("Packet must be ready before external filing can be confirmed"); coded errors pass through.
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `PROPERTY_TAX_APPEAL_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `appeal-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToAppeal, label: 'See my appeal', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `appeal-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'PROPERTY_TAX_APPEAL_CASE', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('property-tax.appeal-command', confirmAppealCommand);
