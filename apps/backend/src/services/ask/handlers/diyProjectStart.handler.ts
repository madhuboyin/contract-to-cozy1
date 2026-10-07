// Start a DIY project from Ask (docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md, step 8): a read-only card of the reviewed templates this home can start (DIY_TEMPLATE_BROWSE),
// and the confirmation-gated write that starts one (DIY_PROJECT_START). Both are launch-only: the browse is reached by the declared action on the DIY projects card, the start only by
// the row action on a browse row (launchContext.operationId, entityType 'DIY_TEMPLATE', the template id and the exact canned message), never by typed wording or a refresh.
//
// The service is the authority: diyService.startProjectFromTemplate re-checks the role, serializes concurrent starts, refuses a duplicate open project, and re-checks the head revision,
// integrity, eligibility and applicability INSIDE its transaction. What is checked here is early, friendly answers. A started project is "stoppable, but not undoable or deletable":
// the confirmation says it creates a durable project record that can later be stopped.
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { diyService } from '../../diy.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { logger } from '../../../lib/logger';
import {
  DIY_PROJECT_ENTITY_TYPE, DIY_PROJECT_START_ACTION, DIY_START_GUIDE_ACTION_ID, DIY_TEMPLATE_ENTITY_TYPE,
} from '../../diy/projectGuide';

const BOUNDARY_ID = 'diy-template-boundary';
const SUGGESTIONS = ['Show my DIY projects'];
const CATEGORY_LABELS: Record<string, string> = {
  HVAC: 'HVAC', PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical', PAINTING: 'Painting', GENERAL: 'General', EXTERIOR: 'Exterior',
  FLOORING: 'Flooring', APPLIANCE: 'Appliances', LANDSCAPING: 'Landscaping', OTHER: 'Other',
};

type Launch = CreateAskExecutionRequest['launchContext'] | undefined;
type StartableTemplate = Awaited<ReturnType<typeof diyService.listStartableTemplates>>['items'][number];

const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'BOUNDARY', id: BOUNDARY_ID, title, body, severity: 'INFO', suggestions: SUGGESTIONS }], suggestions: SUGGESTIONS,
});
const guideAction = (projectId: string) => ({
  id: DIY_START_GUIDE_ACTION_ID, label: 'Guide me through this project', interactionType: 'START_WORKFLOW' as const, message: 'Guide me through this project.',
  operationId: 'DIY_PROJECT_GUIDE', entityType: DIY_PROJECT_ENTITY_TYPE, entityId: projectId, style: 'PRIMARY' as const,
});
const minutes = (value: number | null | undefined) => (!value ? null : value < 60 ? `About ${value} min` : `About ${Math.round((value / 60) * 10) / 10} hr`);

// ---- browse (read-only) ---------------------------------------------------------------------------------------------------------------------------------

/** Pure: the card. `canStart` is whether the person may change the property (a contributor or owner); only then do rows carry the start action. */
export function diyTemplateBrowseFromItems(view: { items: StartableTemplate[]; hasMore: boolean }, propertyId: string, canStart: boolean): AskOperationResult {
  const scope: AskPresentationBlock = {
    type: 'BOUNDARY', id: BOUNDARY_ID, title: 'Only reviewed, low-risk projects',
    body: 'Only reviewed templates that fit this home are offered here. Electrical panel or wiring work, gas lines, structural work, active leaks or flooding, and hazardous materials are for a licensed professional. Stop if anything feels unsafe.',
    severity: 'INFO', suggestions: [],
  };
  if (!view.items.length) {
    return {
      status: 'ANSWERED', reasonCode: 'DIY_TEMPLATE_BROWSE_EMPTY',
      blocks: [{
        type: 'EMPTY_STATE', id: 'diy-template-browse-empty', title: 'No reviewed projects to start yet',
        body: 'There are no reviewed DIY projects that fit this home right now. Check back once one is published.', actions: [],
      }, scope],
      suggestions: SUGGESTIONS,
    };
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'diy-template-browse-summary',
    title: `${view.items.length}${view.hasMore ? '+' : ''} reviewed project${view.items.length === 1 && !view.hasMore ? '' : 's'} you can start`,
    body: canStart
      ? 'Starting one creates a project record with its steps, and you can stop it later. Nothing is booked, bought or scheduled.'
      : 'A contributor or owner of this home can start one. Nothing is booked, bought or scheduled.',
    tone: 'DEFAULT', actions: [],
  }];
  if (view.hasMore) {
    blocks.push({ type: 'LIMITATION', id: 'diy-template-browse-limit', title: `Showing the first ${view.items.length}`, body: 'There are more reviewed projects than are shown here.', severity: 'INFO' });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'diy-template-browse', title: 'Projects you can start', description: 'Reviewed templates that fit this home, in alphabetical order.',
    sections: [{
      id: 'diy-templates', title: 'Reviewed projects', count: view.items.length,
      items: view.items.map((item) => ({
        id: item.openProjectId ?? item.id, title: item.title, description: item.shortDescription,
        meta: [CATEGORY_LABELS[item.category] ?? item.category, `${item.stepCount} steps`, minutes(item.estimatedMinutes)].filter((value): value is string => Boolean(value)),
        status: item.openProjectId ? 'Already started' : null,
        entityType: item.openProjectId ? DIY_PROJECT_ENTITY_TYPE : DIY_TEMPLATE_ENTITY_TYPE,
        // A template with an open project offers the in-Ask guide for that project; otherwise a contributor or owner gets the start action (the row id is the template's).
        ...(item.openProjectId
          ? { actions: [{ id: 'guide-diy-project', label: 'Guide me through this project', message: 'Guide me through this project.', style: 'SECONDARY' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'DIY_PROJECT_GUIDE' }] }
          : canStart ? {
            actions: [{
              id: DIY_PROJECT_START_ACTION.id, label: DIY_PROJECT_START_ACTION.label, message: DIY_PROJECT_START_ACTION.message, style: 'SECONDARY' as const,
              interactionType: 'MUTATE_RECORD' as const, operationId: 'DIY_PROJECT_START',
            }],
          } : {}),
      })),
    }],
    actions: [],
  });
  blocks.push(scope);
  return { status: 'ANSWERED', reasonCode: 'DIY_TEMPLATE_BROWSE_READY', blocks, suggestions: SUGGESTIONS };
}

registerCapabilityHandler('diy.template-browse', async (envelope) => {
  const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  const view = await diyService.listStartableTemplates(envelope.propertyId!, envelope.userId);
  return diyTemplateBrowseFromItems(view, envelope.propertyId!, access.role !== HouseholdRole.VIEWER);
});

// ---- start (confirmation-gated write) ------------------------------------------------------------------------------------------------------------------

/** The declared start of a launch, or null: the operation, entity type DIY_TEMPLATE, a template id, the exact canned message, and (when sent) the matching action id. */
function declaredStart(message: string, launchContext: Launch): { templateId: string } | null {
  if (!launchContext || launchContext.operationId !== 'DIY_PROJECT_START' || launchContext.surface === 'ASK_REFRESH') return null;
  if (launchContext.entityType !== DIY_TEMPLATE_ENTITY_TYPE || !launchContext.entityId) return null;
  if (message.trim() !== DIY_PROJECT_START_ACTION.message) return null;
  return { templateId: launchContext.entityId };
}

function alreadyStarted(title: string, projectId: string, propertyId: string): AskOperationResult {
  return {
    status: 'COMPLETED', reasonCode: 'DIY_PROJECT_ALREADY_STARTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'diy-project-start-already', title: 'Already started', status: 'COMPLETED',
      description: 'You already have this project open, so no second one was made. Nothing was changed.',
      details: [{ label: 'Project', value: title }],
      actions: [guideAction(projectId)],
    }],
    suggestions: SUGGESTIONS,
  };
}

/** The service's refusals become the confirmation's own answers. */
function serviceRefusal(error: any): never {
  const code = error?.code;
  if (code === 'DIY_ACCESS_REVOKED') throw writeError('A contributor or owner is required to start a project in Ask.', 'ASK_PERMISSION_REQUIRED');
  if (code === 'DIY_TEMPLATE_CHANGED' || code === 'DIY_TEMPLATE_UNAVAILABLE' || code === 'DIY_NOT_LOW_RISK' || code === 'DIY_PROPERTY_NOT_APPLICABLE' || error?.statusCode === 404) {
    throw writeError('This project is no longer available to start for this home. Review the projects you can start and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  throw error;
}

function track(userId: string, propertyId: string, category: string): void {
  try {
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.DIY_DECISION, metadataJson: { actionType: 'create_project', category, source: 'ask' },
    });
  } catch (error) {
    logger.warn({ error: (error as Error).message }, '[DIY] analytics emit failed for an Ask project start');
  }
}

export async function diyProjectStartResult(userId: string, propertyId: string, message: string, launchContext?: Launch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const decl = declaredStart(message, launchContext);
  if (!decl) return boundary("Use the project's own action", 'Open the list of projects you can start and use its Start this project button. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_START_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can start a project in Ask. Nothing was changed.', 'BLOCKED', 'DIY_PROJECT_START_PERMISSION_REQUIRED');

  // Proposal-time findings are a courtesy; the service decides again at confirmation.
  const view = await diyService.listStartableTemplates(propertyId, userId, { templateId: decl.templateId });
  const item = view.items[0];
  if (!item) return boundary('This project is not available', 'It was withdrawn, or it does not fit this home. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_START_UNAVAILABLE');
  if (item.openProjectId) return alreadyStarted(item.title, item.openProjectId, propertyId);

  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const description = 'This creates a project record with its steps for this home. It can later be stopped or handed off, but not undone or deleted. Nothing is booked, bought or scheduled.';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_PROJECT_START_CONFIRMATION_REQUIRED', contextVersion: item.revisionId,
    parameters: {
      diyTemplateId: item.id, diyTemplateRevisionId: item.revisionId, diyTemplateCategory: item.category,
      sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'diy-project-start-review', title: `Review starting "${item.title}"`, body: `Nothing has changed yet. ${description}`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `diy-project-start-${item.id}-${item.revisionId}`, version: 1, title: `Start "${item.title}"?`, description,
      fields: [
        { label: 'Project', value: item.title },
        { label: 'Steps', value: `${item.stepCount}` },
        ...(minutes(item.estimatedMinutes) ? [{ label: 'Time', value: minutes(item.estimatedMinutes)! }] : []),
        { label: 'Booking or purchases', value: 'None' },
        { label: 'Can be stopped later', value: 'Yes' },
        { label: 'Can be undone or deleted', value: 'No' },
      ],
      editableFields: [], confirmLabel: 'Start project', consentText: 'I want to start this project and create its record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('diy.project-start', async (envelope) => diyProjectStartResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

async function confirmDiyProjectStart(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to start a project in Ask.', 'ASK_PERMISSION_REQUIRED');
  const templateId = typeof parameters.diyTemplateId === 'string' ? parameters.diyTemplateId : null;
  const revisionId = typeof parameters.diyTemplateRevisionId === 'string' ? parameters.diyTemplateRevisionId : null;
  if (!templateId || !revisionId) throw writeError('The project selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');

  let result;
  try {
    result = await diyService.startProjectFromTemplate(execution.propertyId, templateId, { actorUserId: userId, requireGoverned: true, expectedRevisionId: revisionId });
  } catch (error) {
    serviceRefusal(error);
  }
  // Only a project this call newly created emits analytics; a second confirmation or a concurrent one that lost the race is the "already started" receipt.
  const created = result.outcome === 'CREATED';
  if (created) track(userId, execution.propertyId, String(result.project.category));
  const projectId = result.project.id;
  const outcome: AskOperationResult = created
    ? {
      status: 'COMPLETED', reasonCode: 'DIY_PROJECT_STARTED',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: 'diy-project-start-receipt', title: 'Project started', status: 'COMPLETED',
        description: 'The project and its steps were created, and you are on step 1. Nothing was booked, bought or scheduled. You can stop it later.',
        details: [{ label: 'Project', value: result.project.title }],
        actions: [guideAction(projectId)],
      }],
      suggestions: SUGGESTIONS,
    }
    : alreadyStarted(result.project.title, projectId, execution.propertyId);

  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    outcome.blocks.push({
      type: 'BOUNDARY', id: BOUNDARY_ID, severity: 'CAUTION', title: 'Saved; the list could not refresh',
      body: 'The project was recorded. The list you were looking at could not refresh automatically; open it again to see it.', suggestions: [],
    });
  }
  return { result: outcome, artifactType: 'DIY_PROJECT', artifactId: projectId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('diy.project-start', confirmDiyProjectStart);
