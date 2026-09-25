// Shared support for the Ask handlers, moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98).
import { ASK_RESPONSE_SCHEMA_VERSION, AskExecutionResponseSchema, type AskCaptureRequest, type AskExecutionResponse, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../productFramework/ask/ask.contract';
import { resolvePropertyAccess, type PropertyAccess } from '../propertyAccess.service';
import { AskExecution, AskExecutionStatus, HouseholdRole, MaintenanceTaskPriority, Prisma, RecurrenceFrequency } from '@prisma/client';
import { z } from 'zod';
import { isMeaningfulMaintenanceTaskTitle } from './askMaintenanceTaskInput';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import { prisma } from '../../lib/prisma';
import { askAnswerTrustTotal, askSemanticAnswerValidationDurationSeconds, askSemanticAnswerValidationTotal } from '../../lib/metrics';
import { skillContextProviderKey } from '../skills/context/skillContextProviderRegistry';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER, type PropertyJourneyContext } from '../skills/context/propertyJourneyContext.contract';
import type { ComposedSkillContext } from '../skills/context/skillContext.contract';
import { type AskAudienceApplicabilityDecision } from './askAudiencePolicy';
import { getSkillForOperation } from '../skills/skillRegistry';
import { validateSkillExecutionBinding } from '../skills/skillExecutionBinding';
import { type SkillExecutionTimingTrace } from '../skills/skillExecutionTelemetry';
import { getSkillLineageMetadata } from '../skills/skillLineageRegistry';
import { resolveAskAudienceContext } from './askAudienceContext';
import { validateAskAnswerTrustPipeline } from './askAnswerTrustValidator';
import { requiredAskTargetEntity } from './askEntityResolution';
import { createHash } from 'node:crypto';
import * as outcomeObservationService from '../decisionPlatform/outcomeObservationService';
import { sourceTypeLabel as outcomeSourceTypeLabel } from '../decisionPlatform/outcomeObservationService';
import { APIError } from '../../middleware/error.middleware';
import { radarQueryService } from '../../modules/homeEventRadar/services/radarQuery.service';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../modules/homeEventRadar/domain/radarInteraction';
import { RADAR_ACTION_CODES } from '../../modules/homeEventRadar/domain/radarActionRegistry';
import { type CorrectionFieldSpec, type CorrectionOption } from './askCorrectionFields';

export const INVENTORY_CATEGORY_VALUES = ['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY', 'SMART_HOME', 'FURNITURE', 'ELECTRONICS', 'INTERIOR', 'STRUCTURAL', 'EXTERIOR', 'SITE', 'OTHER'] as const;

export function askCaptureRequest(requirement: any, contextVersion: string, destinationLabel: string, fallbackHref: string): AskCaptureRequest {
  return {
    requirementId: requirement.requirementId,
    captureKey: requirement.capture.captureKey,
    classification: requirement.classification,
    state: requirement.state,
    title: requirement.capture.title,
    question: requirement.capture.question,
    helpText: requirement.capture.helpText ?? null,
    inputSchema: requirement.capture.inputSchema,
    ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: requirement.capture.allowNotSure,
    sensitivity: requirement.capture.sensitivity,
    destinationLabel,
    fallbackHref,
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function ensurePropertyAccess(userId: string, propertyId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

// F05 fix, extracted as a pure function for direct unit testing (same
// convention as parseRefinanceScenarioEdit/isAllPropertyAttentionRequest --
// this is the "brain" of the fix; capitalReservePlanResult's DB fetches
// around it are not independently testable without a live database). See
// the F05 fix comment inside capitalReservePlanResult for why this must
// compare against getFinancialContextDecisions's contextVersion specifically,
// not evaluateFeatureContext's.
export function isCapitalTimelineAnalysisStale(
  analysis: { inputsSnapshot: unknown } | null | undefined,
  currentContextVersion: string,
): boolean {
  if (!analysis) return false;
  const storedContextVersion = analysis.inputsSnapshot && typeof analysis.inputsSnapshot === 'object' && !Array.isArray(analysis.inputsSnapshot)
    ? (analysis.inputsSnapshot as Record<string, unknown>)._propertyContextVersion
    : undefined;
  return storedContextVersion !== currentContextVersion;
}

// Home Capital Timeline "re-run with a different horizon" write (FRD Appendix D
// planning/refinement follow-up): the traditional page's ONLY real
// homeowner-facing "different assumptions" lever is this 5yr/10yr toggle
// (CapitalTimelineClient.tsx's `([5, 10] as const)` -- confirmed no other
// horizon and no homeowner-editable rate/assumption-set control exists
// anywhere in the app). Parsed the same way propertyTaxAppealReadinessResult
// parses `ground` from free text, and exported for direct unit testing per
// this file's own isCapitalTimelineAnalysisStale/parseRefinanceScenarioEdit
// convention.
export function parseCapitalTimelineHorizonRequest(message: string): 5 | 10 | null {
  if (/\b5[\s-]*year/i.test(message)) return 5;
  if (/\b10[\s-]*year/i.test(message)) return 10;
  return null;
}

export function safeTimezone(value: string | null | undefined): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

// Shared with confirmBuyerFindingDisposition's own result copy, so the
// conflict message and the eventual success message describe a
// disposition the same way, not two independently-maintained label sets.
export const BUYER_FINDING_DISPOSITION_LABELS: Record<string, string> = {
  VERIFIED_FACT: 'verified fact', PRE_CLOSE_NEGOTIATION: 'seller negotiation', POST_CLOSE_ACTION: 'post-close work', DISMISSED: 'dismissed', PENDING_REVIEW: 'pending review',
};

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

export const MaintenanceTaskWorkflowInputSchema = z.object({
  title: z.string().trim().min(3).max(160).refine(isMeaningfulMaintenanceTaskTitle, {
    message: 'Describe the maintenance work to be done.',
  }),
  description: z.string().trim().max(1000).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).default(MaintenanceTaskPriority.MEDIUM),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedCostUsd: z.number().min(0).max(10_000_000).optional(),
  isRecurring: z.boolean().default(false),
  frequency: z.nativeEnum(RecurrenceFrequency).optional(),
}).strict().superRefine((value, context) => {
  if (value.isRecurring && !value.frequency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['frequency'], message: 'Choose how often this task repeats.' });
  }
  if (value.nextDueDate) {
    const due = new Date(`${value.nextDueDate}T00:00:00.000Z`);
    if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value.nextDueDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextDueDate'], message: 'Enter a valid due date.' });
    }
  }
});

export type MaintenanceTaskWorkflowInput = z.infer<typeof MaintenanceTaskWorkflowInputSchema>;

export const MaintenanceCompletionWorkflowInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  actualCostUsd: z.number().min(0).max(10_000_000).optional(),
  outcomeHealth: z.enum(['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED']).optional(),
}).strict();

export type MaintenanceCompletionWorkflowInput = z.infer<typeof MaintenanceCompletionWorkflowInputSchema>;

export const MaintenanceTaskUpdateInputSchema = z.object({
  taskId: z.string().trim().min(1).max(160),
  action: z.enum(['EDIT', 'RESCHEDULE', 'ASSIGN', 'UNASSIGN', 'ARCHIVE', 'REOPEN']),
  title: z.string().trim().min(3).max(160).optional(),
  priority: z.nativeEnum(MaintenanceTaskPriority).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigneeUserId: z.string().trim().min(1).max(160).nullable().optional(),
}).strict();

export function durableFreeTextClarification(operationId: AskOperationId, question: string): Pick<AskOperationResult, 'clarification' | 'parameters'> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    clarification: { version: 1, question, options: [], allowFreeText: true, expiresAt },
    parameters: { clarification: { version: 1, candidateOperationIds: [operationId], expiresAt } },
  };
}

export function journeyContextFrom(composedContext: ComposedSkillContext | null): PropertyJourneyContext | null {
  if (!composedContext) return null;
  const value = composedContext.values[skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER)];
  if (!value || typeof value !== 'object') return null;
  return value as PropertyJourneyContext;
}

export function audienceApplicabilityResult(
  decision: AskAudienceApplicabilityDecision,
  propertyId?: string | null,
  householdRole?: HouseholdRole | null,
): AskOperationResult {
  const contextRequired = decision.outcome === 'CONTEXT_REQUIRED';
  const blocked = decision.outcome === 'INAPPLICABLE_BLOCK';
  const correctionAction = contextRequired && propertyId && householdRole !== 'VIEWER'
    ? [{
      id: 'review-home-journey',
      label: 'Confirm home journey',
      href: `/dashboard/properties/${encodeURIComponent(propertyId)}/onboarding#home-journey`,
      style: 'SECONDARY' as const,
    }]
    : [];
  return {
    status: contextRequired ? 'NEEDS_CONTEXT' : blocked ? 'BLOCKED' : 'NOT_APPLICABLE',
    reasonCode: decision.reasonCode ?? 'ASK_AUDIENCE_INAPPLICABLE',
    blocks: [{
      type: 'BOUNDARY',
      id: 'ask-audience-applicability',
      title: contextRequired ? 'A little home context is needed' : 'This capability does not fit the home’s current stage',
      severity: 'INFO',
      body: contextRequired
        ? 'Ask can still help with general home-record questions, but this request needs a confirmed buying, owning, or selling stage before it can give reliable guidance.'
        : `This request is not applicable to the selected home’s ${decision.operatingMode.toLowerCase()} stage. No home record was changed.`,
      suggestions: ['Summarize my home record', 'What maintenance is pending?', 'What should I plan for next?'],
      actions: correctionAction,
    }],
    suggestions: ['Summarize my home record', 'What maintenance is pending?', 'What should I plan for next?'],
    parameters: {
      audiencePresentation: householdRole ? { householdRole } : undefined,
      audienceApplicability: {
        outcome: decision.outcome,
        reasonCode: decision.reasonCode,
        policyVersion: decision.policyVersion,
        operatingMode: decision.operatingMode,
      },
    },
  };
}

export function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

export function terminalStatus(status: AskOperationResult['status']): boolean {
  return ['ANSWERED', 'COMPLETED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'OUT_OF_SCOPE', 'BLOCKED', 'FAILED_TERMINAL', 'CANCELLED', 'EXPIRED'].includes(status);
}

export function audienceTelemetryFor(input: {
  propertyAccess?: PropertyAccess | null;
  journeyContext?: PropertyJourneyContext | null;
  audiencePolicyEnabled: boolean;
  journeyContextStatus?: NonNullable<SkillExecutionTimingTrace['audience']>['journeyContextStatus'];
}): NonNullable<SkillExecutionTimingTrace['audience']> {
  const audience = resolveAskAudienceContext({
    accountRole: 'HOMEOWNER',
    propertyAccess: input.propertyAccess,
    journeyContext: input.journeyContext,
  });
  return {
    accountRole: audience.accountRole,
    householdRole: audience.householdRole ?? 'UNKNOWN',
    operatingMode: audience.operatingMode,
    propertyRelationship: audience.propertyRelationship,
    audienceEligibilityOutcome: 'ELIGIBLE' as const,
    audienceApplicabilityOutcome: 'NOT_EVALUATED' as const,
    audiencePolicyVersion: null,
    audiencePolicyEvaluationMode: input.audiencePolicyEnabled ? 'ENABLED' as const : 'SAFE_FALLBACK' as const,
    journeyContextStatus: (input.journeyContextStatus ?? 'NOT_EVALUATED') as NonNullable<SkillExecutionTimingTrace['audience']>['journeyContextStatus'],
  };
}

export async function propertySummary(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  return property ? { id: property.id, label: propertyLabel(property) } : null;
}

export function recordAskAnswerTrustMetrics(
  operationId: AskOperationId,
  validation: ReturnType<typeof validateAskAnswerTrustPipeline>,
): void {
  askAnswerTrustTotal.inc({
    operation: operationId,
    outcome: validation.trust.outcome,
    source: validation.trust.checks.sourceIntegrity,
    repaired: validation.repaired ? 'yes' : 'no',
  });
  if (validation.semantic) {
    askSemanticAnswerValidationTotal.inc({ operation: operationId, outcome: validation.semantic.outcome });
    askSemanticAnswerValidationDurationSeconds.observe(
      { operation: operationId, outcome: validation.semantic.outcome },
      validation.semantic.latencyMs / 1_000,
    );
  }
}

export function captureFallbackHref(operationId: string | null, propertyId: string | null): string | null {
  if (!propertyId) return null;
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  switch (operationId) {
    case 'REPLACEMENT_GUIDANCE':
    case 'INVENTORY_LOOKUP':
    case 'COVERAGE_GAPS': return `${base}/inventory`;
    case 'COVERAGE_COMPARISON_STATUS': return `${base}/tools/coverage-options`;
    case 'INCIDENT_CLAIM_STATUS':
    case 'CLAIM_FILE':
    case 'CLAIM_TRANSITION':
    case 'INCIDENT_CONTINUATION': return `${base}/claims`;
    case 'REFINANCE_ANALYSIS': return `${base}/tools/financing/profile`;
    case 'SAVINGS_OPPORTUNITIES': return `${base}/tools/home-savings`;
    case 'OWNERSHIP_COSTS': return `${base}/ownership-costs`;
    case 'SELL_HOLD_RENT_ANALYSIS':
    case 'SELLER_PREP_CHECKLIST':
    case 'SELLER_PREP_ITEM_DECISION': return `${base}/seller-prep`;
    case 'INVENTORY_ITEM_CORRECT':
    case 'INVENTORY_ITEM_CREATE': return `${base}/inventory?tab=items`;
    case 'PROPERTY_CONTEXT_AREA_CAPTURE': return base;
    case 'HOME_EVENT_CORRECT': return `${base}/timeline`;
    case 'WARRANTY_CORRECT': return '/dashboard/warranties';
    case 'ROOM_RENAME':
    case 'ROOM_CREATE': return `${base}/rooms`;
    case 'CAPITAL_RESERVE_PLAN': return `${base}/tools/capital-timeline`;
    case 'PROPERTY_TAX_APPEAL_READINESS': return `${base}/tools/property-tax`;
    case 'QUOTE_COMPARISON_REVIEW': return `${base}/tools/quote-comparison`;
    case 'RENOVATION_PERMIT_READINESS': return `${base}/projects`;
    case 'MAJOR_EVENT_ENTRY': return `${base}/tools`;
    case 'HOME_ACTIONS':
    case 'OPERATIONAL_WORK_UPDATE': return `${base}/home-operations`;
    case 'INSPECTION_FINDINGS':
    case 'INSPECTION_FINDING_UPDATE': return `${base}/inspection`;
    case 'DOCUMENT_PROMOTION_REVIEW':
    case 'DOCUMENT_PROMOTION_CONFIRM':
    case 'DOCUMENT_LOOKUP': return `${base}/documents`;
    case 'HOUSEHOLD_INVITATION': return `${base}/household`;
    case 'MAINTENANCE_TASK_CREATE':
    case 'MAINTENANCE_TASK_COMPLETE':
    case 'MAINTENANCE_FORECAST': return `${base}/maintenance`;
    default: return `${base}/edit`;
  }
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

export function askContextFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

export function formatOutcomeCents(cents: number | null): string | null {
  return cents == null ? null : `$${(cents / 100).toFixed(2)}`;
}

// Ask Intelligence FRD §21.5, Phase 10A. `comparable` is always false and
// `predictedCostLabel` always null for this slice -- the HVAC engine does not
// yet emit a normalized predicted cost to compare against, and §21.5
// requires the block hide the delta rather than show a non-comparable one.
export function outcomeSummaryBlock(id: string, decisionThreadId: string, rows: outcomeObservationService.OutcomeSummaryAttribution[]): AskPresentationBlock {
  return {
    type: 'OUTCOME_SUMMARY', id, title: 'Outcome for this decision', decisionThreadId,
    entries: rows.map((row) => {
      const payload = row.observation.observedPayload as { costCents?: number | null; note?: string | null } | null;
      return {
        outcomeObservationId: row.observation.id,
        recommendationSnapshotId: row.attribution.recommendationSnapshotId,
        observedType: row.observation.observedType,
        occurredAt: row.observation.occurredAt.toISOString(),
        verificationStatus: row.observation.verificationStatus,
        sourceLabel: outcomeSourceTypeLabel(row.observation.sourceType),
        relationshipType: row.attribution.relationshipType,
        attributionConfidence: row.attribution.confidence,
        reviewStatus: row.attribution.reviewStatus,
        comparable: false,
        observedCostLabel: formatOutcomeCents(typeof payload?.costCents === 'number' ? payload.costCents : null),
        predictedCostLabel: null,
        note: typeof payload?.note === 'string' ? payload.note : null,
      };
    }),
    limitation: 'A different outcome or homeowner choice does not by itself prove the recommendation was incorrect.',
  };
}

export const RadarFeedbackInputSchema = z.object({
  matchId: z.string().trim().min(1).max(160),
  feedbackType: z.enum(['wrong_location', 'not_relevant', 'duplicate', 'stale', 'other']).nullable(),
  comment: z.string().trim().max(RADAR_FEEDBACK_COMMENT_MAX_LENGTH).nullable(),
}).strict();

// Canonical re-read of one match for this user; null when it no longer exists for this property.
export async function loadRadarMatchForWrite(propertyId: string, matchId: string, userId: string): Promise<Record<string, any> | null> {
  try {
    return await radarQueryService.getDetail(propertyId, matchId, userId) as Record<string, any>;
  } catch (error) {
    if (error instanceof APIError && error.code === 'RADAR_MATCH_NOT_FOUND') return null;
    throw error;
  }
}

export const RADAR_CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const RadarTaskTargetSchema = z.object({ matchId: z.string().trim().min(1).max(160), actionCode: z.enum(RADAR_ACTION_CODES) }).strict();

// The inline form's answer. dueDate is the shared APPROXIMATE_DATE value ({ precision, value }), limited to an exact date.
export const RadarTaskAnswerSchema = z.object({
  operation: z.enum(['create_task', 'create_reminder', 'link_existing_task']),
  maintenanceTaskId: z.string().trim().max(128).nullish(),
  dueDate: z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).nullish(),
  dueTime: z.string().regex(RADAR_CLOCK_TIME).nullish().or(z.literal('')),
  assigneeUserId: z.string().trim().min(1).max(128).nullish(),
});

// What confirming sends to radarTaskIntegrationService.createOrLink (the traditional POST body, plus its target).
export const RadarTaskInputSchema = z.object({
  matchId: z.string().trim().min(1).max(160),
  actionCode: z.enum(RADAR_ACTION_CODES),
  operation: z.enum(['create_task', 'create_reminder', 'link_existing_task']),
  maintenanceTaskId: z.string().trim().min(1).max(128).nullable(),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  assigneeUserId: z.string().trim().min(1).max(128).nullable(),
}).strict();

export function exactEntityMatch<T extends { id: string }>(rows: readonly T[], message: string, launchContext?: CreateAskExecutionRequest['launchContext']): T | null {
  const launched = launchContext?.entityId ? rows.find((row) => row.id === launchContext.entityId) : null;
  if (launched) return launched;
  const normalized = message.toLowerCase();
  const matches = rows.filter((row) => {
    const label = 'title' in row && typeof row.title === 'string' ? row.title : 'homeSystem' in row && typeof row.homeSystem === 'string' ? row.homeSystem : '';
    return normalized.includes(row.id.toLowerCase()) || (label.length >= 3 && normalized.includes(label.toLowerCase()));
  });
  return matches.length === 1 ? matches[0] : null;
}

export const InventoryItemCorrectionInputSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  field: z.enum(['installedOn', 'purchasedOn', 'lastServicedOn', 'condition', 'brand', 'model', 'serialNo', 'purchaseCostCents', 'replacementCostCents', 'notes', 'category', 'roomId']),
  // null until the homeowner supplies (or edits in) a value; confirm rejects null.
  value: z.string().max(2000).nullable(),
}).strict();

export function homeEventCorrectionItemActions(canManage: boolean) {
  if (!canManage) return undefined;
  const fields = (Object.keys(HOME_EVENT_CORRECTION_FIELDS) as HomeEventCorrectionField[]).map((field) => ({
    id: `correct-${field}`, label: HOME_EVENT_CORRECTION_FIELDS[field].action, message: HOME_EVENT_CORRECTION_FIELDS[field].message,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_EVENT_CORRECT',
  }));
  // Whether this contributor may go on to choose PRIVATE, or move a PRIVATE event to something else, is re-checked
  // against live data (createdById) in homeEventVisibilityResult/confirmHomeEventVisibility -- the action itself is
  // offered to any contributor exactly like the other event corrections, since a PRIVATE event a non-creator cannot
  // even see never reaches this list in the first place.
  return [...fields, {
    id: 'correct-visibility', label: 'Change visibility', message: HOME_EVENT_VISIBILITY_MESSAGE,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_EVENT_VISIBILITY',
  }];
}

// Phase 3 write slice 7: change who can see a HomeEvent (PRIVATE / HOUSEHOLD / RESALE_PACK). Written in place through the
// existing setVisibility writer -- unlike HOME_EVENT_CORRECT this does not supersede the event with a new revision, so the
// event id and every other field are untouched. STRICTER than the traditional PATCH route (any contributor, no ownership
// check): a change TO or FROM PRIVATE is creator-only, matching the read-side rule that a PRIVATE event is visible only to
// its creator (ensureHomeEventVisible below; every event query elsewhere in this file applies the same OR filter).
export const HOME_EVENT_VISIBILITY_MESSAGE = 'Change the visibility of this timeline event.';

export const optionalShortText = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

export const InventoryCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(INVENTORY_CATEGORY_VALUES),
  roomId: z.string().min(1).max(64),
  brand: optionalShortText(80),
  model: optionalShortText(80),
}).strict();

// ASK_COZY_INTERACTION_MODEL_UI_FRD §8 (CONF-002/CONF-003): edits a
// declared field on an open confirmation, bumping its version rather than
// mutating in place -- a stale confirmationVersion (already superseded by
// a prior edit, or already claimed by confirmAskExecution's own claim
// transaction) is rejected exactly like an out-of-date confirm attempt is.
// This never performs the domain write itself; confirmAskExecution's own
// freshness re-check (confirmMaintenanceTaskUpdate's task-version compare)
// still runs when the edited proposal is actually confirmed. Scoped to the
// one editable-field case that exists (maintenance reschedule) rather than
// a generic per-operation registry -- extend this when a second case is
// actually implemented.
// Shared by both editAskConfirmation branches (Maintenance and, as of the
// B04 fix, Buyer) -- extracted so the exact-yyyy-mm-dd-plus-real-calendar-
// date validation is defined once and directly unit-testable, rather than
// duplicated inline in each operation's own edit path.
export function isValidDateEditInput(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Phase 3 write slice 2: title/date correction on an exact current HomeEvent.
// updateHomeEvent supersedes the row and creates a replacement with a NEW id,
// so the target is always re-resolved as (id, isCurrent, !deletedAt) and the
// receipt/artifact carries the replacement's id.
// VERIFIED_RESOLUTION is created by the system when a guidance journey completes, so it is not offered as a type
// and an event that already has it cannot have its type changed here.
export const HOME_EVENT_TYPE_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Purchase', value: 'PURCHASE' }, { label: 'Document', value: 'DOCUMENT' }, { label: 'Repair', value: 'REPAIR' },
  { label: 'Maintenance', value: 'MAINTENANCE' }, { label: 'Claim', value: 'CLAIM' }, { label: 'Improvement', value: 'IMPROVEMENT' },
  { label: 'Value update', value: 'VALUE_UPDATE' }, { label: 'Inspection', value: 'INSPECTION' }, { label: 'Note', value: 'NOTE' },
  { label: 'Milestone', value: 'MILESTONE' }, { label: 'Other', value: 'OTHER' },
];

export const HOME_EVENT_IMPORTANCE_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Low', value: 'LOW' }, { label: 'Normal', value: 'NORMAL' }, { label: 'High', value: 'HIGH' }, { label: 'Highlight', value: 'HIGHLIGHT' },
];

export type HomeEventCorrectionMeta = CorrectionFieldSpec & { action: string; message: string };

export const HOME_EVENT_CORRECTION_FIELDS: Record<'title' | 'occurredAt' | 'summary' | 'amount' | 'type' | 'importance' | 'roomId' | 'inventoryItemId', HomeEventCorrectionMeta> = {
  title: { label: 'title', action: 'Correct title', message: 'Correct the title of this timeline event.', kind: 'TEXT', min: 3, max: 140 },
  occurredAt: { label: 'date', action: 'Correct date', message: 'Correct the date of this timeline event.', kind: 'DATE' },
  summary: { label: 'summary', action: 'Correct summary', message: 'Correct the summary of this timeline event.', kind: 'TEXTAREA', max: 500 },
  amount: { label: 'amount', action: 'Correct amount', message: 'Correct the amount of this timeline event.', kind: 'MONEY' },
  type: { label: 'type', action: 'Correct type', message: 'Correct the type of this timeline event.', kind: 'SELECT', options: HOME_EVENT_TYPE_OPTIONS },
  importance: { label: 'importance', action: 'Correct importance', message: 'Correct the importance of this timeline event.', kind: 'SELECT', options: HOME_EVENT_IMPORTANCE_OPTIONS },
  // The two link fields below have no static option list -- homeEventLinkOptions builds it from the property's own
  // rooms/items at propose and edit time, and homeEventCorrectionConfirmation substitutes it in as `dynamicOptions`.
  // A raw id would mean nothing to a homeowner, so unlike every other field these are never message-extracted from
  // free text; the confirmation card's dropdown is the only way to choose a value.
  roomId: { label: 'room', action: 'Correct room', message: 'Correct the room of this timeline event.', kind: 'SELECT', options: [] },
  inventoryItemId: { label: 'inventory item', action: 'Correct inventory item', message: 'Correct the inventory item of this timeline event.', kind: 'SELECT', options: [] },
};

export type HomeEventCorrectionField = keyof typeof HOME_EVENT_CORRECTION_FIELDS;

