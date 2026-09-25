// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { askExecutionDurationSeconds, askExecutionsTotal, askInlineCapturesTotal, askRoutingDecisionsTotal, askSkillRoutingDecisionsTotal, askSkillRoutingDurationSeconds } from '../../../lib/metrics';
import { type AskAccountRole } from '../askAccountEligibility';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { runConversationalCaptureForTurn } from '../conversationalUnderstanding/conversationalCapture';
import { asInputJson, askFailureBlocks, askFailureStatus, assertSkillResultBlocksAllowed, audienceTelemetryFor, discoverableAskOperationIds, ensureAskServiceAccountEligibility, ensurePropertyAccess, enterAskPropertyTimezoneContext, mapPersistedExecution, maybeSynthesizeDeterministicResult, preservedExecutionHistory, propertySummary, recordAskAnswerTrustMetrics, terminalStatus, withAskTimeout } from '../askHandlerSupport';
import { executeOperation } from '../execution/executeOperation';
import { propertyScopeForAskRouting, resolveAskRoutingCascade, type AskRoutingDecision } from '../askRoutingCascade';
import { resolveAskFollowUpMessage } from '../askFollowUpContext';
import { getSkillDefinition, getSkillForOperation, resolveEffectiveSkillOperationPolicy } from '../../skills/skillRegistry';
import { ASK_CAPABILITY_UNIQUE_OPERATION } from '../../intelligence/capabilitySkillGuidanceBridge.registry';
import { resolveHierarchicalSkillRouting, type SkillRoutingOutcome } from '../../skills/skillRouter';
import { buildSkillExecutionBinding } from '../../skills/skillExecutionBinding';
import { buildSkillExecutionTelemetry, createSkillExecutionTimingTrace } from '../../skills/skillExecutionTelemetry';
import { focusedOperationForLaunchContext } from '../askFocusedGuidance';
import { validateAskAnswerTrustPipeline } from '../askAnswerTrustValidator';
import { resolveAskEntityState } from '../askEntityResolution';
import { askOperationSemanticIndexVersion, normalizeAskMessage } from '../askSemanticRouter';
import { reclaimOrphanedRunningExecution } from '../execution/askSessions';

function stableSkillRoutingReasonCode(outcome: SkillRoutingOutcome): string | null {
  if (outcome === 'UNSUPPORTED') return 'ASK_SKILL_UNSUPPORTED';
  if (outcome === 'AMBIGUOUS_SKILL' || outcome === 'AMBIGUOUS_OPERATION') return 'ASK_SKILL_AMBIGUOUS';
  return null;
}

function routingClarificationResult(
  decision: AskRoutingDecision,
  reasonCode: 'ASK_ROUTING_AMBIGUOUS' | 'ASK_SKILL_AMBIGUOUS' = 'ASK_ROUTING_AMBIGUOUS',
): AskOperationResult {
  const candidates = decision.candidates.slice(0, 3);
  const languagePack = (operationId: AskOperationId) => (
    getAskOperationDefinition(operationId).semantic.languagePacks[decision.language]
  );
  const choices = candidates.map((candidate) => languagePack(candidate.operationId)?.supportedJobs[0]).filter(Boolean);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    status: 'NEEDS_CLARIFICATION',
    reasonCode,
    blocks: [{
      type: 'SUMMARY',
      id: 'routing-clarification',
      title: 'What would you like to focus on?',
      body: choices.length
        ? `I found more than one possible home-related request: ${choices.join(', ')}. Add one detail so I can use the right home record and calculation.`
        : 'Add one detail about the home record, decision, task, or tool you want to use.',
      tone: 'DEFAULT',
      actions: [],
    }],
    clarification: {
      version: 1,
      question: 'Which home request would you like Ask to handle?',
      options: candidates.map((candidate) => ({
        operationId: candidate.operationId,
        label: languagePack(candidate.operationId)?.supportedJobs[0]
          ?? getAskOperationDefinition(candidate.operationId).semantic.supportedJobs[0],
      })),
      allowFreeText: true,
      expiresAt,
    },
    parameters: {
      clarification: {
        version: 1,
        candidateOperationIds: candidates.map((candidate) => candidate.operationId),
        expiresAt,
      },
    },
    suggestions: choices.map((choice) => `Help me with ${choice}`).slice(0, 3),
  };
}

export async function createAskExecution(userId: string, input: CreateAskExecutionRequest, accountRole?: AskAccountRole): Promise<AskExecutionResponse> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const controls = readAskOperationalControls();
  const safetyFirstDecision = resolveAskRoutingCascade(input.message, {
    localRoutingEnabled: false,
    embeddingRetrievalEnabled: false,
  });
  const executionPropertyId = propertyScopeForAskRouting(safetyFirstDecision, input.propertyId);
  const initialPropertyAccess = executionPropertyId
    ? await ensurePropertyAccess(userId, executionPropertyId)
    : null;
  const eligibleOperationIds = await discoverableAskOperationIds({
    propertyId: executionPropertyId, propertyAccess: initialPropertyAccess, controls,
  });
  await enterAskPropertyTimezoneContext(executionPropertyId);
  const duplicate = await prisma.askExecution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
  if (duplicate) {
    // Without this, a retry that reuses the same clientRequestId (the
    // client's own idempotency key for this question) just returns a
    // crash-orphaned RUNNING row verbatim, forever — an infinite spinner
    // with no path forward. Reclaim it first so the retry actually observes
    // a terminal, retryable state instead.
    const current = await reclaimOrphanedRunningExecution(duplicate);
    return mapPersistedExecution(
      current,
      await propertySummary(safetyFirstDecision.stage === 'SAFETY' ? null : current.propertyId),
    );
  }

  const expiresAt = new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000);
  const existingSession = await prisma.askSession.findUnique({ where: { id: input.sessionId } });
  if (existingSession && existingSession.userId !== userId) {
    const error = new Error('Ask session not found.');
    (error as Error & { code?: string }).code = 'ASK_SESSION_NOT_FOUND';
    throw error;
  }
  const session = existingSession
    ? await prisma.askSession.update({
      where: { id: existingSession.id },
      data: { propertyId: executionPropertyId ?? undefined, lastActiveAt: new Date(), expiresAt },
    })
    : await prisma.askSession.create({
      data: { id: input.sessionId, userId, propertyId: executionPropertyId ?? null, title: input.message.slice(0, 120), expiresAt },
    });
  const execution = await prisma.askExecution.create({
    data: {
      sessionId: session.id,
      userId,
      propertyId: executionPropertyId ?? null,
      clientRequestId: input.clientRequestId,
      message: input.message,
      launchContextJson: safetyFirstDecision.stage !== 'SAFETY' && input.launchContext
        ? asInputJson(input.launchContext)
        : undefined,
      // The row's true first persisted state: the request has been
      // accepted but routing hasn't run yet. Previously this was created
      // directly as 'ROUTING', so RECEIVED was declared in
      // AskExecutionStatus (and matches the schema column default) but
      // could never actually be observed as execution.status -- only as
      // this same-named AskExecutionEvent.eventType below.
      status: 'RECEIVED',
      expiresAt,
    },
  });
  await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'RECEIVED', metadataJson: asInputJson({ surface: input.launchContext?.surface ?? 'unknown' }) } });

  // Bounded, durable follow-up resolution: reads the most recent typed
  // execution in this session (not raw chat history) and, only for a
  // recognized bare-continuation phrasing ("Now complete it.", "Only show
  // the urgent ones."), rewrites the effective message so the existing
  // deterministic routing/entity-matching regexes see enough context to
  // resolve correctly. The homeowner-visible/persisted question stays the
  // original input.message.
  const followUp = await resolveAskFollowUpMessage({ sessionId: session.id, propertyId: executionPropertyId, message: input.message, declaredSourceExecutionId: input.launchContext?.sourceExecutionId ?? null });
  const routingMessage = followUp.effectiveMessage;

  const skillRoutingStartedAt = process.hrtime.bigint();
  let routingDecision = safetyFirstDecision.stage === 'SAFETY'
    ? safetyFirstDecision
    : resolveAskRoutingCascade(routingMessage, {
      localRoutingEnabled: controls.localRoutingEnabled && controls.semanticRetrievalEnabled,
      localMinimumConfidence: controls.localRoutingMinimumConfidence,
      ambiguityMargin: controls.routingAmbiguityMargin,
      classifierEnabled: controls.constrainedClassifierEnabled,
      embeddingRetrievalEnabled: controls.embeddingRetrievalEnabled,
      eligibleOperationIds,
      propertyId: executionPropertyId,
      launchEntityId: input.launchContext?.entityId,
    });
  const launchCapabilityOperationId = input.launchContext?.capabilityId
    ? ASK_CAPABILITY_UNIQUE_OPERATION[input.launchContext.capabilityId]
    : undefined;
  const contextualOperationId = focusedOperationForLaunchContext(input.launchContext);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD ACT-001/ACT-003: a declared item
  // action (GroupedListItemActionSchema.operationId) names its own
  // registered operation explicitly -- the highest-priority source here,
  // since it is server-declared authoritative identity from a prior
  // response, not an inference from free text or a launch surface.
  // Validated against the operation registry before use; an unrecognized
  // or stale value is silently ignored rather than trusted, falling back
  // to the same NLU/entity-based resolution every other turn uses.
  const declaredItemActionOperationId = input.launchContext?.operationId && input.launchContext.operationId in ASK_OPERATION_DEFINITIONS
    ? input.launchContext.operationId as AskOperationId
    : null;
  const forcedOperationId = declaredItemActionOperationId ?? followUp.forcedOperationId ?? contextualOperationId ?? launchCapabilityOperationId ?? null;
  const skillRoutingDecision = resolveHierarchicalSkillRouting(routingMessage, routingDecision, {
    consumer: 'ASK',
    consumerEnabled: controls.consumerEnabled,
    domainEnabled: controls.domainEnabled,
    skillEnabled: controls.skillEnabled,
    operationEnabled: controls.operationEnabled,
    adapterEnabled: controls.adapterEnabled,
    contextProviderEnabled: controls.contextProviderEnabled,
    minimumConfidence: controls.localRoutingMinimumConfidence,
    ambiguityMargin: controls.routingAmbiguityMargin,
  });
  askSkillRoutingDecisionsTotal.inc({ outcome: skillRoutingDecision.outcome, path: skillRoutingDecision.path });
  const skillRoutingLatencyMs = Number(process.hrtime.bigint() - skillRoutingStartedAt) / 1_000_000;
  askSkillRoutingDurationSeconds.observe(
    { outcome: skillRoutingDecision.outcome, path: skillRoutingDecision.path },
    skillRoutingLatencyMs / 1_000,
  );
  const skillTelemetryTrace = createSkillExecutionTimingTrace(skillRoutingLatencyMs);
  skillTelemetryTrace.audience = audienceTelemetryFor({
    propertyAccess: initialPropertyAccess,
    audiencePolicyEnabled: controls.audiencePolicyEnabled,
  });
  if (!forcedOperationId && routingDecision.stage === 'REMOTE_FALLBACK' && skillRoutingDecision.outcome === 'RESOLVED' && skillRoutingDecision.selectedOperationId) {
    const selectedOperation = getAskOperationDefinition(skillRoutingDecision.selectedOperationId);
    const confidence = skillRoutingDecision.skillCandidates[0]?.confidence ?? selectedOperation.confidence;
    routingDecision = {
      language: routingDecision.language,
      operation: { ...selectedOperation, confidence },
      stage: 'LOCAL_CLASSIFIER',
      candidates: [{ operationId: selectedOperation.operationId, confidence }],
      requiresClarification: false,
      entityResolution: resolveAskEntityState({ message: routingMessage, operationId: selectedOperation.operationId, propertyId: executionPropertyId, launchEntityId: input.launchContext?.entityId, requiresProperty: selectedOperation.requiresProperty }),
    };
  } else if (!forcedOperationId && routingDecision.stage === 'REMOTE_FALLBACK'
    && (skillRoutingDecision.outcome === 'AMBIGUOUS_OPERATION' || skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL')) {
    const skillAmbiguityOperations = skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL'
      ? skillRoutingDecision.skillCandidates.flatMap((candidate) => {
        const candidateSkill = getSkillDefinition(candidate.skillId);
        return candidateSkill?.operations
          .filter((operationReference) => Boolean(resolveEffectiveSkillOperationPolicy(candidateSkill.id, operationReference.operationId, 'ASK')))
          .map((operationReference) => ({ operationId: operationReference.operationId, confidence: candidate.confidence })) ?? [];
      })
      : skillRoutingDecision.operationCandidates;
    routingDecision = {
      language: routingDecision.language,
      operation: routingDecision.operation,
      stage: 'CLARIFICATION',
      candidates: [...new Map(skillAmbiguityOperations.map((candidate) => [candidate.operationId, candidate])).values()].slice(0, 3),
      requiresClarification: true,
      entityResolution: null,
    };
  }
  // The local classifier already had the concatenated prior+current message
  // to work with; only step in when it still found nothing confident
  // (REMOTE_FALLBACK) — a DETERMINISTIC/LOCAL_CLASSIFIER/CLARIFICATION
  // outcome, or SAFETY, is always a stronger signal than this nudge.
  // The entry point that opened Ask (e.g. the warranties or insurance page)
  // may carry a capabilityId identifying what the homeowner almost
  // certainly means, even before they type anything operation-specific —
  // this was previously captured in launchContextJson and never read back.
  // Same conservative guard as the follow-up bias: only steps in when the
  // cascade found nothing confident on its own, and only when the
  // capability unambiguously names one operation.
  //
  // External review [P1]: this conservative gate was, until now, applied
  // uniformly to every source of forcedOperationId -- including
  // declaredItemActionOperationId, which the comment above it already
  // documents as "the highest-priority source here, since it is
  // server-declared authoritative identity from a prior response, not an
  // inference from free text or a launch surface." A declared item action
  // (e.g. "Why is this important?" pinned to GROUNDED_GUIDANCE) has no
  // ambiguity left to resolve -- the UI already named the exact operation
  // -- so gating it behind "the classifier found nothing confident" meant
  // a confidently-but-wrongly-routed message (e.g. "Why is 'Annual
  // maintenance inspection' important?" matching MAINTENANCE_STATUS's own
  // keyword pattern) silently overrode the declared control. Only the two
  // genuinely soft/contextual signals (contextualOperationId,
  // launchCapabilityOperationId) keep the narrow "nudge" gate; an explicit
  // declared control always forces, exactly as ACT-001/ACT-003 intend.
  const shouldForceOperation = Boolean(forcedOperationId)
    && routingDecision.stage !== 'SAFETY'
    && !routingDecision.requiresClarification
    && routingDecision.operation.operationId !== forcedOperationId
    && (Boolean(declaredItemActionOperationId) || Boolean(contextualOperationId) || routingDecision.stage === 'REMOTE_FALLBACK');
  const operation = shouldForceOperation
    ? { ...getAskOperationDefinition(forcedOperationId as AskOperationId), confidence: 1 }
    : routingDecision.operation;
  const operationDefinition = getAskOperationDefinition(operation.operationId);
  const routedEntityResolution = shouldForceOperation
    ? resolveAskEntityState({ message: routingMessage, operationId: operation.operationId, propertyId: executionPropertyId, launchEntityId: input.launchContext?.entityId, requiresProperty: operation.requiresProperty })
    : routingDecision.entityResolution;
  const selectedSkill = getSkillForOperation(operation.operationId);
  const selectedSkillBinding = selectedSkill && !routingDecision.requiresClarification
    ? buildSkillExecutionBinding({
      skill: selectedSkill,
      operationId: operation.operationId,
      consumer: 'ASK',
      routingPath: skillRoutingDecision.path,
      routingReasonCodes: skillRoutingDecision.skillCandidates
        .find((candidate) => candidate.skillId === selectedSkill.id)?.reasonCodes ?? [],
      semanticIndexVersion: skillRoutingDecision.semanticIndexVersion,
    })
    : null;
  const generationMode = routingDecision.requiresClarification
    ? 'deterministic'
    : operationDefinition.executionMode === 'REMOTE_GENERATION' ? 'remote' : 'deterministic';
  askRoutingDecisionsTotal.inc({ stage: routingDecision.stage.toLowerCase(), outcome: routingDecision.requiresClarification ? 'clarification' : operation.operationId.toLowerCase() });
  const normalizedRoutingMessage = normalizeAskMessage(routingMessage, routingDecision.language);
  await prisma.askExecutionEvent.create({
    data: {
      executionId: execution.id,
      eventType: 'CAPABILITY_RESOLVED',
      metadataJson: asInputJson({
        skillId: routingDecision.requiresClarification ? null : selectedSkill?.id ?? null,
        skillVersion: routingDecision.requiresClarification ? null : selectedSkill?.version ?? null,
        operationId: routingDecision.requiresClarification ? null : operation.operationId,
        operationVersion: routingDecision.requiresClarification ? null : operation.version,
        routingStage: routingDecision.stage,
        routingConfidence: operation.confidence,
        routingConfidenceBand: routingDecision.candidates.find((candidate) => candidate.operationId === operation.operationId)?.confidenceBand
          ?? (operation.confidence >= 0.9 ? 'HIGH' : operation.confidence >= 0.45 ? 'MEDIUM' : 'LOW'),
        entityResolutionOutcome: routedEntityResolution?.outcome ?? 'NOT_REQUIRED',
        entityConfidenceBand: routedEntityResolution?.confidenceBand ?? null,
        entityReasonCodes: routedEntityResolution?.reasonCodes ?? [],
        language: routingDecision.language,
        languageContractVersion: normalizedRoutingMessage.contractVersion,
        normalizedMessageHash: createHash('sha256').update(normalizedRoutingMessage.normalized).digest('hex').slice(0, 16),
        retrievalMode: routingDecision.stage === 'LOCAL_CLASSIFIER' || routingDecision.stage === 'CLARIFICATION' ? 'HYBRID_LOCAL' : 'DETERMINISTIC',
        retrievalPath: routingDecision.candidates[0]?.retrievalPath ?? 'DETERMINISTIC',
        routingCalibrationVersion: routingDecision.candidates[0]?.calibrationVersion ?? null,
        routingRawScore: routingDecision.candidates[0]?.rawConfidence ?? null,
        classifierMode: controls.constrainedClassifierEnabled ? 'CONSTRAINED_LOCAL' : 'DISABLED',
        operationSemanticVersion: routingDecision.requiresClarification ? null : operationDefinition.semantic.semanticVersion,
        operationSemanticIndexVersion: askOperationSemanticIndexVersion(routingDecision.language),
        candidateOperationIds: routingDecision.candidates.map((candidate) => candidate.operationId),
        candidateReasonCodes: routingDecision.candidates.flatMap((candidate) => candidate.reasonCodes ?? []),
        skillRoutingOutcome: skillRoutingDecision.outcome,
        skillRoutingReasonCode: stableSkillRoutingReasonCode(skillRoutingDecision.outcome),
        skillRoutingPath: skillRoutingDecision.path,
        semanticIndexVersion: skillRoutingDecision.semanticIndexVersion,
        skillCandidateIds: skillRoutingDecision.skillCandidates.map((candidate) => candidate.skillId),
      }),
    },
  });
  if (followUp.sourceExecutionId) {
    await prisma.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'FOLLOW_UP_RESOLVED', metadataJson: asInputJson({ sourceExecutionId: followUp.sourceExecutionId, forcedOperation: shouldForceOperation }) },
    });
  }
  const startedAt = Date.now();
  // A clarification-in-progress execution hasn't actually resolved to
  // `operation` yet — that's just the routing cascade's placeholder/best
  // guess among ambiguous candidates. Recording its family here would
  // mislabel a genuinely ambiguous turn as belonging to whatever family
  // the placeholder happens to carry (typically GENERAL_HOME_GUIDANCE),
  // undercounting true CLARIFICATION volume in analytics.
  const storedIntentFamily = routingDecision.requiresClarification ? 'CLARIFICATION' : operation.family;
  await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      skillId: selectedSkillBinding?.skill.id ?? null,
      skillVersion: selectedSkillBinding?.skill.version ?? null,
      skillDomain: selectedSkillBinding?.skill.domain ?? null,
      skillBindingJson: selectedSkillBinding ? asInputJson(selectedSkillBinding) : undefined,
      operationId: operation.operationId,
      operationVersion: operation.version,
      intentFamily: storedIntentFamily,
      intentConfidence: operation.confidence,
      status: 'RUNNING',
    },
  });
  // External review [P2]: an organically-typed filter refinement (no
  // declared chip -- e.g. typing "only show urgent tasks" after a
  // maintenance list) is resolved server-side via
  // resolveAskFollowUpMessage/followUp.sourceExecutionId, but the call
  // below only ever forwarded input.launchContext -- the CLIENT's own
  // launch context, which carries no sourceExecutionId for a typed
  // message. maintenance.status's handler only loads the stored viewState
  // when launchContext.sourceExecutionId is present, so every organic
  // refinement reset resultId/revision and lost local view state
  // (selection/expansion/pagination) even though the identical refinement
  // via a declared chip already worked (the client sets sourceExecutionId
  // itself for those). Prefer an already-declared sourceExecutionId when
  // present -- for a declared chip, resolveAskFollowUpMessage's pinned
  // lookup found the SAME row by that id, so the two never actually
  // disagree; this only fills the gap for organic follow-ups.
  const effectiveLaunchContext = safetyFirstDecision.stage === 'SAFETY'
    ? undefined
    : (followUp.sourceExecutionId && !input.launchContext?.sourceExecutionId)
      ? { ...(input.launchContext ?? { surface: 'ASK_FOLLOW_UP' }), sourceExecutionId: followUp.sourceExecutionId }
      : input.launchContext;
  try {
    const rawResult = await withAskTimeout(
      routingDecision.requiresClarification
        ? Promise.resolve(routingClarificationResult(
          routingDecision,
          skillRoutingDecision.outcome === 'AMBIGUOUS_SKILL' || skillRoutingDecision.outcome === 'AMBIGUOUS_OPERATION'
            ? 'ASK_SKILL_AMBIGUOUS'
            : 'ASK_ROUTING_AMBIGUOUS',
        ))
        : executeOperation({ userId, sessionId: session.id, executionId: execution.id, message: routingMessage, propertyId: executionPropertyId, operation, launchContext: effectiveLaunchContext, continuationCursor: followUp.continuationCursor, suppliedInput: followUp.suppliedInput, deferSemanticValidation: true }, skillTelemetryTrace),
      controls.executionTimeoutMs,
    );
    const presentedResult = operationDefinition.executionMode === 'DETERMINISTIC' && !routingDecision.requiresClarification
      ? await maybeSynthesizeDeterministicResult(operation.operationId, rawResult, controls.resultSynthesisEnabled && controls.remoteGenerationEnabled, skillTelemetryTrace)
      : rawResult;
    const validation = routingDecision.requiresClarification
      ? null
      : validateAskAnswerTrustPipeline({ question: routingMessage, operationId: operation.operationId, result: presentedResult, propertyId: executionPropertyId, semanticEnabled: controls.semanticResponseValidatorEnabled, language: routingDecision.language });
    const result = validation?.result ?? presentedResult;
    if (validation) recordAskAnswerTrustMetrics(operation.operationId, validation);
    assertSkillResultBlocksAllowed(operation.operationId, result, skillTelemetryTrace);
    const completedAt = terminalStatus(result.status) ? new Date() : undefined;
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : undefined,
        // RES-003/MAINT-003: only a bare filter refinement (not entity/
        // pagination/specialist/monitor continuations, which are legitimate
        // separate answers) is marked so the frontend can update the prior
        // card's surface instead of appending a duplicate list.
        // This is a brand-new execution row (execution.resultJson is null
        // at this point), so continuesExecutionId is a fresh assignment
        // from this turn's own follow-up resolution, not a preserved value
        // -- only originalResponse comes from the shared history policy.
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, continuesExecutionId: followUp.isFilterRefinement ? followUp.sourceExecutionId : null, originalResponse: preservedExecutionHistory(execution.resultJson, result.blocks).originalResponse }),
        completedAt,
      },
    });
    if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: operation.operationId, outcome: 'PROMPTED' }, result.captureRequests.length);
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: result.status, metadataJson: asInputJson({ skillId: selectedSkill?.id ?? null, skillVersion: selectedSkill?.version ?? null, operationId: operation.operationId, operationVersion: operation.version, blockTypes: result.blocks.map((block) => block.type) }) } });
    if (validation) await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...validation.trust, semantic: validation.semantic, repaired: validation.repaired, sourceCompletionState: validation.trust.checks.sourceIntegrity }) } });
    await prisma.askExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'SKILL_EXECUTION_TELEMETRY',
        metadataJson: asInputJson(buildSkillExecutionTelemetry({
          routing: skillRoutingDecision,
          binding: selectedSkillBinding,
          operationId: routingDecision.requiresClarification ? null : operation.operationId,
          operationVersion: routingDecision.requiresClarification ? null : operation.version,
          executionMode: routingDecision.requiresClarification ? 'CLARIFICATION' : operationDefinition.executionMode,
          effectiveRiskPolicy: routingDecision.requiresClarification ? null : selectedSkill?.riskPolicy ?? null,
          resultStatus: result.status,
          errorCode: null,
          totalLatencyMs: Date.now() - startedAt,
          trace: skillTelemetryTrace,
        })),
      },
    });
    askExecutionsTotal.inc({ operation: operation.operationId, status: result.status, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    const resolvedProperty = await propertySummary(executionPropertyId);
    // Ask Cozy Stage 3, Phase 3 (implementation plan §9's extraction-trigger
    // call site; FRD §10 Turn Processing Contract steps 7-8). Independent of
    // the routed answer above (FRD §10: "Steps 6 and 8 are independent --
    // routing succeeding or failing does not gate extraction"). Code review
    // finding (2026-09-13): this previously also skipped extraction whenever
    // routing needed clarification or the routed operation itself returned
    // NEEDS_CONFIRMATION -- an invented UX simplification, not something the
    // FRD asked for, and it silently discarded an independent home fact
    // stated in the same message as an ambiguous or confirmation-requiring
    // command (e.g. "Turn on the AC, and I replaced the roof last summer for
    // $14,500" would lose the roof fact entirely). childExecutions already
    // supports multiple simultaneous confirmation cards in one turn by
    // design (bounded to 3) -- there is no real stacking conflict to avoid.
    // The only remaining gate is executionPropertyId, since extraction needs
    // a property to write facts/events to.
    let childExecutionResponses: AskExecutionResponse[] = [];
    if (executionPropertyId) {
      try {
        const capturedChildren = await runConversationalCaptureForTurn({
          userId,
          sessionId: session.id,
          propertyId: executionPropertyId,
          parentExecutionId: execution.id,
          message: input.message,
          contextVersion: result.contextVersion ?? saved.contextVersion,
          skipDueToRoutedCapture: operationDefinition.safetyClass === 'MATERIAL_DECISION' && result.status === 'COMPLETED',
        });
        childExecutionResponses = capturedChildren.map((child) => mapPersistedExecution(child, resolvedProperty));
      } catch (error) {
        logger.warn({ error, executionId: execution.id }, "[ask-conversational-capture] failed to attach captured children to this turn's response");
      }
    }
    return mapPersistedExecution(saved, resolvedProperty, childExecutionResponses);
  } catch (caught) {
    const failureStatus = askFailureStatus(caught);
    const retryable = failureStatus === 'FAILED_RETRYABLE';
    const errorCode = caught instanceof Error ? caught.name : 'ASK_EXECUTION_FAILED';
    const saved = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: failureStatus,
        errorCode,
        completedAt: failureStatus === 'FAILED_TERMINAL' ? new Date() : null,
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: askFailureBlocks(caught, retryable),
          captureRequests: [], confirmation: null, clarification: null,
          suggestions: retryable ? ['Ask this question again'] : [],
          ...preservedExecutionHistory(execution.resultJson, askFailureBlocks(caught, retryable)),
        }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: failureStatus, metadataJson: asInputJson({ skillId: selectedSkill?.id ?? null, skillVersion: selectedSkill?.version ?? null, operationId: operation.operationId, operationVersion: operation.version }) } });
    await prisma.askExecutionEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'SKILL_EXECUTION_TELEMETRY',
        metadataJson: asInputJson(buildSkillExecutionTelemetry({
          routing: skillRoutingDecision,
          binding: selectedSkillBinding,
          operationId: routingDecision.requiresClarification ? null : operation.operationId,
          operationVersion: routingDecision.requiresClarification ? null : operation.version,
          executionMode: routingDecision.requiresClarification ? 'CLARIFICATION' : operationDefinition.executionMode,
          effectiveRiskPolicy: routingDecision.requiresClarification ? null : selectedSkill?.riskPolicy ?? null,
          resultStatus: failureStatus,
          errorCode,
          totalLatencyMs: Date.now() - startedAt,
          trace: skillTelemetryTrace,
        })),
      },
    });
    askExecutionsTotal.inc({ operation: operation.operationId, status: failureStatus, generation_mode: generationMode });
    askExecutionDurationSeconds.observe({ operation: operation.operationId, generation_mode: generationMode }, (Date.now() - startedAt) / 1000);
    return mapPersistedExecution(saved, await propertySummary(executionPropertyId));
  }
}
