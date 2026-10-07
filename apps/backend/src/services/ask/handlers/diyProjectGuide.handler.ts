// DIY project guide (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md, step 5 of the stateful GUIDE): a READ-ONLY, launch-only walk through one DIY project,
// reached only from the declared row action on a DIY_PROJECTS row (launchContext.entityType 'DIY_PROJECT', entityId the project id), never by message. Same
// shape as GUIDANCE_JOURNEY_CONTINUE: the entity type is a literal the handler checks, and an id that is not in this property answers "couldn't find".
// It reads canonical state on every open and refresh, owns no progress, and writes nothing. Step 6 adds the declared step actions to the card for a contributor or owner;
// the write itself is DIY_STEP_UPDATE (diyStepUpdate.handler.ts).
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { type CapabilityInvocationEnvelope } from '../capabilityInvocation.contract';
import { diyService } from '../../diy.service';
import { logger } from '../../../lib/logger';
import { HouseholdRole } from '@prisma/client';
import { buildFinishedProjectBlocks, buildPreviousStepBlocks, buildProjectGuideBlocks, buildProjectOptionsBlocks, DIY_PROJECT_MORE, DIY_VIEW_ACTION_ID, DIY_VIEW_ENTITY_TYPE, evaluateProjectGuide, projectNotFoundBlocks, refusalBlocks, type GuideSource } from '../../diy/projectGuide';

/** `canEdit` is whether the person asking may change the project (a contributor or owner); only then does the guide card carry the step actions (plan section 3.1). Default false. */
export async function diyProjectGuideResult(propertyId: string, launchContext?: CapabilityInvocationEnvelope['launchContext'], now: Date = new Date(), canEdit = false): Promise<AskOperationResult> {
  // Two launches: the project (the live guide) or one finished step of it (the previous-step view, a READ; a refresh keeps the entity fields, so the view survives one).
  const viewedStepId = launchContext?.entityType === DIY_VIEW_ENTITY_TYPE && launchContext.actionId === DIY_VIEW_ACTION_ID ? launchContext.entityId ?? null : null;
  const requestedProjectId = launchContext?.entityType === 'DIY_PROJECT' ? launchContext.entityId : null;
  const source = viewedStepId
    ? await diyService.getProjectGuideSourceForStep(viewedStepId, propertyId)
    : requestedProjectId ? await diyService.getProjectGuideSource(requestedProjectId, propertyId) : null;
  const projectId = source?.project.id ?? requestedProjectId;
  // Not in this property (another property's project, a deleted one, a missing id): the same answer, and nothing about whether it exists elsewhere.
  if (!projectId || !source) return { status: 'ANSWERED', reasonCode: 'DIY_GUIDE_PROJECT_NOT_FOUND', blocks: projectNotFoundBlocks(propertyId), suggestions: [] };

  const evaluation = evaluateProjectGuide(source as unknown as GuideSource);
  // A COMPLETED project that would otherwise be guideable (a reviewed template, matching steps) shows its finished view with the status of the records that follow a completion.
  // A project of any other origin, and one stopped or handed off, keeps the plain "finished" refusal and its page link: nothing of an unreviewed project's steps is shown.
  if (evaluation.kind === 'REFUSED' && evaluation.reason === 'PROJECT_FINISHED' && source.project.status === 'COMPLETED') {
    const probe = evaluateProjectGuide({ ...(source as unknown as GuideSource), project: { ...(source as unknown as GuideSource).project, status: 'IN_PROGRESS' } });
    if (probe.kind === 'GUIDE') {
      const effects = await diyService.readProjectEffects(projectId, propertyId);
      return { status: 'ANSWERED', reasonCode: 'DIY_PROJECT_FINISHED_VIEW', blocks: buildFinishedProjectBlocks({ source: source as unknown as GuideSource, propertyId, asOf: now, canEdit, effects }), suggestions: [] };
    }
  }
  if (evaluation.kind === 'REFUSED') {
    // Field names only, never the text: an altered or mismatched step list is an operational signal, not something to echo.
    if (evaluation.reason === 'STEPS_NOT_FROM_REVISION' || evaluation.reason === 'REVISION_INTEGRITY') {
      logger.warn({ projectId, reason: evaluation.reason, mismatches: evaluation.mismatches }, '[DIY-GUIDE] refusing to guide a project whose steps cannot be confirmed against its reviewed revision');
    }
    return { status: 'ANSWERED', reasonCode: `DIY_GUIDE_${evaluation.reason}`, blocks: refusalBlocks(evaluation.reason, source as unknown as GuideSource, propertyId, projectId), suggestions: [] };
  }
  // The stop-or-hand-off options (a read, kept across a refresh by the stored action id), for the project itself.
  if (!viewedStepId && launchContext?.entityType === 'DIY_PROJECT' && launchContext.actionId === DIY_PROJECT_MORE.actionId) {
    return { status: 'ANSWERED', reasonCode: 'DIY_PROJECT_OPTIONS_READY', blocks: buildProjectOptionsBlocks({ source: source as unknown as GuideSource, evaluation, propertyId, asOf: now, canEdit }), suggestions: [] };
  }
  if (viewedStepId) {
    // A step that is not a valid "previous step" (it is the current step now, a later one, or unfinished) falls back to the live guide: the view never invents a state.
    const previous = buildPreviousStepBlocks({ source: source as unknown as GuideSource, evaluation, propertyId, asOf: now, viewedStepId, canAdvance: canEdit });
    if (previous) return { status: 'ANSWERED', reasonCode: 'DIY_PREVIOUS_STEP_READY', blocks: previous, suggestions: [] };
  }
  // An open project linked to a maintenance task: read-only status of that link (only a recoverable failure is shown).
  const linkedTask = (source.project as { maintenanceTaskId?: string | null }).maintenanceTaskId ? (await diyService.readProjectEffects(projectId, propertyId))?.taskLink ?? null : null;
  return {
    status: 'ANSWERED', reasonCode: 'DIY_PROJECT_GUIDE_READY',
    blocks: buildProjectGuideBlocks({ source: source as unknown as GuideSource, evaluation, propertyId, asOf: now, canAdvance: canEdit, taskLink: linkedTask }),
    suggestions: [],
  };
}

// The role is read per request, so a viewer's answer never carries a step action (the emit-time gate; the audience filter is a second layer only).
registerCapabilityHandler('diy.project-guide', async (envelope) => {
  // Loaded on use, so the pure result function above stays importable (and testable) without the whole Ask support module graph.
  const { ensurePropertyAccess } = await import('../askHandlerSupport');
  const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return diyProjectGuideResult(envelope.propertyId!, envelope.launchContext, new Date(), access.role !== HouseholdRole.VIEWER);
});
