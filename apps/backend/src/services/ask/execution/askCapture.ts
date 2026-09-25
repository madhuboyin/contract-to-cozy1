// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { getCaptureDefinitionForFact } from '../../../modules/propertyContext/catalog/captureRegistry';
import { PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import { HouseholdRole, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPresentationBlock, type RecordAskCaptureEvent, type SubmitAskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { askInlineCapturesTotal } from '../../../lib/metrics';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { ASK_OPERATION_DEFINITIONS, resolveAskOperation, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { operationalUnavailableResult, registerCapabilityHandler, skillRuntimeUnavailableReason } from '../capabilityHandlerRegistry';
import { assertCoverageConflictFree } from '../../coverageConflict.service';
import { captureFeatureContext } from '../../../modules/propertyContext/application/captureFeatureContext';
import { capturePropertyFact } from '../../../modules/propertyContext/application/capturePropertyFact';
import { PropertyContextAccessDeniedError } from '../../../modules/propertyContext/application/getPropertyContext';
import { buildUserAddedEventConfirmation, editCaptureEventCandidate, editCaptureFactCandidate, editCaptureWarrantyCandidate, EVENT_ADD_CAPTURE_KEY } from '../conversationalUnderstanding/conversationalCapture';
import { buildAskNextActionsBlock, NEXT_ACTION_CONTEXT_PREFIX, NEXT_ACTION_FACT_QUESTIONS, NEXT_ACTION_MISSING_FACT_CAPTURE_KEY, nextActionContextOperation } from '../askNextActions';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { getProfile, upsertProfile } from '../../financing.service';
import { radarNotificationPreferenceService } from '../../../modules/homeEventRadar/services/radarNotificationPreference.service';
import { updateInsurancePolicy } from '../../home-management.service';
import { areaCapturePrompt, areaCaptureStateFrom, areaCaptureSubmitResult } from '../handlers/propertySummary.handler';
import { AREA_CAPTURE_MESSAGES, areaCaptureFallbackHref, asInputJson, ensurePropertyAccess, enterAskPropertyTimezoneContext, expireIfSkillBindingChanged, HouseholdInvitationInputSchema, InventoryCreateInputSchema, MaintenanceCompletionWorkflowInputSchema, MaintenanceTaskWorkflowInputSchema, mapPersistedExecution, preservedExecutionHistory, propertySummary, RadarTaskAnswerSchema, RadarTaskTargetSchema, RoomCreateInputSchema, terminalStatus } from '../askHandlerSupport';
import { householdInvitationResult, householdWorkflowVersion, ROOM_CREATE_CAPTURE_KEY, roomCreateContextVersion, roomCreateResult } from '../handlers/homeRecordWrites.handler';
import { INVENTORY_CREATE_CAPTURE_KEY, inventoryCreateContextVersion, inventoryItemCreateResult } from '../handlers/inventory.handler';
import { claimFileResult, ClaimFileWorkflowInputSchema } from '../handlers/claims.handler';
import { RADAR_PREFERENCES_CAPTURE_KEY, RADAR_TASK_CAPTURE_KEY, radarCaptureError, radarPreferencesBodyFromAnswer, radarPreferencesContextVersion, radarPreferencesFormResult, radarTaskContextVersion, radarTaskFormResult } from '../handlers/homeEventRadar.handler';
import { executeOperation } from '../execution/executeOperation';
import { maintenanceTaskCompleteResult, maintenanceTaskCreateResult, maintenanceTaskVersion, maintenanceWorkflowVersion } from '../handlers/maintenance.handler';
import { getSkillForOperation } from '../../skills/skillRegistry';
import { ASK_OPERATION_CAPABILITY } from '../../intelligence/capabilitySkillGuidanceBridge.registry';
import { homeDeadlineMonitorResult } from '../handlers/miscHandlers.handler';

const RefinanceProfileCaptureSchema = z.object({
  currentMortgageBalanceUsd: z.number().min(1_000).max(100_000_000),
  interestRatePct: z.number().positive().max(30),
  remainingTermYears: z.number().positive().max(50),
  monthlyPaymentUsd: z.number().positive().max(1_000_000).optional(),
}).strict();

const HomeDeadlineExpirationCaptureSchema = z.object({
  policyId: z.string().trim().min(1).max(160),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const expiry = new Date(`${value.expiryDate}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== value.expiryDate || expiry <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: 'Enter a valid future expiration date.' });
  }
});

const HomeDeadlineTaskDueCaptureSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict().superRefine((value, context) => {
  const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate || due <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid future due date.' });
  }
});

// Capture missing context through canonical validation and receipts, then
// refresh the recommendation from the updated property record.
async function submitNextActionMissingFactCapture(
  userId: string,
  execution: NonNullable<Awaited<ReturnType<typeof prisma.askExecution.findFirst>>>,
  input: SubmitAskCaptureRequest,
): Promise<AskExecutionResponse> {
  const propertyId = execution.propertyId!;
  const registryCapture = input.captureKey.startsWith(NEXT_ACTION_CONTEXT_PREFIX);
  if (!registryCapture && execution.contextVersion !== input.expectedContextVersion) {
    const error = new Error('This property record changed since this prompt was shown. Ask again to see the current state.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { schemaVersion?: unknown; blocks?: unknown[]; captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }>; confirmation?: unknown; clarification?: unknown; suggestions?: unknown[]; skillHandoff?: unknown }
    : {};
  const captureIdempotencyKey = 'ask-next:' + createHash('sha256').update(JSON.stringify([execution.id, input.captureKey, input.idempotencyKey])).digest('hex');
  const previous = registryCapture ? await prisma.propertyContextCaptureReceipt.findUnique({
    where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey: captureIdempotencyKey } },
  }) : null;
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active && !previous) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const answer = input.answer as { factKey?: unknown; value?: unknown };
  const factKey = registryCapture ? input.captureKey.slice(NEXT_ACTION_CONTEXT_PREFIX.length) : typeof answer.factKey === 'string' ? answer.factKey : null;
  if (!factKey || (!registryCapture && !(factKey in NEXT_ACTION_FACT_QUESTIONS))) {
    const error = new Error('This fact is no longer eligible for this quick capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'SUBMITTED' });
  let capture: { contextVersion: string };
  const definition = factKey ? getCaptureDefinitionForFact(factKey) : undefined;
  if (definition && definition.sensitivity !== 'STANDARD' && !input.sensitiveDataConfirmed) {
    throw Object.assign(new Error('Confirm that you want to save this sensitive home information.'), { code: 'ASK_CAPTURE_CONFIRMATION_REQUIRED' });
  }
  try {
    if (registryCapture) {
      if (!definition) throw new Error('No registered capture exists for this fact.');
      const result = await captureFeatureContext(propertyId, userId, {
        featureKey: 'ASK_NEXT_ACTION', operationKey: nextActionContextOperation(factKey),
        captureKey: definition.captureKey, requirementId: input.requirementId,
        expectedContextVersion: input.expectedContextVersion,
        idempotencyKey: captureIdempotencyKey, answer: input.answer,
      });
      if (!result || typeof result !== 'object' || Array.isArray(result) || !('contextVersion' in result) || typeof result.contextVersion !== 'string') {
        throw new Error('Canonical capture returned an invalid receipt.');
      }
      capture = { contextVersion: result.contextVersion };
      if (!active && previous) return mapPersistedExecution(execution, await propertySummary(propertyId));
    } else capture = await capturePropertyFact(propertyId, userId, factKey, {
      value: answer.value,
      sourceType: 'USER_REPORTED',
      attribution: 'FIRSTHAND',
      captureChannel: 'ASK_NEXT_ACTION',
      captureExecutionId: execution.id,
    });
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) {
      throw Object.assign(new Error('You do not have permission to update this property record.'), { code: 'ASK_PERMISSION_REQUIRED' });
    }
    throw error;
  }
  // A refresh failure must not resurrect stale readiness after a durable save.
  let refreshedBlocks = (stored.blocks ?? []).filter((block) => !(block && typeof block === 'object' && (block as { id?: unknown }).id === 'ask-next-actions'));
  let refreshedCaptureRequests = (stored.captureRequests ?? []).filter((request) => request.requirementId !== input.requirementId);
  try {
    if (execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS) {
      const recent = await prisma.askExecution.findMany({
        where: { sessionId: execution.sessionId, userId, id: { not: execution.id }, status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { operationId: true },
      });
      const recentCompletedCapabilityIds = new Set(
        recent
          .map((item) => (item.operationId ? ASK_OPERATION_CAPABILITY[item.operationId as AskOperationId] : undefined))
          .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
      );
      const launchContextRaw = execution.launchContextJson && typeof execution.launchContextJson === 'object' && !Array.isArray(execution.launchContextJson)
        ? execution.launchContextJson as { actionId?: unknown; journeyId?: unknown; entityType?: unknown; entityId?: unknown }
        : null;
      const nextActions = await buildAskNextActionsBlock({
        propertyId,
        userId,
        operationId: execution.operationId as AskOperationId,
        message: execution.message,
        recentCompletedCapabilityIds,
        launchContext: launchContextRaw ? {
          actionId: typeof launchContextRaw.actionId === 'string' ? launchContextRaw.actionId : null,
          journeyId: typeof launchContextRaw.journeyId === 'string' ? launchContextRaw.journeyId : null,
          entityType: typeof launchContextRaw.entityType === 'string' ? launchContextRaw.entityType : null,
          entityId: typeof launchContextRaw.entityId === 'string' ? launchContextRaw.entityId : null,
        } : null,
        contextVersion: capture.contextVersion,
      });
      refreshedBlocks = (stored.blocks ?? []).filter((block) => !(block && typeof block === 'object' && (block as { type?: unknown; id?: unknown }).type === 'CAPABILITY_LIST' && (block as { type?: unknown; id?: unknown }).id === 'ask-next-actions'));
      if (nextActions.block) refreshedBlocks.push(nextActions.block);
      // nextActions.captureRequests is at most one (buildAskNextActionsBlock's
      // own bound) -- refreshedCaptureRequests is otherwise already empty at
      // this point (the one requirement this function handles is always
      // filtered above), so this never risks exceeding the shared 3-item cap.
      refreshedCaptureRequests = [...refreshedCaptureRequests, ...nextActions.captureRequests.filter((request) => !(answer.value === null && request.requirementId === input.requirementId))];
    }
  } catch (error) {
    logger.warn({ error, executionId: execution.id }, '[submitNextActionMissingFactCapture] next-actions recompute failed; removed stale recommendations');
  }
  const saved = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      contextVersion: capture.contextVersion,
      resultJson: asInputJson({
        schemaVersion: stored.schemaVersion ?? ASK_RESPONSE_SCHEMA_VERSION,
        blocks: refreshedBlocks,
        // The fulfilled requirement is removed rather than kept around
        // answered -- this captureRequest is a one-shot prompt, not a
        // form the homeowner can revisit, matching allowNotSure's own
        // "dismiss, don't re-ask" framing on the frontend.
        captureRequests: refreshedCaptureRequests,
        confirmation: stored.confirmation ?? null,
        clarification: stored.clarification ?? null,
        suggestions: stored.suggestions ?? [],
        skillHandoff: stored.skillHandoff ?? null,
        ...preservedExecutionHistory(execution.resultJson, refreshedBlocks as AskPresentationBlock[]),
      }),
    },
  });
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureKey: input.captureKey, factKey, canonicalOwner: 'PropertyContext' }) },
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
  return mapPersistedExecution(saved, await propertySummary(propertyId));
}

export async function submitAskCapture(userId: string, executionId: string, input: SubmitAskCaptureRequest): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await ensurePropertyAccess(userId, execution.propertyId);
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  // External review, 2026-09-13 (FRD §27's "tell me about X" requirement --
  // see askNextActions.ts's own header comment on NEXT_ACTION_FACT_QUESTIONS).
  // Handled entirely separately from the operationId-keyed dispatch below:
  // this captureRequest is attached to an execution's next-actions block,
  // for a DIFFERENT, not-yet-run capability than whatever operation was
  // actually routed this turn -- none of the "recompute THIS SAME operation
  // with newly-captured context" machinery every branch below performs
  // applies here (the routed answer already given stays exactly as given).
  // Bypasses that dispatch's own operationId allowlist entirely, since a
  // next-actions prompt can attach to ANY routed operation's turn, not just
  // the capture-capable subset that allowlist exists for.
  if (input.captureKey === NEXT_ACTION_MISSING_FACT_CAPTURE_KEY || input.captureKey.startsWith(NEXT_ACTION_CONTEXT_PREFIX)) {
    return submitNextActionMissingFactCapture(userId, execution, input);
  }
  const registeredOperationId = execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS
    ? execution.operationId as AskOperationId
    : null;
  if (registeredOperationId) {
    const controls = readAskOperationalControls();
    const unavailableReason = skillRuntimeUnavailableReason(registeredOperationId, controls);
    if (unavailableReason) {
      const unavailable = operationalUnavailableResult(unavailableReason);
      const saved = await prisma.askExecution.update({
        where: { id: execution.id },
        data: {
          status: unavailable.status,
          reasonCode: unavailable.reasonCode,
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: unavailable.blocks,
            captureRequests: [],
            confirmation: null,
            clarification: null,
            suggestions: unavailable.suggestions,
            ...preservedExecutionHistory(execution.resultJson, unavailable.blocks),
          }),
          completedAt: new Date(),
        },
      });
      const skill = getSkillForOperation(registeredOperationId);
      await prisma.askExecutionEvent.create({
        data: { executionId, eventType: unavailableReason, metadataJson: asInputJson({ skillId: skill?.id ?? null, stage: 'CAPTURE_SUBMISSION' }) },
      });
      return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
    }
  }
  const answerHash = createHash('sha256').update(JSON.stringify({ captureKey: input.captureKey, answer: input.answer, sensitiveDataConfirmed: input.sensitiveDataConfirmed ?? false })).digest('hex');
  const previousCapture = await prisma.askCaptureReceipt.findUnique({
    where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
  });
  if (previousCapture) {
    if (previousCapture.answerHash !== answerHash) {
      const error = new Error('The idempotency key was already used for a different inline answer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    // Code review finding (2026-09-13, [P1]): capture-edit operations
    // (CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM/CAPTURE_WARRANTY_CONFIRM)
    // are never routable via resolveAskOperation -- they are only ever
    // created programmatically by conversationalCapture.ts, never proposed
    // from a raw homeowner message. Replaying through resolveAskOperation +
    // executeOperation below would reroute the candidate's own
    // sourceSentence (stored as execution.message, e.g. "My home was built
    // in 1998.") through the full deterministic/semantic router as if it
    // were a brand-new incoming Ask message, silently overwriting the
    // already-persisted, correctly-edited confirmation card with an
    // unrelated result. This branch exists purely for idempotent replay of
    // an already-successful submission -- the execution row already
    // reflects that success, so return it directly instead of re-executing
    // anything.
    // The Home Event Radar forms (FRD v1.41) are the same: their canned message is only honored with its declared
    // launchContext, which a replay does not have, so re-executing would replace the review card with a boundary.
    if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM' || execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES') {
      askInlineCapturesTotal.inc({ operation: execution.operationId, outcome: 'RESUMED' });
      return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
    }
    const operation = resolveAskOperation(execution.message);
    const replayed = await executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation });
    const resumed = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: replayed.status,
        reasonCode: replayed.reasonCode,
        contextVersion: replayed.contextVersion ?? previousCapture.contextVersion,
        parametersJson: replayed.parameters ? asInputJson(replayed.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: replayed.blocks, captureRequests: replayed.captureRequests ?? [], confirmation: replayed.confirmation ?? null, clarification: replayed.clarification ?? null, suggestions: replayed.suggestions, skillHandoff: replayed.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, replayed.blocks) }),
        completedAt: terminalStatus(replayed.status) ? new Date() : null,
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId: execution.id, eventType: 'CAPTURE_RESUME_RETRIED', metadataJson: asInputJson({ captureKey: input.captureKey, resumedStatus: replayed.status }) } });
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
    if (replayed.captureRequests?.some((request) => request.captureKey === input.captureKey)) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
    if (replayed.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, replayed.captureRequests.length);
    return mapPersistedExecution(resumed, await propertySummary(execution.propertyId));
  }
  if (!['REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS', 'HOUSEHOLD_INVITATION', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE', 'ROOM_CREATE', 'INVENTORY_ITEM_CREATE', 'HOME_EVENT_RADAR_TASK', 'HOME_EVENT_RADAR_PREFERENCES', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'CLAIM_FILE', 'HOME_DEADLINE_MONITOR', 'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'SAVINGS_OPPORTUNITIES', 'SELL_HOLD_RENT_ANALYSIS', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP', 'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'COVERAGE_GAPS', 'CAPTURE_FACT_CONFIRM', 'CAPTURE_EVENT_CONFIRM', 'CAPTURE_WARRANTY_CONFIRM'].includes(execution.operationId ?? '')) {
    const error = new Error('This execution does not have an active inline capture.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) {
    const error = new Error('This capture requirement is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
    throw error;
  }
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'SUBMITTED' });

  let captureId: string;
  let capturedContextVersion: string;
  let result: AskOperationResult;
  let canonicalOwner: string;
  if (execution.operationId === 'CAPITAL_RESERVE_PLAN' || execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS') {
    const tax = execution.operationId === 'PROPERTY_TAX_APPEAL_READINESS';
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown> : {};
    const capitalTimeline = !tax && parameters.phase5CaptureFeature === 'CAPITAL_TIMELINE';
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: tax ? 'TAX_APPEAL' : capitalTimeline ? 'CAPITAL_TIMELINE' : 'RESERVE_FUND',
      operationKey: tax ? 'RUN_ANALYSIS' : capitalTimeline ? 'RUN_TIMELINE' : 'RECALCULATE',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({ userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'SAVINGS_OPPORTUNITIES') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_SAVINGS',
      operationKey: 'RUN_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'OWNERSHIP_COSTS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'OWNERSHIP_COSTS',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'INVENTORY_LOOKUP') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'PROPERTY_SUMMARY') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'PROPERTY_RECORD_SUMMARY',
      operationKey: 'VIEW_SUMMARY',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'HOME_ACTIONS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'HOME_ACTIONS',
      operationKey: 'VIEW_FEED',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'COVERAGE_GAPS') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    if (typeof parameters.inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this coverage capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'COVERAGE_INTELLIGENCE',
      operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: parameters.inventoryItemId,
        responsibilityScope: parameters.responsibilityScope,
        hasDisclosedEstimate: parameters.hasDisclosedEstimate,
      },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'SELL_HOLD_RENT_ANALYSIS') {
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'SELL_HOLD_RENT',
      operationKey: 'VIEW_ANALYSIS',
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'MAINTENANCE_TASK_COMPLETE') {
    if (input.captureKey !== 'MAINTENANCE_COMPLETION_INPUTS') {
      const error = new Error('This maintenance completion capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceCompletionWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Select an open task and enter a valid actual cost and outcome.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await maintenanceTaskCompleteResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'MAINTENANCE_TASK_CREATE') {
    if (input.captureKey !== 'MAINTENANCE_TASK_INPUTS') {
      const error = new Error('This maintenance task capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed record and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a task name and valid priority, schedule, recurrence, and estimate.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await maintenanceTaskCreateResult(
      userId,
      execution.propertyId,
      execution.message,
      candidate.data,
      typeof parameters.sourceExecutionId === 'string' ? parameters.sourceExecutionId : null,
    );
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'PropertyMaintenanceTaskWorkflow';
  } else if (execution.operationId === 'ROOM_CREATE') {
    if (input.captureKey !== ROOM_CREATE_CAPTURE_KEY) {
      const error = new Error('This room capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add a room.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = roomCreateContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('This form is out of date. Start again from the Add a room button.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RoomCreateInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Choose a room type and enter a name of up to 80 characters; a floor level, if given, must be a whole number from -5 to 50.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await roomCreateResult(userId, execution.propertyId, candidate.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'InventoryRoom';
  } else if (execution.operationId === 'HOME_EVENT_RADAR_TASK' || execution.operationId === 'HOME_EVENT_RADAR_PREFERENCES') {
    const isTask = execution.operationId === 'HOME_EVENT_RADAR_TASK';
    if (input.captureKey !== (isTask ? RADAR_TASK_CAPTURE_KEY : RADAR_PREFERENCES_CAPTURE_KEY)) {
      throw radarCaptureError('This Home Event Radar form is no longer active.', 'ASK_CAPTURE_NOT_ACTIVE');
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      throw radarCaptureError(isTask ? 'A contributor or owner is required to plan radar actions.' : 'A contributor or owner is required to change radar notification settings in Ask.', 'ASK_PERMISSION_REQUIRED');
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const sourceExecutionId = typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null;
    if (isTask) {
      const target = RadarTaskTargetSchema.safeParse(storedParameters.radarTaskTarget);
      if (!target.success) throw radarCaptureError('This Home Event Radar form is no longer active.', 'ASK_CAPTURE_NOT_ACTIVE');
      const currentVersion = radarTaskContextVersion(target.data);
      if (currentVersion !== input.expectedContextVersion) throw radarCaptureError('This form is out of date. Start again from "Plan this action".', 'ASK_CONTEXT_VERSION_CONFLICT');
      const answer = RadarTaskAnswerSchema.safeParse(input.answer);
      if (!answer.success) throw radarCaptureError('Choose what to do; a due date must be a date and a due time a 24-hour HH:mm time.');
      result = await radarTaskFormResult(userId, execution.propertyId, target.data, answer.data, sourceExecutionId);
      capturedContextVersion = currentVersion;
      canonicalOwner = 'PropertyRadarTaskLink';
    } else {
      const currentVersion = radarPreferencesContextVersion(await radarNotificationPreferenceService.get(execution.propertyId, userId));
      if (currentVersion !== input.expectedContextVersion) throw radarCaptureError('Your notification settings changed while this form was open. Start again from "Notification settings".', 'ASK_CONTEXT_VERSION_CONFLICT');
      result = await radarPreferencesFormResult(userId, execution.propertyId, radarPreferencesBodyFromAnswer(input.answer), sourceExecutionId);
      capturedContextVersion = currentVersion;
      canonicalOwner = 'PropertyRadarNotificationPreference';
    }
    captureId = input.idempotencyKey;
  } else if (execution.operationId === 'INVENTORY_ITEM_CREATE') {
    if (input.captureKey !== INVENTORY_CREATE_CAPTURE_KEY) {
      const error = new Error('This inventory capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add an inventory item.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await inventoryCreateContextVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('The rooms in this home changed while the form was open. Start again from the Add an item button.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = InventoryCreateInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a name of up to 120 characters and choose a category and a room (or "No room"); brand and model, if given, are up to 80 characters.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    result = await inventoryItemCreateResult(userId, execution.propertyId, candidate.data, typeof storedParameters.sourceExecutionId === 'string' ? storedParameters.sourceExecutionId : null);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'InventoryItem';
  } else if (execution.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE') {
    const state = areaCaptureStateFrom(execution.parametersJson);
    if (!state) {
      const error = new Error('This home-detail capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    result = await areaCaptureSubmitResult(userId, execution.propertyId, state.scope, new Set(state.skipFactKeys), state.sourceExecutionId, {
      requirementId: input.requirementId, captureKey: input.captureKey, answer: input.answer,
      expectedContextVersion: input.expectedContextVersion, sensitiveDataConfirmed: input.sensitiveDataConfirmed === true,
    });
    captureId = input.idempotencyKey;
    capturedContextVersion = input.expectedContextVersion;
    canonicalOwner = 'PropertyContext';
  } else if (execution.operationId === 'CLAIM_FILE') {
    // P03 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
    // resumes claimFileResult with the structured answer from CLAIM_FILE_INPUTS
    // instead of re-parsing the original message. No live "workflow version"
    // exists to check for drift here (unlike Maintenance's task list) --
    // nothing about the property invalidates a not-yet-created draft claim --
    // so expectedContextVersion is just the same requirementId the capture
    // request was issued with; the generic `active` check above already
    // confirms it matches.
    if (input.captureKey !== 'CLAIM_FILE_INPUTS') {
      const error = new Error('This claim capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to file a claim.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const candidate = ClaimFileWorkflowInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Choose an incident type and describe what happened.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await claimFileResult(execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = input.expectedContextVersion;
    canonicalOwner = 'Claim';
  } else if (execution.operationId === 'HOUSEHOLD_INVITATION') {
    if (input.captureKey !== 'HOUSEHOLD_INVITATION_INPUTS') {
      const error = new Error('This household invitation capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role !== HouseholdRole.OWNER) {
      const error = new Error('Only a household owner can prepare an invitation.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const currentVersion = await householdWorkflowVersion(execution.propertyId);
    if (currentVersion !== input.expectedContextVersion) {
      const error = new Error('Household access changed while this invitation was open. Review the current household and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = HouseholdInvitationInputSchema.safeParse(input.answer);
    if (!candidate.success) {
      const error = new Error('Enter a valid email address and choose Contributor or Viewer.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = await householdInvitationResult(userId, execution.propertyId, execution.message, candidate.data);
    captureId = input.idempotencyKey;
    capturedContextVersion = currentVersion;
    canonicalOwner = 'HouseholdInviteWorkflow';
  } else if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM') {
    // Ask Cozy Stage 3, Phase 3 edit-before-confirm (FRD §22's own line:
    // "candidate payload is editable via the existing captureRequests/
    // suppliedInput mechanism before the confirm call, not a separate edit
    // endpoint"). Never writes to any domain model -- only rebuilds this
    // execution's own pending NEEDS_CONFIRMATION card with the edited
    // value(s); an actual confirm is still required afterward.
    const editCaptureKey = execution.operationId === 'CAPTURE_FACT_CONFIRM'
      ? 'CAPTURE_FACT_EDIT'
      : execution.operationId === 'CAPTURE_EVENT_CONFIRM'
        ? 'CAPTURE_EVENT_EDIT'
        : 'CAPTURE_WARRANTY_EDIT';
    // A user-added event resubmits its own form (CAPTURE_EVENT_ADD); every other pending entry edits through its
    // per-category edit key.
    const isEventAdd = execution.operationId === 'CAPTURE_EVENT_CONFIRM' && input.captureKey === EVENT_ADD_CAPTURE_KEY;
    if (!isEventAdd && input.captureKey !== editCaptureKey) {
      const error = new Error('This pending entry can no longer be edited.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const storedContextVersion = execution.contextVersion ?? 'unversioned';
    if (storedContextVersion !== input.expectedContextVersion) {
      const error = new Error('This pending entry changed since the form was opened. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    if (isEventAdd) {
      const built = buildUserAddedEventConfirmation(execution.parametersJson, storedContextVersion, input.answer, new Date());
      if ('error' in built) {
        const error = new Error(built.error);
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      result = built.result;
      captureId = input.idempotencyKey;
      capturedContextVersion = storedContextVersion;
      canonicalOwner = 'AskCaptureCandidateEdit';
    } else {
    const edited = execution.operationId === 'CAPTURE_FACT_CONFIRM'
      ? editCaptureFactCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date())
      : execution.operationId === 'CAPTURE_EVENT_CONFIRM'
        ? editCaptureEventCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date())
        : editCaptureWarrantyCandidate(execution.parametersJson, execution.message, storedContextVersion, input.answer, new Date());
    if (!edited) {
      const error = new Error('Enter a valid value for this field.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    result = edited;
    captureId = input.idempotencyKey;
    capturedContextVersion = storedContextVersion;
    canonicalOwner = 'AskCaptureCandidateEdit';
    }
  } else if (execution.operationId === 'HOME_DEADLINE_MONITOR') {
    const access = await ensurePropertyAccess(userId, execution.propertyId);
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to update reminder dates.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    if (input.captureKey === 'HOME_DEADLINE_MAINTENANCE_DUE_DATE') {
      const currentVersion = await maintenanceWorkflowVersion(execution.propertyId);
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Maintenance tasks changed while this form was open. Review the refreshed task and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineTaskDueCaptureSchema.safeParse(input.answer);
      const task = candidate.success ? await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId, status: { not: MaintenanceTaskStatus.CANCELLED } } }) : null;
      if (!candidate.success || !task) {
        const error = new Error('Choose an open maintenance task and enter a valid future due date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      const updated = await PropertyMaintenanceTaskService.updateTask(userId, task.id, { nextDueDate: candidate.data.nextDueDate });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = maintenanceTaskVersion(updated);
      canonicalOwner = 'PropertyMaintenanceTask';
    } else if (input.captureKey === 'HOME_DEADLINE_EXPIRATION_DATE') {
      const policiesMissingExpiry = await prisma.insurancePolicy.findMany({
        where: { propertyId: execution.propertyId, expiryDate: null },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, carrierName: true, coverageType: true, updatedAt: true },
      });
      const currentVersion = createHash('sha256').update(JSON.stringify(policiesMissingExpiry)).digest('hex');
      if (currentVersion !== input.expectedContextVersion) {
        const error = new Error('Coverage records changed while this form was open. Review the refreshed choices and try again.');
        (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
        throw error;
      }
      const candidate = HomeDeadlineExpirationCaptureSchema.safeParse(input.answer);
      if (!candidate.success || !policiesMissingExpiry.some((policy) => policy.id === candidate.data?.policyId)) {
        const error = new Error('Choose an undated policy and enter a valid future expiration date.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
        throw error;
      }
      await assertCoverageConflictFree(execution.propertyId, prisma, {
        insurancePolicyId: candidate.data.policyId,
      });
      const property = await prisma.property.findUnique({ where: { id: execution.propertyId }, select: { homeownerProfileId: true } });
      if (!property) {
        const error = new Error('The selected home is no longer available.');
        (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
        throw error;
      }
      await updateInsurancePolicy(candidate.data.policyId, property.homeownerProfileId, {
        expiryDate: new Date(`${candidate.data.expiryDate}T00:00:00.000Z`),
      });
      result = await homeDeadlineMonitorResult(userId, execution.propertyId, execution.message);
      captureId = input.idempotencyKey;
      capturedContextVersion = result.contextVersion ?? createHash('sha256').update(`${candidate.data.policyId}:${candidate.data.expiryDate}`).digest('hex');
      canonicalOwner = 'InsurancePolicy';
    } else {
      const error = new Error('This deadline capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
  } else if (execution.operationId === 'REPLACEMENT_GUIDANCE') {
    const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
      ? execution.parametersJson as Record<string, unknown>
      : {};
    const inventoryItemId = parameters.inventoryItemId;
    if (typeof inventoryItemId !== 'string') {
      const error = new Error('The inventory item for this capture is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    const capture = await captureFeatureContext(execution.propertyId, userId, {
      ...input,
      featureKey: 'REPAIR_REPLACE',
      operationKey: 'RUN_ANALYSIS',
      operationInput: { inventoryItemId },
    });
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)
      || !('captureId' in capture) || typeof capture.captureId !== 'string'
      || !('contextVersion' in capture) || typeof capture.contextVersion !== 'string') {
      throw new Error('Property context capture did not return a valid receipt.');
    }
    captureId = capture.captureId;
    capturedContextVersion = capture.contextVersion;
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'InventoryItem';
  } else {
    if (input.captureKey !== 'FINANCING_PROFILE_REFINANCE_INPUTS') {
      const error = new Error('This financing capture is no longer active.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    if (input.sensitiveDataConfirmed !== true) {
      const error = new Error('Confirm the mortgage details before saving them to the Financing Profile.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_CONFIRMATION_REQUIRED';
      throw error;
    }
    const [currentContext, profile] = await Promise.all([
      getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR'),
      getProfile(execution.propertyId),
    ]);
    if (currentContext.contextVersion !== input.expectedContextVersion) {
      const error = new Error('The financing profile changed while this answer was open. Review the refreshed values and try again.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const candidate = RefinanceProfileCaptureSchema.safeParse({
      currentMortgageBalanceUsd: input.answer.currentMortgageBalanceUsd ?? (profile?.currentMortgageBalanceCents == null ? undefined : profile.currentMortgageBalanceCents / 100),
      interestRatePct: input.answer.interestRatePct ?? (profile?.interestRateBps == null ? undefined : profile.interestRateBps / 100),
      remainingTermYears: input.answer.remainingTermYears ?? (profile?.remainingTermMonths == null ? undefined : profile.remainingTermMonths / 12),
      monthlyPaymentUsd: input.answer.monthlyPaymentUsd ?? (profile?.monthlyPaymentCents == null ? undefined : profile.monthlyPaymentCents / 100),
    });
    if (!candidate.success) {
      const error = new Error('Enter a valid balance, current rate, and remaining term.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_VALIDATION_ERROR';
      throw error;
    }
    // Claim the idempotency receipt BEFORE the write, not after: previously
    // this branch called upsertProfile unconditionally and only recorded a
    // receipt afterward (a no-op upsert), so two concurrent submissions
    // (double-click, two tabs) could both pass the version check above and
    // both write, racing to a silent last-write-wins outcome. The unique
    // (executionId, idempotencyKey) create below is the same
    // claim-before-mutate compare-and-swap already used for command
    // confirmations (AskConfirmationReceipt) elsewhere in this file.
    let alreadyCaptured = false;
    try {
      await prisma.askCaptureReceipt.create({
        data: { executionId: execution.id, idempotencyKey: input.idempotencyKey, captureKey: input.captureKey, canonicalOwner: 'PropertyFinancingProfile', answerHash },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await prisma.askCaptureReceipt.findUnique({
        where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      });
      if (!existing || existing.answerHash !== answerHash) {
        const conflict = new Error('The idempotency key was already used for a different inline answer.');
        (conflict as Error & { code?: string }).code = 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      // A concurrent request already claimed this exact answer and wrote
      // it (or is about to); skip the duplicate write and fall through to
      // recomputing the result from the now-current profile.
      alreadyCaptured = true;
    }
    if (!alreadyCaptured) {
      await upsertProfile(execution.propertyId, {
        currentMortgageBalanceCents: Math.round(candidate.data.currentMortgageBalanceUsd * 100),
        mortgageBalanceAsOfDate: input.answer.currentMortgageBalanceUsd === undefined ? undefined : new Date().toISOString(),
        interestRateBps: Math.round(candidate.data.interestRatePct * 100),
        remainingTermMonths: Math.max(1, Math.round(candidate.data.remainingTermYears * 12)),
        monthlyPaymentCents: candidate.data.monthlyPaymentUsd === undefined ? undefined : Math.round(candidate.data.monthlyPaymentUsd * 100),
      });
    }
    const nextContext = await getFinancialContextDecisions(execution.propertyId, userId, 'REFINANCE_RADAR');
    captureId = input.idempotencyKey;
    capturedContextVersion = nextContext.contextVersion;
    if (!alreadyCaptured) {
      await prisma.askCaptureReceipt.update({
        where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
        data: { contextVersion: capturedContextVersion },
      });
    }
    const operation = resolveAskOperation(execution.message);
    result = await executeOperation({
      userId, sessionId: execution.sessionId, executionId: execution.id, message: execution.message, propertyId: execution.propertyId, operation,
    });
    canonicalOwner = 'PropertyFinancingProfile';
  }
  // Code review finding (2026-09-13, [P1]): this used to be an unconditional
  // update keyed only on `id` -- if a concurrent request changed this
  // execution's status between the read at the top of this function and
  // this write (most concretely: confirmAskExecution claiming it into
  // RUNNING, or completing it, while this same request was still off
  // computing an edited result), this write would silently clobber that
  // newer state back to whatever `result.status` says (typically
  // NEEDS_CONFIRMATION again, with this attempt's own now-stale
  // parameters) -- resurrecting an already-confirmed-and-executed capture
  // into a fresh "pending confirmation" state with mismatched data. Guarded
  // exactly like the analogous races already fixed elsewhere in this file
  // (confirmAskExecution's own conflict-release and claim transitions): a
  // compare-and-swap against `execution.status` as read at the top of this
  // function, not an unconditional update. If the guard doesn't match,
  // something else already moved this execution past the status this
  // request expected -- fail closed rather than overwrite it.
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.askExecution.updateMany({
      where: { id: execution.id, status: execution.status },
      data: {
        status: result.status,
        reasonCode: result.reasonCode,
        contextVersion: result.contextVersion ?? capturedContextVersion,
        parametersJson: result.parameters ? asInputJson(result.parameters) : execution.parametersJson ?? undefined,
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: result.captureRequests ?? [], confirmation: result.confirmation ?? null, clarification: result.clarification ?? null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }),
        completedAt: terminalStatus(result.status) ? new Date() : null,
      },
    });
    if (updated.count !== 1) {
      const error = new Error('This changed while your edit was being saved -- it may already be confirming or completed. Ask again to review the current state.');
      (error as Error & { code?: string }).code = 'ASK_CAPTURE_NOT_ACTIVE';
      throw error;
    }
    await tx.askCaptureReceipt.upsert({
      where: { executionId_idempotencyKey: { executionId: execution.id, idempotencyKey: input.idempotencyKey } },
      create: {
        executionId: execution.id,
        idempotencyKey: input.idempotencyKey,
        captureKey: input.captureKey,
        canonicalOwner,
        answerHash,
        contextVersion: result.contextVersion ?? capturedContextVersion,
      },
      update: { contextVersion: result.contextVersion ?? capturedContextVersion },
    });
    await tx.askExecutionEvent.create({
      data: { executionId: execution.id, eventType: 'CONTEXT_CAPTURED', metadataJson: asInputJson({ captureId, captureKey: input.captureKey, canonicalOwner, resumedStatus: result.status }) },
    });
    return tx.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'RESUMED' });
  if (result.captureRequests?.some((request) => request.captureKey === input.captureKey)) {
    askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'REPEATED_PROMPT' });
  }
  if (result.captureRequests?.length) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: 'PROMPTED' }, result.captureRequests.length);
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}

export async function recordAskCaptureEvent(userId: string, executionId: string, input: RecordAskCaptureEvent): Promise<void> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { id: true, operationId: true, resultJson: true } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { captureRequests?: Array<{ requirementId?: unknown; captureKey?: unknown }> }
    : {};
  const active = stored.captureRequests?.some((request) => request.requirementId === input.requirementId && request.captureKey === input.captureKey);
  if (!active) return;
  await prisma.askExecutionEvent.create({
    data: { executionId, eventType: `CAPTURE_${input.event}`, metadataJson: asInputJson({ requirementId: input.requirementId, captureKey: input.captureKey }) },
  });
  askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome: input.event });
}

export async function recordAskCaptureFailure(executionId: string, outcome: 'CONFLICT' | 'PERMISSION_DENIED' | 'RESUME_FAILED'): Promise<void> {
  const execution = await prisma.askExecution.findUnique({ where: { id: executionId }, select: { operationId: true } });
  if (execution) askInlineCapturesTotal.inc({ operation: execution.operationId ?? 'UNKNOWN', outcome });
}

const areaScopeForMessage = (message: string): PropertyAreaCaptureScope | null =>
  PROPERTY_AREA_CAPTURE_SCOPES.find((scope) => AREA_CAPTURE_MESSAGES[scope] === message) ?? null;

registerCapabilityHandler('property-context.area-capture', async (envelope) => {
  const launch = envelope.launchContext;
  const scope = areaScopeForMessage(envelope.message);
  const entityMatches = !launch?.entityType || launch.entityType !== 'PROPERTY_CONTEXT_AREA' || launch.entityId === scope;
  const declaredStart = launch?.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE' && launch.surface !== 'ASK_REFRESH' && scope !== null && entityMatches;
  const notRoutable = (): AskOperationResult => ({
    status: 'NOT_APPLICABLE', reasonCode: 'ASK_AREA_CAPTURE_NOT_DIRECTLY_ROUTABLE',
    blocks: [{ type: 'SUMMARY', id: 'area-capture-not-routable', title: 'Use "Fill in missing details" on the home record', body: 'Missing home details are filled in from the completeness list in your home summary. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
    suggestions: ['How complete is my home record?'],
  });
  if (declaredStart && scope) {
    const access = await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
    if (access.role === HouseholdRole.VIEWER) {
      return {
        status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
        blocks: [{ type: 'SUMMARY', id: 'area-capture-permission', title: 'A contributor or owner can add home details', body: 'Your role can view the home record but not change it. Nothing has changed.', tone: 'CAUTION', actions: [{ id: 'open-property-record', label: 'Open property record', href: areaCaptureFallbackHref(envelope.propertyId!, scope), style: 'SECONDARY' }] }],
        suggestions: [],
      };
    }
    // "Continue" from a receipt carries that workflow's skips; a start from any other result begins with none.
    let skip = new Set<string>();
    const sourceId = launch.sourceExecutionId ?? null;
    if (sourceId) {
      const source = await prisma.askExecution.findFirst({ where: { id: sourceId, userId: envelope.userId, propertyId: envelope.propertyId!, operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE' }, select: { parametersJson: true } });
      const inherited = source ? areaCaptureStateFrom(source.parametersJson) : null;
      if (inherited && inherited.scope === scope) skip = new Set(inherited.skipFactKeys);
    }
    return areaCapturePrompt(envelope.userId, envelope.propertyId!, scope, skip, sourceId);
  }
  // A refresh of this execution re-asks with ITS OWN stored skips (never reset, never client-supplied); anything else is not routable.
  if (launch?.surface === 'ASK_REFRESH') {
    const own = await prisma.askExecution.findFirst({ where: { id: envelope.executionId, userId: envelope.userId }, select: { parametersJson: true } });
    const state = own ? areaCaptureStateFrom(own.parametersJson) : null;
    if (state) return areaCapturePrompt(envelope.userId, envelope.propertyId!, state.scope, new Set(state.skipFactKeys), state.sourceExecutionId);
  }
  return notRoutable();
});
