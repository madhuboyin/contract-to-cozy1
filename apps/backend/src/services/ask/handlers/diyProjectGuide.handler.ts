// DIY project guide (docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md, step 5 of the stateful GUIDE): a READ-ONLY, launch-only walk through one DIY project,
// reached only from the declared row action on a DIY_PROJECTS row (launchContext.entityType 'DIY_PROJECT', entityId the project id), never by message. Same
// shape as GUIDANCE_JOURNEY_CONTINUE: the entity type is a literal the handler checks, and an id that is not in this property answers "couldn't find".
// It reads canonical state on every open and refresh, owns no progress, and writes nothing.
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { type CapabilityInvocationEnvelope } from '../capabilityInvocation.contract';
import { diyService } from '../../diy.service';
import { logger } from '../../../lib/logger';
import { buildProjectGuideBlocks, evaluateProjectGuide, projectNotFoundBlocks, refusalBlocks, type GuideSource } from '../../diy/projectGuide';

export async function diyProjectGuideResult(propertyId: string, launchContext?: CapabilityInvocationEnvelope['launchContext'], now: Date = new Date()): Promise<AskOperationResult> {
  const projectId = launchContext?.entityType === 'DIY_PROJECT' ? launchContext.entityId : null;
  const source = projectId ? await diyService.getProjectGuideSource(projectId, propertyId) : null;
  // Not in this property (another property's project, a deleted one, a missing id): the same answer, and nothing about whether it exists elsewhere.
  if (!projectId || !source) return { status: 'ANSWERED', reasonCode: 'DIY_GUIDE_PROJECT_NOT_FOUND', blocks: projectNotFoundBlocks(propertyId), suggestions: [] };

  const evaluation = evaluateProjectGuide(source as unknown as GuideSource);
  if (evaluation.kind === 'REFUSED') {
    // Field names only, never the text: an altered or mismatched step list is an operational signal, not something to echo.
    if (evaluation.reason === 'STEPS_NOT_FROM_REVISION' || evaluation.reason === 'REVISION_INTEGRITY') {
      logger.warn({ projectId, reason: evaluation.reason, mismatches: evaluation.mismatches }, '[DIY-GUIDE] refusing to guide a project whose steps cannot be confirmed against its reviewed revision');
    }
    return { status: 'ANSWERED', reasonCode: `DIY_GUIDE_${evaluation.reason}`, blocks: refusalBlocks(evaluation.reason, source as unknown as GuideSource, propertyId, projectId), suggestions: [] };
  }
  return {
    status: 'ANSWERED', reasonCode: 'DIY_PROJECT_GUIDE_READY',
    blocks: buildProjectGuideBlocks({ source: source as unknown as GuideSource, evaluation, propertyId, asOf: now }),
    suggestions: [],
  };
}

registerCapabilityHandler('diy.project-guide', async (envelope) => diyProjectGuideResult(envelope.propertyId!, envelope.launchContext));
