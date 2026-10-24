// Completion reports for a guided journey from the Project Tracker, shared by every surface that performs the same write (the Desktop controller and Ask).
// They used to be inline in projectTracker.controller, so a project created or completed in Ask advanced no journey. Reporting is best-effort (a failure is
// logged, never thrown: the project write already happened) and idempotent through the dedupe keys.
//
// A project stores the journey it was created for, so closure reports go to exactly that journey: nothing falls back to a signal family, and a journey that is no
// longer open is not reported to.

import { logger } from '../../lib/logger';
import { getGuidanceModels } from './guidanceTypes';
import { guidanceJourneyService } from './guidanceJourney.service';

export const PROJECT_CREATE_STEP_KEY = 'confirm_scope_and_provider';

export type ProjectCreatedReport = {
  projectId: string;
  journeyId: string;
  inventoryItemId?: string | null;
  executionPath?: string | null;
  fulfillmentMode?: string | null;
  fundingMode?: string | null;
  complexity?: string | null;
};

/** Reports a created project to the journey step "Confirm scope and execution path". Returns whether it was recorded; never throws. */
export async function reportProjectCreated(propertyId: string, actorUserId: string, project: ProjectCreatedReport): Promise<boolean> {
  try {
    await guidanceJourneyService.recordToolCompletion({
      propertyId,
      actorUserId,
      journeyId: project.journeyId,
      inventoryItemId: project.inventoryItemId ?? null,
      sourceToolKey: 'project-tracker',
      sourceEntityType: 'PROJECT',
      sourceEntityId: project.projectId,
      stepKey: PROJECT_CREATE_STEP_KEY,
      status: 'COMPLETED',
      dedupeKey: `project-tracker:${propertyId}:${project.projectId}:${PROJECT_CREATE_STEP_KEY}`,
      producedData: {
        proofType: 'project_scope_confirmation',
        proofId: project.projectId,
        projectId: project.projectId,
        executionPath: project.executionPath ?? null,
        fulfillmentMode: project.fulfillmentMode ?? 'PROVIDER',
        fundingMode: project.fundingMode ?? 'UNDECIDED',
        complexity: project.complexity ?? 'MAJOR',
      },
    });
    return true;
  } catch (guidanceError) {
    logger.warn({ guidanceError }, '[PHASE3] project handoff guidance hook failed');
    return false;
  }
}

export type ProjectClosureReport = {
  projectId: string;
  journeyId: string | null | undefined;
  inventoryItemId?: string | null;
  outcomeStatus: string;
  writeBackAppliedAt?: unknown;
  homeEventId?: string | null;
  documentIds?: string[] | null;
  futureCareTaskIds?: string[] | null;
};

/**
 * Reports a verified project closure to the journey the project was created for (the five closure steps, each with its own proof). Returns null when there is
 * nothing to report (no journey, or an outcome that is not a verified success), true when recorded, false when the journey is no longer open or the report failed.
 */
export async function reportProjectClosure(propertyId: string, actorUserId: string, closure: ProjectClosureReport): Promise<boolean | null> {
  if (!closure.journeyId || closure.outcomeStatus !== 'VERIFIED_SUCCESS') return null;
  try {
    const { guidanceJourney } = getGuidanceModels();
    const open = await guidanceJourney.findFirst({ where: { id: closure.journeyId, propertyId, status: { in: ['ACTIVE', 'NOT_STARTED'] } }, select: { id: true } });
    if (!open) return false;
    const event = closure.homeEventId ?? undefined;
    const steps = [
      ['track_work', 'project_execution_record', closure.projectId],
      ['verify_outcome', 'project_verified_outcome', event],
      ['capture_proof', 'project_completion_proof', closure.documentIds?.[0] ?? event],
      ['update_home_record', 'living_home_record_writeback', event],
      ['set_future_care', 'future_care_plan', closure.futureCareTaskIds?.[0] ?? event],
    ] as const;
    for (const [stepKey, proofType, proofId] of steps) {
      await guidanceJourneyService.recordToolCompletion({
        propertyId,
        actorUserId,
        journeyId: closure.journeyId,
        inventoryItemId: closure.inventoryItemId ?? null,
        sourceToolKey: 'project-completion',
        sourceEntityType: 'PROJECT',
        sourceEntityId: closure.projectId,
        stepKey,
        status: 'COMPLETED',
        dedupeKey: `project-completion:${propertyId}:${closure.projectId}:${stepKey}`,
        producedData: { proofType, proofId, projectId: closure.projectId, outcomeStatus: closure.outcomeStatus, writeBackAppliedAt: closure.writeBackAppliedAt },
      });
    }
    return true;
  } catch (guidanceError) {
    logger.warn({ guidanceError }, '[PHASE3] verified closure guidance hook failed');
    return false;
  }
}
