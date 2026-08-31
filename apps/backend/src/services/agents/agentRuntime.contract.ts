// apps/backend/src/services/agents/agentRuntime.contract.ts
//
// Typed contract for the Phase 2 agent runtime (implementation plan §7.3/§7.4).
// The runtime exposes a small closed set of operations; every one re-authorizes
// property access and verifies the AgentState CAS version. Homeowner-facing
// surfaces render the canonical DecisionThread plus this bounded run-status
// projection — never raw AgentRun / AgentState / invocation rows.

export const AGENT_RUNTIME_OPERATIONS = [
  'START_OR_RESUME',
  'SUBMIT_CONTEXT',
  'DISPUTE_INPUT',
  'GET_STATUS',
] as const;
export type AgentRuntimeOperation = (typeof AGENT_RUNTIME_OPERATIONS)[number];

// IPD-004: SCHEDULE_FOLLOW_UP is excluded from the v1 HVAC Specialist. These
// four are all read/recommend (autonomy <= 1).
export const HVAC_SPECIALIST_TOOLS = [
  'REQUEST_CONTEXT',
  'REQUEST_DOCUMENT',
  'SCORE',
  'EXPLAIN',
] as const;
export type HvacSpecialistTool = (typeof HVAC_SPECIALIST_TOOLS)[number];

export type AgentRunPhase =
  | 'WORKING'
  | 'NEEDS_CONTEXT'
  | 'NEEDS_DOCUMENT'
  | 'RECOMMENDATION_READY'
  | 'ABSTAINED';

export type AgentAbstentionReason =
  | 'AMBIGUOUS_DECISION_THREAD'
  | 'LOOP_BUDGET_EXHAUSTED'
  | 'CONTEXT_UNRESOLVED'
  | 'CONTEXT_UNAUTHORIZED'
  | 'LOW_CONFIDENCE'
  | 'TOOL_FAILURE'
  | 'UNSUPPORTED_VERDICT';

/**
 * §7.3.5 audit: one bounded record per tool call, accumulated by the loop and
 * persisted by the runtime once the AgentRun row exists. Payload is hashed at
 * persist time — see agentInvocationAudit.service.
 */
export interface PendingToolInvocation {
  sequence: number;
  toolId: HvacSpecialistTool;
  toolVersion: string;
  input: unknown;
  output?: unknown;
  outcome: 'OK' | 'EMPTY' | 'FAILED' | 'ABSTAINED';
  errorCode?: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface PendingLlmInvocation {
  sequence: number;
  purpose: 'HVAC_TYPED_CLAIM_NARRATION';
  modelId: string;
  policyId?: string | null;
  prompt: unknown;
  response?: unknown;
  typedClaimIds: readonly string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outcome: 'OK' | 'REJECTED' | 'FAILED';
  errorCode?: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface HvacSpecialistHomeActionOrigin {
  homeActionId: string;
  lineageId: string;
  sourceEntityId: string;
  sourceVersion: string | null;
  contextVersion: string | null;
  /** Stable for retries of one click; a new homeowner engagement gets a new nonce. */
  engagementNonce: string;
}

export interface AgentContextRequestItem {
  /** Stable key the homeowner surface uses to render the ask and route the fix. */
  key: string;
  label: string;
  /** Where the homeowner goes to supply it (canonical correction path). */
  correctionPath: string | null;
  kind: 'FACT' | 'DOCUMENT';
}

export interface AgentTypedClaim {
  claimId: string;
  text: string;
  /** The snapshot reason/limitation code this claim was selected from. */
  sourceCode: string;
}

export interface AgentRunStatusProjection {
  runId: string | null;
  agentId: string;
  agentVersion: string;
  /** Exact admitted profile selected for this run; retained across status reconstruction. */
  profileId?: string;
  phase: AgentRunPhase;
  decisionThreadId: string | null;
  currentRecommendationSnapshotId: string | null;
  verdict: 'REPAIR' | 'REPLACE' | 'MONITOR' | null;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  /** Present when phase is NEEDS_CONTEXT / NEEDS_DOCUMENT. */
  outstanding: AgentContextRequestItem[];
  /** Present when phase is RECOMMENDATION_READY (deterministic explanation). */
  explanation: AgentTypedClaim[];
  abstentionReason: AgentAbstentionReason | null;
  paused: boolean;
  /** Required by every state-mutating continuation; null when no live pause exists. */
  casVersion: number | null;
  expectedOperation: AgentRuntimeOperation | null;
}

export interface AgentRuntimeInvocation {
  operation: AgentRuntimeOperation;
  principalUserId: string;
  propertyId: string;
  inventoryItemId: string;
  /** Attribution only — never used for authorization (§7.3.7). */
  requestingAgentId: string;
  /** SUBMIT_CONTEXT: the structured intake the homeowner supplied. */
  contextIntake?: Readonly<Record<string, unknown>>;
  /** DISPUTE_INPUT: the fact/document key the homeowner is disputing + a bounded note. */
  dispute?: { key: string; note?: string };
  /** Resume path: the CAS version the caller last saw. */
  expectedCasVersion?: number;
  /** Provenance for a HOME_ACTION_ENGAGEMENT trigger. */
  homeActionOrigin?: HvacSpecialistHomeActionOrigin;
  askExecutionId?: string;
}

export interface AgentRuntimeResult {
  status: AgentRunStatusProjection;
  /** True when this invocation created or advanced durable state. */
  mutated: boolean;
}
