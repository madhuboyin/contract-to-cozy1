// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type RequestAskCorrection, type SubmitAskFeedback, type SubmitHomeActionUsefulnessFeedback } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { askCorrectionsTotal, askFeedbackTotal } from '../../../lib/metrics';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { asInputJson, captureFallbackHref, discoverableAskOperationIds, ensurePropertyAccess, preservedExecutionHistory } from '../askHandlerSupport';
import { recordHomeActionUsefulnessFeedback } from '../../decisionPlatform/homeActionUsefulnessFeedback.service';
import { recordTypedFeedback } from '../../feedback/typedFeedback.service';
import type { FeedbackReasonCode } from '../../feedback/feedbackContract';
import { retrieveAskOperationCandidates } from '../askSemanticRouter';

export async function requestAskCorrection(userId: string, executionId: string, input: RequestAskCorrection): Promise<{ executionId: string; href: string }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const correctionAccess = execution.propertyId ? await ensurePropertyAccess(userId, execution.propertyId) : null;
  if (input.kind === 'INTENT' || input.kind === 'ENTITY') {
    const controls = readAskOperationalControls();
    const correctionEligibleOperationIds = await discoverableAskOperationIds({
      propertyId: execution.propertyId, propertyAccess: correctionAccess, controls,
    });
    const answerValidationRecovery = execution.reasonCode?.startsWith('ASK_ANSWER_RELEVANCE_') ?? false;
    const semanticCandidates = retrieveAskOperationCandidates(execution.message, {
      eligibleOperationIds: correctionEligibleOperationIds,
      topK: 5,
      embeddingEnabled: controls.embeddingRetrievalEnabled,
      minimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
    }).filter((candidate) => input.kind === 'ENTITY'
      ? candidate.operationId === execution.operationId
      : answerValidationRecovery || candidate.operationId !== execution.operationId);
    const fallbackIds: AskOperationId[] = input.kind === 'ENTITY' && execution.operationId
      ? [execution.operationId as AskOperationId]
      : ['PROPERTY_SUMMARY', 'MAINTENANCE_STATUS', 'INVENTORY_LOOKUP', 'HOME_ACTIONS'];
    const candidateOperationIds = [...new Set([
      ...(answerValidationRecovery && execution.operationId ? [execution.operationId as AskOperationId] : []),
      ...semanticCandidates.map((candidate) => candidate.operationId),
      ...fallbackIds,
    ])].filter((operationId) => operationId in ASK_OPERATION_DEFINITIONS && correctionEligibleOperationIds.includes(operationId)).slice(0, 3);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const clarification = {
      version: 1,
      question: input.kind === 'ENTITY'
        ? 'Which home item or record did you mean?'
        : 'What did you want Ask Cozy to help with?',
      options: input.kind === 'ENTITY' ? [] : candidateOperationIds.map((operationId) => ({
        operationId,
        label: getAskOperationDefinition(operationId).semantic.supportedJobs[0],
      })),
      allowFreeText: true,
      expiresAt,
    };
    const correction = await prisma.askExecution.create({
      data: {
        sessionId: execution.sessionId,
        userId,
        propertyId: execution.propertyId,
        clientRequestId: `correction-${execution.id}-${Date.now()}`,
        message: execution.message,
        intentFamily: 'CLARIFICATION',
        status: 'NEEDS_CLARIFICATION',
        reasonCode: input.kind === 'ENTITY' ? 'ASK_ENTITY_CORRECTION_REQUESTED' : 'ASK_INTENT_CORRECTION_REQUESTED',
        parametersJson: asInputJson({
          clarification: { version: 1, candidateOperationIds, expiresAt },
          correctionOfExecutionId: execution.id,
          correctionReason: input.kind,
        }),
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{ type: 'SUMMARY', id: 'ask-correction', title: 'Let’s correct that', body: input.kind === 'ENTITY' ? 'Tell me which item or record you meant. I’ll keep the selected home and check access again.' : 'Choose the home job you meant. I’ll keep this conversation and re-run the correct canonical workflow.', tone: 'DEFAULT', actions: [] }],
          captureRequests: [], confirmation: null, clarification, suggestions: [], skillHandoff: null,
          // A genuinely new, separate execution row (its own correction
          // turn) -- stamps its own fresh original snapshot rather than
          // inheriting anything from the execution it corrects.
          ...preservedExecutionHistory(null, [{ type: 'SUMMARY' as const, id: 'ask-correction', title: 'Let’s correct that', body: 'Correction requested.', tone: 'DEFAULT' as const, actions: [] }]),
        }),
        expiresAt: execution.expiresAt ?? new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CORRECTION_REQUESTED', metadataJson: asInputJson({ kind: input.kind, correctionExecutionId: correction.id }) } });
    await prisma.askExecutionEvent.create({ data: { executionId: correction.id, eventType: 'CORRECTION_STARTED', metadataJson: asInputJson({ kind: input.kind, correctionOfExecutionId: execution.id, candidateOperationIds }) } });
    askCorrectionsTotal.inc({ kind: input.kind, outcome: 'started' });
    return { executionId: correction.id, href: `/dashboard/ask?sessionId=${encodeURIComponent(execution.sessionId)}&executionId=${encodeURIComponent(correction.id)}` };
  }
  const href = input.kind === 'RETRY_RESPONSE'
    ? `/dashboard/ask?retryExecutionId=${encodeURIComponent(execution.id)}`
    : captureFallbackHref(execution.operationId, execution.propertyId) ?? '/dashboard/ask';
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CORRECTION_REQUESTED', metadataJson: asInputJson({ kind: input.kind }) } });
  askCorrectionsTotal.inc({ kind: input.kind, outcome: 'redirected' });
  return { executionId, href };
}

export async function submitAskExecutionFeedback(userId: string, executionId: string, input: SubmitAskFeedback): Promise<{ id: string; rating: 'UP' | 'DOWN' }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, propertyId: true, skillId: true, skillVersion: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const page = `ask:execution:${execution.id}`;
  const saved = await recordTypedFeedback({
    userId,
    propertyId: execution.propertyId,
    page,
    rating: input.rating.toLowerCase(),
    comment: input.comment ?? null,
    targetType: 'ASK_EXECUTION',
    targetId: execution.id,
    surface: 'COZY',
    reasonCodes: [...new Set<FeedbackReasonCode>([input.rating === 'UP' ? 'USEFUL' : 'NOT_USEFUL', ...(input.reasonCodes ?? [])])],
    capabilityId: execution.skillId ?? 'ask',
    capabilityVersion: execution.skillVersion ?? ASK_RESPONSE_SCHEMA_VERSION,
  });
  askFeedbackTotal.inc({ rating: input.rating.toLowerCase() });
  return { id: saved.id, rating: input.rating };
}

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable —
// per-PRIORITY_LIST-item rating, distinct from submitAskExecutionFeedback's
// whole-execution UP/DOWN. Ownership is verified the same way
// submitAskExecutionFeedback does (the execution belongs to this user);
// homeActionsResult() already ran ensurePropertyAccess before this execution
// could have surfaced any PRIORITY_LIST item for its property.
export async function submitHomeActionUsefulnessFeedback(
  userId: string,
  executionId: string,
  homeActionId: string,
  input: SubmitHomeActionUsefulnessFeedback,
): Promise<{ id: string; rating: 'USEFUL' | 'NOT_USEFUL' }> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, propertyId: true, skillId: true, skillVersion: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  return recordHomeActionUsefulnessFeedback({
    userId, propertyId: execution.propertyId, homeActionId, rating: input.rating, comment: input.comment ?? null,
    reasonCodes: input.reasonCodes,
    capabilityId: execution.skillId ?? 'home-actions',
    capabilityVersion: execution.skillVersion ?? 'canonical-feed-v1',
  });
}
