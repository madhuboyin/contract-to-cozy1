// Shared support for the Ask handlers, moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98).
import { type AskCaptureRequest } from '../../productFramework/ask/ask.contract';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { MaintenanceTaskPriority, RecurrenceFrequency } from '@prisma/client';
import { z } from 'zod';
import { isMeaningfulMaintenanceTaskTitle } from './askMaintenanceTaskInput';
import { type AskOperationId, type AskOperationResult } from './askOperationRegistry';

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
