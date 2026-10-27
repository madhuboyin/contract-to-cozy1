// Home Record state inside Ask (register P2 "Documents and Home Records"; FRD v1.350). Reached only by the declared row actions on a Home Record in the
// document answer. The writes are HomeRecordsService's own archive, setVerification and setEffectivePeriod (the routes' calls), behind a review and a
// confirmation bound to the record's state. The service applies record-level visibility; the command re-reads the record before it offers or applies.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { homeRecordsService } from '../../homeRecords.service';
import {
  HOME_RECORD_ACTION_IDS, HOME_RECORD_CAPTURE_KEYS, HOME_RECORD_ENTITY_TYPE, HOME_RECORD_MESSAGES, LEGAL_HOLD_LABELS, TRASH_IMPACT_LABELS, VERIFICATION_LABELS, homeRecordKindFromMessage, parseHomeRecordAnswer,
  type HomeRecordFormKind, type HomeRecordKind,
} from '../support/homeRecordStateCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'home-record-back', label: 'Back to my documents', interactionType: 'START_WORKFLOW' as const, message: 'Show my documents', operationId: 'DOCUMENT_LOOKUP' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-record-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

interface RecordView { id: string; title: string; lifecycleStatus: string; verificationStatus: string; verificationNotes: string | null; effectiveFrom: string | Date | null; effectiveTo: string | Date | null; updatedAt: string | Date; legalHoldReason?: string | null; retainUntil?: string | Date | null; links?: unknown[] }
async function load(propertyId: string, recordId: string, role: HouseholdRole): Promise<RecordView | null> {
  try { return await homeRecordsService.get(propertyId, recordId, role) as unknown as RecordView; } catch { return null; }
}
const version = (r: RecordView) => sha(`home-record:${r.id}:${r.lifecycleStatus}:${r.verificationStatus}:${iso(r.effectiveFrom)}:${iso(r.effectiveTo)}:${iso(r.updatedAt)}:${r.legalHoldReason ?? ''}:${iso(r.retainUntil)}:${r.links?.length ?? 0}`);
const day = (value: unknown) => (value ? humanDate(new Date(value as string)) ?? 'Not set' : 'Not set');

function formCapture(kind: HomeRecordFormKind, contextVersion: string, record: RecordView, entered?: Record<string, unknown>): AskCaptureRequest {
  const dateField = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const spec = kind === 'TRASH'
    ? { title: `${record.title} is used as evidence`, question: `It has ${record.links?.length ?? 0} link${record.links?.length === 1 ? '' : 's'} to other records. What should happen to them?`, seed: {},
      fields: [{ key: 'impact', label: 'Its links', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(TRASH_IMPACT_LABELS).map(([value, label]) => ({ label, value })) } }] }
    : kind === 'RETENTION'
    ? { title: `Retention for ${record.title}`, question: 'A legal hold stops the record from ever being permanently removed. A keep-until date does the same until that day.', seed: { legalHold: 'NO_CHANGE' },
      fields: [
        { key: 'legalHold', label: 'Legal hold', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(LEGAL_HOLD_LABELS).map(([value, label]) => ({ label, value })) } },
        { key: 'reason', label: 'Why it is on hold', helpText: 'Needed when placing a hold.', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 500 } },
        dateField('retainUntil', 'Keep until'),
      ] }
    : kind === 'VERIFICATION'
    ? { title: `Have you verified ${record.title}?`, question: 'Choose where it stands.', seed: { status: record.verificationStatus },
      fields: [
        { key: 'status', label: 'Verification', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(VERIFICATION_LABELS).map(([value, label]) => ({ label, value })) } },
        { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1000 } },
      ] }
    : { title: `When is ${record.title} in effect?`, question: 'Leave a date blank to keep it.', seed: {}, fields: [dateField('effectiveFrom', 'In effect from'), dateField('effectiveTo', 'In effect until')] };
  return {
    requirementId: `home-record-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: HOME_RECORD_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function homeRecordStateResult(
  userId: string, propertyId: string, launch: { kind: HomeRecordKind; entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-record-permission', title: 'A contributor or owner can change a record', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const record = await load(propertyId, launch.entityId, access.role);
  if (!record) return unavailable('HOME_RECORD_NOT_FOUND', 'That record is no longer available', 'Ask could not find that record. Nothing has changed.');
  if (kind === 'RESTORE' ? record.lifecycleStatus !== 'TRASHED' : record.lifecycleStatus === 'TRASHED') {
    return unavailable(kind === 'RESTORE' ? 'HOME_RECORD_NOT_TRASHED' : 'HOME_RECORD_TRASHED', kind === 'RESTORE' ? 'That record is not in the trash' : 'That record is in the trash', 'Nothing has changed.');
  }
  if (kind === 'RETENTION' && access.role !== HouseholdRole.OWNER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'home-record-retention-owner', title: 'Only an owner can set retention or a legal hold', body: 'Your role can change this record but not how long it is kept. Nothing has changed.', tone: 'DEFAULT', actions: [back] }], suggestions: [] };
  }
  if (kind === 'ARCHIVE' && record.lifecycleStatus !== 'ACTIVE') return unavailable('HOME_RECORD_NOT_ACTIVE', 'That record is already archived', 'Nothing has changed.');
  const contextVersion = version(record);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `home-record-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel,
    consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  const here = { entityType: HOME_RECORD_ENTITY_TYPE, entityId: record.id, operationId: 'HOME_RECORD_STATE_COMMAND' as const, interactionType: 'START_WORKFLOW' as const };
  if (kind === 'OPTIONS') {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_RECORD_OPTIONS_READY', contextVersion,
      blocks: [{
        type: 'SUMMARY', id: 'home-record-options', title: `More for ${record.title}`, tone: 'DEFAULT',
        body: `Moving a record to the trash keeps it for 30 days so you can restore it${access.role === HouseholdRole.OWNER ? '; a legal hold or keep-until date stops it from ever being permanently removed' : ''}. Nothing changes until you confirm.`,
        actions: [
          { id: HOME_RECORD_ACTION_IDS.TRASH, label: 'Move to trash', message: HOME_RECORD_MESSAGES.TRASH, style: 'SECONDARY' as const, ...here },
          ...(access.role === HouseholdRole.OWNER ? [{ id: HOME_RECORD_ACTION_IDS.RETENTION, label: 'Retention or legal hold', message: HOME_RECORD_MESSAGES.RETENTION, style: 'SECONDARY' as const, ...here }] : []),
          back,
        ],
      }],
      suggestions: [],
    };
  }
  const linkCount = record.links?.length ?? 0;
  if (kind === 'RESTORE' || kind === 'ARCHIVE' || (kind === 'TRASH' && linkCount === 0)) {
    const copy = kind === 'RESTORE'
      ? { id: 'restore', title: 'Restore this record?', description: 'It returns to your active records with its versions. Links that were removed are not brought back.', confirm: 'Restore it', state: 'Trash → Active', review: `Restore ${record.title}?` }
      : kind === 'TRASH'
        ? { id: 'trash', title: 'Move this record to the trash?', description: 'It leaves your records but is kept for 30 days, and you can restore it until then. After that it can be permanently removed unless a hold or keep-until date applies.', confirm: 'Move to trash', state: `${record.lifecycleStatus === 'ARCHIVED' ? 'Archived' : 'Active'} → Trash`, review: `Move ${record.title} to the trash?` }
        : { id: 'archive', title: 'Archive this record?', description: 'It moves out of your active records but is kept, with its versions and links. It is not deleted.', confirm: 'Archive it', state: 'Active → Archived', review: `Archive ${record.title}?` };
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_RECORD_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
      parameters: { homeRecordCommand: { kind, entityId: record.id }, homeRecordContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: `home-record-${copy.id}-review`, title: copy.review, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`${copy.id}-${sha(record.id).slice(0, 12)}`, copy.title, copy.description, copy.confirm, [{ label: 'Record', value: record.title }, { label: 'State', value: copy.state }]),
      suggestions: [],
    };
  }
  const formKind = kind as HomeRecordFormKind;
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `HOME_RECORD_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { homeRecordLaunch: { kind, entityId: record.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'home-record-input', title: record.title, body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, record)], suggestions: [],
    };
  }
  const parsed = parseHomeRecordAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('HOME_RECORD_INPUT_INVALID', 'Check the details', 'Fill in what the form asks for. Nothing has changed.');
  const d = parsed.data;
  let spec: ReturnType<typeof confirmation>;
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  if (formKind === 'TRASH') {
    spec = confirmation(id, 'Move this record to the trash?', d.impact === 'REMOVE_LINKS'
      ? `It leaves your records and ${linkCount} link${linkCount === 1 ? '' : 's'} to it will be removed. It is kept for 30 days, but removed links are not brought back if you restore it.`
      : `It leaves your records and its ${linkCount} link${linkCount === 1 ? '' : 's'} stay in place. It is kept for 30 days and you can restore it until then.`,
      'Move to trash', [{ label: 'Record', value: record.title }, { label: 'Its links', value: TRASH_IMPACT_LABELS[d.impact!] }]);
  } else if (formKind === 'RETENTION') {
    spec = confirmation(id, d.legalHold === 'HOLD' ? 'Place a legal hold?' : d.legalHold === 'RELEASE' ? 'Release the legal hold?' : 'Set how long to keep it?',
      'A hold or keep-until date stops the record from being permanently removed. It does not change the record itself. Ask did not review any legal requirement.',
      'Save it', [
        { label: 'Record', value: record.title },
        ...(d.legalHold !== 'NO_CHANGE' ? [{ label: 'Legal hold', value: `${record.legalHoldReason ? 'On hold' : 'No hold'} → ${d.legalHold === 'HOLD' ? `On hold: ${d.reason}` : 'No hold'}` }] : []),
        ...(d.retainUntil ? [{ label: 'Keep until', value: `${day(record.retainUntil)} → ${day(`${d.retainUntil}T12:00:00.000Z`)}` }] : []),
      ]);
  } else if (formKind === 'VERIFICATION') {
    spec = confirmation(id, 'Record this verification?',
      d.status === 'VERIFIED' ? 'This records that you checked this record yourself. Ask did not read or verify it.' : 'This records your own note about the record. Ask did not read or verify it.',
      'Record it', [{ label: 'Record', value: record.title }, { label: 'Verification', value: `${VERIFICATION_LABELS[record.verificationStatus] ?? record.verificationStatus} → ${VERIFICATION_LABELS[d.status!]}` }]);
  } else {
    const from = d.effectiveFrom ?? (record.effectiveFrom ? new Date(record.effectiveFrom as string).toISOString().slice(0, 10) : undefined);
    const to = d.effectiveTo ?? (record.effectiveTo ? new Date(record.effectiveTo as string).toISOString().slice(0, 10) : undefined);
    if (from && to && to < from) return unavailable('HOME_RECORD_INPUT_INVALID', 'The end is before the start', 'Choose an end date on or after the start. Nothing has changed.');
    spec = confirmation(id, 'Set the period it is in effect?', 'This records when the record applies, for example a policy or a warranty term.', 'Save the period', [
      ...(d.effectiveFrom ? [{ label: 'In effect from', value: `${day(record.effectiveFrom)} → ${day(`${d.effectiveFrom}T12:00:00.000Z`)}` }] : []),
      ...(d.effectiveTo ? [{ label: 'In effect until', value: `${day(record.effectiveTo)} → ${day(`${d.effectiveTo}T12:00:00.000Z`)}` }] : []),
    ]);
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_RECORD_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { homeRecordCommand: { kind, entityId: record.id }, homeRecordForm: supplied, homeRecordContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'home-record-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: spec, captureRequests: [formCapture(formKind, contextVersion, record, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('home-record-state.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = homeRecordKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'HOME_RECORD_STATE_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== HOME_RECORD_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_HOME_RECORD_STATE_NOT_DIRECTLY_ROUTABLE', 'Open your documents first', 'A record is changed from your documents. Nothing has changed.');
  }
  return homeRecordStateResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmHomeRecordState(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.homeRecordCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as HomeRecordKind | undefined;
  if (!kind || !(kind in HOME_RECORD_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const role = (await ensurePropertyAccess(userId, propertyId)).role;
  let title: string;
  try {
    const record = await load(propertyId, command.entityId, role);
    if (!record || (kind === 'RESTORE' ? record.lifecycleStatus !== 'TRASHED' : record.lifecycleStatus === 'TRASHED')) throw stale('That record is no longer available.');
    if (parameters.homeRecordContextVersion !== version(record)) throw stale('This record changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'OPTIONS') throw stale('The change to make is invalid.');
    if (kind === 'RETENTION' && role !== HouseholdRole.OWNER) throw Object.assign(new Error('Only an owner can set retention or a legal hold. Nothing was changed.'), { code: 'ASK_PERMISSION_REQUIRED' });
    if (kind === 'RESTORE') {
      await homeRecordsService.restore(propertyId, record.id, role);
      title = 'Record restored';
    } else if (kind === 'TRASH') {
      const parsed = (record.links?.length ?? 0) > 0 ? parseHomeRecordAnswer('TRASH', parameters.homeRecordForm) : null;
      if (parsed && !parsed.success) throw stale('The details to save are invalid.');
      await homeRecordsService.trash({ propertyId, recordId: record.id, userId, role, ...(parsed?.success ? { impactDecision: parsed.data.impact as 'KEEP_LINKS' | 'REMOVE_LINKS' } : {}) });
      title = 'Record moved to the trash';
    } else if (kind === 'RETENTION') {
      const parsed = parseHomeRecordAnswer('RETENTION', parameters.homeRecordForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data;
      await homeRecordsService.setRetention({
        propertyId, recordId: record.id, role,
        ...(d.legalHold === 'HOLD' ? { legalHoldReason: d.reason } : d.legalHold === 'RELEASE' ? { legalHoldReason: null } : {}),
        ...(d.retainUntil ? { retainUntil: new Date(`${d.retainUntil}T12:00:00.000Z`) } : {}),
      });
      title = 'Retention saved';
    } else if (kind === 'ARCHIVE') {
      if (record.lifecycleStatus !== 'ACTIVE') throw stale('That record is not active.');
      await homeRecordsService.archive(propertyId, record.id, role);
      title = 'Record archived';
    } else {
      const parsed = parseHomeRecordAnswer(kind, parameters.homeRecordForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data;
      if (kind === 'VERIFICATION') {
        await homeRecordsService.setVerification({ propertyId, recordId: record.id, userId, role, status: d.status as never, notes: d.notes ?? null });
        title = 'Verification recorded';
      } else {
        await homeRecordsService.setEffectivePeriod({
          propertyId, recordId: record.id, role,
          ...(d.effectiveFrom ? { effectiveFrom: new Date(`${d.effectiveFrom}T12:00:00.000Z`) } : {}),
          ...(d.effectiveTo ? { effectiveTo: new Date(`${d.effectiveTo}T12:00:00.000Z`) } : {}),
        });
        title = 'Period saved';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_RECORD_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-record-${kind.toLowerCase()}-${command.entityId}`, title, status: 'COMPLETED', description: kind === 'TRASH' ? 'It is in the trash for 30 days. Nothing has been permanently removed.' : 'It is on the home record. Nothing was deleted.', details: [], actions: [...(kind === 'TRASH' ? [{ id: HOME_RECORD_ACTION_IDS.RESTORE, label: 'Undo: restore it', message: HOME_RECORD_MESSAGES.RESTORE, entityType: HOME_RECORD_ENTITY_TYPE, entityId: command.entityId as string, operationId: 'HOME_RECORD_STATE_COMMAND' as const, interactionType: 'START_WORKFLOW' as const, style: 'SECONDARY' as const }] : []), { ...back, label: 'See my documents', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `home-record-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'PROPERTY_RECORD', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-record-state.command', confirmHomeRecordState);
