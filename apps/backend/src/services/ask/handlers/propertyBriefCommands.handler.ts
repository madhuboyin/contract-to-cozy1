import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { z } from 'zod';
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { PROPERTY_BRIEF_PURPOSES, PROPERTY_BRIEF_SECTIONS, PROPERTY_BRIEF_TEMPLATES, createPropertyBriefSchema, createPropertyBriefShareSchema } from '../../../propertyBrief/propertyBrief.contracts';
import { createPropertyBrief, createPropertyBriefShare, getPropertyBriefPreview, listEligiblePropertyBriefDocuments, republishPropertyBrief, revokePropertyBriefShare, testPropertyBriefShareAccess } from '../../../propertyBrief/propertyBrief.service';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { readableCode } from '../askFormatting';
import { PROPERTY_BRIEF_ACTION_IDS, PROPERTY_BRIEF_COMMAND_MESSAGE, PROPERTY_BRIEF_PREPARE_CAPTURE_KEY, PROPERTY_BRIEF_SHARE_CAPTURE_KEY } from '../support/propertyBriefConstants';
import { getEmailNotificationQueue } from '../../JobQueue.service';
import { logger } from '../../../lib/logger';

export const PropertyBriefPrepareInputSchema = z.object({
  purpose: z.enum(PROPERTY_BRIEF_PURPOSES), title: z.string().trim().max(160).nullish(),
  selectedSections: z.array(z.enum(PROPERTY_BRIEF_SECTIONS)).min(1), documentIds: z.array(z.string().uuid()).default([]),
  acknowledgeSensitiveSections: z.boolean().default(false),
}).strict();
export const PropertyBriefShareInputSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(90), downloadPolicy: z.enum(['VIEW_ONLY', 'ALLOW_DOWNLOAD']),
  recipientName: z.string().trim().max(120).nullish(), recipientEmail: z.string().trim().email().max(200).nullish(),
  sensitiveDataAcknowledged: z.literal(true), householdConsentAcknowledged: z.boolean().default(false),
}).strict();
type Launch = { actionId?: string | null; entityId?: string | null; sourceExecutionId?: string | null } | null | undefined;
type Supplied = { kind: 'PREPARE'; value: z.infer<typeof PropertyBriefPrepareInputSchema> } | { kind: 'SHARE'; value: z.infer<typeof PropertyBriefShareInputSchema> };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const expiry = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
const showBriefs = { id: 'property-brief-show-current', label: 'Show updated property briefs', interactionType: 'START_WORKFLOW' as const, message: 'Show my property briefs', operationId: 'PROPERTY_BRIEFS_LIST' as const, style: 'PRIMARY' as const };

function prepareCapture(documents: Awaited<ReturnType<typeof listEligiblePropertyBriefDocuments>>): AskCaptureRequest {
  return { requirementId: 'property-brief-prepare-input', captureKey: PROPERTY_BRIEF_PREPARE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Prepare a property brief', question: 'Who is this snapshot for, and which records should it include?', helpText: 'Purpose controls which sections are allowed. The exact frozen snapshot is available for preview before sharing.', inputSchema: { type: 'GROUP', fields: [
    { key: 'purpose', label: 'Recipient purpose', required: true, inputSchema: { type: 'SINGLE_SELECT', options: PROPERTY_BRIEF_PURPOSES.map((value) => ({ value, label: PROPERTY_BRIEF_TEMPLATES[value].label })) } },
    { key: 'title', label: 'Title', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
    { key: 'selectedSections', label: 'Included sections', required: true, helpText: 'The selected purpose may restrict this list.', inputSchema: { type: 'MULTI_SELECT', options: PROPERTY_BRIEF_SECTIONS.map((value) => ({ value, label: readableCode(value) })), maxItems: PROPERTY_BRIEF_SECTIONS.length } },
    ...(documents.length ? [{ key: 'documentIds', label: 'Verified documents', required: false, helpText: 'Used only when Documents is included.', inputSchema: { type: 'MULTI_SELECT' as const, options: documents.map((document) => ({ value: document.id, label: document.name })), maxItems: 25 } }] : []),
    { key: 'acknowledgeSensitiveSections', label: 'Sensitive records', required: true, helpText: 'Required when documents, claims, insurance, or emergency information are included.', inputSchema: { type: 'BOOLEAN', trueLabel: 'I understand', falseLabel: 'Not acknowledged' } },
  ] }, currentAnswer: { purpose: 'HOMEOWNER_REFERENCE', selectedSections: PROPERTY_BRIEF_TEMPLATES.HOMEOWNER_REFERENCE.defaultSections, documentIds: [], acknowledgeSensitiveSections: false }, allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Creates a frozen Property Brief snapshot after confirmation', confirmationText: null, expectedContextVersion: 'property-brief-live' };
}

function shareCapture(): AskCaptureRequest {
  return { requirementId: 'property-brief-share-input', captureKey: PROPERTY_BRIEF_SHARE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Create a controlled share link', question: 'How should this exact snapshot be shared?', helpText: 'A recipient email sends an invitation. Leave it blank to receive a link you can send yourself.', inputSchema: { type: 'GROUP', fields: [
    { key: 'expiresInDays', label: 'Expires after', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [1, 3, 7, 14, 30, 90].map((value) => ({ value: String(value), label: `${value} day${value === 1 ? '' : 's'}` })) } },
    { key: 'downloadPolicy', label: 'Recipient permissions', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'VIEW_ONLY', label: 'View only' }, { value: 'ALLOW_DOWNLOAD', label: 'View and download' }] } },
    { key: 'recipientName', label: 'Recipient name', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
    { key: 'recipientEmail', label: 'Recipient email', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
    { key: 'sensitiveDataAcknowledged', label: 'Material sharing action', required: true, helpText: 'Confirm that you reviewed the property identity, selected records and limitation statement.', inputSchema: { type: 'BOOLEAN', trueLabel: 'Reviewed', falseLabel: 'Not reviewed' } },
    { key: 'householdConsentAcknowledged', label: 'Household consideration', required: true, helpText: 'Confirm that you considered other household members before sharing externally.', inputSchema: { type: 'BOOLEAN', trueLabel: 'Considered', falseLabel: 'Not considered' } },
  ] }, currentAnswer: { expiresInDays: '14', downloadPolicy: 'VIEW_ONLY', sensitiveDataAcknowledged: false, householdConsentAcknowledged: false }, allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Creates an expiring external share after confirmation', confirmationText: null, expectedContextVersion: 'property-brief-live' };
}

const blocked = (): AskOperationResult => ({ status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-brief-command-permission', title: 'A contributor or owner is required', body: 'You can inspect saved briefs and their exact snapshots, but your role cannot prepare, share, republish, test, or revoke them.', tone: 'CAUTION', actions: [] }], suggestions: [] });

export async function propertyBriefCommandResult(userId: string, propertyId: string, launch: Launch, supplied?: Supplied): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked();
  const actionId = launch?.actionId ?? '';
  if (!Object.values(PROPERTY_BRIEF_ACTION_IDS).includes(actionId as never)) return { status: 'NOT_APPLICABLE', reasonCode: 'PROPERTY_BRIEF_ACTION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-brief-command-launch', title: 'Choose an action from a Property Brief answer', body: 'Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  if (actionId === PROPERTY_BRIEF_ACTION_IDS.PREPARE && !supplied) {
    return { status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_BRIEF_PREPARE_INPUT_REQUIRED', parameters: { propertyBriefLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'property-brief-prepare-input', title: 'Prepare a recipient snapshot', body: 'Choose the purpose and records, then review them before the snapshot is created.', tone: 'DEFAULT', actions: [] }], captureRequests: [prepareCapture(await listEligiblePropertyBriefDocuments(propertyId, access.role))], suggestions: [] };
  }
  const targetParts = (launch?.entityId ?? '').split(':');
  const briefId = targetParts[0] ?? '';
  const targetedShareId = targetParts.length > 1 ? targetParts[1] : null;
  if (actionId !== PROPERTY_BRIEF_ACTION_IDS.PREPARE && !briefId) return { status: 'NOT_APPLICABLE', reasonCode: 'PROPERTY_BRIEF_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-brief-required', title: 'Select a saved brief first', body: 'Open the brief preview and choose an action there. Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  if (actionId === PROPERTY_BRIEF_ACTION_IDS.SHARE && !supplied) {
    await getPropertyBriefPreview(propertyId, userId, briefId);
    return { status: 'NEEDS_CONTEXT', reasonCode: 'PROPERTY_BRIEF_SHARE_INPUT_REQUIRED', parameters: { propertyBriefLaunch: launch }, blocks: [{ type: 'SUMMARY', id: 'property-brief-share-input', title: 'Share this exact snapshot', body: 'Set the expiry, permissions, and optional recipient. The link is not created until you confirm.', tone: 'CAUTION', actions: [] }], captureRequests: [shareCapture()], suggestions: [] };
  }
  const command: Record<string, unknown> = { actionId, briefId };
  let title = 'Update this Property Brief?'; let description = 'Nothing changes until you confirm.'; const fields: Array<{ label: string; value: string }> = [];
  if (actionId === PROPERTY_BRIEF_ACTION_IDS.PREPARE && supplied?.kind === 'PREPARE') {
    const parsed = createPropertyBriefSchema.parse({ ...supplied.value, title: supplied.value.title || undefined }); command.input = parsed; title = `Prepare a ${PROPERTY_BRIEF_TEMPLATES[parsed.purpose].label.toLowerCase()} brief?`; description = 'This creates a frozen household snapshot. It is not shared yet.'; fields.push({ label: 'Sections', value: parsed.selectedSections.map(readableCode).join(', ') });
  } else if (actionId === PROPERTY_BRIEF_ACTION_IDS.SHARE && supplied?.kind === 'SHARE') {
    const normalized = { ...supplied.value, recipientName: supplied.value.recipientName || undefined, recipientEmail: supplied.value.recipientEmail || undefined, expiresInDays: Number(supplied.value.expiresInDays), previewAcknowledged: true as const, limitationAcknowledged: true as const };
    const parsed = createPropertyBriefShareSchema.parse(normalized); command.input = parsed; title = 'Create this controlled external share?'; description = 'The recipient can view this exact property snapshot until the selected expiry. This is a material privacy action.'; fields.push({ label: 'Expiry', value: `${parsed.expiresInDays} days` }, { label: 'Permissions', value: readableCode(parsed.downloadPolicy) }, { label: 'Recipient', value: parsed.recipientEmail ? 'Email invitation will be sent' : 'Copyable link only' });
  } else {
    const preview = await getPropertyBriefPreview(propertyId, userId, briefId);
    const live = preview.shares.filter((share) => share.status === 'ACTIVE' && new Date(share.expiresAt).getTime() > Date.now());
    const share = targetedShareId ? live.find((candidate) => candidate.id === targetedShareId) : live[0];
    if ((actionId === PROPERTY_BRIEF_ACTION_IDS.TEST_SHARE || actionId === PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE) && !share) return { status: 'NOT_APPLICABLE', reasonCode: 'PROPERTY_BRIEF_LIVE_SHARE_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'property-brief-live-share-required', title: 'No live share link is available', body: 'Create a controlled link from the brief preview first.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
    command.shareId = share?.id;
    if (actionId === PROPERTY_BRIEF_ACTION_IDS.TEST_SHARE) { title = 'Test this recipient link?'; description = 'This records an owner test but does not increment recipient views or accept an invitation.'; }
    if (actionId === PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE) { title = 'Revoke this live share link?'; description = 'The recipient will immediately lose access. The frozen brief remains saved.'; }
    if (actionId === PROPERTY_BRIEF_ACTION_IDS.REPUBLISH) { title = 'Check for updates and republish?'; description = 'If source records changed, the same live links will show the refreshed snapshot and emailed recipients may be notified.'; }
  }
  const expiresAt = expiry();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'PROPERTY_BRIEF_COMMAND_CONFIRMATION_REQUIRED', parameters: { propertyBriefCommand: command, sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'property-brief-command-review', title, body: description, tone: actionId === PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE || actionId === PROPERTY_BRIEF_ACTION_IDS.SHARE ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: `property-brief-${sha(`${propertyId}:${JSON.stringify(command)}`).slice(0, 16)}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel: actionId === PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE ? 'Revoke link' : 'Confirm', consentText: 'I authorize this change to the shared household Property Brief records.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('property-brief.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.operationId !== 'PROPERTY_BRIEF_COMMAND' || launch.surface === 'ASK_REFRESH' || envelope.message !== PROPERTY_BRIEF_COMMAND_MESSAGE) return propertyBriefCommandResult(envelope.userId, envelope.propertyId!, null);
  return propertyBriefCommandResult(envelope.userId, envelope.propertyId!, launch);
});

async function confirmPropertyBriefCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, parameters, userId } = ctx; const propertyId = execution.propertyId;
  const command = parameters.propertyBriefCommand as { actionId: string; briefId?: string; shareId?: string; input?: Record<string, unknown> };
  let artifactId = command.briefId ?? propertyId; let artifactType = 'PROPERTY_BRIEF'; let title = 'Property Brief updated'; let description = 'The canonical Property Brief records now reflect this change.'; const actions: Array<{ id: string; label: string; interactionType?: 'START_WORKFLOW'; message?: string; operationId?: string; href?: string; style: 'PRIMARY' | 'SECONDARY' }> = [showBriefs];
  if (command.actionId === PROPERTY_BRIEF_ACTION_IDS.PREPARE) {
    const input = createPropertyBriefSchema.parse(command.input); const access = await ensurePropertyAccess(userId, propertyId);
    const brief = await createPropertyBrief({ propertyId, userId, role: access.role, purpose: input.purpose, title: input.title, selectedSections: input.selectedSections, documentIds: input.documentIds }); artifactId = brief.id; title = 'Property Brief prepared'; description = 'The frozen snapshot is saved and has not been shared.';
  } else if (command.actionId === PROPERTY_BRIEF_ACTION_IDS.SHARE) {
    const input = createPropertyBriefShareSchema.parse(command.input); const share = await createPropertyBriefShare({ propertyId, userId, briefId: command.briefId!, expiresInDays: input.expiresInDays, downloadPolicy: input.downloadPolicy, sensitiveDataAcknowledged: true, householdConsentAcknowledged: input.householdConsentAcknowledged, recipientName: input.recipientName, recipientEmail: input.recipientEmail }); artifactType = 'PROPERTY_BRIEF_SHARE'; artifactId = share.id; title = 'Controlled share link created'; description = `The link expires ${share.expiresAt.toLocaleDateString()}. Copy it now; Cozy stores only its hash and cannot recover the raw link later.`;
    const sharePath = `/property-brief/share/${encodeURIComponent(share.token)}`; const shareUrl = `${(process.env.FRONTEND_URL ?? '').replace(/\/$/, '')}${sharePath}`;
    actions.unshift({ id: 'property-brief-open-share', label: 'Open recipient view', href: sharePath, style: 'SECONDARY' as const });
    if (share.recipientEmail) getEmailNotificationQueue().add('SEND_PROPERTY_BRIEF_INVITATION', { to: share.recipientEmail, recipientName: share.recipientName, propertyBriefTitle: share.propertyBriefTitle, propertyAddress: share.propertyAddress, shareUrl, expiresAt: share.expiresAt.toISOString() }, { removeOnComplete: true, removeOnFail: true, attempts: 2 }).catch((err) => logger.error({ err }, '[PropertyBriefAsk] failed to enqueue invitation email'));
  } else if (command.actionId === PROPERTY_BRIEF_ACTION_IDS.TEST_SHARE) {
    const tested = await testPropertyBriefShareAccess({ propertyId, userId, briefId: command.briefId!, shareId: command.shareId! }); artifactType = 'PROPERTY_BRIEF_SHARE'; artifactId = tested.id; title = tested.accessible ? 'Share link is accessible' : 'Share link is unavailable'; description = tested.accessible ? 'The owner test did not count as a recipient view.' : `The link failed because ${readableCode(tested.failureReason)}.`;
  } else if (command.actionId === PROPERTY_BRIEF_ACTION_IDS.REVOKE_SHARE) {
    const share = await revokePropertyBriefShare({ propertyId, userId, briefId: command.briefId!, shareId: command.shareId! }); artifactType = 'PROPERTY_BRIEF_SHARE'; artifactId = share.id; title = 'Share link revoked'; description = 'The recipient can no longer open this link. The saved brief remains available.';
  } else if (command.actionId === PROPERTY_BRIEF_ACTION_IDS.REPUBLISH) {
    const access = await ensurePropertyAccess(userId, propertyId); const result = await republishPropertyBrief({ propertyId, briefId: command.briefId!, role: access.role }); artifactId = command.briefId!; title = result.changed ? 'Property Brief republished' : 'Property Brief is already current'; description = result.changed ? `${result.changedSectionTypes.map(readableCode).join(', ')} changed. Existing live links now show the refreshed snapshot.` : 'No selected section changed, so the snapshot and recipient links were left untouched.';
    if (result.changed) {
      const propertyAddress = [result.brief.property.address, result.brief.property.city, result.brief.property.state].filter(Boolean).join(', ');
      for (const share of result.brief.shares) if (share.status === 'ACTIVE' && share.recipientEmail) getEmailNotificationQueue().add('SEND_PROPERTY_BRIEF_UPDATE_NOTICE', { to: share.recipientEmail, recipientName: share.recipientName, propertyBriefTitle: result.brief.title, propertyAddress, changedSections: result.changedSectionTypes }, { removeOnComplete: true, removeOnFail: true, attempts: 2 }).catch((err) => logger.error({ err }, '[PropertyBriefAsk] failed to enqueue update notice'));
    }
  } else throw Object.assign(new Error('That Property Brief action is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  return { result: { status: 'COMPLETED', reasonCode: 'PROPERTY_BRIEF_COMMAND_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `property-brief-command-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions }], suggestions: [] }, artifactType, artifactId };
}

registerConfirmCapabilityHandler('property-brief.command', confirmPropertyBriefCommand);
