// Ask handler support: executionState. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { ASK_RESPONSE_SCHEMA_VERSION, AskExecutionResponseSchema, type AskExecutionResponse, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { AskExecution, AskExecutionStatus, Prisma } from '@prisma/client';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { prisma } from '../../../lib/prisma';
import { getSkillForOperation } from '../../skills/skillRegistry';
import { validateSkillExecutionBinding } from '../../skills/skillExecutionBinding';
import { getSkillLineageMetadata } from '../../skills/skillLineageRegistry';
import { requiredAskTargetEntity } from '../askEntityResolution';
import { captureFallbackHref } from './capture';
import { propertySummary } from './propertyContext';

// ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005/FRESH-001: an explicit
// representation of "what the homeowner is currently looking at," separate
// from any single conversational turn. `resultId` is minted once (the
// first time a distinct query for this result is asked) and carried
// forward unchanged across every filter-chip click and refresh of that
// SAME interactive result -- it is NOT the executionId, which is a new row
// per turn. Stored inside the execution's own parametersJson (no new
// table); looked up by launchContext.sourceExecutionId, which a declared
// filter chip already carries per round 9's fix. Deliberately generic
// (not Maintenance-only) in shape, matching `viewState`'s own schema
// comment in ask.contract.ts -- renamed from MaintenanceViewState/
// loadMaintenanceViewState as part of B02's Buyer Deadlines phase-filter
// fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md),
// its second real consumer, same convention as B04's
// refreshMaintenanceSourceExecution -> refreshAskSourceExecution rename.
export interface AskViewState {
  resultId: string;
  // The raw matched phrase behind each still-applied dimension (e.g.
  // "hvac", "this month") -- not the derived boolean/label -- so it can be
  // re-fed into the same regex-based parsing a fresh query already uses,
  // rather than requiring a second, parallel parsing path. Maintenance-only
  // concept; other consumers (e.g. Buyer Deadlines) leave these null.
  domainScopePhrase: string | null;
  dateScopePhrase: string | null;
  // External review [P2]: room scope was derived fresh every turn from
  // the raw task list + message text, but never stored here -- so unlike
  // domain/date, it was silently dropped by any status-chip continuation
  // (missing from a plain object, `undefined` behaves like a stored row
  // predating this field -- both correctly drop out of the merge below).
  // Maintenance-only; other consumers omit it.
  roomScopePhrase?: string | null;
  // Not narrowed to Maintenance's own 4 values -- a generic identifier for
  // whatever filter/scope dimension a given operation's own chips select
  // (Maintenance: 'ALL_OPEN'/'OVERDUE'/'DUE_SOON'/'URGENT'; Buyer
  // Deadlines: a BuyerClosingHomeLaneKey or 'ALL').
  statusFilter: string;
  selectedTaskId: string | null;
  // The last effective collection query, retained so paging never has to
  // reconstruct scope/status intent from a display label or UI message.
  queryMessage?: string | null;
  // Per-section server windows. Optional for older executions and other
  // consumers of this otherwise generic view-state shape.
  collectionOffsets?: Record<string, number>;
  revision: number;
}

export const MAX_RESULT_ITEMS = 50;

export function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED'].includes(status);
}

// ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: the ONE shared history-
// preservation policy for every write that replaces an execution's
// resultJson -- success, failure, expiry, conflict, cancellation and
// recovery alike. External review finding: a prior, narrower version of
// this only ran on 4 of this file's 24 resultJson write sites (confirm
// success, edit, refresh, creation); every expiry/conflict/cancellation
// path silently dropped both the original snapshot and continuation
// identity. It also mislabeled a fresh error/expiry/conflict blocks
// payload as "the original response" whenever a row had no formal
// snapshot yet -- fixed here: when no valid originalResponse exists but
// the row DID hold some previously stored answer (a row predating this
// policy, or from a write site not yet covered), that previous answer
// becomes the original, never this write's own blocks.
export function preservedExecutionHistory(existingResultJson: unknown, freshBlocks: AskPresentationBlock[]): {
  originalResponse: { blocks: AskPresentationBlock[]; observedAt: string };
  continuesExecutionId: string | null;
} {
  const existing = existingResultJson && typeof existingResultJson === 'object' && !Array.isArray(existingResultJson)
    ? existingResultJson as { originalResponse?: unknown; blocks?: unknown; continuesExecutionId?: unknown }
    : null;
  const continuesExecutionId = typeof existing?.continuesExecutionId === 'string' ? existing.continuesExecutionId : null;
  const validExisting = existing?.originalResponse && typeof existing.originalResponse === 'object' && !Array.isArray(existing.originalResponse)
    && Array.isArray((existing.originalResponse as { blocks?: unknown }).blocks)
    && typeof (existing.originalResponse as { observedAt?: unknown }).observedAt === 'string'
    ? existing.originalResponse as { blocks: AskPresentationBlock[]; observedAt: string }
    : null;
  if (validExisting) return { originalResponse: validExisting, continuesExecutionId };
  if (Array.isArray(existing?.blocks) && existing.blocks.length > 0) {
    return { originalResponse: { blocks: existing.blocks as AskPresentationBlock[], observedAt: new Date().toISOString() }, continuesExecutionId };
  }
  return { originalResponse: { blocks: freshBlocks, observedAt: new Date().toISOString() }, continuesExecutionId };
}

export function mapPersistedExecution(execution: {
  id: string; sessionId: string; message: string; status: AskExecutionStatus; reasonCode?: string | null; propertyId: string | null; operationId: string | null;
  operationVersion: string | null; intentFamily: string | null; contextVersion: string | null; resultJson: Prisma.JsonValue | null;
  parametersJson?: Prisma.JsonValue | null;
  skillId?: string | null; skillVersion?: string | null; skillDomain?: string | null;
  createdAt: Date; updatedAt: Date;
}, property: { id: string; label: string } | null, childExecutions: AskExecutionResponse[] = []): AskExecutionResponse {
  const operationId = execution.operationId && execution.operationId in ASK_OPERATION_DEFINITIONS
    ? execution.operationId as AskOperationId
    : null;
  const currentSkill = operationId ? getSkillForOperation(operationId) : undefined;
  const historicalSkill = execution.skillId && execution.skillVersion
    ? getSkillLineageMetadata(execution.skillId, execution.skillVersion)
    : undefined;
  const skill = execution.skillId && execution.skillVersion && execution.skillDomain
    ? { id: execution.skillId, version: execution.skillVersion, domain: execution.skillDomain }
    : execution.skillId && execution.skillVersion
      ? { id: execution.skillId, version: execution.skillVersion, domain: historicalSkill?.domain ?? 'UNKNOWN' }
    : currentSkill
      ? { id: currentSkill.id, version: currentSkill.version, domain: currentSkill.domain }
      : null;
  const stored = execution.resultJson && typeof execution.resultJson === 'object' && !Array.isArray(execution.resultJson)
    ? execution.resultJson as { schemaVersion?: unknown; blocks?: unknown; captureRequests?: unknown; confirmation?: unknown; clarification?: unknown; suggestions?: unknown; skillHandoff?: unknown; continuesExecutionId?: unknown; originalResponse?: unknown }
    : {};
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005: viewState lives in
  // parametersJson (stamped by maintenanceResult), not resultJson.
  const storedParameters = execution.parametersJson && typeof execution.parametersJson === 'object' && !Array.isArray(execution.parametersJson)
    ? execution.parametersJson as { viewState?: unknown }
    : null;
  const rawViewState = storedParameters?.viewState;
  const viewState = rawViewState && typeof rawViewState === 'object' && !Array.isArray(rawViewState) && typeof (rawViewState as { resultId?: unknown }).resultId === 'string'
    ? rawViewState as AskViewState
    : null;
  const storedSchemaVersion = typeof stored.schemaVersion === 'string' ? stored.schemaVersion : ASK_RESPONSE_SCHEMA_VERSION;
  const operationDefinition = operationId ? getAskOperationDefinition(operationId) : null;
  const successfulAnswer = ['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(execution.status);
  const correctionCapabilities = {
    intent: successfulAnswer,
    entity: successfulAnswer && Boolean(operationId && requiredAskTargetEntity(operationId)),
    homeRecord: successfulAnswer
      && Boolean(execution.propertyId && operationDefinition?.requiresProperty)
      && !['COMMAND', 'CAPABILITY_DISCOVERY', 'GENERAL_HOME_GUIDANCE', 'OUT_OF_SCOPE', 'UNSAFE_OR_RESTRICTED'].includes(operationDefinition?.family ?? ''),
    retryResponse: execution.status === 'FAILED_RETRYABLE'
      || (execution.status === 'UNAVAILABLE' && execution.reasonCode !== 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION'),
  };
  const candidate = {
    schemaVersion: storedSchemaVersion,
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: execution.status,
    property,
    skill,
    skillHandoff: stored.skillHandoff ?? null,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? '1.0', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    continuesExecutionId: typeof stored.continuesExecutionId === 'string' ? stored.continuesExecutionId : null,
    originalResponse: stored.originalResponse && typeof stored.originalResponse === 'object' && !Array.isArray(stored.originalResponse)
      ? stored.originalResponse
      : null,
    viewState,
    contextVersion: execution.contextVersion,
    blocks: stored.blocks ?? [],
    captureRequests: Array.isArray(stored.captureRequests)
      ? stored.captureRequests.map((request) => request && typeof request === 'object' && !Array.isArray(request)
        ? {
          ...request,
          fallbackHref: typeof (request as { fallbackHref?: unknown }).fallbackHref === 'string'
            ? (request as { fallbackHref: string }).fallbackHref
            : captureFallbackHref(execution.operationId, execution.propertyId),
        }
        : request)
      : [],
    confirmation: stored.confirmation ?? null,
    clarification: stored.clarification ?? null,
    correctionCapabilities,
    suggestions: stored.suggestions ?? [],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
    // Ask Cozy Stage 3, Phase 3 (implementation plan §19; FRD §16/§28).
    // Only ever populated by the turn's own synchronous conversational-
    // capture attempt (conversationalCapture.ts) -- a persisted execution
    // read back later (e.g. session history) has none, since a child's own
    // resultJson has no childExecutions of its own to surface.
    childExecutions,
  };
  const parsed = AskExecutionResponseSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return AskExecutionResponseSchema.parse({
    schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
    executionId: execution.id,
    sessionId: execution.sessionId,
    question: execution.message,
    status: 'UNAVAILABLE',
    property,
    skill,
    skillHandoff: null,
    operation: execution.operationId ? { id: execution.operationId, version: execution.operationVersion ?? 'unknown', family: execution.intentFamily ?? 'UNKNOWN' } : null,
    contextVersion: execution.contextVersion,
    blocks: [{
      type: 'SUMMARY', id: 'ask-schema-fallback', title: 'This saved response needs to be refreshed',
      body: 'The response was saved with an unsupported presentation version. Ask preserved the execution and hid incompatible details instead of showing a broken or misleading result.',
      tone: 'CAUTION', actions: [],
    }],
    captureRequests: [],
    confirmation: null,
    clarification: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: true },
    suggestions: ['Ask this question again'],
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
  });
}

export async function expireIfSkillBindingChanged(execution: AskExecution): Promise<AskExecutionResponse | null> {
  if (!execution.skillId || terminalStatus(execution.status)) return null;
  const validation = validateSkillExecutionBinding(execution.skillBindingJson);
  if (validation.valid) return null;
  const policyMismatch = validation.reasonCode === 'ASK_SKILL_POLICY_MISMATCH';
  const expired = await prisma.askExecution.update({
    where: { id: execution.id },
    data: {
      status: 'EXPIRED',
      reasonCode: validation.reasonCode,
      completedAt: new Date(),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{
          type: 'SUMMARY',
          id: 'ask-skill-binding-expired',
          title: policyMismatch ? 'This request needs a new permission check' : 'This request uses an unavailable capability version',
          body: policyMismatch
            ? 'The effective Skill policy changed while this request was open. No action was performed; ask again to review the current policy and home context.'
            : 'The Skill or operation version bound to this request is no longer executable. No action was performed; ask again to use the current registered version.',
          tone: 'CAUTION',
          actions: [],
        }],
        captureRequests: [], confirmation: null, clarification: null, suggestions: ['Ask this question again'],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY' as const, id: 'ask-skill-binding-expired', title: 'This request is no longer available', body: 'No action was performed.', tone: 'CAUTION' as const, actions: [] }]),
      }),
    },
  });
  await prisma.askExecutionEvent.create({
    data: {
      executionId: execution.id,
      eventType: validation.reasonCode,
      metadataJson: asInputJson({
        skillId: execution.skillId,
        skillVersion: execution.skillVersion,
        operationId: execution.operationId,
        operationVersion: execution.operationVersion,
      }),
    },
  });
  return mapPersistedExecution(expired, await propertySummary(execution.propertyId));
}
