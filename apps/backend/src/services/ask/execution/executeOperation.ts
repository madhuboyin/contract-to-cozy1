// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, AskExecutionStatus, HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { askInlineCapturesTotal, askRemoteGenerationTotal, askSkillAdapterExecutionDurationSeconds, askSkillAdapterExecutionsTotal, askSkillAdapterResolutionDurationSeconds, askSkillCanonicalOperationDurationSeconds, askSkillExecutionDurationSeconds, askSkillExecutionsTotal, askSkillHandoffsTotal } from '../../../lib/metrics';
import { type PropertyAccess } from '../../propertyAccess.service';
import { composeSkillContext } from '../../skills/context/skillContextComposer';
import { skillContextProviderKey } from '../../skills/context/skillContextProviderRegistry';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../../skills/context/propertyJourneyContext.contract';
import type { ComposedSkillContext } from '../../skills/context/skillContext.contract';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy, type AskAudienceApplicabilityDecision } from '../askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResolution, type AskOperationResult } from '../askOperationRegistry';
import { capabilityInvoke, needsPropertyResult, operationalUnavailableResult, permissionRequiredResult, skillRuntimeUnavailableReason, type CapabilityInvocationDependencies } from '../capabilityHandlerRegistry';
import type { CapabilityInvocationEnvelope } from '../capabilityInvocation.contract';
import { buildAskNextActionsBlock } from '../askNextActions';
import { asInputJson, audienceApplicabilityResult, audienceTelemetryFor, ensurePropertyAccess, expireIfSkillBindingChanged, journeyContextFrom, mapPersistedExecution, preservedExecutionHistory, propertySummary, recordAskAnswerTrustMetrics, terminalStatus } from '../askHandlerSupport';
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';
import { suppressRepeatedAskSuggestions } from '../askSuggestionPolicy';
import { getSkillForOperation, resolveEffectiveSkillOperationPolicy } from '../../skills/skillRegistry';
import { ASK_OPERATION_CAPABILITY } from '../../intelligence/capabilitySkillGuidanceBridge.registry';
import { getSkillAdapter } from '../../skills/adapters/skillAdapterRegistry';
import { type SkillExecutionTimingTrace } from '../../skills/skillExecutionTelemetry';
import { resolveSkillHandoffSuggestion } from '../../skills/skillHandoff';
import { applyAskAudiencePresentation } from '../askAudiencePresentation';
import { validateAskAnswerTrustPipeline } from '../askAnswerTrustValidator';
import { attachAskAuthoritativeSourceEvidence, includeAskContextSourceEvidence } from '../askAnswerTrustPolicy';
import type { AskAuthoritativeSourceEvidence } from '../askTrust.contract';

function attachJourneyContext(
  result: AskOperationResult,
  composedContext: ComposedSkillContext | null,
  audienceDecision?: AskAudienceApplicabilityDecision | null,
): AskOperationResult {
  const journeyContext = journeyContextFrom(composedContext);
  if (!journeyContext && !audienceDecision) return result;
  return {
    ...result,
    parameters: {
      ...(result.parameters ?? {}),
      ...(journeyContext ? {
        journeyContext: {
          ownershipState: journeyContext.ownershipState,
          operatingMode: journeyContext.operatingMode,
          entryPath: journeyContext.entryPath,
          propertyOrigin: journeyContext.propertyOrigin,
          contextVersion: journeyContext.contextVersion,
          capturedAt: journeyContext.capturedAt,
        },
      } : {}),
      ...(audienceDecision ? {
        audienceApplicability: {
          outcome: audienceDecision.outcome,
          reasonCode: audienceDecision.reasonCode,
          policyVersion: audienceDecision.policyVersion,
          operatingMode: audienceDecision.operatingMode,
        },
      } : {}),
    },
  };
}

function buildCapabilityInvocationEnvelope(
  input: { userId: string; sessionId: string; executionId: string; message: string; propertyId?: string | null; launchContext?: CreateAskExecutionRequest['launchContext']; continuationCursor?: string | null; suppliedInput?: Record<string, unknown> | null },
): CapabilityInvocationEnvelope {
  return {
    userId: input.userId,
    propertyId: input.propertyId ?? undefined,
    sessionId: input.sessionId,
    executionId: input.executionId,
    message: input.message,
    launchContext: input.launchContext,
    continuationCursor: input.continuationCursor ?? undefined,
    suppliedInput: input.suppliedInput ?? undefined,
  };
}

async function dispatchOperationAdapterResult(
  input: { userId: string; sessionId: string; executionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution; launchContext?: CreateAskExecutionRequest['launchContext']; continuationCursor?: string | null; suppliedInput?: Record<string, unknown> | null },
  composedContext: Awaited<ReturnType<typeof composeSkillContext>> | null,
  trace?: SkillExecutionTimingTrace,
  propertyAccess?: PropertyAccess | null,
): Promise<AskOperationResult> {
  const deps: CapabilityInvocationDependencies = { composedContext, trace, propertyAccess };
  return capabilityInvoke(input.operation.operationId, buildCapabilityInvocationEnvelope(input), deps);
}

function canonicalAdapterSourceEvidence(
  operationId: AskOperationId,
  composedContext: ComposedSkillContext | null,
  observedAt = new Date().toISOString(),
): AskAuthoritativeSourceEvidence[] {
  const adapter: AskAuthoritativeSourceEvidence = {
    sourceId: getAskOperationDefinition(operationId).adapterKey,
    operationId,
    status: 'COMPLETE',
    scope: 'FULL',
    freshness: 'CURRENT',
    observedAt,
  };
  const providers = (composedContext?.entries ?? [])
    .filter(includeAskContextSourceEvidence)
    .map((entry): AskAuthoritativeSourceEvidence => {
      const complete = entry.status === 'AVAILABLE';
      const unavailable = ['UNAVAILABLE', 'UNAUTHORIZED', 'TIMED_OUT', 'BUDGET_EXCEEDED'].includes(entry.status);
      return {
        sourceId: entry.provenance
          ? `${entry.provenance.providerId}@${entry.provenance.providerVersion}`
          : entry.key,
        operationId,
        status: complete ? 'COMPLETE' : unavailable ? 'UNAVAILABLE' : 'PARTIAL',
        scope: complete ? 'FULL' : 'LIMITED',
        freshness: complete
          ? 'CURRENT'
          : entry.status === 'STALE' ? 'STALE' : 'UNKNOWN',
        observedAt: entry.provenance?.observedAt ?? observedAt,
      };
    });
  return [adapter, ...providers];
}

async function dispatchOperationAdapter(
  input: { userId: string; sessionId: string; executionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution; launchContext?: CreateAskExecutionRequest['launchContext']; continuationCursor?: string | null; suppliedInput?: Record<string, unknown> | null },
  composedContext: ComposedSkillContext | null,
  trace?: SkillExecutionTimingTrace,
  propertyAccess?: PropertyAccess | null,
): Promise<AskOperationResult> {
  const result = await dispatchOperationAdapterResult(input, composedContext, trace, propertyAccess);
  return attachAskAuthoritativeSourceEvidence(
    result,
    canonicalAdapterSourceEvidence(input.operation.operationId, composedContext),
  );
}

export async function executeOperationCore(input: { userId: string; sessionId: string; executionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution; launchContext?: CreateAskExecutionRequest['launchContext']; continuationCursor?: string | null; suppliedInput?: Record<string, unknown> | null }, trace?: SkillExecutionTimingTrace): Promise<AskOperationResult> {
  const controls = readAskOperationalControls();
  const definition = getAskOperationDefinition(input.operation.operationId);
  const skill = getSkillForOperation(input.operation.operationId);
  const audiencePolicy = skill
    ? getAskAudiencePolicy(input.operation.operationId, definition.version)
    : undefined;
  if (!controls.askEnabled) return operationalUnavailableResult('ASK_DISABLED');
  if (!controls.operationEnabled(input.operation.operationId)) return operationalUnavailableResult('OPERATION_DISABLED');
  const skillUnavailableReason = skillRuntimeUnavailableReason(input.operation.operationId, controls);
  if (skillUnavailableReason) return operationalUnavailableResult(skillUnavailableReason);
  const effectivePolicy = skill ? resolveEffectiveSkillOperationPolicy(skill.id, input.operation.operationId, 'ASK') : null;
  if (definition.executionMode === 'REMOTE_GENERATION' && !controls.remoteGenerationEnabled) {
    askRemoteGenerationTotal.inc({ outcome: 'disabled' });
    return operationalUnavailableResult('REMOTE_GENERATION_DISABLED');
  }
  if (input.operation.requiresProperty && !input.propertyId) return needsPropertyResult();
  const authorizationFloor = effectivePolicy?.authorizationFloor ?? definition.propertyRoleFloor;
  let householdRole: HouseholdRole | null = null;
  let propertyAccess: PropertyAccess | null = null;
  if (input.propertyId && authorizationFloor) {
    const access = await ensurePropertyAccess(input.userId, input.propertyId);
    propertyAccess = access;
    householdRole = access.role;
    if (trace) {
      trace.audience = audienceTelemetryFor({
        propertyAccess: access,
        audiencePolicyEnabled: controls.audiencePolicyEnabled,
      });
    }
    const rank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
    if (rank[access.role] < rank[authorizationFloor]) {
      return permissionRequiredResult(authorizationFloor);
    }
  }
  let composedContext: Awaited<ReturnType<typeof composeSkillContext>> | null = null;
  let audienceDecision: AskAudienceApplicabilityDecision | null = null;
  if (skill && input.propertyId) {
    const contextStartedAt = process.hrtime.bigint();
    composedContext = await composeSkillContext({
      skill,
      operationId: input.operation.operationId,
      userId: input.userId,
      propertyId: input.propertyId,
    }, { providerEnabled: controls.contextProviderEnabled });
    if (trace) {
      trace.contextCompositionLatencyMs = Number(process.hrtime.bigint() - contextStartedAt) / 1_000_000;
      trace.context = composedContext;
      const journeyEntry = composedContext.entries.find(
        (entry) => entry.key === skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER),
      );
      trace.audience = audienceTelemetryFor({
        propertyAccess,
        journeyContext: journeyContextFrom(composedContext),
        audiencePolicyEnabled: controls.audiencePolicyEnabled,
        journeyContextStatus: journeyEntry?.status ?? 'NOT_APPLICABLE',
      });
    }
    if (composedContext.status === 'BLOCKED') {
      const requiredFailure = composedContext.entries.find((entry) => entry.required && entry.status !== 'AVAILABLE');
      const permissionFailure = requiredFailure?.status === 'UNAUTHORIZED';
      const budgetFailure = requiredFailure?.status === 'BUDGET_EXCEEDED';
      return {
        status: permissionFailure ? 'BLOCKED' : 'UNAVAILABLE',
        reasonCode: permissionFailure
          ? 'ASK_PERMISSION_REQUIRED'
          : budgetFailure ? 'ASK_CONTEXT_BUDGET_EXCEEDED' : 'ASK_CONTEXT_PROVIDER_UNAVAILABLE',
        blocks: [{
          type: 'SUMMARY',
          id: 'ask-required-context-unavailable',
          title: permissionFailure ? 'Permission is required' : 'Required home context is temporarily unavailable',
          body: permissionFailure
            ? 'The required property context is unavailable for your current household role. No home record was changed.'
            : 'Ask could not load a required, bounded source of home context. No home record was changed; try again shortly.',
          tone: 'CAUTION',
          actions: [],
        }],
        suggestions: ['Try again'],
      };
    }
    if (!audiencePolicy || !householdRole) return operationalUnavailableResult('ASK_SKILL_POLICY_MISMATCH');
    audienceDecision = evaluateAskAudienceApplicability({
      policy: audiencePolicy,
      accountRole: 'HOMEOWNER',
      householdRole,
      operatingMode: controls.audiencePolicyEnabled
        ? journeyContextFrom(composedContext)?.operatingMode ?? 'UNKNOWN'
        : 'UNKNOWN',
      purpose: 'EXECUTION',
    });
    if (trace?.audience) {
      trace.audience.audienceApplicabilityOutcome = audienceDecision.outcome;
      trace.audience.audiencePolicyVersion = audienceDecision.policyVersion;
    }
    if (!audienceDecision.allowed) {
      return audienceApplicabilityResult(
        audienceDecision,
        controls.audiencePolicyEnabled ? input.propertyId : null,
        householdRole,
      );
    }
  }
  if (!skill) return dispatchOperationAdapter(input, composedContext, trace, propertyAccess);
  const adapterResolutionStartedAt = process.hrtime.bigint();
  const adapterReference = skill.allowedAdapters.find((candidate) => candidate.id === definition.adapterKey)!;
  const adapter = getSkillAdapter(adapterReference.id, adapterReference.version)!;
  if (trace) trace.adapterResolutionLatencyMs = Number(process.hrtime.bigint() - adapterResolutionStartedAt) / 1_000_000;
  askSkillAdapterResolutionDurationSeconds.observe(
    { skill: skill.id, operation: input.operation.operationId, status: adapter ? 'resolved' : 'unavailable' },
    Number(process.hrtime.bigint() - adapterResolutionStartedAt) / 1_000_000_000,
  );
  const adapterStartedAt = process.hrtime.bigint();
  const canonicalStartedAt = process.hrtime.bigint();
  let canonicalStatus = 'threw';
  try {
    const canonicalResult = await dispatchOperationAdapter(input, composedContext, trace, propertyAccess);
    const presentedResult = householdRole
      ? applyAskAudiencePresentation({
        result: canonicalResult,
        householdRole,
        journeyContext: journeyContextFrom(composedContext),
        propertyId: input.propertyId,
        lifecycleFramingEnabled: controls.audiencePresentationEnabled
          && audiencePolicy?.journeyPresentation !== 'NEUTRAL',
      })
      : canonicalResult;
    const result = attachJourneyContext(
      presentedResult,
      composedContext,
      audienceDecision,
    );
    canonicalStatus = result.status;
    askSkillAdapterExecutionsTotal.inc({ adapter: adapter.id, adapter_version: adapter.version, operation: input.operation.operationId, status: result.status });
    return result;
  } catch (error) {
    askSkillAdapterExecutionsTotal.inc({ adapter: adapter.id, adapter_version: adapter.version, operation: input.operation.operationId, status: 'THREW' });
    throw error;
  } finally {
    if (trace) trace.canonicalOperationLatencyMs = Number(process.hrtime.bigint() - canonicalStartedAt) / 1_000_000;
    askSkillCanonicalOperationDurationSeconds.observe(
      { skill: skill.id, operation: input.operation.operationId, status: canonicalStatus },
      Number(process.hrtime.bigint() - canonicalStartedAt) / 1_000_000_000,
    );
    askSkillAdapterExecutionDurationSeconds.observe(
      { adapter: adapter.id, adapter_version: adapter.version, operation: input.operation.operationId },
      Number(process.hrtime.bigint() - adapterStartedAt) / 1_000_000_000,
    );
  }
}

// ASK_OPERATION_CAPABILITY / ASK_CAPABILITY_UNIQUE_OPERATION now come from
// ./intelligence/capabilitySkillGuidanceBridge.registry.ts (Home Intelligence
// Functional Completeness FRD Phase 0) — same computed values, single-sourced
// and validated at startup instead of an untyped inline map.

export async function executeOperation(input: { userId: string; sessionId: string; executionId: string; message: string; propertyId?: string | null; operation: AskOperationResolution; launchContext?: CreateAskExecutionRequest['launchContext']; continuationCursor?: string | null; suppliedInput?: Record<string, unknown> | null; deferSemanticValidation?: boolean }, trace?: SkillExecutionTimingTrace): Promise<AskOperationResult> {
  const skill = getSkillForOperation(input.operation.operationId);
  const skillStartedAt = skill ? Date.now() : null;
  let coreResult: AskOperationResult;
  try {
    coreResult = await executeOperationCore(input, trace);
  } catch (error) {
    if (skill && skillStartedAt != null) {
      askSkillExecutionsTotal.inc({ skill: skill.id, skill_version: skill.version, operation: input.operation.operationId, status: 'THREW' });
      askSkillExecutionDurationSeconds.observe(
        { skill: skill.id, skill_version: skill.version, operation: input.operation.operationId },
        (Date.now() - skillStartedAt) / 1000,
      );
    }
    throw error;
  }
  if (skill && skillStartedAt != null) {
    askSkillExecutionsTotal.inc({ skill: skill.id, skill_version: skill.version, operation: input.operation.operationId, status: coreResult.status });
    askSkillExecutionDurationSeconds.observe(
      { skill: skill.id, skill_version: skill.version, operation: input.operation.operationId },
      (Date.now() - skillStartedAt) / 1000,
    );
  }
  const result: AskOperationResult = coreResult.status === 'NEEDS_ENTITY'
    ? {
      ...coreResult,
      reasonCode: 'ASK_ENTITY_REQUIRED',
      parameters: { ...(coreResult.parameters ?? {}), requirementReasonCode: coreResult.reasonCode ?? null },
    }
    : coreResult.status === 'OUT_OF_SCOPE'
      ? {
        ...coreResult,
        reasonCode: 'ASK_OPERATION_UNSUPPORTED',
        parameters: { ...(coreResult.parameters ?? {}), requirementReasonCode: coreResult.reasonCode ?? null },
      }
      : coreResult;
  // Ask Cozy Stage 3, Phase 4 (implementation plan §10; FRD §27:
  // "Suppression: existing capabilitySuppressionPolicy.ts... plus existing
  // askSuggestionPolicy.ts repeat-filter -- both apply, they suppress
  // different things"). Hoisted above `finalize` (previously computed only
  // inside it, for the string-suggestion repeat-filter alone) so the same
  // one query also feeds the next-actions block below: a capability whose
  // owning operation was one of this session's own last 5 completed turns
  // is excluded from next-action suggestions, the session-recency
  // counterpart to `capabilitySuppressionPolicy.ts`'s own property-wide,
  // 30-day dismissal-cooldown suppression (already applied automatically
  // inside `getCapabilitySuggestions`, `askNextActions.ts`'s one call).
  // `askSuggestionPolicy.ts`'s own `suppressRepeatedAskSuggestions` is
  // string-message-shaped and not reused verbatim here -- a structured
  // capability candidate has no message text to key off -- but this is the
  // same underlying signal (recently-completed turns this session)
  // suppressing the analogous thing for a different response shape.
  let recentCompletedMessages: string[] = [];
  let recentCompletedCapabilityIds: ReadonlySet<string> = new Set();
  try {
    const recent = await prisma.askExecution.findMany({
      where: {
        sessionId: input.sessionId,
        userId: input.userId,
        id: { not: input.executionId },
        status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { message: true, operationId: true },
    });
    recentCompletedMessages = recent.map((execution) => execution.message);
    recentCompletedCapabilityIds = new Set(
      recent
        .map((execution) => (execution.operationId ? ASK_OPERATION_CAPABILITY[execution.operationId as AskOperationId] : undefined))
        .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
    );
  } catch {
    // Suggestion continuity is optional and must not block the answer.
  }
  const finalize = async (): Promise<AskOperationResult> => {
    const controls = readAskOperationalControls();
    const skillHandoff = resolveSkillHandoffSuggestion({
      sourceOperationId: input.operation.operationId,
      result,
      consumer: 'ASK',
      controls: {
        consumerEnabled: controls.consumerEnabled,
        domainEnabled: controls.domainEnabled,
        skillEnabled: controls.skillEnabled,
        operationEnabled: controls.operationEnabled,
        adapterEnabled: controls.adapterEnabled,
        contextProviderEnabled: controls.contextProviderEnabled,
      },
      continuity: {
        propertyId: input.propertyId ?? null,
        sourceEntityType: input.launchContext?.entityType ?? null,
        sourceEntityId: input.launchContext?.entityId ?? null,
        sourceHomeActionId: input.launchContext?.actionId ?? null,
        decisionThreadId: typeof result.parameters?.decisionThreadId === 'string' ? result.parameters.decisionThreadId : input.launchContext?.decisionThreadId ?? (input.launchContext?.entityType === 'DECISION_THREAD' ? input.launchContext.entityId ?? null : null),
        workItemId: typeof result.parameters?.operationalWorkItemId === 'string' ? result.parameters.operationalWorkItemId : input.launchContext?.workItemId ?? null,
        journeyId: input.launchContext?.journeyId ?? null,
        contextVersion: result.contextVersion ?? input.launchContext?.contextVersion ?? null,
        returnDestination: input.launchContext?.returnTo ?? null,
      },
    });
    if (skill && skillHandoff) {
      askSkillHandoffsTotal.inc({ source_skill: skill.id, target_skill: skillHandoff.suggestedNextSkillId, outcome: 'SUGGESTED' });
    }
    const suggestionAwareResult = suppressRepeatedAskSuggestions(
      { ...result, skillHandoff },
      input.message,
      recentCompletedMessages,
    );
    const validation = validateAskAnswerTrustPipeline({
      question: input.message,
      operationId: input.operation.operationId,
      propertyId: input.propertyId,
      result: suggestionAwareResult,
      semanticEnabled: controls.semanticResponseValidatorEnabled && !input.deferSemanticValidation,
    });
    if (!input.deferSemanticValidation) recordAskAnswerTrustMetrics(input.operation.operationId, validation);
    return validation.result;
  };
  // Ask Cozy Stage 3, Phase 4 (implementation plan §10; FRD §27). Widened
  // from the pre-Phase-4 gate, which additionally required an
  // `ASK_OPERATION_CAPABILITY` entry (excluding GROUNDED_GUIDANCE, which
  // has none) and exactly `ANSWERED`/`COMPLETED` status (excluding
  // sell/hold/rent's own `READY_WITH_LIMITATIONS` common case whenever
  // confidence is not `HIGH`) -- both were Stage 1's two named next-action
  // gaps this phase's acceptance criterion exists to close. The remaining
  // conditions (no outstanding captures, no pending confirmation, no
  // CAPABILITY_LIST block already present) are unchanged.
  if (
    !input.propertyId
    || !['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'].includes(result.status)
    || (result.captureRequests?.length ?? 0) > 0
    || result.confirmation
    || result.blocks.some((block) => block.type === 'CAPABILITY_LIST')
  ) return finalize();

  try {
    const nextActions = await buildAskNextActionsBlock({
      propertyId: input.propertyId,
      userId: input.userId,
      operationId: input.operation.operationId,
      message: input.message,
      recentCompletedCapabilityIds,
      launchContext: input.launchContext,
      contextVersion: result.contextVersion ?? null,
    });
    if (nextActions.block) result.blocks.push(nextActions.block);
    if (nextActions.captureRequests.length) result.captureRequests = nextActions.captureRequests;
  } catch {
    // Optional continuity must never turn a successful primary answer into a failure.
  }
  return finalize();
}

export async function refreshAskExecutionAfterConflict(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await ensurePropertyAccess(userId, execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  if (!execution.operationId || !(execution.operationId in ASK_OPERATION_DEFINITIONS)) {
    const error = new Error('The bound operation version is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_SKILL_VERSION_UNAVAILABLE';
    throw error;
  }
  const operation = { ...getAskOperationDefinition(execution.operationId as AskOperationId), confidence: execution.intentConfidence ?? 1 };
  // External review finding: this call omitted launchContext entirely, so
  // maintenance.status's capability handler (which only loads the stored
  // viewState when envelope.launchContext?.sourceExecutionId is present)
  // never saw it here -- every refresh re-derived a fresh viewState from
  // scratch, discarding domain/date scope and minting a new resultId and
  // revision. Self-referencing this row (it is its own view-state source)
  // fixes this for all three callers of this function: the explicit
  // Refresh button, the automatic post-mutation refresh (MAINT-005), and
  // the Ask-workspace return-trip revalidation after a Maintenance edit.
  const result = await executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation, launchContext: { surface: 'ASK_REFRESH', sourceExecutionId: execution.id } });
  // RES-001/RES-003/MAINT-003: refreshing a result does not change which
  // result it continues, nor what it originally answered -- both are
  // preserved from whatever this row already had via the one shared
  // history policy.
  const history = preservedExecutionHistory(execution.resultJson, result.blocks);
  const priorParameters = execution.parametersJson as { viewState?: { revision?: number } } | null;
  const priorRevision = priorParameters?.viewState?.revision;
  const write = await prisma.askExecution.updateMany({
    // The revision guard also covers two reads that share a millisecond timestamp.
    where: { id: execution.id, updatedAt: execution.updatedAt, status: execution.status,
      ...(typeof priorRevision === 'number' ? { parametersJson: { path: ['viewState', 'revision'], equals: priorRevision } } : {}),
    },
    data: {
      status: result.status,
      reasonCode: result.reasonCode,
      contextVersion: result.contextVersion,
      parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
      resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, continuesExecutionId: history.continuesExecutionId, originalResponse: history.originalResponse }),
      completedAt: terminalStatus(result.status) ? new Date() : null,
    },
  });
  const saved = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
  if (write.count !== 1) return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CONTEXT_CONFLICT_REFRESHED', metadataJson: asInputJson({ contextVersion: result.contextVersion }) } });
  if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: operation.operationId, outcome: 'PROMPTED' }, result.captureRequests.length);
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

// ASK_COZY_INTERACTION_MODEL_UI_FRD MAINT-005/A12: after a confirmation-
// gated mutation succeeds, refresh the list execution it was clicked from
// (if any) so it stops showing stale pending/due state instead of leaving
// that reconciliation to a manual re-ask. Reuses
// refreshAskExecutionAfterConflict (already re-runs an execution's own
// operation+message in place) rather than a new mechanism. Best-effort per
// CONF-005: a refresh failure must never fail the mutation that already
// succeeded, so any error here is swallowed and simply yields no refreshed
// card. Originally Maintenance-only (hence the name this function and type
// used to have); nothing about the implementation is actually
// Maintenance-specific -- it just reads parameters.sourceExecutionId, which
// any confirm handler can populate the same way. Generalized as part of the
// B04 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md)
// so confirmBuyerTaskUpdate can reuse it directly instead of duplicating it.
interface AskSourceRefreshOutcome {
  refreshedExecutions: AskExecutionResponse[];
  // External review finding: a failed refresh used to be indistinguishable
  // from "nothing to refresh" -- the caller got an empty array either way,
  // so CONF-005's "Saved; list could not refresh" recovery text could never
  // actually be shown. This flag lets the caller add that disclosure only
  // when a refresh was actually attempted and actually failed.
  attemptedAndFailed: boolean;
}

export async function refreshAskSourceExecution(userId: string, currentExecutionId: string, parameters: Record<string, unknown>): Promise<AskSourceRefreshOutcome> {
  const sourceExecutionId = parameters.sourceExecutionId;
  if (typeof sourceExecutionId !== 'string' || !sourceExecutionId || sourceExecutionId === currentExecutionId) {
    return { refreshedExecutions: [], attemptedAndFailed: false };
  }
  try {
    return { refreshedExecutions: [await refreshAskExecutionAfterConflict(userId, sourceExecutionId)], attemptedAndFailed: false };
  } catch {
    return { refreshedExecutions: [], attemptedAndFailed: true };
  }
}

// B04 design (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// per explicit user design decision): refreshAskSourceExecution above only
// ever refreshes the ONE list a mutation's row-action was launched from --
// XREC-001 requires "each source result whose membership, totals, status
// or next actions may have changed", not just that one. A server-owned,
// operation-level "this mutation may affect these sibling READ operations"
// map, conservative by design (XREC-001 says "may have changed", not
// "definitely changed for this exact record" -- refreshing a sibling that
// turns out unaffected just re-renders identically, which is harmless, not
// a correctness bug). Deliberately NOT client-supplied: the server already
// has the authoritative userId/sessionId/propertyId, and a client-supplied
// list would be untrusted and would still need the server to know which
// operations are even eligible siblings.
export const ASK_MUTATION_IMPACT_MAP: Partial<Record<AskOperationId, readonly AskOperationId[]>> = {
  BUYER_TASK_UPDATE: ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES'],
  // B03 fix: BUYER_TASK_COMPLETE previously called no reconciliation
  // mechanism at all (not even the single-target one BUYER_TASK_UPDATE had
  // before B04) -- completing a task changes the same BUYER_PLAN_STATUS/
  // BUYER_DEADLINES membership/counts a reschedule does, so it shares the
  // exact same sibling set.
  BUYER_TASK_COMPLETE: ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES'],
  // P05 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
  // neither Claims confirm handler called any reconciliation mechanism at
  // all -- a homeowner viewing INCIDENT_CONTINUATION's combined
  // incidents/claims list (the one read that shows claim state) had no way
  // for that list to refresh after filing or transitioning a claim except
  // asking again from scratch. INCIDENT_CONTINUATION is the sole sibling:
  // it is the only read in this track whose membership/status can change
  // from either mutation.
  CLAIM_FILE: ['INCIDENT_CONTINUATION'],
  CLAIM_TRANSITION: ['INCIDENT_CONTINUATION'],
  // IW-FRESH-003 fix (docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md §15):
  // confirmDocumentPromotionConfirm, confirmCaptureFact/confirmCaptureEvent,
  // confirmBuyerLifecycleUpdate, and confirmRefinanceRateMonitor previously
  // called no reconciliation mechanism at all -- not even the single-target
  // refreshAskSourceExecution the Maintenance reference implementation has
  // had since Phase 2. Same mechanism as the Buyer/Claims fixes above, not a
  // new one; sibling sets below are deliberately conservative (XREC-001:
  // "may have changed", not "definitely changed for this exact record" --
  // refreshing an unaffected sibling just re-renders identically).
  //
  // Confirming or rejecting one candidate changes DOCUMENT_PROMOTION_REVIEW's
  // own still-visible pending-candidates membership; a CONFIRMED material
  // spec / insurance policy fact / inspection report write-back can also
  // change what DOCUMENT_LOOKUP (the document vault) and PROPERTY_SUMMARY
  // (canonical property facts) show.
  DOCUMENT_PROMOTION_CONFIRM: ['DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP', 'PROPERTY_SUMMARY'],
  // Both are generic property-record writers (capturePropertyFact /
  // HomeEventsService.createHomeEvent) that can capture a fact or event
  // about any part of the home, including an inventory item -- the exact
  // "still-visible inventory result can go stale after a related capture
  // confirms" gap the coverage audit named. PROPERTY_SUMMARY is the more
  // general sibling; INVENTORY_LOOKUP the specific one the audit called out.
  CAPTURE_FACT_CONFIRM: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  CAPTURE_EVENT_CONFIRM: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  // Pause/resume/cancel/reschedule all change the same BUYER_PLAN_STATUS/
  // BUYER_DEADLINES membership and counts a task update or completion does
  // (reschedule explicitly recalculates every unedited task's due date) --
  // shares BUYER_TASK_UPDATE/BUYER_TASK_COMPLETE's exact sibling set.
  BUYER_LIFECYCLE_UPDATE: ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES'],
  // Creating or updating the rate monitor changes what REFINANCE_ANALYSIS
  // (the refinance decision read a "set up a monitor" action is typically
  // launched from) shows about current monitoring state.
  REFINANCE_RATE_MONITOR: ['REFINANCE_ANALYSIS'],
  // Finishing the remaining XREC-001 backlog surfaced by the coverage audit
  // (docs/architecture/ASK_COZY_PHASE0_COVERAGE_AUDIT.md), same
  // reconcileAskExecutionSideEffects mechanism, same conservative-sibling
  // design as every entry above.
  //
  // The finding's own status/work-disposition is exactly what INSPECTION_FINDINGS's
  // list shows per row.
  INSPECTION_FINDING_UPDATE: ['INSPECTION_FINDINGS'],
  // The item's status is exactly what SELLER_PREP_CHECKLIST's list shows per row.
  SELLER_PREP_ITEM_DECISION: ['SELLER_PREP_CHECKLIST'],
  // The corrected date is shown on the inventory lists and the Property Summary inventory collection.
  INVENTORY_ITEM_CORRECT: ['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY'],
  // The corrected revision replaces the event row shown in the item-history and Property Summary timeline lists.
  HOME_EVENT_CORRECT: ['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY'],
  // Warranty rows are carried by PROPERTY_SUMMARY's property-warranties collection.
  WARRANTY_CORRECT: ['PROPERTY_SUMMARY'],
  // Room names appear in the Property Summary rooms collection and on inventory item rows.
  ROOM_RENAME: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  // A new room appears in the Property Summary rooms collection and can be chosen for inventory items.
  ROOM_CREATE: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  // A new item appears in the Property Summary inventory collection and the inventory lookup lists.
  INVENTORY_ITEM_CREATE: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  // Answering an area question changes the completeness rows and percentage the Property Summary shows.
  PROPERTY_CONTEXT_AREA_CAPTURE: ['PROPERTY_SUMMARY'],
  // Accepting/deferring/snoozing/completing an Operational Work item changes
  // its state in the HOME_ACTIONS feed that surfaces it -- confirmed by this
  // handler's own suggested follow-up ("What needs my attention next?").
  OPERATIONAL_WORK_UPDATE: ['HOME_ACTIONS'],
  // Creating a task changes the same BUYER_PLAN_STATUS/BUYER_DEADLINES
  // membership/counts BUYER_TASK_UPDATE/BUYER_TASK_COMPLETE already declare.
  BUYER_TASK_CREATE: ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES'],
  // BUYER_INSPECTION_REVIEW's own open-finding count is exactly what changes
  // when a finding's disposition is classified (confirmed by the coverage
  // audit's own read of that operation).
  BUYER_FINDING_DISPOSITION: ['BUYER_INSPECTION_REVIEW'],
  // Creating (or reusing) a workspace changes what QUOTE_COMPARISON_REVIEW
  // shows for this property.
  QUOTE_COMPARISON_CREATE: ['QUOTE_COMPARISON_REVIEW'],
  // All 7 HVAC decision-platform operations affect what HVAC_DECISION_CONTINUE
  // (the thread's own status/recommendation read) shows for that thread;
  // OUTCOME_REPORT/OUTCOME_UNLINK additionally affect HVAC_DECISION_OUTCOME_VIEW's
  // own outcome list directly. No entity-specific filtering beyond the shared
  // same-session/same-property scoping `refreshImpactedSiblingExecutions`
  // already does -- a homeowner with multiple open HVAC threads may see an
  // unrelated thread's still-visible card re-fetch using ITS OWN stored
  // parameters (harmless, same conservative design as every sibling above).
  HVAC_DECISION_START: ['HVAC_DECISION_CONTINUE'],
  HVAC_DECISION_SCENARIO: ['HVAC_DECISION_CONTINUE'],
  HVAC_DECISION_ABANDON: ['HVAC_DECISION_CONTINUE'],
  HVAC_DECISION_OUTCOME_REPORT: ['HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_CONTINUE'],
  HVAC_DECISION_OUTCOME_UNLINK: ['HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_CONTINUE'],
  // Saving/forgetting a preference already calls
  // decisionThreadService.markThreadsStaleByIds on every canonically
  // affected DecisionThread (a stronger, entity-precise mechanism than this
  // map provides) -- but that only marks the CANONICAL record stale; it does
  // not itself re-fetch an already-rendered Ask conversation card in the
  // same session, which is what this sibling declaration is for.
  HVAC_PREFERENCE_SAVE: ['HVAC_DECISION_CONTINUE'],
  HVAC_PREFERENCE_FORGET: ['HVAC_DECISION_CONTINUE'],
  // The MATERIAL_DEADLINE/insurance branch of confirmHomeDeadlineMonitor
  // creates or updates a real PropertyMaintenanceTask (confirmed by direct
  // read) -- MAINTENANCE_STATUS's own list is exactly what would show it.
  HOME_DEADLINE_MONITOR: ['MAINTENANCE_STATUS'],
  // Both are generic property-record writers, same reasoning as
  // CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM above.
  CAPTURE_WARRANTY_CONFIRM: ['PROPERTY_SUMMARY', 'INVENTORY_LOOKUP'],
  // Attaches a document to a canonical HomeEvent -- DOCUMENT_LOOKUP (the
  // document vault) is the direct sibling; PROPERTY_SUMMARY as the general
  // one, matching the other three CAPTURE_*_CONFIRM operations.
  CAPTURE_EVIDENCE_CONFIRM: ['DOCUMENT_LOOKUP', 'PROPERTY_SUMMARY'],
  // GUIDANCE_JOURNEY_CREATE and HOUSEHOLD_INVITATION have no still-visible
  // Ask read operation whose membership/status they plausibly affect (no
  // "list my guidance journeys" or "list household members" read exists) --
  // deliberately left out of this map. Their confirm handlers still call
  // reconcileAskExecutionSideEffects for the explicit sourceExecutionId
  // refresh (the one result a launched-from row-action would refresh), just
  // with zero declared siblings.
};

// Pure decision core, extracted for direct unit testing (same convention as
// mergeEvidence/isCapitalTimelineAnalysisStale/formatUnavailableHomeActionProducers):
// BUYER_MOVE_STATUS is only added when the specific task being mutated is
// itself a move task -- same taskType === 'MOVE' field buyerMoveStatusResult
// already filters on, not a new heuristic. Any other sibling map entry
// (added for other operations later) is unconditional.
export function siblingOperationIdsForBuyerTaskMutation(baseSiblings: readonly AskOperationId[], taskType: string | null | undefined): readonly AskOperationId[] {
  return taskType === 'MOVE' ? [...baseSiblings, 'BUYER_MOVE_STATUS'] : baseSiblings;
}

// BUYER_TASK_UPDATE and BUYER_TASK_COMPLETE both store the mutated task's id
// as parameters.buyerTaskId (confirmed by direct read of both propose-time
// functions) -- the move-task lookup below is keyed on that shared field
// name, not a per-operation branch, so any current or future buyer-task
// mutation using the same field automatically gets the same conditional
// sibling without needing its own case here.
async function impactedSiblingOperationIds(execution: AskExecution, parameters: Record<string, unknown>): Promise<readonly AskOperationId[]> {
  const declared = execution.operationId ? ASK_MUTATION_IMPACT_MAP[execution.operationId as AskOperationId] ?? [] : [];
  const taskId = parameters.buyerTaskId;
  if (typeof taskId !== 'string' || !execution.propertyId) return declared;
  const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId } }, select: { taskType: true } });
  return siblingOperationIdsForBuyerTaskMutation(declared, task?.taskType);
}

const ASK_SIBLING_REFRESH_ELIGIBLE_STATUSES: readonly AskExecutionStatus[] = ['ANSWERED', 'READY_WITH_LIMITATIONS', 'NOT_APPLICABLE', 'BLOCKED', 'NEEDS_ENTITY'];

// Pure, extracted for direct unit testing with an injected predicate rather
// than the real registry lookup. Defense in depth (never trust the impact
// map alone): a row whose operationId is a registered domain command is a
// mutation/proposal, not a read -- calling refreshAskExecutionAfterConflict
// on one would re-run its PROPOSE-time read, silently injecting a
// brand-new, unrequested confirmation proposal into the transcript rather
// than refreshing a read. Most-recent-per-operation only: an older,
// superseded row for the same operation (asked the same read question
// twice this session) isn't worth refreshing -- only the newest one is
// still what the homeowner would actually revisit.
export function selectSiblingRefreshTargets<T extends { operationId: string | null }>(
  candidates: readonly T[],
  isCommandOperation: (operationId: string) => boolean,
): T[] {
  const seenOperationIds = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.operationId || isCommandOperation(candidate.operationId)) return false;
    if (seenOperationIds.has(candidate.operationId)) return false;
    seenOperationIds.add(candidate.operationId);
    return true;
  });
}

async function refreshImpactedSiblingExecutions(
  userId: string,
  execution: AskExecution,
  parameters: Record<string, unknown>,
  excludeExecutionIds: ReadonlySet<string>,
): Promise<AskSourceRefreshOutcome> {
  if (!execution.propertyId) return { refreshedExecutions: [], attemptedAndFailed: false };
  const siblingOperationIds = await impactedSiblingOperationIds(execution, parameters);
  if (!siblingOperationIds.length) return { refreshedExecutions: [], attemptedAndFailed: false };
  const candidates = await prisma.askExecution.findMany({
    where: {
      userId, sessionId: execution.sessionId, propertyId: execution.propertyId,
      operationId: { in: [...siblingOperationIds] },
      status: { in: [...ASK_SIBLING_REFRESH_ELIGIBLE_STATUSES] },
      id: { notIn: [execution.id, ...excludeExecutionIds] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const targets = selectSiblingRefreshTargets(candidates, (operationId) => Boolean(getAskDomainCommandByOperation(operationId)));
  if (!targets.length) return { refreshedExecutions: [], attemptedAndFailed: false };
  // Promise.allSettled per explicit design decision: one sibling's refresh
  // failing must never prevent the others from refreshing.
  const outcomes = await Promise.allSettled(targets.map((target) => refreshAskExecutionAfterConflict(userId, target.id)));
  return {
    refreshedExecutions: outcomes.filter((outcome): outcome is PromiseFulfilledResult<AskExecutionResponse> => outcome.status === 'fulfilled').map((outcome) => outcome.value),
    attemptedAndFailed: outcomes.some((outcome) => outcome.status === 'rejected'),
  };
}

// Combines the explicit, frontend-supplied single-target refresh with the
// server-owned sibling-impact refresh, so both a confirm handler's first
// run AND confirmAskExecution's completed-replay branch (below) can call
// one function and get the full, current reconciliation behavior.
// AskExecutionResponseSchema's own childExecutions field is capped at 3
// (ask.contract.ts) -- the explicit sourceExecutionId refresh plus up to 3
// declared siblings (BUYER_MOVE_STATUS included) can together exceed that,
// which would fail response validation on an otherwise-successful mutation.
// The explicit source (the one list this row-action was actually launched
// from -- definitely still visible) always keeps its slot; sibling
// refreshes fill whatever budget remains, in the map's own declared order.
const ASK_RECONCILED_CHILD_EXECUTIONS_LIMIT = 3;

// Pure, extracted for direct unit testing -- a boundary bug here would be a
// silent regression (a successful mutation's response failing schema
// validation only on the specific combination that exceeds the cap).
export function capReconciledChildExecutions<T>(sourceExecutions: readonly T[], siblingExecutions: readonly T[]): T[] {
  const remainingBudget = Math.max(0, ASK_RECONCILED_CHILD_EXECUTIONS_LIMIT - sourceExecutions.length);
  return [...sourceExecutions, ...siblingExecutions.slice(0, remainingBudget)];
}

export async function reconcileAskExecutionSideEffects(userId: string, execution: AskExecution, parameters: Record<string, unknown>): Promise<AskSourceRefreshOutcome> {
  const sourceExecutionId = typeof parameters.sourceExecutionId === 'string' ? parameters.sourceExecutionId : null;
  const [sourceOutcome, siblingOutcome] = await Promise.all([
    refreshAskSourceExecution(userId, execution.id, parameters),
    refreshImpactedSiblingExecutions(userId, execution, parameters, new Set(sourceExecutionId ? [sourceExecutionId] : [])),
  ]);
  return {
    refreshedExecutions: capReconciledChildExecutions(sourceOutcome.refreshedExecutions, siblingOutcome.refreshedExecutions),
    attemptedAndFailed: sourceOutcome.attemptedAndFailed || siblingOutcome.attemptedAndFailed,
  };
}
