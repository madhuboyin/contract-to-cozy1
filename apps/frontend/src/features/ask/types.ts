export type AskExecutionStatus =
  | 'RECEIVED' | 'ROUTING' | 'NEEDS_PROPERTY' | 'NEEDS_ENTITY'
  | 'NEEDS_CLARIFICATION' | 'NEEDS_CONTEXT' | 'READY_WITH_LIMITATIONS'
  | 'NEEDS_CONFIRMATION' | 'RUNNING' | 'ANSWERED' | 'COMPLETED'
  | 'NOT_APPLICABLE' | 'UNAVAILABLE' | 'OUT_OF_SCOPE' | 'BLOCKED'
  | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'CANCELLED' | 'EXPIRED';

export interface AskAction {
  id: string;
  label: string;
  href?: string;
  style: 'PRIMARY' | 'SECONDARY' | 'QUIET';
}

export type AskPresentationBlock =
  | { type: 'SUMMARY'; id: string; title: string; body: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL'; actions: AskAction[] }
  | { type: 'GROUPED_LIST'; id: string; title: string; description?: string | null; sections: Array<{ id: string; title: string; count: number; items: Array<{ id: string; title: string; description?: string | null; meta: string[]; status?: string | null; href?: string | null }> }>; actions: AskAction[] }
  | { type: 'TABLE'; id: string; title: string; description?: string | null; columns: Array<{ key: string; label: string }>; rows: Array<{ id: string; values: Record<string, string> }>; totalCount?: number; actions: AskAction[] }
  | { type: 'CAPABILITY_LIST'; id: string; title: string; description?: string | null; capabilities: Array<{ id: string; label: string; description: string; expectedOutput: string; href: string; readiness: 'READY' | 'NEEDS_PROPERTY' | 'NEEDS_CONTEXT' | 'UNAVAILABLE' | 'AVAILABLE'; readinessLabel: string | null; readinessReasons: string[]; releaseStage: 'ACTIVE' | 'BETA' }> }
  | { type: 'EVIDENCE'; id: string; title: string; items: Array<{ label: string; source: string | null; observedAt: string | null }> }
  | { type: 'BOUNDARY'; id: string; title: string; body: string; severity: 'INFO' | 'CAUTION' | 'EMERGENCY'; suggestions: string[] }
  | { type: 'MONITOR'; id: string; monitorId: string; title: string; status: 'ACTIVE' | 'PAUSED' | 'STOPPED'; threshold: string; product: string; channel: string; cadence: string; quietHours: string | null; sourceBoundary: string; actions: AskAction[] }
  | { type: 'WORKFLOW_PROGRESS'; id: string; title: string; status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'; description: string; details: Array<{ label: string; value: string }>; actions: AskAction[] }
  | { type: 'METRIC_ROW'; id: string; title: string; description?: string | null; metrics: Array<{ label: string; value: string; detail?: string | null; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL' }> }
  | { type: 'TIMELINE'; id: string; title: string; description?: string | null; items: Array<{ id: string; label: string; date?: string | null; description?: string | null; status?: string | null; href?: string | null }> }
  | { type: 'COMPARISON'; id: string; title: string; description?: string | null; options: Array<{ id: string; label: string; summary?: string | null; attributes: Array<{ label: string; value: string; tone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' | 'CRITICAL' }> }>; actions: AskAction[] }
  | { type: 'DECISION_TRACE'; id: string; title: string; steps: Array<{ label: string; detail: string; outcome?: string | null }> }
  | { type: 'DECISION_PROGRESS'; id: string; title: string; decisionThreadId: string; lifecycleStatus: 'OPEN' | 'GATHERING_CONTEXT' | 'READY_TO_COMPARE' | 'RECOMMENDATION_AVAILABLE' | 'ACTION_IN_PROGRESS' | 'DECIDED' | 'COMPLETED' | 'ABANDONED' | 'ARCHIVED'; contextStatus: 'CURRENT' | 'STALE' | 'CONFLICTED'; verdict: string | null; reasonCodes: string[]; limitationCodes: string[]; contextIssueCodes: string[]; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null; generatedAt: string | null; actions: AskAction[] }
  | { type: 'SCENARIO_COMPARISON'; id: string; title: string; decisionThreadId: string; scenarioId: string; baseline: { label: string; verdict: string; reasonCodes: string[]; limitationCodes: string[] }; scenario: { label: string; verdict: string; reasonCodes: string[]; limitationCodes: string[]; assumptions: Array<{ label: string; value: string }> }; comparisonDirection: 'SCENARIO_FAVORS_REPLACE' | 'SCENARIO_FAVORS_REPAIR' | 'NO_CHANGE'; actions: AskAction[] }
  | { type: 'PREFERENCE_REFERENCE'; id: string; title: string; preferenceKey: string; summary: string; visibility: 'PRIVATE' | 'OWNER_ONLY' | 'HOUSEHOLD_SUMMARY' | 'HOUSEHOLD_DETAIL'; confirmedAt: string | null; expiresAt: string | null }
  | { type: 'WHY_NOW'; id: string; title: string; triggerCodes: string[]; evidenceCodes: string[]; timingNote: string | null; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null }
  | { type: 'RECOMMENDATION_CHANGE'; id: string; title: string; decisionThreadId: string; previousVerdict: string; currentVerdict: string; category: 'MATERIAL' | 'CONFIDENCE_ONLY' | 'SYSTEM_METHOD_ONLY' | 'UNCHANGED'; changedFactors: string[]; changedAt: string }
  | { type: 'CHANGE_SUMMARY'; id: string; title: string; source: string; changeType: 'SOURCE_RECORD_CREATED' | 'SOURCE_RECORD_REVISED' | 'SOURCE_LIFECYCLE_CHANGED' | 'PROPERTY_FACT_CHANGED' | 'ACTION_STATE_CHANGED' | 'OUTCOME_CONFIRMED' | 'SOURCE_HEALTH_CHANGED'; summary: string; effectiveAt: string | null; detectedAt: string; materiality: 'INFORMATIONAL' | 'MEANINGFUL' | 'IMPORTANT' | 'URGENT'; materialityReasonCodes: string[]; confidence: number | null; linkedAction: { label: string; href: string } | null }
  | { type: 'PRIORITY_LIST'; id: string; title: string; propertyId: string; rankingPolicyVersion: string; generatedAt: string; sourceFreshnessAt: string | null; truncated: boolean; items: Array<{ homeActionId: string; title: string; consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL' | 'NO_ACTION'; comparativeReasonCodes: string[]; confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH'; deadlineAt: string | null; dependencyRefs: string[]; cta: AskAction | null; watchState: string | null; suppressed: boolean; completed: boolean; unavailable: boolean; stale: boolean }> }
  | { type: 'OUTCOME_SUMMARY'; id: string; title: string; decisionThreadId: string; entries: Array<{ outcomeObservationId: string; recommendationSnapshotId: string; observedType: string; occurredAt: string; verificationStatus: 'REPORTED' | 'CORROBORATED' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED'; sourceLabel: string; relationshipType: 'SELECTED_OPTION' | 'ACTION_STARTED' | 'ACTION_COMPLETED' | 'COST_OBSERVED' | 'TIMING_OBSERVED' | 'RESULT_OBSERVED'; attributionConfidence: number | null; reviewStatus: 'PENDING' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED'; comparable: boolean; observedCostLabel: string | null; predictedCostLabel: string | null; note: string | null }>; limitation: string }
  | { type: 'ASSUMPTIONS'; id: string; title: string; items: string[] }
  | { type: 'LIMITATION'; id: string; title: string; body: string; severity: 'INFO' | 'CAUTION' }
  | { type: 'EMPTY_STATE'; id: string; title: string; body: string; actions: AskAction[] }
  | { type: 'ERROR_STATE'; id: string; title: string; body: string; retryable: boolean; actions: AskAction[] };

export interface AskExecutionResponse {
  schemaVersion: '1.0';
  executionId: string;
  sessionId: string;
  question: string;
  status: AskExecutionStatus;
  property: { id: string; label: string } | null;
  operation: { id: string; version: string; family: string } | null;
  contextVersion: string | null;
  blocks: AskPresentationBlock[];
  captureRequests: AskCaptureRequest[];
  confirmation: AskConfirmation | null;
  clarification: AskClarification | null;
  suggestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AskPendingWorkItem {
  pendingKind: 'CLARIFICATION' | 'ENTITY_SELECTION' | 'CONTEXT_CAPTURE' | 'CONFIRMATION' | 'COMMAND_RECOVERY';
  actionLabel: string;
  execution: AskExecutionResponse;
}

export interface AskClarification {
  version: number;
  question: string;
  options: Array<{ operationId: string; label: string }>;
  allowFreeText: boolean;
  expiresAt: string;
}

export interface SubmitAskClarificationPayload {
  clarificationVersion: number;
  idempotencyKey: string;
  operationId?: string;
  answer?: string;
}

export interface AskFeedbackResponse {
  id: string;
  rating: 'UP' | 'DOWN';
}

export interface AskConfirmation {
  confirmationId: string;
  version: number;
  title: string;
  description: string;
  fields: Array<{ label: string; value: string }>;
  confirmLabel: string;
  consentText: string;
  expiresAt: string;
}

export interface AskCaptureRequest {
  requirementId: string;
  captureKey: string;
  classification: 'REQUIRED_APPLICABILITY' | 'REQUIRED_SAFETY' | 'REQUIRED_CALCULATION' | 'ENHANCEMENT_ACCURACY' | 'SCENARIO_INPUT' | 'PREFERENCE_INPUT' | 'WORKFLOW_INPUT';
  state: 'KNOWN' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
  title: string;
  question: string;
  helpText: string | null;
  inputSchema: CaptureInputSchema;
  currentAnswer?: unknown;
  allowNotSure: boolean;
  sensitivity: 'STANDARD' | 'FINANCIAL' | 'SECURITY';
  destinationLabel: string | null;
  fallbackHref?: string | null;
  confirmationText: string | null;
  expectedContextVersion: string;
}

export interface SubmitAskCapturePayload {
  requirementId: string;
  captureKey: string;
  expectedContextVersion: string;
  idempotencyKey: string;
  answer: Record<string, unknown>;
  sensitiveDataConfirmed?: boolean;
}

export interface CreateAskExecutionPayload {
  clientRequestId: string;
  sessionId: string;
  message: string;
  propertyId?: string | null;
  launchContext?: {
    surface: string;
    capabilityId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actionId?: string | null;
    journeyId?: string | null;
    returnTo?: string | null;
  };
}
// Ask Intelligence FRD §18.4, Phase 9B "Concierge Home" — a dedicated
// composed read surface for the Ask starting page, distinct from
// AskExecutionResponse (no message, no execution created). See
// apps/backend/src/productFramework/conciergeHome.contract.ts for the
// authoritative shape.
export interface ConciergeHomeView {
  propertyId: string;
  generatedAt: string;
  priorityList: {
    state: 'AVAILABLE' | 'NO_ACTION' | 'UNAVAILABLE';
    rankingPolicyVersion: string | null;
    generatedAt: string | null;
    items: Array<{
      homeActionId: string;
      title: string;
      consumerPriority: 'DO_NOW' | 'PLAN_SOON' | 'WATCH' | 'OPTIONAL' | 'NO_ACTION';
      comparativeReasonCodes: string[];
      confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH';
      deadlineAt: string | null;
      cta: { label: string; href: string } | null;
      watchState: string | null;
      suppressed: boolean;
      completed: boolean;
      unavailable: boolean;
      stale: boolean;
    }>;
    truncated: boolean;
    href: string;
  };
  changes: {
    state: 'AVAILABLE' | 'NO_CHANGE' | 'UNAVAILABLE';
    windowDays: number;
    items: Array<{ id: string; source: string; summary: string; materiality: 'INFORMATIONAL' | 'MEANINGFUL' | 'IMPORTANT' | 'URGENT'; detectedAt: string; effectiveAt: string | null }>;
    href: string;
  };
  decisions: {
    state: 'AVAILABLE' | 'NO_DECISIONS' | 'UNAVAILABLE';
    items: Array<{ decisionThreadId: string; title: string; lifecycleStatus: string; contextStatus: string; verdict: string | null; confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null; updatedAt: string }>;
    href: string;
  };
  suggestedQuestions: string[];
}

import type { CaptureInputSchema } from '@/components/property-context/featureContextTypes';
