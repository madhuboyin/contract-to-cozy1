// Deciding what to do about inspection findings, and what it proves to a guided journey (continuation FRD section 46).
//
// `act_on_inspection_findings` is done when every OPEN finding the journey is about has a durable decision (its work disposition is no longer PENDING_REVIEW: accepted as work, monitored, a duplicate,
// already resolved, not applicable or sent back for correction), or it was dismissed or resolved. A finding signal's journey is about that one finding; a report's journey is about the report's findings.
// One finding's decision never completes a step about a whole report. The checklist the Desktop page used to self-report is not proof; this function reads the findings and reports the exact step, and
// the page and the Ask command both call it.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';
import { inspectionReportForJourney } from './inspectionReportReviewOperations';

export const FINDINGS_STEP_TOOL_KEY = 'guidance-overview';
export const FINDINGS_STEP_KEY = 'act_on_inspection_findings';

export async function resolveFindingsDecisionBinding(propertyId: string, stepId: string): Promise<GuidanceStepBindingResult> {
  return resolveGuidanceStepBinding(propertyId, stepId, { toolKey: FINDINGS_STEP_TOOL_KEY, stepKeys: [FINDINGS_STEP_KEY] });
}

export type FindingsDecisionState = { total: number; decided: number; pending: Array<{ id: string; title: string }>; decidedIds: string[]; reportId: string | null };

/** The findings the journey is about and how many still need a decision. A finding that is no longer open (dismissed, resolved) counts as decided. */
export async function evaluateFindingDecisions(propertyId: string, binding: GuidanceStepBinding): Promise<FindingsDecisionState | null> {
  const source = binding.signalSource;
  let findings: any[] = [];
  let reportId: string | null = null;
  if (source.entityType === 'INSPECTION_FINDING' && source.entityId) {
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: source.entityId, propertyId } });
    if (finding) { findings = [finding]; reportId = finding.reportId; }
  } else {
    const report = await inspectionReportForJourney(propertyId, binding);
    if (report) { reportId = report.id; findings = await prisma.inspectionFinding.findMany({ where: { reportId: report.id, propertyId } }); }
  }
  if (findings.length === 0) return null;
  const isPending = (finding: any) => finding.status === 'OPEN' && finding.workDisposition === 'PENDING_REVIEW';
  const pending = findings.filter(isPending).map((finding) => ({ id: finding.id as string, title: String(finding.inspectorDescription ?? 'Finding').slice(0, 80) }));
  return { total: findings.length, decided: findings.length - pending.length, pending, decidedIds: findings.filter((finding) => !isPending(finding)).map((finding) => finding.id as string), reportId };
}

export function buildFindingsDecisionCompletion(propertyId: string, actorUserId: string, state: FindingsDecisionState, binding: GuidanceStepBinding) {
  return {
    propertyId, actorUserId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId, signalIntentFamily: binding.signalIntentFamily ?? 'inspection_followup_needed', issueDomain: 'MAINTENANCE' as const,
    sourceToolKey: FINDINGS_STEP_TOOL_KEY, sourceEntityType: 'INSPECTION_REPORT', sourceEntityId: state.reportId ?? binding.journeyId, stepKey: binding.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `inspection-findings-decided:${propertyId}:${binding.stepId}:${[...state.decidedIds].sort().join(',')}`,
    producedData: { proofType: 'inspection_findings_decided', proofId: state.reportId ?? binding.journeyId, reportId: state.reportId, findingIds: state.decidedIds, findingCount: state.total },
  };
}

export type CheckFindingsResult = { state: FindingsDecisionState; guidanceReported: boolean };

export async function checkFindingDecisionsWithEffects(propertyId: string, userId: string, stepId: string): Promise<CheckFindingsResult> {
  const bound = await resolveFindingsDecisionBinding(propertyId, stepId);
  if (!bound.ok) throw new APIError('That journey step cannot be completed this way.', bound.reason === 'NOT_FOUND' ? 404 : 409, `GUIDANCE_STEP_${bound.reason}`);
  const state = await evaluateFindingDecisions(propertyId, bound.binding);
  if (!state) throw new APIError('Ask could not find the inspection findings this journey is about.', 409, 'INSPECTION_FINDINGS_NOT_FOUND');
  if (state.pending.length > 0) {
    throw new APIError(`${state.pending.length} finding${state.pending.length === 1 ? ' still needs' : 's still need'} a decision before this step is done.`, 409, 'INSPECTION_FINDINGS_PENDING', { pending: state.pending });
  }
  try {
    await guidanceJourneyService.recordToolCompletion(buildFindingsDecisionCompletion(propertyId, userId, state, bound.binding));
    return { state, guidanceReported: true };
  } catch (guidanceError) {
    logger.warn({ guidanceError, stepId }, '[GUIDANCE] inspection findings decision report failed');
    return { state, guidanceReported: false };
  }
}
