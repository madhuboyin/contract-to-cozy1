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
  HOME_RECORD_CAPTURE_KEYS, HOME_RECORD_ENTITY_TYPE, HOME_RECORD_MESSAGES, VERIFICATION_LABELS, homeRecordKindFromMessage, parseHomeRecordAnswer,
  type HomeRecordFormKind, type HomeRecordKind,
} from '../support/homeRecordStateCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'home-record-back', label: 'Back to my documents', interactionType: 'START_WORKFLOW' as const, message: 'Show my documents', operationId: 'DOCUMENT_LOOKUP' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'home-record-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');

interface RecordView { id: string; title: string; lifecycleStatus: string; verificationStatus: string; verificationNotes: string | null; effectiveFrom: string | Date | null; effectiveTo: string | Date | null; updatedAt: string | Date }
async function load(propertyId: string, recordId: string, role: HouseholdRole): Promise<RecordView | null> {
  try { return await homeRecordsService.get(propertyId, recordId, role) as unknown as RecordView; } catch { return null; }
}
const version = (r: RecordView) => sha(`home-record:${r.id}:${r.lifecycleStatus}:${r.verificationStatus}:${iso(r.effectiveFrom)}:${iso(r.effectiveTo)}:${iso(r.updatedAt)}`);
const day = (value: unknown) => (value ? humanDate(new Date(value as string)) ?? 'Not set' : 'Not set');

function formCapture(kind: HomeRecordFormKind, contextVersion: string, record: RecordView, entered?: Record<string, unknown>): AskCaptureRequest {
  const dateField = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const spec = kind === 'VERIFICATION'
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
  if (record.lifecycleStatus === 'TRASHED') return unavailable('HOME_RECORD_TRASHED', 'That record is in the trash', 'Nothing has changed.');
  if (kind === 'ARCHIVE' && record.lifecycleStatus !== 'ACTIVE') return unavailable('HOME_RECORD_NOT_ACTIVE', 'That record is already archived', 'Nothing has changed.');
  const contextVersion = version(record);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `home-record-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel,
    consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
  });
  if (kind === 'ARCHIVE') {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_RECORD_ARCHIVE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { homeRecordCommand: { kind, entityId: record.id }, homeRecordContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'home-record-archive-review', title: `Archive ${record.title}?`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`archive-${sha(record.id).slice(0, 12)}`, 'Archive this record?',
        'It moves out of your active records but is kept, with its versions and links. It is not deleted.', 'Archive it', [{ label: 'Record', value: record.title }, { label: 'State', value: 'Active → Archived' }]),
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
  if (formKind === 'VERIFICATION') {
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
    if (!record || record.lifecycleStatus === 'TRASHED') throw stale('That record is no longer available.');
    if (parameters.homeRecordContextVersion !== version(record)) throw stale('This record changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (kind === 'ARCHIVE') {
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
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-record-${kind.toLowerCase()}-${command.entityId}`, title, status: 'COMPLETED', description: 'It is on the home record. Nothing was deleted.', details: [], actions: [{ ...back, label: 'See my documents', style: 'PRIMARY' as const }] }],
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
