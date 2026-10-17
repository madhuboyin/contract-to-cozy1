import { createHash } from 'node:crypto';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { HomeDigitalWillService } from '../../homeDigitalWill.service';

const CREATE_MESSAGE = 'Create my home continuity plan';
const PUBLISH_MESSAGE = 'Publish my home continuity plan';
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

registerCapabilityHandler('home-digital-will.create', async (envelope) => {
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PUBLISH_MESSAGE && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_PUBLISH') return homeDigitalWillPublishResult(envelope.propertyId!, envelope.launchContext.entityId ?? null);
  const declared = envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE'
    && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === CREATE_MESSAGE;
  if (!declared) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_CREATE_NOT_DECLARED', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-not-declared', title: 'Start from Create my plan', body: 'Nothing was created or changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  return homeDigitalWillCreateResult(envelope.propertyId!);
});

async function confirmHomeDigitalWillCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
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
