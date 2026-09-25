// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { outcomeSummaryBlock } from '../askHandlerSupport';
import { HVAC_VERDICT_RANK, hvacDecisionStartContextVersion, hvacDecisionThreadVersionFingerprint } from '../handlers/hvacDecision.handler';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import * as decisionThreadService from '../../decisionPlatform/decisionThreadService';
import * as decisionPreferenceService from '../../decisionPlatform/decisionPreferenceService';
import { decisionProgressBlock, whyNowBlock } from '../decisionThreadPresentationBlocks';
import { HouseholdProfileNotEnabledError, PreferenceNotAuthorizedError } from '../../decisionPlatform/decisionPreferenceService';
import * as outcomeObservationService from '../../decisionPlatform/outcomeObservationService';

const HvacDecisionStartInputSchema = z.object({
  inventoryItemId: z.string().trim().min(1).max(160),
}).strict();

const HvacDecisionScenarioInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  quoteAmountCents: z.number().int().positive(),
  vendorLabel: z.string().trim().min(1).max(160),
}).strict();

const HvacDecisionAbandonInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
}).strict();

// Ask Intelligence FRD Phase 10A (§19.2's homeowner-report source).
const HvacDecisionOutcomeReportInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  actionState: z.enum(['STARTED', 'COMPLETED']),
  costCents: z.number().int().nonnegative().nullable(),
  note: z.string().trim().max(500).nullable(),
}).strict();

const HvacDecisionOutcomeUnlinkInputSchema = z.object({
  decisionThreadId: z.string().trim().min(1).max(160),
  outcomeObservationId: z.string().trim().min(1).max(160),
}).strict();

function scenarioComparisonBlock(
  id: string, title: string, decisionThreadId: string, scenarioId: string,
  baseline: { label: string; verdictCode: string; reasonCodes: string[]; limitationCodes: string[] },
  scenario: { label: string; verdictCode: string; reasonCodes: string[]; limitationCodes: string[]; assumptions: { label: string; value: string }[] },
): AskPresentationBlock {
  const baselineRank = HVAC_VERDICT_RANK[baseline.verdictCode] ?? 1;
  const scenarioRank = HVAC_VERDICT_RANK[scenario.verdictCode] ?? 1;
  const comparisonDirection = scenarioRank === baselineRank
    ? 'NO_CHANGE'
    : scenarioRank > baselineRank ? 'SCENARIO_FAVORS_REPLACE' : 'SCENARIO_FAVORS_REPAIR';
  return {
    type: 'SCENARIO_COMPARISON', id, title, decisionThreadId, scenarioId,
    baseline: { label: baseline.label, verdict: baseline.verdictCode, reasonCodes: baseline.reasonCodes, limitationCodes: baseline.limitationCodes },
    scenario: { label: scenario.label, verdict: scenario.verdictCode, reasonCodes: scenario.reasonCodes, limitationCodes: scenario.limitationCodes, assumptions: scenario.assumptions },
    comparisonDirection,
    actions: [],
  };
}

// Built from a specific snapshot's own recorded preferenceReferenceIds
// (FRD §14.1 lineage), NOT a fresh "what's active right now" read -- those
// can diverge (a different household member viewing later, or the
// preference changing before a recompute runs). See
// decisionPreferenceService.getPreferenceReferenceDetails.
async function preferenceReferenceBlocksForSnapshot(idPrefix: string, preferenceReferenceIds: string[]): Promise<AskPresentationBlock[]> {
  const details = await decisionPreferenceService.getPreferenceReferenceDetails(preferenceReferenceIds);
  return details.map((detail) => ({
    type: 'PREFERENCE_REFERENCE', id: `${idPrefix}-preference-${detail.definitionId.toLowerCase().replace(/_/g, '-')}`,
    title: detail.definitionId === 'OWNERSHIP_HORIZON' ? 'Using your confirmed plan' : 'Using your confirmed preference',
    preferenceKey: detail.definitionId, summary: detail.summary, visibility: detail.visibility,
    confirmedAt: detail.confirmedAt ? detail.confirmedAt.toISOString() : null,
    expiresAt: detail.expiresAt ? detail.expiresAt.toISOString() : null,
  }));
}

async function confirmHvacDecisionStart(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionStartInputSchema.safeParse(parameters.hvacDecisionStart);
    if (!candidate.success) {
      const error = new Error('The decision thread settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionStartContextVersion(execution.propertyId, candidate.data.inventoryItemId)) {
      const error = new Error('The HVAC system record changed while confirmation was open. Review the current record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const startSelection = await decisionThreadService.selectHvacDecisionThread(execution.propertyId, candidate.data.inventoryItemId);
    if (startSelection.kind !== 'NONE') {
      const error = new Error('A decision thread already exists for this HVAC system.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const { thread: createdThread, snapshot: createdSnapshot } = await decisionThreadService.createHvacDecisionThread({
      propertyId: execution.propertyId, userId, inventoryItemId: candidate.data.inventoryItemId, askExecutionId: execution.id,
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_START_CREATED',
      blocks: [
        decisionProgressBlock('hvac-decision-created', 'Decision thread started', createdThread, createdSnapshot, []),
        whyNowBlock('hvac-decision-why-now', createdSnapshot, []),
        ...await preferenceReferenceBlocksForSnapshot('hvac-decision-created', createdSnapshot.preferenceReferenceIds),
      ],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = createdThread.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_START entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `hvac-decision-start-refresh-failed-${createdThread.id}`, title: 'Saved; list could not refresh',
        body: 'The decision thread was started successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Should I repair or replace my HVAC?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacDecisionScenario(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionScenarioInputSchema.safeParse(parameters.hvacDecisionScenario);
    if (!candidate.success) {
      const error = new Error('The scenario settings are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const scenarioThread = await prisma.decisionThread.findFirst({ where: { id: candidate.data.decisionThreadId, propertyId: execution.propertyId }, include: { currentRecommendationSnapshot: true } });
    if (!scenarioThread) {
      const error = new Error('Decision thread not found.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const { scenario, scenarioSnapshot } = await decisionThreadService.createHvacScenario(scenarioThread.id, userId, {
      quoteAmountCents: candidate.data.quoteAmountCents, vendorLabel: candidate.data.vendorLabel, askExecutionId: execution.id,
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_SCENARIO_CREATED',
      blocks: [
        scenarioComparisonBlock(
          'hvac-scenario-comparison', `Scenario: ${candidate.data.vendorLabel}`, scenarioThread.id, scenario.id,
          { label: 'Current recommendation', verdictCode: scenarioThread.currentRecommendationSnapshot?.verdictCode ?? 'UNKNOWN', reasonCodes: scenarioThread.currentRecommendationSnapshot?.reasonCodes ?? [], limitationCodes: scenarioThread.currentRecommendationSnapshot?.limitationCodes ?? [] },
          { label: scenario.label, verdictCode: scenarioSnapshot.verdictCode, reasonCodes: scenarioSnapshot.reasonCodes, limitationCodes: scenarioSnapshot.limitationCodes, assumptions: [{ label: 'Quote amount', value: `$${(candidate.data.quoteAmountCents / 100).toFixed(2)}` }, { label: 'Vendor', value: candidate.data.vendorLabel }] },
        ),
        ...await preferenceReferenceBlocksForSnapshot('hvac-scenario', scenarioSnapshot.preferenceReferenceIds),
      ],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = scenario.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_SCENARIO entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `hvac-decision-scenario-refresh-failed-${scenario.id}`, title: 'Saved; list could not refresh',
        body: 'The scenario was saved successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Should I repair or replace my HVAC?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacDecisionAbandon(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionAbandonInputSchema.safeParse(parameters.hvacDecisionAbandon);
    if (!candidate.success) {
      const error = new Error('The abandon request is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const abandonedThread = await decisionThreadService.abandonDecisionThread(candidate.data.decisionThreadId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_ABANDONED',
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `hvac-decision-abandoned-${abandonedThread.id}`, title: 'Decision abandoned', status: 'COMPLETED', description: 'The decision thread is no longer active. You can start a new one at any time.', details: [{ label: 'Thread', value: abandonedThread.title }], actions: [] }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = abandonedThread.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_ABANDON entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-decision-abandon-refresh-failed-${abandonedThread.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The decision was abandoned successfully. A result you were viewing could not refresh automatically -- ask about this HVAC system again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacDecisionOutcomeReport(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionOutcomeReportInputSchema.safeParse(parameters.hvacDecisionOutcomeReport);
    if (!candidate.success) {
      const error = new Error('The outcome details are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const { observation } = await outcomeObservationService.recordHomeownerReportedOutcome({
      propertyId: execution.propertyId, userId, decisionThreadId: candidate.data.decisionThreadId,
      actionState: candidate.data.actionState, costCents: candidate.data.costCents, occurredOn: null, note: candidate.data.note,
    });
    const reportedRows = await outcomeObservationService.getOutcomeSummaryForThread(candidate.data.decisionThreadId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_OUTCOME_RECORDED',
      blocks: [outcomeSummaryBlock('hvac-outcome-recorded', candidate.data.decisionThreadId, reportedRows)],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = observation.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_OUTCOME_REPORT entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-outcome-report-refresh-failed-${observation.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The outcome was recorded successfully. A result you were viewing could not refresh automatically -- ask about this decision again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacDecisionOutcomeUnlink(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = HvacDecisionOutcomeUnlinkInputSchema.safeParse(parameters.hvacDecisionOutcomeUnlink);
    if (!candidate.success) {
      const error = new Error('The outcome selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    if (parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)) {
      const error = new Error('The decision changed while confirmation was open. Review the current decision and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const disputed = await outcomeObservationService.disputeOutcomeObservation(candidate.data.outcomeObservationId, execution.propertyId);
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_DECISION_OUTCOME_DISPUTED',
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `hvac-outcome-disputed-${disputed.id}`, title: 'Outcome disputed', status: 'COMPLETED', description: 'The reported outcome is now marked as disputed. It was not deleted.', details: [], actions: [] }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = disputed.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_DECISION_OUTCOME_UNLINK entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-outcome-unlink-refresh-failed-${disputed.id}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The outcome was disputed successfully. A result you were viewing could not refresh automatically -- ask about this decision again to see its current state.',
        suggestions: [],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacPreferenceSave(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = parameters.hvacPreferenceSave as {
      ownership: decisionPreferenceService.ParsedOwnershipHorizon | null;
      approach: decisionPreferenceService.ParsedRepairReplaceApproach | null;
    } | undefined;
    if (!candidate || (!candidate.ownership && !candidate.approach)) {
      const error = new Error('The preference details are invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const savedIds: string[] = [];
    const savedBlocks: AskPresentationBlock[] = [];
    const affectedThreadIds = new Set<string>();
    try {
      if (candidate.ownership) {
        const saved = await decisionPreferenceService.saveOwnershipHorizonPreference(execution.propertyId, userId, candidate.ownership);
        savedIds.push(saved.preferenceValueId);
        saved.affectedThreadIds.forEach((id) => affectedThreadIds.add(id));
        savedBlocks.push({
          type: 'PREFERENCE_REFERENCE', id: 'hvac-preference-saved-ownership-horizon', title: 'Ownership horizon saved',
          preferenceKey: 'OWNERSHIP_HORIZON', summary: `Saved: plan to sell in about ${candidate.ownership.horizonMonths} months.`,
          visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: new Date().toISOString(), expiresAt: null,
        });
      }
      if (candidate.approach) {
        const saved = await decisionPreferenceService.saveRepairReplaceApproachPreference(execution.propertyId, userId, candidate.approach);
        savedIds.push(saved.preferenceValueId);
        saved.affectedThreadIds.forEach((id) => affectedThreadIds.add(id));
        savedBlocks.push({
          type: 'PREFERENCE_REFERENCE', id: 'hvac-preference-saved-approach', title: 'Approach saved',
          preferenceKey: 'REPAIR_REPLACE_APPROACH', summary: `Saved: ${candidate.approach.approach.replace(/_/g, ' ').toLowerCase()}.`,
          visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: new Date().toISOString(), expiresAt: null,
        });
      }
    } catch (caught) {
      if (caught instanceof HouseholdProfileNotEnabledError) {
        const error = new Error('The optional household profile is not enabled for this property yet, so this plan cannot be saved as a household preference. Enable the household profile first, then try again.');
        (error as Error & { code?: string }).code = 'ASK_HOUSEHOLD_PROFILE_REQUIRED';
        throw error;
      }
      throw caught;
    }
    // D03 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
    // saving a preference now marks every thread it could apply to stale,
    // the same way confirmHvacPreferenceForget already does on revoke --
    // closing the save/forget asymmetry the audit found.
    if (affectedThreadIds.size) {
      await decisionThreadService.markThreadsStaleByIds([...affectedThreadIds], 'PREFERENCE_SAVED');
    }
    savedBlocks.push({
      type: 'WORKFLOW_PROGRESS', id: 'hvac-preference-saved-refresh', title: 'Refresh scheduled', status: 'COMPLETED',
      description: affectedThreadIds.size ? 'Affected decisions will be recalculated the next time you open them.' : 'No active decision currently uses this preference.',
      details: [], actions: [],
    });
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_PREFERENCE_SAVED',
      blocks: savedBlocks, confirmation: null, suggestions: ['Should I repair or replace my HVAC?'],
    };
    artifactType = command.artifactType;
    artifactId = savedIds[0] ?? '';
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_PREFERENCE_SAVE entry. This
    // is in addition to, not instead of, the markThreadsStaleByIds call
    // above (that marks the canonical DecisionThread stale; this refreshes
    // an already-rendered Ask conversation card in the same session).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: 'hvac-preference-save-refresh-failed', severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The preference was saved successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        suggestions: ['Should I repair or replace my HVAC?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmHvacPreferenceForget(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = parameters.hvacPreferenceForget as { preferenceValueId: string } | undefined;
    if (!candidate?.preferenceValueId) {
      const error = new Error('The preference to forget is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    let affectedThreadIds: string[];
    try {
      ({ affectedThreadIds } = await decisionPreferenceService.revokeHvacPreference(candidate.preferenceValueId, userId));
    } catch (caught) {
      if (caught instanceof PreferenceNotAuthorizedError) {
        const error = new Error(caught.message);
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      throw caught;
    }
    await decisionThreadService.markThreadsStaleByIds(affectedThreadIds, 'PREFERENCE_REVOKED');
    result = {
      status: 'COMPLETED', reasonCode: 'HVAC_PREFERENCE_FORGOTTEN',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `hvac-preference-forgotten-${candidate.preferenceValueId}`, title: 'Preference forgotten', status: 'COMPLETED',
        description: affectedThreadIds.length ? 'Affected decisions will be recalculated the next time you open them.' : 'No active decision used this preference.',
        details: [], actions: [],
      }],
      confirmation: null, suggestions: [],
    };
    artifactType = command.artifactType;
    artifactId = candidate.preferenceValueId;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's HVAC_PREFERENCE_FORGET entry
    // (same markThreadsStaleByIds-plus-refresh reasoning as
    // confirmHvacPreferenceSave above).
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'BOUNDARY', id: `hvac-preference-forget-refresh-failed-${candidate.preferenceValueId}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
        body: 'The preference was forgotten successfully. A result you were viewing could not refresh automatically -- ask "Should I repair or replace my HVAC?" to see its current state.',
        suggestions: ['Should I repair or replace my HVAC?'],
      });
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('decision-platform.hvac.start', confirmHvacDecisionStart);

registerConfirmCapabilityHandler('decision-platform.hvac.scenario', confirmHvacDecisionScenario);

registerConfirmCapabilityHandler('decision-platform.hvac.abandon', confirmHvacDecisionAbandon);

registerConfirmCapabilityHandler('decision-platform.hvac.outcome.report', confirmHvacDecisionOutcomeReport);

registerConfirmCapabilityHandler('decision-platform.hvac.outcome.unlink', confirmHvacDecisionOutcomeUnlink);

registerConfirmCapabilityHandler('decision-platform.hvac.preference.save', confirmHvacPreferenceSave);

registerConfirmCapabilityHandler('decision-platform.hvac.preference.forget', confirmHvacPreferenceForget);
