import { ASK_INLINE_EXTRACTION_OUTCOMES, ASK_TURN_STAGES, type AskTurnStage } from '../../lib/metrics';

/**
 * Ask turn performance contract (Findings Implementation Plan, Phase 3).
 *
 * `ask_turn_stage_duration_seconds{stage, operation}` carries 15 stages that do NOT all measure the same thing: some are deltas between two
 * marks, one is nested inside another, one runs concurrently with another, and several are cumulative clocks started at different points.
 * Adding them up, or reading TURN_TOTAL as "the request latency", gives wrong answers. This contract states, for every stage, exactly where its
 * clock starts and stops and whether it may be summed with others, and a test (tests/ask/askTurnStageContract.test.js) keeps it in step with the
 * stage list and with the instrumentation in createAskExecution.ts / executeOperation.ts.
 *
 * This is a measurement definition, not a latency target. No numeric objective is set here: FR-PERF-001 requires approved p50/p95 targets,
 * and those come from measured evidence (docs/operations/ASK_TURN_PERFORMANCE_MEASUREMENT.md), not from this file.
 */
export type AskTurnStageKind =
  /** Time since the previous mark inside the execution phase; consecutive DELTA stages tile the execution phase with no gap and no overlap. */
  | 'DELTA'
  /** Contained inside another stage's span; never add it to its container. */
  | 'NESTED'
  /** Runs at the same time as another stage; never add the two. */
  | 'CONCURRENT_SPAN'
  /** Cumulative clock from the start of the execution phase (`startedAt`), which is AFTER request setup. */
  | 'ELAPSED_FROM_EXECUTION_START'
  /** Cumulative clock from the first line of createAskExecution (`requestStartedAt`). The only one that includes request setup. */
  | 'ELAPSED_FROM_REQUEST_START';

export interface AskTurnStageDefinition {
  kind: AskTurnStageKind;
  /** Where the clock starts. */
  start: string;
  /** Where the clock stops. */
  end: string;
  /** What is inside the span, including work that is easy to attribute to the wrong stage. */
  includes: string;
  /** True only when summing this stage with the other additive stages gives a meaningful total. */
  additive: boolean;
  /** For NESTED and CONCURRENT_SPAN: the stage it overlaps. */
  overlaps?: AskTurnStage;
  /** Observed on the success path, the failure path, or both. */
  observedOn: 'SUCCESS' | 'FAILURE' | 'SUCCESS_AND_FAILURE_SETUP';
}

export const ASK_TURN_STAGE_CONTRACT: Readonly<Record<AskTurnStage, AskTurnStageDefinition>> = Object.freeze({
  REQUEST_SETUP: {
    kind: 'DELTA',
    start: 'First line of createAskExecution (requestStartedAt).',
    end: 'The `startedAt` assignment, after the execution row is created and marked RUNNING and skill routing and follow-up resolution are done.',
    includes: 'Service-account eligibility, safety-first routing cascade, property access, discoverable-operation resolution, timezone context, the clientRequestId idempotency lookup, session create or reuse, execution row create and update, skill routing, follow-up resolution.',
    additive: true,
    observedOn: 'SUCCESS_AND_FAILURE_SETUP',
  },
  ROUTE_AND_EXECUTE: {
    kind: 'DELTA',
    start: '`startedAt` (end of request setup).',
    end: 'The operational-timeout race around executeOperation (or the clarification builder) resolves.',
    includes: 'Capability invocation, SUGGESTION_FINALIZE and an inner trust validation (both run inside executeOperation), the operational timeout wrapper. A timeout surfaces here.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  SUGGESTION_FINALIZE: {
    kind: 'NESTED',
    start: 'Immediately before finalizeSuggestedNextActions in executeOperation.finalize.',
    end: 'finalizeSuggestedNextActions returns.',
    includes: 'Candidate nomination, eligibility, exact-four selection and the persisted ledger write for an ordinary answer.',
    additive: false,
    overlaps: 'ROUTE_AND_EXECUTE',
    observedOn: 'SUCCESS',
  },
  SYNTHESIS: {
    kind: 'DELTA',
    start: 'End of ROUTE_AND_EXECUTE.',
    end: 'maybeSynthesizeDeterministicResult returns.',
    includes: 'The optional remote result-synthesis call when synthesis and remote generation are enabled for a deterministic operation; effectively zero otherwise.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  ACTIONS_FINALIZE: {
    kind: 'DELTA',
    start: 'End of SYNTHESIS.',
    end: 'The routing-clarification suggested-action finalizer returns.',
    includes: 'Only a routing clarification is finalized here; an ordinary answer is finalized earlier as SUGGESTION_FINALIZE inside ROUTE_AND_EXECUTE, so this is effectively zero for ordinary turns.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  TRUST_VALIDATION: {
    kind: 'DELTA',
    start: 'End of ACTIONS_FINALIZE.',
    end: 'The outer validateAskAnswerTrustPipeline result is taken.',
    includes: 'The turn-level answer-trust validation. An ordinary answer is also validated inside executeOperation, which is counted in ROUTE_AND_EXECUTE and not here.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  PERSIST_BASE: {
    kind: 'DELTA',
    start: 'The TRUST_VALIDATION mark.',
    end: 'The askExecution.update that stores the validated result returns.',
    includes: 'Trust-metric recording, the skill result-block allowlist assertion, and the single database write that makes the base result durable (the write dominates).',
    additive: true,
    observedOn: 'SUCCESS',
  },
  DURABLE_BASE_RESULT: {
    kind: 'ELAPSED_FROM_EXECUTION_START',
    start: '`startedAt` (end of request setup).',
    end: 'Immediately after PERSIST_BASE.',
    includes: 'ROUTE_AND_EXECUTE through PERSIST_BASE. Excludes REQUEST_SETUP.',
    additive: false,
    observedOn: 'SUCCESS',
  },
  POST_PERSIST_EVENTS: {
    kind: 'DELTA',
    start: 'End of PERSIST_BASE.',
    end: 'Right after the ask_execution_duration_seconds observation, following completion, lifecycle and handoff-outcome recording.',
    includes: 'Awaited post-persist event and telemetry writes. Fire-and-forget lifecycle work is not awaited and is not in this span.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  INLINE_EXTRACTION: {
    kind: 'DELTA',
    start: 'End of POST_PERSIST_EVENTS (the property summary read is started here).',
    end: 'runConversationalCaptureForTurn and, when it ran, the awaited property summary promise have both settled.',
    includes: 'The inline conversational-capture tail with its 1.5 second budget. When extraction runs it also contains any property-summary latency that exceeds the extraction. Near zero when no property is in scope or the pre-filter misses.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  PROPERTY_SUMMARY: {
    kind: 'DELTA',
    start: 'End of INLINE_EXTRACTION.',
    end: 'The property summary promise is awaited once more.',
    includes: 'Only the residual wait left over after INLINE_EXTRACTION. It is NOT the cost of the property summary read and is near zero whenever extraction took at least as long; use PROPERTY_SUMMARY_READ for the read itself.',
    additive: true,
    observedOn: 'SUCCESS',
  },
  PROPERTY_SUMMARY_READ: {
    kind: 'CONCURRENT_SPAN',
    start: 'Immediately before propertySummary(executionPropertyId) is called, at the start of the inline tail.',
    end: 'That promise resolves.',
    includes: 'The property-label read. Runs concurrently with INLINE_EXTRACTION. Not observed if the read rejects.',
    additive: false,
    overlaps: 'INLINE_EXTRACTION',
    observedOn: 'SUCCESS',
  },
  TURN_TOTAL: {
    kind: 'ELAPSED_FROM_EXECUTION_START',
    start: '`startedAt` (end of request setup).',
    end: 'Just before mapPersistedExecution builds the response.',
    includes: 'ROUTE_AND_EXECUTE through PROPERTY_SUMMARY. EXCLUDES REQUEST_SETUP, so it under-reports the request a homeowner waits for; use REQUEST_TOTAL for that.',
    additive: false,
    observedOn: 'SUCCESS',
  },
  REQUEST_TOTAL: {
    kind: 'ELAPSED_FROM_REQUEST_START',
    start: 'First line of createAskExecution (requestStartedAt).',
    end: 'Same point as TURN_TOTAL, just before mapPersistedExecution.',
    includes: 'REQUEST_SETUP plus everything in TURN_TOTAL. Excludes HTTP parsing, authentication middleware and response serialization, which run outside createAskExecution.',
    additive: false,
    observedOn: 'SUCCESS',
  },
  FAILED_REQUEST_TOTAL: {
    kind: 'ELAPSED_FROM_REQUEST_START',
    start: 'First line of createAskExecution (requestStartedAt).',
    end: 'After the failure result and its events are persisted, before the final property summary read and response mapping.',
    includes: 'Everything up to the failure, plus the failure persistence writes.',
    additive: false,
    observedOn: 'FAILURE',
  },
});

/** Stages whose durations tile the success path from request start to response, so their sum approximates REQUEST_TOTAL. */
export const ASK_TURN_ADDITIVE_STAGES: readonly AskTurnStage[] = ASK_TURN_STAGES.filter((stage) => ASK_TURN_STAGE_CONTRACT[stage].additive);

/** Labels each metric may carry. All are registry-bounded; none is homeowner text, an id, or a captured value. */
export const ASK_TURN_METRIC_LABELS = Object.freeze({
  ask_turn_stage_duration_seconds: ['stage', 'operation'],
  ask_turn_failures_total: ['after_stage', 'timeout'],
  ask_inline_extraction_total: ['outcome'],
} as const);

/** What the success-path additive stages do NOT cover, stated so a reader does not assume otherwise. */
export const ASK_TURN_UNMEASURED = Object.freeze([
  'Idempotent replay: a request that reuses a clientRequestId returns before any stage is observed.',
  'Confirmation (confirmAskExecution), retry, clarification-resolution and capture-submit turns: none observes the stage histogram. Where one of them calls executeOperation it can add a SUGGESTION_FINALIZE observation with no enclosing stages.',
  'Early returns before the execution phase (for example a safety or property-scope refusal) are not observed as stages.',
  'HTTP parsing, authentication, rate limiting and response serialization outside createAskExecution.',
  'Database round trips per turn: no safe per-turn query-count attribution exists (see docs/operations/ASK_TURN_PERFORMANCE_MEASUREMENT.md).',
  'Fire-and-forget work started during the turn (lifecycle recording, background extraction completion by the worker).',
] as const);

export { ASK_INLINE_EXTRACTION_OUTCOMES };
