// Run the canonical coverage analysis for a journey's coverage check step, in Ask (continuation FRD section 34). The same persisted analysis the page runs, through the same shared service
// (coverageAnalysisOperations): the property's, or one item's, as the JOURNEY'S subject decides (the scope is derived from the step, never taken from the caller). Reached only by the check step's
// own declared action (non-routable); confirmation-gated, CONTRIBUTOR floor. The analysis is saved even if the journey cannot be updated; the step completes only with this fresh, scoped evaluation.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { APIError } from '../../../middleware/error.middleware';
import { COVERAGE_CHECK_STEP_KEYS, COVERAGE_CHECK_TOOL_KEY, coverageScopeForBinding, resolveCoverageCheckBinding, runCoverageAnalysisWithEffects } from '../../coverageAnalysisOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { COVERAGE_ANALYSIS_RUN_MESSAGE, COVERAGE_PROPERTY_ANALYSIS_ACTION_ID, COVERAGE_PROPERTY_ANALYSIS_MESSAGE } from '../support/coverageAnalysisRun';
import { COVERAGE_PROPERTY_ENTITY_TYPE } from '../support/coverageCommand';
import { humanDate } from '../askFormatting';
import { getGuidanceModels } from '../../guidanceEngine/guidanceTypes';
import { prisma } from '../../../lib/prisma';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'coverage-analysis-run-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });

async function subjectName(propertyId: string, itemId: string | null): Promise<string> {
  if (!itemId) return 'This home';
  const item = await (prisma as any).inventoryItem.findFirst({ where: { id: itemId, propertyId }, select: { name: true } });
  return item?.name ?? 'This item';
}
const contextVersionFor = (step: { id: string; updatedAt: Date | string; status: string }, scope: string) => createHash('sha256').update(`coverage-run:${step.id}:${step.status}:${new Date(step.updatedAt).toISOString()}:${scope}`).digest('hex');
async function loadStep(propertyId: string, stepId: string) {
  return getGuidanceModels().guidanceJourneyStep.findFirst({ where: { id: stepId, journey: { propertyId } }, select: { id: true, label: true, status: true, updatedAt: true } });
}

const SCENARIO_LABELS: Record<string, string> = {
  COST_EXPOSURE_EXCEEDS_PLAN_COST: 'The modeled repair cost is more than the plan costs', COSTS_ARE_CLOSE: 'The plan cost and the modeled repair cost are close',
  PLAN_COST_EXCEEDS_MODELED_EXPOSURE: 'The plan costs more than the modeled repairs', INSUFFICIENT_DATA: 'Not enough recorded to compare',
};
/** The latest saved whole-home analysis, so a confirmation made before another run (here or on the page) is refused rather than silently adding a second. */
async function propertyRunVersion(propertyId: string): Promise<string> {
  const latest = await (prisma as any).coverageAnalysis.findFirst({ where: { propertyId, inventoryItemId: null }, orderBy: { computedAt: 'desc' }, select: { id: true, computedAt: true } });
  return createHash('sha256').update(`coverage-run-property:${propertyId}:${latest?.id ?? 'none'}:${latest ? new Date(latest.computedAt).toISOString() : ''}`).digest('hex');
}
async function propertyRunResult(userId: string, propertyId: string, launchContext: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can run a coverage analysis in Ask. Nothing was changed.', 'BLOCKED', 'COVERAGE_ANALYSIS_PERMISSION_REQUIRED');
  const contextVersion = await propertyRunVersion(propertyId);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'COVERAGE_ANALYSIS_RUN_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { coveragePropertyRun: true, coverageAnalysisContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'coverage-analysis-run-review', title: 'Run a coverage analysis for your home', body: 'Nothing has run yet. It evaluates your warranty and insurance records and saves the result.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `coverage-analysis-run-property-${contextVersion.slice(0, 12)}-1`, version: 1, title: 'Run a coverage analysis for your home?',
      description: 'This runs the same coverage analysis the page runs and saves it next to the earlier ones. It does not change a policy or contact an insurer, and it is an estimate from what is recorded: it says nothing about what a claim would pay.',
      fields: [{ label: 'Scope', value: 'The whole home' }, { label: 'Uses', value: 'Your recorded warranties, policy facts and home details' }],
      editableFields: [], confirmLabel: 'Run the analysis', consentText: 'I authorize running this coverage analysis and saving its result.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

export async function coverageAnalysisRunResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (launchContext?.operationId === 'COVERAGE_ANALYSIS_RUN' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === COVERAGE_PROPERTY_ANALYSIS_MESSAGE
    && launchContext.actionId === COVERAGE_PROPERTY_ANALYSIS_ACTION_ID && launchContext.entityType === COVERAGE_PROPERTY_ENTITY_TYPE && launchContext.entityId === propertyId) {
    return propertyRunResult(userId, propertyId, launchContext);
  }
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'COVERAGE_ANALYSIS_RUN' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === COVERAGE_ANALYSIS_RUN_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'A coverage check is run from the journey step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'COVERAGE_ANALYSIS_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can run a coverage check in Ask. Nothing was changed.', 'BLOCKED', 'COVERAGE_ANALYSIS_PERMISSION_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_CHECK_TOOL_KEY, stepKeys: COVERAGE_CHECK_STEP_KEYS });
  if (!bound.ok) return boundary('This step cannot start a coverage check', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'COVERAGE_ANALYSIS_STEP_UNAVAILABLE');
  const scope = coverageScopeForBinding(bound.binding);
  const step = await loadStep(propertyId, stepId);
  if (!step) return boundary('This step is no longer available', 'Nothing was changed.', 'NOT_APPLICABLE', 'COVERAGE_ANALYSIS_STEP_UNAVAILABLE');
  const subject = await subjectName(propertyId, scope.kind === 'ITEM' ? scope.itemId : null);
  const contextVersion = contextVersionFor(step, scope.kind === 'ITEM' ? scope.itemId : 'property');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'COVERAGE_ANALYSIS_RUN_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { guidanceStepId: step.id, coverageAnalysisContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'coverage-analysis-run-review', title: `Run a coverage check for ${subject.toLowerCase()}`, body: 'Nothing has run yet. It evaluates your coverage from the records on file and saves the result.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `coverage-analysis-run-${step.id}-1`, version: 1, title: `Run a coverage check for ${subject.toLowerCase()}?`,
      description: 'This runs the same coverage analysis the page runs and saves it. It does not change a policy or contact an insurer, and it is an estimate from what is recorded.',
      fields: [{ label: 'Step', value: step.label }, { label: 'Checks', value: subject }, { label: 'Scope', value: scope.kind === 'ITEM' ? 'This item' : 'The whole home' }],
      editableFields: [], confirmLabel: 'Run the check', consentText: 'I authorize running this coverage analysis and saving its result.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmPropertyRun(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  if (parameters.coverageAnalysisContextVersion !== await propertyRunVersion(propertyId)) {
    throw writeError('Your coverage analysis changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  let run: Awaited<ReturnType<typeof runCoverageAnalysisWithEffects>>;
  try {
    run = await runCoverageAnalysisWithEffects(propertyId, userId, { kind: 'PROPERTY' }, {});
  } catch (error) {
    // A gate's refusal is the homeowner's answer, in the gate's own words.
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const analysis = run.analysis as { id: string; summary?: string | null; confidence?: string | null; scenarioState?: string | null; computedAt?: string | Date | null };
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'COVERAGE_ANALYSIS_RUN_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `coverage-analysis-run-${analysis.id}`, title: 'Coverage analysis saved', status: 'COMPLETED',
      description: analysis.summary ?? 'The analysis is saved with your other coverage records. It is an estimate from what is recorded.',
      details: [{ label: 'Checked', value: 'The whole home' }, { label: 'Confidence', value: String(analysis.confidence ?? 'unknown').toLowerCase() },
        ...(analysis.scenarioState ? [{ label: 'What it found', value: SCENARIO_LABELS[analysis.scenarioState] ?? analysis.scenarioState }] : [])],
      actions: [{ id: 'coverage-analysis-see', label: 'See my coverage analysis', interactionType: 'START_WORKFLOW' as const, message: 'Show my coverage analysis.', operationId: 'COVERAGE_REVIEW_STATUS' as const, style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: `coverage-analysis-refresh-failed-${analysis.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.', suggestions: [] });
  return { result, artifactType: 'COVERAGE_ANALYSIS', artifactId: analysis.id, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmCoverageAnalysisRun(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to run a coverage check in Ask.', 'ASK_PERMISSION_REQUIRED');
  if (parameters.coveragePropertyRun === true) return confirmPropertyRun(ctx);
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  if (!stepId) throw writeError('The step selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const propertyId = execution.propertyId;
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_CHECK_TOOL_KEY, stepKeys: COVERAGE_CHECK_STEP_KEYS });
  if (!bound.ok) throw writeError(`${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was run.`, 'ASK_CONTEXT_VERSION_CONFLICT');
  const scope = coverageScopeForBinding(bound.binding);
  const step = await loadStep(propertyId, stepId);
  if (!step || parameters.coverageAnalysisContextVersion !== contextVersionFor(step, scope.kind === 'ITEM' ? scope.itemId : 'property')) {
    throw writeError('This step changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  let run: Awaited<ReturnType<typeof runCoverageAnalysisWithEffects>>;
  try {
    run = await runCoverageAnalysisWithEffects(propertyId, userId, scope, { guidanceStepId: stepId });
  } catch (error) {
    // A gate's refusal is the homeowner's answer, in the gate's own words.
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const subject = await subjectName(propertyId, scope.kind === 'ITEM' ? scope.itemId : null);
  const note = run.guidanceReported ? 'This step is recorded as done' : run.guidanceRefusal ? GUIDANCE_STEP_REFUSAL_TEXT[run.guidanceRefusal as keyof typeof GUIDANCE_STEP_REFUSAL_TEXT] ?? 'No journey step was updated'
    : 'The check is saved, but the journey step could not be updated. Open the journey to check it';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'COVERAGE_ANALYSIS_RUN_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `coverage-analysis-run-${run.analysis.id}`, title: 'Coverage check saved', status: 'COMPLETED',
      description: run.analysis.summary ?? 'The analysis is saved with your other coverage records. It is an estimate from what is recorded.',
      details: [{ label: 'Checked', value: subject }, { label: 'Confidence', value: String(run.analysis.confidence ?? 'unknown').toLowerCase() }, { label: 'Guided journey', value: note }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: `coverage-analysis-refresh-failed-${run.analysis.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved. The journey view you were looking at could not refresh automatically; ask "Show my guided journeys" to see it.', suggestions: [] });
  return { result, artifactType: run.scope.kind === 'ITEM' ? 'COVERAGE_ITEM_ANALYSIS' : 'COVERAGE_ANALYSIS', artifactId: run.analysis.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('coverage.analysis-run', async (envelope) => coverageAnalysisRunResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('coverage.analysis-run', confirmCoverageAnalysisRun);
// Kept for the registration of the resolve helper used by tests.
export { resolveCoverageCheckBinding };
