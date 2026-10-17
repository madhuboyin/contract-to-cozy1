import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { HomeDigitalWillService } from '../../homeDigitalWill.service';

const CREATE_MESSAGE = 'Create my home continuity plan';
const PUBLISH_MESSAGE = 'Publish my home continuity plan';
const METADATA_MESSAGE = 'Edit my home continuity plan details';
export const HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY = 'HOME_DIGITAL_WILL_METADATA_INPUTS';
export const HomeDigitalWillMetadataInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  status: z.enum(['DRAFT', 'ARCHIVED']),
  readiness: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW']),
  lastReviewedAt: z.string().trim().max(10).optional().default(''),
});
export type HomeDigitalWillMetadataInput = z.infer<typeof HomeDigitalWillMetadataInputSchema>;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export async function homeDigitalWillCreateResult(propertyId: string): Promise<AskOperationResult> {
  const existing = await new HomeDigitalWillService().getByProperty(propertyId);
  if (existing) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_ALREADY_EXISTS',
      blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-existing', title: 'Your Home Continuity Plan already exists', body: 'Nothing was created or changed.', tone: 'DEFAULT', actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_CREATE_CONFIRMATION_REQUIRED',
    parameters: { homeDigitalWillCreate: true, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-review', title: 'Create your Home Continuity Plan', body: 'Ask will create a private draft with the standard sections. It will not publish the plan, invite anyone, or send anything.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-digital-will-create-${sha(propertyId).slice(0, 12)}-1`, version: 1,
      title: 'Create this Home Continuity Plan?',
      description: 'This creates the shared-home draft and its standard sections. You can add emergency instructions and trusted contacts next.',
      fields: [{ label: 'Status', value: 'Private draft' }, { label: 'Initial contents', value: 'Eight standard sections' }],
      editableFields: [], confirmLabel: 'Create plan', consentText: 'I authorize creating this Home Continuity Plan in the shared home record.', expiresAt,
    },
    suggestions: [],
  };
}

async function homeDigitalWillPublishResult(propertyId: string, planId: string | null): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan || !planId || plan.id !== planId) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-missing', title: 'That plan is no longer available', body: 'Nothing was published.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (plan.status === 'ACTIVE') return { status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_ALREADY_PUBLISHED', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-existing', title: 'This plan is already marked ready', body: 'Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_PUBLISH_CONFIRMATION_REQUIRED', parameters: { homeDigitalWillPublish: { planId }, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-review', title: 'Mark this plan ready', body: 'This records the plan as published and reviewed. It does not invite contacts or grant access.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-publish-${sha(`${propertyId}:${planId}:${plan.updatedAt.toISOString()}`).slice(0, 12)}-1`, version: 1, title: 'Mark this Home Continuity Plan ready?', description: 'The readiness checks currently pass. Publishing sets the plan to active and records today as its review date.', fields: [{ label: 'Plan', value: plan.title }, { label: 'Entries', value: String(plan.counts.entryCount) }, { label: 'Trusted contacts', value: String(plan.counts.trustedContactCount) }], editableFields: [], confirmLabel: 'Mark plan ready', consentText: 'I authorize publishing this Home Continuity Plan in the shared home record.', expiresAt }, suggestions: [] };
}

export async function homeDigitalWillMetadataResult(userId: string, propertyId: string, planId: string | null, supplied?: HomeDigitalWillMetadataInput): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan || plan.id !== planId) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-missing', title: 'That plan is no longer available', body: 'Nothing was changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const contextVersion = sha(`home-digital-will-metadata:${plan.id}:${plan.updatedAt.toISOString()}`);
  const current = { title: plan.title, status: plan.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT', readiness: plan.readiness === 'READY' ? 'IN_PROGRESS' : plan.readiness, lastReviewedAt: plan.lastReviewedAt?.toISOString().slice(0, 10) ?? '' } as HomeDigitalWillMetadataInput;
  const capture: AskCaptureRequest = { requirementId: 'home-digital-will-metadata-inputs', captureKey: HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM', title: 'Edit plan details', question: 'What should the plan details say?', helpText: 'Ready is set only by publishing. Nothing is saved until you review and confirm.', inputSchema: { type: 'GROUP', fields: [
    { key: 'title', label: 'Plan title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } },
    { key: 'status', label: 'Status', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Draft', value: 'DRAFT' }, { label: 'Archived', value: 'ARCHIVED' }] } },
    { key: 'readiness', label: 'Readiness', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Not started', value: 'NOT_STARTED' }, { label: 'In progress', value: 'IN_PROGRESS' }, { label: 'Needs review', value: 'NEEDS_REVIEW' }] } },
    { key: 'lastReviewedAt', label: 'Last reviewed date', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
  ] } as AskCaptureRequest['inputSchema'], currentAnswer: supplied ?? current, allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Updates the shared Home Continuity Plan after confirmation', confirmationText: null, expectedContextVersion: contextVersion };
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'HOME_DIGITAL_WILL_METADATA_INPUT_REQUIRED', contextVersion, parameters: { homeDigitalWillMetadataLaunch: { planId } }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-input', title: 'Edit plan details', body: 'The form shows what is recorded. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }], captureRequests: [capture], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_METADATA_CONFIRMATION_REQUIRED', contextVersion, parameters: { homeDigitalWillMetadata: { planId, values: supplied }, homeDigitalWillMetadataContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-review', title: 'Review these plan details', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-metadata-${sha(`${plan.id}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1, title: 'Save these plan details?', description: 'This updates the plan metadata. It does not publish the plan or notify anyone.', fields: [{ label: 'Title', value: supplied.title }, { label: 'Status', value: supplied.status === 'DRAFT' ? 'Draft' : 'Archived' }, { label: 'Readiness', value: supplied.readiness.toLowerCase().replace('_', ' ') }, { label: 'Last reviewed', value: supplied.lastReviewedAt || 'Not set' }], editableFields: [], confirmLabel: 'Save details', consentText: 'I authorize updating these Home Continuity Plan details.', expiresAt }, captureRequests: [capture], suggestions: [] };
}

type EntryOrderCommand = 'ENTRY_DELETE' | 'ENTRY_MOVE_UP' | 'ENTRY_MOVE_DOWN';
async function homeDigitalWillEntryOrderResult(propertyId: string, command: EntryOrderCommand, entryId: string): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  const section = plan?.sections.find((candidate) => candidate.entries.some((entry) => entry.id === entryId));
  const entry = section?.entries.find((candidate) => candidate.id === entryId);
  if (!section || !entry) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-entry-missing', title: 'That entry is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const version = sha('home-digital-will-entry:' + section.id + ':' + section.entries.map((row) => row.id + ':' + row.updatedAt.toISOString() + ':' + row.sortOrder).join('|'));
  const deleting = command === 'ENTRY_DELETE'; const direction = command === 'ENTRY_MOVE_UP' ? 'up' : 'down';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_CONFIRMATION_REQUIRED', contextVersion: version, parameters: { homeDigitalWillEntryOrder: { command, entryId, sectionId: section.id }, homeDigitalWillEntryOrderContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-entry-order-review', title: deleting ? 'Delete ' + entry.title + '?' : 'Move ' + entry.title + ' ' + direction + '?', body: deleting ? 'Deleting permanently removes this entry from the shared plan.' : 'This changes only the entry order.', tone: deleting ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: 'home-digital-will-entry-' + sha(command + ':' + entryId + ':' + version).slice(0, 12) + '-1', version: 1, title: deleting ? 'Delete "' + entry.title + '"?' : 'Move "' + entry.title + '" ' + direction + '?', description: deleting ? 'This permanently deletes the entry.' : 'This changes its position within ' + section.title + '.', fields: [{ label: 'Section', value: section.title }, { label: 'Entry', value: entry.title }], editableFields: [], confirmLabel: deleting ? 'Delete entry' : 'Move entry', consentText: deleting ? 'I authorize permanently deleting this plan entry.' : 'I authorize changing this entry order.', expiresAt }, suggestions: [] };
}

registerCapabilityHandler('home-digital-will.create', async (envelope) => {
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_ENTRY' && envelope.launchContext.entityId && ['ENTRY_DELETE', 'ENTRY_MOVE_UP', 'ENTRY_MOVE_DOWN'].includes(envelope.launchContext.actionId ?? '')) return homeDigitalWillEntryOrderResult(envelope.propertyId!, envelope.launchContext.actionId as EntryOrderCommand, envelope.launchContext.entityId);
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === METADATA_MESSAGE && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_METADATA') return homeDigitalWillMetadataResult(envelope.userId, envelope.propertyId!, envelope.launchContext.entityId ?? null);
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PUBLISH_MESSAGE && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_PUBLISH') return homeDigitalWillPublishResult(envelope.propertyId!, envelope.launchContext.entityId ?? null);
  const declared = envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE'
    && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === CREATE_MESSAGE;
  if (!declared) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_CREATE_NOT_DECLARED', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-not-declared', title: 'Start from Create my plan', body: 'Nothing was created or changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  return homeDigitalWillCreateResult(envelope.propertyId!);
});

async function confirmHomeDigitalWillCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const entryOrder = ctx.parameters.homeDigitalWillEntryOrder as { command?: unknown; entryId?: unknown; sectionId?: unknown } | undefined;
  if (entryOrder) {
    if (typeof entryOrder.command !== 'string' || !['ENTRY_DELETE', 'ENTRY_MOVE_UP', 'ENTRY_MOVE_DOWN'].includes(entryOrder.command) || typeof entryOrder.entryId !== 'string' || typeof entryOrder.sectionId !== 'string') throw Object.assign(new Error('This entry action is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService(); const plan = await service.getByProperty(ctx.execution.propertyId); const section = plan?.sections.find((row) => row.id === entryOrder.sectionId); const entry = section?.entries.find((row) => row.id === entryOrder.entryId);
    if (!section || !entry) throw Object.assign(new Error('That entry is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const version = sha('home-digital-will-entry:' + section.id + ':' + section.entries.map((row) => row.id + ':' + row.updatedAt.toISOString() + ':' + row.sortOrder).join('|'));
    if (ctx.parameters.homeDigitalWillEntryOrderContextVersion !== version) throw Object.assign(new Error('This section changed while you were reviewing. Open the action again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let title = 'Entry deleted';
    if (entryOrder.command === 'ENTRY_DELETE') await service.deleteEntry(entry.id, ctx.userId);
    else { const ids = section.entries.map((row) => row.id); const at = ids.indexOf(entry.id); const next = entryOrder.command === 'ENTRY_MOVE_UP' ? Math.max(0, at - 1) : Math.min(ids.length - 1, at + 1); ids.splice(at, 1); ids.splice(next, 0, entry.id); if (next !== at) await service.reorderEntries(section.id, ctx.userId, { orderedIds: ids }); title = next === at ? 'Entry is already at the end' : 'Entry moved'; }
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_ACTION_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'home-digital-will-entry-action-' + entry.id, title, status: 'COMPLETED', description: 'The shared Home Continuity Plan was updated. Sensitive entry details are not repeated here.', details: [{ label: 'Section', value: section.title }, { label: 'Entry', value: entry.title }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters); return { result, artifactType: 'HOME_DIGITAL_WILL_ENTRY', artifactId: entry.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  const metadata = ctx.parameters.homeDigitalWillMetadata as { planId?: unknown; values?: unknown } | undefined;
  if (metadata) {
    if (typeof metadata.planId !== 'string') throw Object.assign(new Error('This edit is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const values = HomeDigitalWillMetadataInputSchema.safeParse(metadata.values);
    if (!values.success) throw Object.assign(new Error('The plan details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService(); const current = await service.getByProperty(ctx.execution.propertyId);
    if (!current || current.id !== metadata.planId) throw Object.assign(new Error('That plan is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const expected = typeof ctx.parameters.homeDigitalWillMetadataContextVersion === 'string' ? ctx.parameters.homeDigitalWillMetadataContextVersion : null;
    if (expected !== sha(`home-digital-will-metadata:${current.id}:${current.updatedAt.toISOString()}`)) throw Object.assign(new Error('The plan changed while this form was open. Open Edit details again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    const plan = await service.updateWill(current.id, ctx.userId, { title: values.data.title, status: values.data.status, readiness: values.data.readiness, lastReviewedAt: values.data.lastReviewedAt ? new Date(`${values.data.lastReviewedAt}T12:00:00.000Z`).toISOString() : null });
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_METADATA_UPDATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-metadata-updated-${plan.id}`, title: 'Plan details updated', status: 'COMPLETED', description: 'The Home Continuity Plan metadata was saved. The plan was not published and nobody was notified.', details: [{ label: 'Title', value: plan.title }, { label: 'Status', value: plan.status }, { label: 'Readiness', value: plan.readiness }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
    return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  const publish = ctx.parameters.homeDigitalWillPublish as { planId?: unknown } | undefined;
  if (publish) {
    if (typeof publish.planId !== 'string') throw Object.assign(new Error('This publication is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService();
    const current = await service.getByProperty(ctx.execution.propertyId);
    if (!current || current.id !== publish.planId) throw Object.assign(new Error('That plan is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const plan = current.status === 'ACTIVE' ? current : await service.publishWill(current.id, ctx.userId);
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: current.status === 'ACTIVE' ? 'HOME_DIGITAL_WILL_ALREADY_PUBLISHED' : 'HOME_DIGITAL_WILL_PUBLISHED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-published-${plan.id}`, title: current.status === 'ACTIVE' ? 'Plan already marked ready' : 'Home Continuity Plan marked ready', status: 'COMPLETED', description: 'The plan is active and its review date is recorded. No invitations were sent.', details: [{ label: 'Status', value: 'Ready' }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
    return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  if (ctx.parameters.homeDigitalWillCreate !== true) throw Object.assign(new Error('This plan creation is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const service = new HomeDigitalWillService();
  const existing = await service.getByProperty(ctx.execution.propertyId);
  const plan = existing ?? await service.getOrCreateByProperty(ctx.execution.propertyId, { title: 'Home Continuity Plan' });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: existing ? 'HOME_DIGITAL_WILL_ALREADY_EXISTS' : 'HOME_DIGITAL_WILL_CREATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-created-${plan.id}`, title: existing ? 'Plan already exists' : 'Home Continuity Plan created', status: 'COMPLETED', description: existing ? 'No duplicate was created.' : 'Your private draft and its standard sections are ready.', details: [{ label: 'Status', value: 'Private draft' }], actions: [{ id: 'home-digital-will-review', label: 'Continue setup', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: 'home-digital-will-create-refresh-failed', title: 'Created; view could not refresh', body: 'The plan was created, but the earlier answer could not refresh automatically. Ask to show the plan again.', severity: 'INFO', suggestions: [] });
  return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('home-digital-will.create', confirmHomeDigitalWillCreate);
