// Environment Report weather preparation and HVAC filter maintenance commands inside Ask Cozy.
// Reached only by declared actions on the Environment Report answer (`ENVIRONMENT_REPORT_COMMAND`).
// Writes go through `startWeatherPreparation`, `updateWeatherPreparationItem`, and `recordHvacFilterMaintenance`
// behind a review card and a confirmation bound to the current record version.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import {
  registerConfirmCapabilityHandler,
  type ConfirmCapabilityContext,
  type ConfirmCapabilityResult,
} from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import {
  getEnvironmentReportForProperty,
  recordHvacFilterMaintenance,
} from '../../environmentReport.service';
import type { EnvironmentInsight } from '../../environment/environmentInsights.service';
import {
  getWeatherPreparation,
  startWeatherPreparation,
  updateWeatherPreparationItem,
  type WeatherPreparationItemStatus,
  type WeatherPreparationPlan,
} from '../../environment/weatherPreparation.service';
import {
  ENVIRONMENT_HVAC_FILTER_CAPTURE_KEY,
  ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE,
  ENVIRONMENT_HVAC_FILTER_INVALID_MESSAGES,
  ENVIRONMENT_INSIGHT_ENTITY_TYPE,
  ENVIRONMENT_REPORT_BACK_ACTION_ID,
  ENVIRONMENT_REPORT_COMMAND_MESSAGES,
  environmentReportCommandKindFromMessage,
  parseEnvironmentHvacFilterAnswer,
  parseWeatherPreparationStepEntityId,
  WEATHER_PREPARATION_ITEM_ENTITY_TYPE,
  type EnvironmentHvacFilterForm,
  type EnvironmentReportCommandKind,
} from '../support/environmentReportCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export interface EnvironmentReportCommandLaunch {
  kind: EnvironmentReportCommandKind;
  entityId: string;
  sourceExecutionId: string | null;
}

const backToEnvironmentReport = {
  id: ENVIRONMENT_REPORT_BACK_ACTION_ID,
  label: 'Back to Environment Report',
  interactionType: 'START_WORKFLOW' as const,
  message: 'Show my environment report',
  operationId: 'ENVIRONMENT_REPORT' as const,
  style: 'SECONDARY' as const,
};

const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED',
  reasonCode,
  blocks: [
    {
      type: 'SUMMARY',
      id: 'environment-report-command-blocked',
      title,
      body,
      tone: 'CAUTION',
      actions: [],
    },
  ],
  suggestions: [],
});

const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE',
  reasonCode,
  blocks: [
    {
      type: 'SUMMARY',
      id: 'environment-report-command-unavailable',
      title,
      body,
      tone: 'DEFAULT',
      actions: [backToEnvironmentReport],
    },
  ],
  suggestions: [],
});

const notRoutable = (): AskOperationResult =>
  unavailable(
    'ASK_ENVIRONMENT_REPORT_COMMAND_NOT_DIRECTLY_ROUTABLE',
    'Open your Environment Report first',
    'Weather preparation checklists and HVAC filter maintenance are started from your Environment Report. Nothing has changed.',
  );

function insightVersion(insight: EnvironmentInsight): string {
  return sha(
    `env-insight:${insight.id}:${insight.severity}:${insight.relatedIncident?.id ?? ''}:${insight.relatedIncident?.status ?? ''}:${insight.recommendedActions.join('|')}`,
  );
}

function preparationStepVersion(
  kind: EnvironmentReportCommandKind,
  preparation: WeatherPreparationPlan,
  item: WeatherPreparationPlan['items'][number],
): string {
  return sha(`env-prep-step:${kind}:${preparation.id}:${preparation.status}:${item.id}:${item.status}`);
}

export function hvacFilterContextVersion(propertyId: string, lastCompletedIso: string | null): string {
  return sha(`env-hvac-filter:${propertyId}:${lastCompletedIso ?? ''}`);
}

function hvacFilterCapture(contextVersion: string, entered: Record<string, unknown> = {}): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    requirementId: 'environment-hvac-filter-inputs',
    captureKey: ENVIRONMENT_HVAC_FILTER_CAPTURE_KEY,
    classification: 'WORKFLOW_INPUT',
    state: 'UNKNOWN',
    title: 'When was the HVAC filter last changed?',
    question: 'Enter the date you last replaced or cleaned the HVAC air filter.',
    helpText: 'This records a completed HVAC filter maintenance task and sets the next 90-day reminder. Nothing is saved until you confirm.',
    inputSchema: {
      type: 'GROUP',
      fields: [
        {
          key: 'completedDate',
          label: 'Last filter change date',
          required: true,
          inputSchema: {
            type: 'APPROXIMATE_DATE' as const,
            allowedPrecisions: ['EXACT_DATE'],
            allowFuture: false,
          },
        },
      ],
    } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean,
    allowNotSure: false,
    sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this maintenance record; nothing is saved until you confirm',
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

const STEP_TARGET_STATUS: Readonly<Record<'COMPLETE_STEP' | 'SKIP_STEP' | 'REOPEN_STEP', WeatherPreparationItemStatus>> = {
  COMPLETE_STEP: 'COMPLETED',
  SKIP_STEP: 'CANCELED',
  REOPEN_STEP: 'CREATED',
};

const STEP_STATUS_LABELS: Readonly<Record<WeatherPreparationItemStatus, string>> = {
  CREATED: 'To do',
  COMPLETED: 'Done',
  CANCELED: 'Not needed',
};

export async function environmentReportCommandResult(
  userId: string,
  propertyId: string,
  launch: EnvironmentReportCommandLaunch,
  supplied?: EnvironmentHvacFilterForm,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return blocked(
      'ASK_PERMISSION_REQUIRED',
      'A contributor or owner can update weather preparation and maintenance',
      'Your role can view this home’s Environment Report but not change checklists or maintenance records. Nothing has changed.',
    );
  }

  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const baseParams = {
    sourceExecutionId: launch.sourceExecutionId,
    confirmationVersion: 1,
    confirmationExpiresAt: expiresAt.toISOString(),
  };

  if (launch.kind === 'START_PREPARATION') {
    const report = await getEnvironmentReportForProperty(propertyId, userId);
    const insight = report?.insights.find((item) => item.id === launch.entityId) ?? null;
    if (!insight) {
      return unavailable(
        'ENVIRONMENT_INSIGHT_NOT_FOUND',
        'That environmental alert is no longer active',
        'Ask Cozy could not find that active alert on your Environment Report. Nothing has changed.',
      );
    }
    if (insight.relatedIncident) {
      return unavailable(
        'WEATHER_PREPARATION_ALREADY_STARTED',
        'That weather preparation checklist is already started',
        `A preparation checklist for "${insight.title}" is already tracked. Nothing has changed.`,
      );
    }
    if (insight.recommendedActions.length === 0) {
      return unavailable(
        'WEATHER_PREPARATION_NO_STEPS',
        'No checklist steps are needed for this alert',
        'This informational note does not have a preparation checklist to start. Nothing has changed.',
      );
    }

    const contextVersion = insightVersion(insight);
    return {
      status: 'NEEDS_CONFIRMATION',
      reasonCode: 'ENVIRONMENT_START_PREPARATION_CONFIRMATION_REQUIRED',
      contextVersion,
      parameters: {
        environmentReportCommand: { kind: 'START_PREPARATION', entityId: insight.id },
        environmentReportContextVersion: contextVersion,
        ...baseParams,
      },
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-start-preparation-review',
          title: `Review: Start checklist for ${insight.title}`,
          body: 'Nothing is saved until you confirm.',
          tone: 'DEFAULT',
          actions: [],
        },
      ],
      confirmation: {
        confirmationId: `env-prep-start-${sha(`${propertyId}:${insight.id}`).slice(0, 12)}-1`,
        version: 1,
        title: `Start preparation checklist for "${insight.title}"?`,
        description: 'This creates a tracked weather preparation checklist on your home record so household members can check off each step.',
        fields: [
          { label: 'Alert', value: insight.title },
          { label: 'Timeframe', value: insight.timeframe },
          { label: 'Checklist steps', value: `${insight.recommendedActions.length} steps (${insight.recommendedActions.slice(0, 3).join('; ')})` },
        ],
        editableFields: [],
        confirmLabel: 'Start checklist',
        consentText: 'I authorize creating this weather preparation checklist on the shared home record.',
        expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  if (launch.kind === 'COMPLETE_STEP' || launch.kind === 'SKIP_STEP' || launch.kind === 'REOPEN_STEP') {
    const parsedEntity = parseWeatherPreparationStepEntityId(launch.entityId);
    if (!parsedEntity) {
      return unavailable(
        'WEATHER_PREPARATION_ITEM_NOT_FOUND',
        'That checklist step could not be found',
        'Ask Cozy could not find that weather preparation step. Nothing has changed.',
      );
    }
    const preparation = await getWeatherPreparation(propertyId, parsedEntity.preparationId);
    const item = preparation?.items.find((entry) => entry.id === parsedEntity.itemId) ?? null;
    if (!preparation || !item) {
      return unavailable(
        'WEATHER_PREPARATION_ITEM_NOT_FOUND',
        'That checklist step is no longer available',
        'Ask Cozy could not find that weather preparation step. Nothing has changed.',
      );
    }

    const targetStatus = STEP_TARGET_STATUS[launch.kind];
    const allowedFromOpen = (launch.kind === 'COMPLETE_STEP' || launch.kind === 'SKIP_STEP') && item.status === 'CREATED';
    const allowedReopen = launch.kind === 'REOPEN_STEP' && (item.status === 'COMPLETED' || item.status === 'CANCELED');
    if (!allowedFromOpen && !allowedReopen) {
      return unavailable(
        'WEATHER_PREPARATION_STEP_STATE_CHANGED',
        'That step is already in that state',
        `This checklist step is currently marked "${STEP_STATUS_LABELS[item.status]}". Nothing has changed.`,
      );
    }

    const contextVersion = preparationStepVersion(launch.kind, preparation, item);
    const spec = {
      COMPLETE_STEP: {
        title: 'Mark this preparation step done?',
        confirmLabel: 'Mark done',
        description: 'This marks the step completed on the shared weather preparation checklist.',
      },
      SKIP_STEP: {
        title: 'Mark this preparation step not needed?',
        confirmLabel: 'Mark not needed',
        description: 'This sets the step aside as not needed for this home.',
      },
      REOPEN_STEP: {
        title: 'Reopen this preparation step?',
        confirmLabel: 'Reopen step',
        description: 'This moves the step back to "To do" on the weather preparation checklist.',
      },
    }[launch.kind];

    return {
      status: 'NEEDS_CONFIRMATION',
      reasonCode: `ENVIRONMENT_${launch.kind}_CONFIRMATION_REQUIRED`,
      contextVersion,
      parameters: {
        environmentReportCommand: { kind: launch.kind, entityId: launch.entityId },
        environmentReportContextVersion: contextVersion,
        ...baseParams,
      },
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-step-review',
          title: `Review: ${item.label}`,
          body: 'Nothing is saved until you confirm.',
          tone: 'DEFAULT',
          actions: [],
        },
      ],
      confirmation: {
        confirmationId: `env-prep-step-${launch.kind.toLowerCase()}-${sha(`${launch.entityId}:${targetStatus}`).slice(0, 12)}-1`,
        version: 1,
        title: spec.title,
        description: spec.description,
        fields: [
          { label: 'Checklist', value: preparation.title },
          { label: 'Step', value: item.label },
          { label: 'Status', value: `${STEP_STATUS_LABELS[item.status]} → ${STEP_STATUS_LABELS[targetStatus]}` },
        ],
        editableFields: [],
        confirmLabel: spec.confirmLabel,
        consentText: 'I authorize this update to the shared weather preparation checklist.',
        expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  // RECORD_HVAC_FILTER
  const context = await getPropertyContext(propertyId, { userId }, {
    scopes: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'],
  });
  const rawLastCompleted = context.facts.hvacFilterLastCompletedDate.value;
  const lastCompletedIso = typeof rawLastCompleted === 'string' ? rawLastCompleted : null;
  const contextVersion = hvacFilterContextVersion(propertyId, lastCompletedIso);

  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT',
      reasonCode: 'ENVIRONMENT_HVAC_FILTER_INPUT_REQUIRED',
      contextVersion,
      parameters: {
        environmentReportLaunch: {
          kind: 'RECORD_HVAC_FILTER',
          entityId: propertyId,
          sourceExecutionId: launch.sourceExecutionId,
        },
      },
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-hvac-filter-input',
          title: 'Record last HVAC filter change',
          body: 'Enter the date the HVAC filter was last replaced or cleaned. Nothing is saved until you review and confirm.',
          tone: 'DEFAULT',
          actions: [],
        },
      ],
      captureRequests: [hvacFilterCapture(contextVersion)],
      suggestions: [],
    };
  }

  const nextDue = new Date(`${supplied.completedDate}T12:00:00.000Z`);
  nextDue.setUTCDate(nextDue.getUTCDate() + 90);

  return {
    status: 'NEEDS_CONFIRMATION',
    reasonCode: 'ENVIRONMENT_HVAC_FILTER_CONFIRMATION_REQUIRED',
    contextVersion,
    parameters: {
      environmentHvacFilterForm: supplied,
      environmentReportCommand: { kind: 'RECORD_HVAC_FILTER', entityId: propertyId },
      environmentReportContextVersion: contextVersion,
      ...baseParams,
    },
    blocks: [
      {
        type: 'SUMMARY',
        id: 'environment-hvac-filter-review',
        title: 'Review: HVAC filter maintenance record',
        body: 'Nothing is saved until you confirm.',
        tone: 'DEFAULT',
        actions: [],
      },
    ],
    confirmation: {
      confirmationId: `env-hvac-filter-${sha(`${propertyId}:${supplied.completedDate}`).slice(0, 12)}-1`,
      version: 1,
      title: 'Record this HVAC filter change?',
      description: 'This records a completed HVAC filter maintenance task on your home record and schedules the next quarterly reminder.',
      fields: [
        { label: 'Maintenance item', value: 'Replace or clean HVAC filter' },
        { label: 'Last completed', value: humanDate(new Date(`${supplied.completedDate}T12:00:00.000Z`)) ?? supplied.completedDate },
        { label: 'Next due (90-day cycle)', value: humanDate(nextDue) ?? nextDue.toISOString().slice(0, 10) },
      ],
      editableFields: [],
      confirmLabel: 'Record filter change',
      consentText: 'I authorize recording this HVAC filter maintenance update on the shared home record.',
      expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [hvacFilterCapture(contextVersion, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('environment-report.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = environmentReportCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'ENVIRONMENT_REPORT_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) {
    return notRoutable();
  }
  if (kind === 'START_PREPARATION' && launch.entityType !== ENVIRONMENT_INSIGHT_ENTITY_TYPE) return notRoutable();
  if ((kind === 'COMPLETE_STEP' || kind === 'SKIP_STEP' || kind === 'REOPEN_STEP') && launch.entityType !== WEATHER_PREPARATION_ITEM_ENTITY_TYPE) {
    return notRoutable();
  }
  if (kind === 'RECORD_HVAC_FILTER' && launch.entityType !== ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE) return notRoutable();

  return environmentReportCommandResult(envelope.userId, envelope.propertyId!, {
    kind,
    entityId: launch.entityId,
    sourceExecutionId: launch.sourceExecutionId ?? null,
  });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmEnvironmentReportCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.environmentReportCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as EnvironmentReportCommandKind | undefined;
  if (!kind || !(kind in ENVIRONMENT_REPORT_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') {
    throw stale('The change to make is invalid.');
  }
  const propertyId = execution.propertyId;

  let artifactId = command.entityId;
  let progressTitle = 'Updated';
  let progressDescription = 'Your Environment Report has been updated.';

  if (kind === 'START_PREPARATION') {
    const report = await getEnvironmentReportForProperty(propertyId, userId);
    const insight = report?.insights.find((item) => item.id === command.entityId) ?? null;
    if (!insight) throw stale('That environmental alert is no longer active.');
    if (insight.relatedIncident) throw stale('A preparation checklist for this alert was already started.');
    if (parameters.environmentReportContextVersion !== insightVersion(insight)) {
      throw stale('This alert changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const created = await startWeatherPreparation(propertyId, userId, insight);
    artifactId = created.id;
    progressTitle = 'Weather preparation checklist started';
    progressDescription = `Started "${created.title}" with ${created.progress.total} checklist steps.`;
  } else if (kind === 'COMPLETE_STEP' || kind === 'SKIP_STEP' || kind === 'REOPEN_STEP') {
    const parsedEntity = parseWeatherPreparationStepEntityId(command.entityId);
    if (!parsedEntity) throw stale('That checklist step is invalid.');
    const preparation = await getWeatherPreparation(propertyId, parsedEntity.preparationId);
    const item = preparation?.items.find((entry) => entry.id === parsedEntity.itemId) ?? null;
    if (!preparation || !item) throw stale('That checklist step is no longer available.');
    if (parameters.environmentReportContextVersion !== preparationStepVersion(kind, preparation, item)) {
      throw stale('This checklist step changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const targetStatus = STEP_TARGET_STATUS[kind];
    const updated = await updateWeatherPreparationItem(propertyId, parsedEntity.preparationId, parsedEntity.itemId, targetStatus);
    if (!updated) throw stale('That checklist step could not be updated.');
    artifactId = parsedEntity.itemId;
    progressTitle = kind === 'COMPLETE_STEP' ? 'Step marked done' : kind === 'SKIP_STEP' ? 'Step marked not needed' : 'Step reopened';
    progressDescription = `${updated.progress.completed} of ${updated.progress.total} steps completed on "${updated.title}".`;
  } else {
    const context = await getPropertyContext(propertyId, { userId }, {
      scopes: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'],
    });
    const rawLastCompleted = context.facts.hvacFilterLastCompletedDate.value;
    const lastCompletedIso = typeof rawLastCompleted === 'string' ? rawLastCompleted : null;
    if (parameters.environmentReportContextVersion !== hvacFilterContextVersion(propertyId, lastCompletedIso)) {
      throw stale('The HVAC filter record changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const checked = parseEnvironmentHvacFilterAnswer(parameters.environmentHvacFilterForm);
    if (!checked.success) throw stale(ENVIRONMENT_HVAC_FILTER_INVALID_MESSAGES[checked.reason]);
    await recordHvacFilterMaintenance(propertyId, checked.data.completedDate, context);
    artifactId = propertyId;
    progressTitle = 'HVAC filter change recorded';
    progressDescription = 'Your HVAC filter maintenance record and 90-day reminder schedule have been updated.';
  }

  const result: AskOperationResult = {
    status: 'COMPLETED',
    reasonCode: `ENVIRONMENT_REPORT_${kind}_COMPLETED`,
    blocks: [
      {
        type: 'WORKFLOW_PROGRESS',
        id: `environment-report-${kind.toLowerCase()}-${artifactId}`,
        title: progressTitle,
        status: 'COMPLETED',
        description: progressDescription,
        details: [],
        actions: [{ ...backToEnvironmentReport, label: 'See my Environment Report', style: 'PRIMARY' as const }],
      },
    ],
    suggestions: [],
  };

  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION',
      id: `environment-report-refresh-failed-${artifactId}`,
      severity: 'CAUTION',
      title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }

  return {
    result,
    artifactType: 'WEATHER_PREPARATION',
    artifactId,
    refreshedExecutions: refresh.refreshedExecutions,
  };
}

registerConfirmCapabilityHandler('environment-report.command', confirmEnvironmentReportCommand);
