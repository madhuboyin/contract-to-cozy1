// Run a Negotiation Shield analysis inside Ask (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, slice 2b; owner decisions D1, D2, D6).
//
// Reached only by the declared "Run the analysis" / "Run it again" action on a review or a started review's receipt (launchContext.entityType
// NEGOTIATION_SHIELD_CASE, entityId the case). It shows a confirmation, and only after the homeowner confirms it runs the same rules-based analysis the
// page runs (NegotiationShieldService.analyzeCase, which appends an analysis and a draft and marks the case ANALYZED), behind the same project-compliance
// applicability gate, then records the guided-journey completion through the one function the page's controller also calls. No model is involved.
//
// The receipt is the slice 1 review itself, so the person lands on the analysis and the collapsed draft, not a second summary.
//
// Idempotency (methodology #14): analyzeCase has no key and appends on every call. A retry of THIS confirmation is recognised by an analysis generated at
// or after this execution began (the precedent MATERIAL_SPEC_ADD uses); it is shown, not run again, and the journey completion is not repeated. A separate
// execution is a deliberate re-run and appends. The shared confirmation receipt already stops a replayed confirm.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getNegotiationShieldCaseReviewForProperty } from '../../negotiationShieldCaseList';
import { recordNegotiationShieldAnalysisCompletion } from '../../negotiationShieldJourneyCompletion';
import { assertProjectComplianceApplicable } from '../../projectCompliance/context';
import { NEGOTIATION_SHIELD_ANALYZE_MESSAGE } from '../support/negotiationShieldAnalyze';
import { NEGOTIATION_SHIELD_CASE_ENTITY_TYPE } from '../support/negotiationShieldStart';
import { negotiationShieldReviewFromView } from './negotiationShield.handler';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const SCENARIO_LABELS: Record<string, string> = {
  CONTRACTOR_QUOTE_REVIEW: 'Contractor quote review', INSURANCE_PREMIUM_INCREASE: 'Insurance premium increase',
  INSURANCE_CLAIM_SETTLEMENT: 'Insurance claim settlement', BUYER_INSPECTION_NEGOTIATION: 'Buyer inspection negotiation',
  CONTRACTOR_URGENCY_PRESSURE: 'Contractor urgency pressure',
};
const backToReviews = { id: 'negotiation-shield-back', label: 'Back to my reviews', interactionType: 'START_WORKFLOW' as const, message: 'Show my negotiation shield cases', operationId: 'NEGOTIATION_SHIELD_CASES' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-analyze-permission', title: 'A contributor or owner can run the analysis', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_NEGOTIATION_SHIELD_ANALYZE_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-analyze-not-routable', title: 'Open a review first', body: 'The analysis is run from Run the analysis on one of your reviews. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-analyze-unavailable', title, body, tone: 'DEFAULT', actions: [backToReviews] }],
  suggestions: [],
});

export interface NegotiationAnalyzeLaunch {
  caseId: string | null;
  sourceExecutionId: string | null;
  journeyId?: string | null;
  stepKey?: string | null;
}

export async function negotiationShieldAnalyzeResult(userId: string, propertyId: string, launch: NegotiationAnalyzeLaunch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!launch.caseId) return notRoutable();
  // Property-scoped: another property's case id is "no longer available", never a different answer.
  const review = await getNegotiationShieldCaseReviewForProperty(propertyId, launch.caseId);
  if (!review) return unavailable('NEGOTIATION_SHIELD_CASE_NOT_FOUND', 'That review is no longer available', 'Ask could not find that negotiation review for this home. It may have been removed. Nothing has changed.');
  if (!review.hasInput) {
    return unavailable('NEGOTIATION_SHIELD_NO_DETAILS', 'This review has no saved details to analyze', 'There is nothing for the analysis to work from yet. Nothing has changed.');
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const again = Boolean(review.latestAnalysis);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'NEGOTIATION_SHIELD_ANALYZE_CONFIRMATION_REQUIRED',
    parameters: {
      negotiationShieldAnalyze: { caseId: review.case.id, title: review.case.title, scenarioType: review.case.scenarioType },
      sourceExecutionId: launch.sourceExecutionId, journeyId: launch.journeyId ?? null, stepKey: launch.stepKey ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'negotiation-shield-analyze-review', title: again ? 'Run this analysis again?' : 'Run the analysis?',
      body: 'Nothing is analyzed until you confirm.', tone: 'DEFAULT', actions: [],
    }],
    confirmation: {
      confirmationId: `negotiation-shield-analyze-${sha(`${propertyId}:${review.case.id}:${review.latestAnalysis?.id ?? 'none'}`).slice(0, 12)}-1`, version: 1,
      title: again ? `Run "${review.case.title}" again?` : `Run the analysis for "${review.case.title}"?`,
      description: 'This runs the rules-based review of the details saved on this review and saves its findings and a draft message. Nothing is sent to anyone. '
        + (again ? 'Earlier analyses are kept; this adds a new one.' : 'It may also update a guided plan this review belongs to.'),
      fields: [
        { label: 'Review', value: review.case.title },
        { label: 'Type', value: SCENARIO_LABELS[review.case.scenarioType] ?? review.case.scenarioType },
        ...(review.latestAnalysis ? [{ label: 'Last analyzed', value: humanDate(new Date(review.latestAnalysis.generatedAt)) ?? 'Earlier' }] : []),
      ],
      editableFields: [], confirmLabel: again ? 'Run it again' : 'Run the analysis',
      consentText: 'I authorize running this analysis and saving its results to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('negotiation-shield.analyze', async (envelope) => {
  const launch = envelope.launchContext;
  const declared = launch?.operationId === 'NEGOTIATION_SHIELD_CASE_ANALYZE' && launch.surface !== 'ASK_REFRESH'
    && envelope.message === NEGOTIATION_SHIELD_ANALYZE_MESSAGE && launch.entityType === NEGOTIATION_SHIELD_CASE_ENTITY_TYPE && Boolean(launch.entityId);
  if (!declared) return notRoutable();
  return negotiationShieldAnalyzeResult(envelope.userId, envelope.propertyId!, {
    caseId: launch!.entityId ?? null, sourceExecutionId: launch!.sourceExecutionId ?? null,
    journeyId: launch!.journeyId ?? null, stepKey: null,
  });
});

async function confirmNegotiationShieldAnalyze(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const stored = parameters.negotiationShieldAnalyze as { caseId?: unknown } | undefined;
  const caseId = typeof stored?.caseId === 'string' && stored.caseId ? stored.caseId : null;
  if (!caseId) throw Object.assign(new Error('The analysis to run is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const propertyId = execution.propertyId;

  const before = await getNegotiationShieldCaseReviewForProperty(propertyId, caseId);
  if (!before) throw Object.assign(new Error('That review is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  if (!before.hasInput) throw Object.assign(new Error('This review has no saved details to analyze.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });

  // A retry of this same confirmation (a reclaimed worker) finds the analysis this execution already saved.
  const alreadyRun = Boolean(before.latestAnalysis && new Date(before.latestAnalysis.generatedAt).getTime() >= new Date(execution.createdAt).getTime());
  if (!alreadyRun) {
    // The same applicability gate the page's analyze controller runs before the service call.
    const gate = await assertProjectComplianceApplicable(propertyId, userId, 'NEGOTIATION_SHIELD', {}, 'negotiationShield');
    // Loaded here, not at boot: the service pulls in document parsing and OCR, which Ask's reads deliberately avoid.
    const { NegotiationShieldService } = await import('../../negotiationShield.service');
    const detail = await new NegotiationShieldService().analyzeCase(propertyId, caseId, gate.contextVersion);
    // One shared function, the same one the controller calls, so Ask and the page complete a guided step identically (best-effort).
    await recordNegotiationShieldAnalysisCompletion({
      propertyId, actorUserId: userId, detail,
      journeyId: typeof parameters.journeyId === 'string' ? parameters.journeyId : null,
      stepKey: typeof parameters.stepKey === 'string' ? parameters.stepKey : null,
    });
  }

  const after = await getNegotiationShieldCaseReviewForProperty(propertyId, caseId);
  if (!after || !after.latestAnalysis) throw Object.assign(new Error('The analysis could not be read back.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const review = negotiationShieldReviewFromView(after, true);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'NEGOTIATION_SHIELD_ANALYSIS_SAVED',
    blocks: [
      {
        type: 'WORKFLOW_PROGRESS', id: `negotiation-shield-analyzed-${after.latestAnalysis.id}`, title: alreadyRun ? 'Analysis already saved' : 'Analysis saved', status: 'COMPLETED',
        description: 'The findings and a draft message are below. Nothing has been sent to anyone.',
        details: [
          { label: 'Review', value: after.case.title },
          { label: 'Analyzed', value: humanDate(new Date(after.latestAnalysis.generatedAt)) ?? 'Just now' },
        ],
        actions: [],
      },
      ...review.blocks,
    ],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `negotiation-shield-analyze-refresh-failed-${caseId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The analysis was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'NEGOTIATION_SHIELD_ANALYSIS', artifactId: after.latestAnalysis.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('negotiation-shield.analyze', confirmNegotiationShieldAnalyze);

