// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type EditAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { radarInteractionService } from '../../../modules/homeEventRadar/services/radarInteraction.service';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../../modules/homeEventRadar/domain/radarInteraction';
import { radarTaskIntegrationService } from '../../../modules/homeEventRadar/services/radarTaskIntegration.service';
import { radarNotificationPreferenceService } from '../../../modules/homeEventRadar/services/radarNotificationPreference.service';
import { updateRadarNotificationPreferencesBodySchema } from '../../../validators/homeEventRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { asInputJson, loadRadarMatchForWrite, mapPersistedExecution, preservedExecutionHistory, propertySummary, RadarFeedbackInputSchema, RadarTaskInputSchema } from '../askHandlerSupport';
import { RADAR_FEEDBACK_OPTIONS, RADAR_FEEDBACK_REVIEW_BODY, RADAR_TASK_CONFIRM_ERRORS, RADAR_USER_STATE_LABEL, radarConfirmError, radarDateTimeLabel, radarEventHref, radarFeedbackConfirmation, radarPreferenceLabels, radarPreferencesContextVersion, radarStateContextVersion, radarWriteReceipt } from '../handlers/homeEventRadar.handler';
import { getAskPropertyTimezone } from '../askExecutionContext';

async function confirmHomeEventRadarMarkDone(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to mark radar events done in Ask.', 'ASK_PERMISSION_REQUIRED');
  const matchId = typeof parameters.radarMatchId === 'string' ? parameters.radarMatchId : null;
  if (!matchId) throw radarConfirmError('The event selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const detail = await loadRadarMatchForWrite(execution.propertyId!, matchId, userId);
  if (!detail) throw radarConfirmError('This monitored event is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const current = String(detail.userState ?? 'new');
  const alreadyApplied = current === 'acted_on';
  if (!alreadyApplied) {
    if (parameters.radarStateContextVersion !== radarStateContextVersion(matchId, current)) {
      throw radarConfirmError('This event changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    await radarInteractionService.updateState(execution.propertyId!, matchId, userId, 'acted_on');
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId!, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
      metadataJson: { actionType: 'update_match_state', matchId, state: 'acted_on', surface: 'ASK' },
    });
  }
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-mark-done-${matchId}`, title: alreadyApplied ? 'Already marked done' : 'Marked done', status: 'COMPLETED',
    description: alreadyApplied ? 'Nothing was changed.' : 'Home Event Radar will recheck this home\'s radar risk to reflect it.',
    details: [{ label: 'Event', value: String(detail.title) }, { label: 'Previous state', value: alreadyApplied ? 'Already done' : RADAR_USER_STATE_LABEL[current] ?? current }],
    actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(execution.propertyId!, matchId), style: 'SECONDARY' }],
  }, alreadyApplied ? 'HOME_EVENT_RADAR_ALREADY_DONE' : 'HOME_EVENT_RADAR_MARKED_DONE', 'PROPERTY_RADAR_STATE');
}

async function confirmHomeEventRadarFeedback(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to send radar feedback in Ask.', 'ASK_PERMISSION_REQUIRED');
  const candidate = RadarFeedbackInputSchema.safeParse(parameters.radarFeedback);
  if (!candidate.success) throw radarConfirmError('The feedback to send is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const { matchId, feedbackType, comment } = candidate.data;
  if (!feedbackType) throw radarConfirmError('Choose a reason before sending feedback.', 'ASK_INVALID_CONFIRMATION_EDIT');
  const detail = await loadRadarMatchForWrite(execution.propertyId!, matchId, userId);
  if (!detail) throw radarConfirmError('This monitored event is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  await radarInteractionService.submitFeedback(execution.propertyId!, matchId, userId, feedbackType, comment || null);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId!, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
    metadataJson: { actionType: 'submit_match_feedback', matchId, feedbackType, hasComment: Boolean(comment), surface: 'ASK' },
  });
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-feedback-${matchId}`, title: 'Feedback sent', status: 'COMPLETED',
    description: 'Thanks. Home Event Radar recorded your feedback on this event.',
    details: [
      { label: 'Event', value: String(detail.title) },
      { label: 'Reason', value: RADAR_FEEDBACK_OPTIONS.find((option) => option.value === feedbackType)?.label ?? feedbackType },
      ...(comment ? [{ label: 'Comment', value: comment }] : []),
    ],
    actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(execution.propertyId!, matchId), style: 'SECONDARY' }],
  }, 'HOME_EVENT_RADAR_FEEDBACK_SENT', 'PROPERTY_RADAR_FEEDBACK');
}

registerConfirmCapabilityHandler('home-event-radar.mark-done', confirmHomeEventRadarMarkDone);

registerConfirmCapabilityHandler('home-event-radar.feedback', confirmHomeEventRadarFeedback);

export async function editHomeEventRadarFeedbackConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
): Promise<AskExecutionResponse> {
  const existing = RadarFeedbackInputSchema.safeParse(parameters.radarFeedback);
  if (!existing.success) throw Object.assign(new Error('Editing is not available for this proposal.'), { code: 'ASK_EDIT_NOT_SUPPORTED' });
  const unknownField = Object.keys(input.edits).find((key) => key !== 'feedbackType' && key !== 'comment');
  if (unknownField) throw Object.assign(new Error('Only the reason and comment can be edited.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const next = { ...existing.data };
  if (input.edits.feedbackType !== undefined) {
    const type = RadarFeedbackInputSchema.shape.feedbackType.safeParse(input.edits.feedbackType);
    if (!type.success || type.data === null) throw Object.assign(new Error('Choose one of the listed reasons.'), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.feedbackType = type.data;
  }
  if (input.edits.comment !== undefined) {
    if (input.edits.comment.trim().length > RADAR_FEEDBACK_COMMENT_MAX_LENGTH) throw Object.assign(new Error(`Keep the comment to ${RADAR_FEEDBACK_COMMENT_MAX_LENGTH} characters or fewer.`), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
    next.comment = input.edits.comment.trim() || null;
  }
  const updatedInput = RadarFeedbackInputSchema.parse(next);
  const detail = await loadRadarMatchForWrite(execution.propertyId!, updatedInput.matchId, userId);
  if (!detail) throw Object.assign(new Error('This monitored event is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const newConfirmation = radarFeedbackConfirmation(detail, updatedInput, nextVersion, expiresAt);
  const reviewBlock = { type: 'SUMMARY' as const, id: 'radar-feedback-review', title: `Feedback on ${detail.title}`, body: RADAR_FEEDBACK_REVIEW_BODY, tone: 'DEFAULT' as const, actions: [] };
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, radarFeedback: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [reviewBlock], captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [reviewBlock]),
      }),
    },
  });
  if (editWrite.count !== 1) throw Object.assign(new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

async function confirmHomeEventRadarTask(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to plan radar actions.', 'ASK_PERMISSION_REQUIRED');
  const candidate = RadarTaskInputSchema.safeParse(parameters.radarTask);
  if (!candidate.success) throw radarConfirmError('The task to add or link is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const { matchId, actionCode, operation, maintenanceTaskId, dueAt, assigneeUserId } = candidate.data;
  const propertyId = execution.propertyId!;
  let outcome: { link: Record<string, any>; deduped: boolean };
  try {
    outcome = await radarTaskIntegrationService.createOrLink(propertyId, matchId, actionCode, userId, { operation, maintenanceTaskId, dueAt, assigneeUserId });
  } catch (error) {
    const mapped = error instanceof APIError && error.code ? RADAR_TASK_CONFIRM_ERRORS[error.code] : undefined;
    if (mapped) throw radarConfirmError(`${(error as Error).message.replace(/\.$/, '')}. Review it and try again.`, mapped);
    throw error;
  }
  const task = outcome.link.task as { id: string; title: string; href: string; nextDueDate: string | null };
  // Same analytics the traditional POST .../task controller emits.
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
    metadataJson: { actionType: operation, matchId, actionCode, maintenanceTaskId: task.id, deduped: outcome.deduped, surface: 'ASK' },
  });
  const title = outcome.deduped ? 'Already planned' : ({ create_task: 'Task added', create_reminder: 'Reminder set', link_existing_task: 'Task linked' } as const)[operation];
  return radarWriteReceipt(ctx, matchId, {
    type: 'WORKFLOW_PROGRESS', id: `radar-task-${matchId}-${actionCode}`, title, status: 'COMPLETED',
    description: outcome.deduped
      ? 'This recommended action already had a maintenance task, so nothing new was added.'
      : 'It is on your maintenance list and linked to this Home Event Radar action.',
    details: [
      { label: 'Task', value: task.title },
      ...(task.nextDueDate ? [{ label: 'Due', value: radarDateTimeLabel(task.nextDueDate, getAskPropertyTimezone()) }] : []),
    ],
    actions: [{ id: 'open-task', label: 'Open task', href: task.href, style: 'PRIMARY' }, { id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }],
  }, outcome.deduped ? 'HOME_EVENT_RADAR_TASK_ALREADY_LINKED' : 'HOME_EVENT_RADAR_TASK_LINKED', 'PROPERTY_RADAR_TASK_LINK');
}

registerConfirmCapabilityHandler('home-event-radar.task', confirmHomeEventRadarTask);

async function confirmHomeEventRadarPreferences(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw radarConfirmError('A contributor or owner is required to change radar notification settings in Ask.', 'ASK_PERMISSION_REQUIRED');
  const body = updateRadarNotificationPreferencesBodySchema.safeParse(parameters.radarPreferences);
  if (!body.success) throw radarConfirmError('The settings to save are invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const propertyId = execution.propertyId!;
  const current = await radarNotificationPreferenceService.get(propertyId, userId);
  if (parameters.radarPreferencesContextVersion !== radarPreferencesContextVersion(current)) {
    throw radarConfirmError('Your notification settings changed while this was open. Review them and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const saved = await radarNotificationPreferenceService.update(propertyId, userId, body.data);
  // The traditional PUT /radar/preferences controller emits no analytics, so neither does this.
  return radarWriteReceipt(ctx, 'preferences', {
    type: 'WORKFLOW_PROGRESS', id: 'radar-preferences-saved', title: 'Notification settings saved', status: 'COMPLETED',
    description: 'Home Event Radar uses these for your notifications about this home. Other household members keep their own.',
    details: radarPreferenceLabels(body.data).map(({ label, value }) => ({ label, value })),
    actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: radarEventHref(propertyId), style: 'SECONDARY' }],
  }, 'HOME_EVENT_RADAR_PREFERENCES_SAVED', 'PROPERTY_RADAR_NOTIFICATION_PREFERENCE').then((result) => ({ ...result, artifactId: `${saved.propertyId}:${saved.userId}` }));
}

registerConfirmCapabilityHandler('home-event-radar.preferences', confirmHomeEventRadarPreferences);
