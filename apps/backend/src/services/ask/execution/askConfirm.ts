// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type AskPresentationBlock, type EditAskConfirmation, type SubmitAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { composeSkillContext } from '../../skills/context/skillContextComposer';
import { evaluateAskAudienceApplicability, getAskAudiencePolicy } from '../askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { operationalUnavailableResult, skillRuntimeUnavailableReason } from '../capabilityHandlerRegistry';
import { confirmCapabilityInvoke } from '../confirmCapabilityHandlerRegistry';
import { asInputJson, assertSkillResultBlocksAllowed, audienceApplicabilityResult, ensurePropertyAccess, enterAskPropertyTimezoneContext, expireIfSkillBindingChanged, journeyContextFrom, mapPersistedExecution, preservedExecutionHistory, propertySummary, recordAskAnswerTrustMetrics, terminalStatus } from '../askHandlerSupport';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { getAskDomainCommandByOperation } from '../askDomainCommandRegistry';
import { getSkillForOperation } from '../../skills/skillRegistry';
import { validateSkillExecutionBinding } from '../../skills/skillExecutionBinding';
import { validateAskConfirmedCompletion } from '../askAnswerTrustValidator';
import { INTERACTIVE_ASK_STATUSES } from '../execution/askSessions';
import { editInspectionFindingResolveConfirmation } from '../handlers/workflowConfirm.handler';
import { editHomeEventCorrectConfirmation, editHomeEventVisibilityConfirmation, editInventoryItemCorrectConfirmation, editRoomRenameConfirmation, editWarrantyCorrectConfirmation } from '../handlers/recordConfirm.handler';
import { editBuyerTaskUpdateConfirmation } from '../handlers/buyerConfirm.handler';
import { editMaintenanceTaskUpdateConfirmation } from '../handlers/maintenanceConfirm.handler';
import { editHomeEventRadarFeedbackConfirmation } from '../handlers/radarConfirm.handler';

export async function confirmAskExecution(userId: string, executionId: string, input: SubmitAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  await enterAskPropertyTimezoneContext(execution.propertyId);
  const bindingExpiry = await expireIfSkillBindingChanged(execution);
  if (bindingExpiry) return bindingExpiry;
  const registeredOperationId = execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS
    ? execution.operationId as AskOperationId
    : null;
  const controls = readAskOperationalControls();
  const skill = registeredOperationId ? getSkillForOperation(registeredOperationId) : undefined;
  const skillUnavailableReason = registeredOperationId ? skillRuntimeUnavailableReason(registeredOperationId, controls) : null;
  if (skillUnavailableReason && execution.status !== 'COMPLETED') {
    const unavailable = operationalUnavailableResult(skillUnavailableReason);
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
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: skillUnavailableReason, metadataJson: asInputJson({ skillId: skill?.id ?? null }) },
    });
    return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  }
  const validatedBinding = execution.skillBindingJson
    ? validateSkillExecutionBinding(execution.skillBindingJson)
    : null;
  const pinnedBinding = validatedBinding?.valid ? validatedBinding.binding : null;
  const inputHash = createHash('sha256').update(JSON.stringify({
    confirmationVersion: input.confirmationVersion,
    consentConfirmed: input.consentConfirmed,
    skillBinding: execution.skillBindingJson,
    operationId: execution.operationId,
    operationVersion: execution.operationVersion,
    propertyId: execution.propertyId,
    contextVersion: execution.contextVersion,
    actionParameters: execution.parametersJson,
  })).digest('hex');
  const previous = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
  if (previous) {
    if (previous.inputHash !== inputHash) {
      const error = new Error('Another confirmation already claimed this execution.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    if (previous.status === 'COMPLETED') {
      // B04 design: a retried confirm after a lost response used to return
      // bare, with no childExecutions -- meaning a client that never saw the
      // original success response also never received the reconciled
      // sibling refreshes, even though the mutation itself (protected by
      // this same idempotency receipt) genuinely already succeeded. This
      // must never replay the mutation -- it only reruns the safe,
      // read-only reconciliation step and redelivers its result inline.
      const replayParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
        ? execution.parametersJson as Record<string, unknown>
        : {};
      const { refreshedExecutions } = await reconcileAskExecutionSideEffects(userId, execution, replayParameters);
      return mapPersistedExecution(execution, await propertySummary(execution.propertyId), refreshedExecutions);
    }
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  const recoveringClaim = previous?.status === 'CLAIMED' && execution.status === 'RUNNING';
  if (!command || (execution.status !== 'NEEDS_CONFIRMATION' && !recoveringClaim)) {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  if (skill && registeredOperationId && !recoveringClaim) {
    const audienceContext = await composeSkillContext({
      skill,
      operationId: registeredOperationId,
      userId,
      propertyId: execution.propertyId,
    }, { providerEnabled: controls.contextProviderEnabled });
    const policy = getAskAudiencePolicy(registeredOperationId, getAskOperationDefinition(registeredOperationId).version);
    const decision = policy ? evaluateAskAudienceApplicability({
      policy,
      accountRole: 'HOMEOWNER',
      householdRole: access.role,
      operatingMode: controls.audiencePolicyEnabled
        ? journeyContextFrom(audienceContext)?.operatingMode ?? 'UNKNOWN'
        : 'UNKNOWN',
      purpose: 'EXECUTION',
    }) : null;
    if (!decision?.allowed) {
      const inapplicable = decision
        ? audienceApplicabilityResult(
          decision,
          controls.audiencePolicyEnabled ? execution.propertyId : null,
          access.role,
        )
        : operationalUnavailableResult('ASK_SKILL_POLICY_MISMATCH');
      const saved = await prisma.askExecution.update({
        where: { id: execution.id },
        data: {
          status: inapplicable.status,
          reasonCode: inapplicable.reasonCode,
          parametersJson: inapplicable.parameters ? asInputJson(inapplicable.parameters) : execution.parametersJson ?? undefined,
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: inapplicable.blocks,
            captureRequests: [], confirmation: null, clarification: null,
            suggestions: inapplicable.suggestions,
            ...preservedExecutionHistory(execution.resultJson, inapplicable.blocks),
          }),
          completedAt: terminalStatus(inapplicable.status) ? new Date() : null,
        },
      });
      await prisma.askExecutionEvent.create({
        data: {
          executionId,
          eventType: inapplicable.reasonCode ?? 'ASK_AUDIENCE_INAPPLICABLE',
          metadataJson: asInputJson({
            stage: 'CONFIRMATION_RECHECK',
            audiencePolicyVersion: decision?.policyVersion ?? null,
            audienceApplicabilityOutcome: decision?.outcome ?? null,
            operatingMode: decision?.operatingMode ?? null,
          }),
        },
      });
      return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
    }
  }
  const roleRank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  if (roleRank[access.role] < roleRank[command.roleFloor]) {
    const error = new Error(`${command.roleFloor.toLowerCase()} access is required for this command.`);
    (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  const expectedVersion = parameters.confirmationVersion;
  const expiresAt = typeof parameters.confirmationExpiresAt === 'string' ? new Date(parameters.confirmationExpiresAt) : null;
  // Once a command has been durably claimed, confirmation expiry must not
  // incorrectly assert that no action occurred. Recovery replays only the
  // already-confirmed input through domain idempotency controls.
  if ((!expiresAt || expiresAt <= new Date()) && !recoveringClaim) {
    const expired = await prisma.askExecution.update({
      where: { id: execution.id },
      data: {
        status: 'EXPIRED', reasonCode: 'ASK_CONFIRMATION_EXPIRED', completedAt: new Date(),
        resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-expired', title: 'Confirmation expired', status: 'EXPIRED', description: 'No action was performed. Ask again to review current home records and settings.', details: [], actions: [] }], captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'], ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-expired', title: 'Confirmation expired', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]) }),
      },
    });
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'EXPIRED', metadataJson: asInputJson({ reason: 'CONFIRMATION_EXPIRED' }) } });
    return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
  }
  if (expectedVersion !== input.confirmationVersion) {
    const error = new Error('This confirmation version is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  if (previous) {
    const recovered = await prisma.askConfirmationReceipt.updateMany({
      where: { executionId, status: 'CLAIMED', leaseExpiresAt: { lte: new Date() } },
      data: {
        idempotencyKey: input.idempotencyKey,
        inputHash,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (recovered.count !== 1) {
      const error = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw error;
    }
    await prisma.askExecutionEvent.create({
      data: { executionId, eventType: 'CONFIRMATION_RECOVERY_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
    });
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        // External review finding: expectedVersion above was compared
        // against `execution`, a snapshot read at the very top of this
        // function -- a concurrent edit (editAskConfirmation) could commit
        // a version bump between that read and this claim without ever
        // being detected, since the claim itself only checked `status`.
        // The claim would then succeed and the domain write would run
        // against the STALE, already-edited-away `parameters` captured
        // earlier -- confirming input the homeowner never actually
        // reviewed (CONF-003). Re-checking the version here, atomically
        // with the claim, closes that window: a concurrent edit now makes
        // this claim fail exactly like an already-inactive confirmation.
        const claimed = await tx.askExecution.updateMany({
          where: { id: execution.id, userId, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
          data: { status: 'RUNNING', reasonCode: 'ASK_CONFIRMATION_CLAIMED', completedAt: null },
        });
        if (claimed.count !== 1) {
          const error = new Error('This confirmation is no longer active.');
          (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
          throw error;
        }
        await tx.askConfirmationReceipt.create({
          data: {
            executionId,
            idempotencyKey: input.idempotencyKey,
            confirmationVersion: input.confirmationVersion,
            skillId: pinnedBinding?.skill.id ?? null,
            skillVersion: pinnedBinding?.skill.version ?? null,
            operationId: execution.operationId,
            operationVersion: execution.operationVersion,
            effectivePolicyVersion: pinnedBinding?.effectivePolicyVersion ?? null,
            contextVersion: execution.contextVersion,
            propertyId: execution.propertyId,
            inputHash,
            status: 'CLAIMED',
            leaseExpiresAt: new Date(Date.now() + 60_000),
          },
        });
        await tx.askExecutionEvent.create({
          data: { executionId, eventType: 'CONFIRMATION_CLAIMED', metadataJson: asInputJson({ confirmationVersion: input.confirmationVersion }) },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const winner = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
      if (!winner || winner.inputHash !== inputHash) {
        const conflict = new Error('Another confirmation already claimed this execution.');
        (conflict as Error & { code?: string }).code = 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT';
        throw conflict;
      }
      if (winner.status === 'COMPLETED') {
        const completed = await prisma.askExecution.findFirstOrThrow({ where: { id: executionId, userId } });
        return mapPersistedExecution(completed, await propertySummary(execution.propertyId));
      }
      const inProgress = new Error('This action is already being completed. Ask will reconcile the durable result shortly.');
      (inProgress as Error & { code?: string }).code = 'ASK_CONFIRMATION_IN_PROGRESS';
      throw inProgress;
    }
  }
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD MAINT-005/A12: populated only when a
  // confirm handler explicitly refreshed another still-visible execution
  // this mutation affected (see ConfirmCapabilityResult.refreshedExecutions).
  let refreshedExecutions: AskExecutionResponse[] = [];
  try {
  {
    const confirmed = await confirmCapabilityInvoke(execution.operationId as AskOperationId, {
      execution: execution as typeof execution & { propertyId: string },
      userId, parameters, access, command,
    });
    result = confirmed.result; artifactType = confirmed.artifactType; artifactId = confirmed.artifactId;
    refreshedExecutions = confirmed.refreshedExecutions ?? [];
  }
  } catch (error) {
    // The claim above (RUNNING + CLAIMED receipt) already committed before
    // this per-operation validation ran. Without this, any freshness/
    // validation failure here (e.g. ASK_CONTEXT_VERSION_CONFLICT) left the
    // execution stuck at RUNNING forever: expirePendingInteraction() is a
    // no-op for RUNNING, cancelAskExecution() never acts on a command that
    // may already be running, and a retry after the lease expires just re-reads
    // the same stale parametersJson and fails identically, indefinitely.
    // Release the claim and land on the same "ask again" terminal state
    // already used for confirmation expiry, so the homeowner has an actual
    // way forward instead of a permanently wedged execution.
    const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    const description = error instanceof Error && error.message
      ? error.message
      : 'This could not be completed because the underlying record changed. No action was performed.';
    // Code review finding (2026-09-12): this used to be an unconditional
    // tx.askExecution.update(...) -- if a CONCURRENT confirm attempt for
    // this same execution.id (a lease-reclaim retry, per the "Timeout /
    // stale lease" pattern above, which does not verify the original
    // actually crashed before reclaiming) already committed successfully
    // between this attempt's own claim and this catch block running, that
    // unconditional update would clobber the winner's terminal COMPLETED
    // state back to EXPIRED. Guarded to only touch the execution while it is
    // still RUNNING -- exactly what the claim transaction above set it to,
    // and the only state a losing/conflicting attempt should ever be
    // allowed to overwrite. If the guard doesn't match, a concurrent winner
    // already moved this execution past RUNNING; re-read and return its
    // actual current state instead of fabricating an EXPIRED one.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.askExecution.updateMany({
        where: { id: execution.id, status: 'RUNNING' },
        data: {
          status: 'EXPIRED', reasonCode: errorCode ?? 'ASK_CONFIRMATION_CONFLICT', completedAt: new Date(),
          resultJson: asInputJson({
            schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
            blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-conflict', title: 'This changed before it could be confirmed', status: 'EXPIRED', description, details: [], actions: [] }],
            captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
            // External review's specific example: the conflict handling
            // correctly blocks the stale write, but was replacing resultJson
            // wholesale, discarding the original response and continuation
            // identity the homeowner had already been looking at.
            ...preservedExecutionHistory(execution.resultJson, [{ type: 'WORKFLOW_PROGRESS', id: 'confirmation-conflict', title: 'This changed before it could be confirmed', status: 'EXPIRED', description: 'No action was performed.', details: [], actions: [] }]),
          }),
        },
      });
      if (updated.count !== 1) return;
      await tx.askConfirmationReceipt.updateMany({
        where: { executionId, status: 'CLAIMED' },
        data: { status: 'FAILED', lastErrorCode: errorCode ?? 'ASK_CONFIRMATION_CONFLICT' },
      });
      await tx.askExecutionEvent.create({
        data: { executionId, eventType: 'CONFIRMATION_CONFLICT_RELEASED', metadataJson: asInputJson({ errorCode: errorCode ?? null }) },
      });
    });
    const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
    return mapPersistedExecution(current, await propertySummary(execution.propertyId));
  }
  let saved: typeof execution;
  const confirmedOperationId = execution.operationId as AskOperationId;
  const confirmedValidation = validateAskConfirmedCompletion({
    question: execution.message,
    operationId: confirmedOperationId,
    propertyId: execution.propertyId,
    householdRole: access.role,
    result,
  });
  result = confirmedValidation.result;
  recordAskAnswerTrustMetrics(confirmedOperationId, confirmedValidation);
  assertSkillResultBlocksAllowed(confirmedOperationId, result);
  try {
    saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.askExecution.update({
        where: { id: execution.id },
        data: { status: result.status, reasonCode: result.reasonCode, contextVersion: result.contextVersion, parametersJson: result.parameters ? asInputJson(result.parameters) : undefined, resultJson: asInputJson({ schemaVersion: ASK_RESPONSE_SCHEMA_VERSION, blocks: result.blocks, captureRequests: [], confirmation: null, clarification: null, suggestions: result.suggestions, skillHandoff: result.skillHandoff ?? null, ...preservedExecutionHistory(execution.resultJson, result.blocks) }), completedAt: new Date() },
      });
      await tx.askConfirmationReceipt.update({
        where: { executionId },
        data: { status: 'COMPLETED', artifactType, artifactId, completedAt: new Date(), lastErrorCode: null },
      });
      // Code review finding (2026-09-12): captureLinkReconciliation.ts's
      // ASK_CAPTURE_LINK_RECONCILE worker consumer existed with no
      // production emitter anywhere -- a linked pair's completion could
      // never actually trigger reconciliation through confirmation, only
      // through a test calling reconcileCaptureLink(executionId) directly.
      // Emit it here, generically, for ANY confirmation-required operation
      // that completes with a linkedExecutionId set (not capture-specific),
      // so the mechanism is actually reachable once a producer sets that
      // field. Idempotency-keyed per execution so a retried completion
      // (the P2002 recovery path below) never queues a duplicate; the
      // consumer itself is also idempotent (guarded by warrantyId: null).
      if (execution.linkedExecutionId) {
        const reconcileIdempotencyKey = `ask-capture-link-reconcile:${execution.id}`;
        await tx.domainEvent.upsert({
          where: { idempotencyKey: reconcileIdempotencyKey },
          create: {
            type: 'ASK_CAPTURE_LINK_RECONCILE',
            status: 'PENDING',
            propertyId: execution.propertyId,
            userId,
            idempotencyKey: reconcileIdempotencyKey,
            payload: { executionId: execution.id },
          },
          update: {},
        });
      }
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'CONFIRMED', metadataJson: asInputJson({ artifactType, artifactId }) } });
      await tx.askExecutionEvent.create({ data: { executionId, eventType: 'ANSWER_TRUST_VALIDATED', metadataJson: asInputJson({ ...confirmedValidation.trust, semantic: null, repaired: confirmedValidation.repaired, stage: 'CONFIRMATION_COMPLETION' }) } });
      return updated;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const duplicate = await prisma.askConfirmationReceipt.findUnique({ where: { executionId } });
    if (!duplicate || duplicate.idempotencyKey !== input.idempotencyKey || duplicate.inputHash !== inputHash) throw error;
    const completed = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
    if (!completed) throw error;
    saved = completed;
  }
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId), refreshedExecutions);
}

export async function editAskConfirmation(userId: string, executionId: string, input: EditAskConfirmation): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution || !execution.propertyId) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  const access = await ensurePropertyAccess(userId, execution.propertyId);
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  if (!command || execution.status !== 'NEEDS_CONFIRMATION') {
    const error = new Error('This confirmation is no longer active.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const roleRank = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 } as const;
  if (roleRank[access.role] < roleRank[command.roleFloor]) {
    const error = new Error(`${command.roleFloor.toLowerCase()} access is required for this command.`);
    (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
    throw error;
  }
  const parameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as Record<string, unknown>
    : {};
  if (parameters.confirmationVersion !== input.confirmationVersion) {
    const error = new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  // B04 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
  // dispatch is a lookup table (EDIT_CONFIRMATION_HANDLERS, defined below),
  // not an if/else operationId chain -- matches the platform-wide
  // registerCapabilityHandler/registerConfirmCapabilityHandler dispatch
  // convention, and keeps confirmCapabilityHandlerRegistry.test.js's "no
  // operationId branching for write dispatch" governance test (Test G)
  // honest for the edit path too, not just confirmAskExecution's own
  // dispatch (its byte-range scan happens to include this whole function).
  const editHandler = EDIT_CONFIRMATION_HANDLERS[execution.operationId as AskOperationId];
  if (!editHandler) {
    const error = new Error('Editing is not available for this action yet.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  return editHandler(execution, parameters, input, userId);
}

const EDIT_CONFIRMATION_HANDLERS: Partial<Record<AskOperationId, (
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
  userId: string,
) => Promise<AskExecutionResponse>>> = {
  MAINTENANCE_TASK_UPDATE: editMaintenanceTaskUpdateConfirmation,
  INVENTORY_ITEM_CORRECT: editInventoryItemCorrectConfirmation,
  HOME_EVENT_CORRECT: editHomeEventCorrectConfirmation,
  HOME_EVENT_VISIBILITY: editHomeEventVisibilityConfirmation,
  HOME_EVENT_RADAR_FEEDBACK: editHomeEventRadarFeedbackConfirmation,
  INSPECTION_FINDING_UPDATE: editInspectionFindingResolveConfirmation,
  WARRANTY_CORRECT: editWarrantyCorrectConfirmation,
  ROOM_RENAME: editRoomRenameConfirmation,
  BUYER_TASK_UPDATE: editBuyerTaskUpdateConfirmation,
};

export async function cancelAskExecution(userId: string, executionId: string): Promise<AskExecutionResponse> {
  const execution = await prisma.askExecution.findFirst({ where: { id: executionId, userId } });
  if (!execution) {
    const error = new Error('Ask execution not found.');
    (error as Error & { code?: string }).code = 'ASK_EXECUTION_NOT_FOUND';
    throw error;
  }
  if (execution.propertyId) await ensurePropertyAccess(userId, execution.propertyId);
  await prisma.askSession.update({ where: { id: execution.sessionId }, data: { lastActiveAt: new Date() } });
  if (execution.status !== 'NEEDS_CONFIRMATION') {
    if (!INTERACTIVE_ASK_STATUSES.includes(execution.status)) return mapPersistedExecution(execution, await propertySummary(execution.propertyId));
    const cancelled = await prisma.askExecution.updateMany({
      where: { id: execution.id, userId, status: execution.status },
      data: {
        status: 'CANCELLED', reasonCode: 'USER_DISMISSED_PENDING_REQUEST',
        resultJson: asInputJson({
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks: [{
            type: 'SUMMARY', id: 'pending-request-dismissed', title: 'Pending request dismissed',
            body: 'No action was performed. You can ask the question again whenever you are ready.', tone: 'DEFAULT', actions: [],
          }],
          captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask a new question'],
          ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'pending-request-dismissed', title: 'Pending request dismissed', body: 'No action was performed.', tone: 'DEFAULT', actions: [] }]),
        }),
        completedAt: new Date(),
      },
    });
    if (cancelled.count !== 1) {
      const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
      return mapPersistedExecution(current, await propertySummary(current.propertyId));
    }
    await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED', metadataJson: asInputJson({ reason: 'USER_DISMISSED_PENDING_REQUEST', previousStatus: execution.status }) } });
    const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
    return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
  }
  const command = getAskDomainCommandByOperation(execution.operationId ?? '');
  if (!command || !command.supportsCancelBeforeExecution) {
    const error = new Error('This execution does not have an active cancellable command.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'confirmation-cancelled',
    title: command.cancellation.title,
    body: command.cancellation.body,
    tone: 'DEFAULT', actions: [],
  }];
  const cancelled = await prisma.askExecution.updateMany({
    where: { id: execution.id, userId, status: 'NEEDS_CONFIRMATION' },
    data: {
      status: 'CANCELLED', reasonCode: 'USER_CANCELLED',
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks,
        captureRequests: [],
        confirmation: null,
        clarification: null,
        suggestions: [command.cancellation.suggestion],
        ...preservedExecutionHistory(execution.resultJson, blocks),
      }),
      completedAt: new Date(),
    },
  });
  if (cancelled.count !== 1) {
    const current = await prisma.askExecution.findFirstOrThrow({ where: { id: execution.id, userId } });
    return mapPersistedExecution(current, await propertySummary(current.propertyId));
  }
  await prisma.askExecutionEvent.create({ data: { executionId, eventType: 'CANCELLED' } });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}
