// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type ResolveAskExecutionProperty, type SubmitAskClarification } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResolution } from '../askOperationRegistry';
import { asInputJson, askFailureBlocks, askFailureStatus, assertSkillResultBlocksAllowed, discoverableAskOperationIds, ensurePropertyAccess, enterAskPropertyTimezoneContext, expireIfSkillBindingChanged, mapPersistedExecution, maybeSynthesizeDeterministicResult, preservedExecutionHistory, propertySummary, recordAskAnswerTrustMetrics, terminalStatus, withAskTimeout } from '../askHandlerSupport';
import { executeOperation } from '../execution/executeOperation';
import { propertyScopeForAskRouting, resolveAskRoutingCascade } from '../askRoutingCascade';
import { getSkillForOperation } from '../../skills/skillRegistry';
import { buildSkillExecutionBinding } from '../../skills/skillExecutionBinding';
import { validateAskAnswerTrustPipeline } from '../askAnswerTrustValidator';

export async function submitAskClarification(userId: string, executionId: string, input: SubmitAskClarification): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const priorReceipt = parameters.clarificationReceipt;
  if (priorReceipt && typeof priorReceipt === 'object' && !Array.isArray(priorReceipt)
    && (priorReceipt as Record<string, unknown>).idempotencyKey === input.idempotencyKey) {
    return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
  }
  const clarification = parameters.clarification;
  if (!['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'].includes(execution.status) || !clarification || typeof clarification !== 'object' || Array.isArray(clarification)) {
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  const savedClarification = clarification as Record<string, unknown>;
  const expiresAt = typeof savedClarification.expiresAt === 'string' ? new Date(savedClarification.expiresAt) : null;
  if (savedClarification.version !== input.clarificationVersion || !expiresAt || expiresAt <= new Date()) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED',
        reasonCode: 'ASK_CLARIFICATION_EXPIRED',
        completedAt: new Date(),
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{ type: 'SUMMARY', id: 'clarification-expired', title: 'This clarification expired', body: 'Ask the question again so the answer uses current home records and routing rules.', tone: 'CAUTION', actions: [] }],
          captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
          ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY' as const, id: 'clarification-expired', title: 'This clarification expired', body: 'No action was performed.', tone: 'CAUTION' as const, actions: [] }]),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CLARIFICATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  const candidateOperationIds = Array.isArray(savedClarification.candidateOperationIds)
    ? savedClarification.candidateOperationIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (input.operationId && !candidateOperationIds.includes(input.operationId)) {
    const error = new Error('The selected clarification option is invalid.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_INVALID_OPTION';
    throw error;
  }
  const controls = readAskOperationalControls();
  const clarifiedMessage = input.answer ? `${execution.message}\nClarification: ${input.answer}` : execution.message;
  const safetyOnlyDecision = resolveAskRoutingCascade(clarifiedMessage, { localRoutingEnabled: false, embeddingRetrievalEnabled: false });
  const clarifiedPropertyId = propertyScopeForAskRouting(safetyOnlyDecision, execution.propertyId);
  const clarifiedAccess = clarifiedPropertyId ? await ensurePropertyAccess(userId, clarifiedPropertyId) : null;
  const clarificationEligibleOperationIds = await discoverableAskOperationIds({
    propertyId: clarifiedPropertyId, propertyAccess: clarifiedAccess, controls,
  });
  const safetyDecision = safetyOnlyDecision.stage === 'SAFETY'
    ? safetyOnlyDecision
    : resolveAskRoutingCascade(clarifiedMessage, {
      localRoutingEnabled: controls.localRoutingEnabled && controls.semanticRetrievalEnabled,
      embeddingRetrievalEnabled: controls.embeddingRetrievalEnabled,
      localMinimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
      classifierEnabled: controls.constrainedClassifierEnabled,
      eligibleOperationIds: clarificationEligibleOperationIds,
      propertyId: clarifiedPropertyId,
    });
  if (input.operationId && !clarificationEligibleOperationIds.includes(input.operationId as AskOperationId)) {
    const error = new Error('That home workflow is no longer available for the selected home and household role. Choose another option or ask again.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_OPTION_UNAVAILABLE';
    throw error;
  }
  let operation: AskOperationResolution;
  if (safetyDecision.stage === 'SAFETY') {
    operation = safetyDecision.operation;
  } else if (input.operationId) {
    operation = { ...getAskOperationDefinition(input.operationId as AskOperationId), confidence: 1 };
  } else if (candidateOperationIds.length === 1) {
    operation = { ...getAskOperationDefinition(candidateOperationIds[0] as AskOperationId), confidence: 1 };
  } else {
    if (safetyDecision.requiresClarification) {
      const error = new Error('Add one more specific detail so Ask can choose the correct home workflow.');
      (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_UNRESOLVED';
      throw error;
    }
    operation = safetyDecision.operation;
  }
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const clarifiedSkill = getSkillForOperation(operation.operationId);
  const clarifiedSkillBinding = clarifiedSkill
    ? buildSkillExecutionBinding({
      skill: clarifiedSkill,
      operationId: operation.operationId,
      consumer: 'ASK',
      routingPath: 'CLARIFICATION',
      routingReasonCodes: ['HOMEOWNER_CLARIFIED'],
      semanticIndexVersion: null,
    })
    : null;
  const claimed = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: { in: ['NEEDS_CLARIFICATION', 'NEEDS_ENTITY'] } },
    data: {
      skillId: clarifiedSkillBinding?.skill.id ?? null,
      skillVersion: clarifiedSkillBinding?.skill.version ?? null,
      skillDomain: clarifiedSkillBinding?.skill.domain ?? null,
      skillBindingJson: clarifiedSkillBinding ? asInputJson(clarifiedSkillBinding) : undefined,
      propertyId: clarifiedPropertyId,
      operationId: operation.operationId, operationVersion: operation.version, intentFamily: operation.family, intentConfidence: operation.confidence, status: 'RUNNING',
      parametersJson: asInputJson({ ...parameters, clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion } }),
    },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.askExecution.findFirst({ where: { id: execution.id, userId } });
    if (latest) return mapPersistedExecution(latest, await propertySummary(latest.propertyId));
    const error = new Error('This clarification is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CLARIFICATION_NOT_ACTIVE';
    throw error;
  }
  try {
    const rawResult = await withAskTimeout(
      executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: clarifiedMessage, propertyId: clarifiedPropertyId, operation, deferSemanticValidation: true }),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC'
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const validation = validateAskAnswerTrustPipeline({
      question: clarifiedMessage,
      operationId: operation.operationId,
      result: presentedResult,
      propertyId: clarifiedPropertyId,
      semanticEnabled: controls.semanticResponseValidatorEnabled,
      recoveryAttempted: true,
      operationConfirmedByUser: Boolean(input.operationId),
    });
    const result = validation.result;
    recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result);
    const nextParameters = {
      ...(result.parameters ?? {}),
      clarificationReceipt: { idempotencyKey: input.idempotencyKey, clarificationVersion: input.clarificationVersion },
    };
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: asInputJson(nextParameters),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CLARIFICATION_SUBMITTED', metadataJson: asInputJson({ operationId: operation.operationId }) } });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired }) } });
    return mapPersistedExecution(saved, await propertySummary(clarifiedPropertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const failureBlocks = askFailureBlocks(caught, retryable);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED',
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: failureBlocks,
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, failureBlocks),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: failureStatus, metadataJson: asInputJson({ stage: 'CLARIFICATION_RESUME' }) } });
    return mapPersistedExecution(saved, await propertySummary(clarifiedPropertyId));
  }
}

// A NEEDS_PROPERTY execution already resolved a registered operation before
// discovering it requires a property; the only missing input is which home.
// This resumes the SAME execution once a property is supplied, instead of
// forcing the homeowner to restate the question as a brand-new execution.
export async function resolveAskExecutionProperty(userId: string, executionId: string, input: ResolveAskExecutionProperty): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  if (execution.status !== 'NEEDS_PROPERTY' || !execution.operationId) {
    const error = new Error('This request no longer needs a home selection.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_SELECTION_NOT_ACTIVE';
    throw error;
  }
  await ensurePropertyAccess(userId, input.propertyId);
  await enterAskPropertyTimezoneContext(input.propertyId);
  const operationDefinition = getAskOperationDefinition(execution.operationId as AskOperationId);
  const operation: AskOperationResolution = { ...operationDefinition, confidence: execution.intentConfidence ?? 1 };
  const claimed = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: 'NEEDS_PROPERTY' },
    data: { propertyId: input.propertyId, status: 'RUNNING' },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.askExecution.findFirst({ where: { id: execution.id, userId } });
    if (latest) return mapPersistedExecution(latest, await propertySummary(latest.propertyId));
    const error = new Error('This request no longer needs a home selection.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_SELECTION_NOT_ACTIVE';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { propertyId: input.propertyId, lastActiveAt: new Date() } });
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'PROPERTY_SELECTED', metadataJson: asInputJson({ propertyId: input.propertyId }) } });
  const controls = readAskOperationalControls();
  try {
    const rawResult = await withAskTimeout(
      executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: input.propertyId, operation, deferSemanticValidation: true }),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC'
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled)
      : rawResult;
    const validation = validateAskAnswerTrustPipeline({ question: execution.message, operationId: operation.operationId, result: presentedResult, propertyId: input.propertyId, semanticEnabled: controls.semanticResponseValidatorEnabled });
    const result = validation.result;
    recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: result.status, metadataJson: asInputJson({ operationId: operation.operationId, stage: 'PROPERTY_RESUME' }) } });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const failureBlocks = askFailureBlocks(caught, retryable);
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode: caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED',
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: failureBlocks,
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, failureBlocks),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: failureStatus, metadataJson: asInputJson({ stage: 'PROPERTY_RESUME' }) } });
    return mapPersistedExecution(saved, await propertySummary(input.propertyId));
  }
}
