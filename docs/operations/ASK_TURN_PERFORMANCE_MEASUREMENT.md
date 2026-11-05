# Ask Turn Performance Measurement

**Date:** November 5, 2026

**Scope:** Findings Implementation Plan, Phase 3 (`docs/architecture/ASK_COZY_TECHNICAL_ARCHITECTURE_FINDINGS_IMPLEMENTATION_PLAN.md` §7). How to measure where one Ask turn's time goes, before any streaming, batching, query-reduction or async-tail change is chosen.

**Status:** measurement contract and instrumentation are built. No measurement has been taken. This document sets no latency target, and no optimization may start until the owner's measurements below exist and FR-PERF-001 targets are approved.

**Evidence labels:** metric definitions and nesting below are **code-traced** from `createAskExecution.ts`, `executeOperation.ts` and `conversationalCapture.ts` and locked by `tests/ask/askTurnStageContract.test.js` (executed, no database). Nothing here is a production measurement.

## 1. Audit of the existing metrics

| Metric | Start and end | Delta or cumulative | Note |
|---|---|---|---|
| `ask_turn_stage_duration_seconds{stage,operation}` | Per stage, see the contract | Mixed | 15 stages after Phase 3; the contract file `apps/backend/src/services/ask/askTurnStageContract.ts` defines each one |
| `ask_execution_duration_seconds{operation,generation_mode}` | `startedAt` to just after the post-persist events (success), or to the end of the failure branch | Cumulative from execution start | Excludes request setup; on success it stops **before** inline extraction and the property summary, so it is not `TURN_TOTAL` |
| `ask_executions_total{operation,status,generation_mode}` | Counter | n/a | Terminal status per turn |
| `ask_model_duration_seconds{stage,outcome}` | Around one optional model call (`result_synthesis`, `grounded_guidance`) | Span | `result_synthesis` sits inside `SYNTHESIS`; `grounded_guidance` inside `ROUTE_AND_EXECUTE`. Result synthesis is **off by default** (`ASK_RESULT_SYNTHESIS_ENABLED`) |
| `ask_suggested_actions_pipeline_duration_seconds{mode}` | The shared finalizer's own `durationMs` | Span | Approximately `SUGGESTION_FINALIZE`, which is nested in `ROUTE_AND_EXECUTE` |
| `ask_skill_*` (routing, context providers and composition, adapter, canonical operation, presentation) | Hand-timed spans | Spans | Skill routing is inside `REQUEST_SETUP`; the rest are inside `ROUTE_AND_EXECUTE`. Not re-audited beyond their registered definitions here |
| `ask_inline_captures_total{operation,outcome}` | Counter | n/a | Inline capture **form** lifecycle, not conversational extraction |

Findings from the audit (all code-traced):

1. **`TURN_TOTAL` and `DURABLE_BASE_RESULT` start after request setup.** The `startedAt` clock is created after eligibility, safety routing, property access, the idempotency lookup, session handling, execution-row creation and skill routing. Before Phase 3, that whole segment was in no metric, so the request a homeowner waited for was under-reported by an unknown amount.
2. **Stages are not all additive.** `SUGGESTION_FINALIZE` is nested inside `ROUTE_AND_EXECUTE`; `DURABLE_BASE_RESULT`, `TURN_TOTAL`, `REQUEST_TOTAL` are cumulative clocks; `PROPERTY_SUMMARY_READ` runs concurrently with `INLINE_EXTRACTION`.
3. **`PROPERTY_SUMMARY` was misleading.** It is only the wait left over after inline extraction, not the cost of the read. `PROPERTY_SUMMARY_READ` now times the read itself.
4. **Inline extraction outcomes were invisible.** A pre-filter miss, a completed attempt, a 1.5 second budget expiry and a failed attempt all looked like a short or long `INLINE_EXTRACTION`.
5. **Failure and timeout attribution did not exist.** Failures were counted by status only.

## 2. What Phase 3 added (only where the existing metrics could not answer)

| Addition | Answers |
|---|---|
| Stage `REQUEST_SETUP` | The previously unmeasured segment before the execution clock |
| Stage `REQUEST_TOTAL` | Request-level latency inside `createAskExecution` (setup plus the whole turn) |
| Stage `FAILED_REQUEST_TOTAL` | Latency of a turn that ended in failure |
| Stage `PROPERTY_SUMMARY_READ` | The true cost of the property label read |
| Counter `ask_turn_failures_total{after_stage,timeout}` | Which stage a failure followed, and whether the operational timeout fired |
| Counter `ask_inline_extraction_total{outcome}` | `PREFILTER_MISS`, `INTENT_NOT_PERSISTED`, `COMPLETED`, `BUDGET_TIMEOUT`, `ATTEMPT_FAILED` |

All labels are registry-bounded or fixed enums. No operation, user, property, session, execution, message, prompt or captured value is a label, and the test fails if a label name suggests one. `TURN_TOTAL` keeps its old meaning so existing dashboards do not shift.

## 3. Stage definitions

The authoritative definitions are in `askTurnStageContract.ts`. In order along the success path:

`REQUEST_SETUP` → `ROUTE_AND_EXECUTE` (contains `SUGGESTION_FINALIZE`) → `SYNTHESIS` → `ACTIONS_FINALIZE` → `TRUST_VALIDATION` → `PERSIST_BASE` → `POST_PERSIST_EVENTS` → `INLINE_EXTRACTION` (concurrent with `PROPERTY_SUMMARY_READ`) → `PROPERTY_SUMMARY` (residual wait).

The additive stages are `REQUEST_SETUP`, `ROUTE_AND_EXECUTE`, `SYNTHESIS`, `ACTIONS_FINALIZE`, `TRUST_VALIDATION`, `PERSIST_BASE`, `POST_PERSIST_EVENTS`, `INLINE_EXTRACTION`, `PROPERTY_SUMMARY`. Their sum should approximate `REQUEST_TOTAL`; the difference is unattributed time and should be reported.

## 4. Not measured (stated so nobody assumes otherwise)

- **Idempotent replay** and **early returns** before the execution phase (a safety or property-scope refusal) observe no stage.
- **Confirmation, retry, clarification-resolution and capture-submit turns** do not observe the stage histogram.
- **HTTP parsing, authentication, rate limiting and response serialization** run outside `createAskExecution`.
- **Fire-and-forget work** (lifecycle recording, the worker finishing a timed-out extraction).
- **Database round trips per turn.** The backend has no Prisma instrumentation (`$on`, `$extends`, `$use`) today. A per-turn query count would need a new global hook plus request-scoped attribution through `AsyncLocalStorage`, and the code already uses `enterWith` for the property timezone, so cross-talk between concurrent turns is a real risk. It was **not built**: query count stays **unresolved**, and the named stages above (each dominated by a known repository call) stand in for it. If the measurements show a stage that needs query-level evidence, that is a separate, reviewed change that must log no SQL or parameters.

## 5. Scenario matrix

Each scenario names an operation class; the owner chooses a representative message of that class. Use a test home and account, never real homeowner content.

| Id | Scenario | Operation class (registry id) | Toggle or condition | Stages and counters to read |
|---|---|---|---|---|
| S1 | Deterministic read | `PROPERTY_SUMMARY` or `RECALL_REVIEW` | Defaults | All additive stages; `SYNTHESIS` should be near zero |
| S2 | Write proposal | `HOME_WORK_ITEM_COMMAND` or `MATERIAL_SPEC_ADD` | Defaults | `ROUTE_AND_EXECUTE`, `PERSIST_BASE` |
| S3 | Confirmation of S2 | same operation | n/a | **Not stage-instrumented**; record wall-clock from the client or the access log |
| S4 | Clarification | any ambiguous message | n/a | `ACTIONS_FINALIZE` is populated only here |
| S5a | Remote synthesis disabled | a deterministic read | `ASK_RESULT_SYNTHESIS_ENABLED=false` (default) | `SYNTHESIS` near zero |
| S5b | Remote synthesis enabled | the same read | `ASK_RESULT_SYNTHESIS_ENABLED=true` and remote generation on | `SYNTHESIS`, `ask_model_duration_seconds{stage="result_synthesis"}` |
| S6 | Extraction pre-filter miss | a message with no home fact | Defaults | `ask_inline_extraction_total{outcome="PREFILTER_MISS"}`; `INLINE_EXTRACTION` small |
| S7 | Inline extraction success | a message stating a home fact | Defaults | `outcome="COMPLETED"`; `INLINE_EXTRACTION`, `PROPERTY_SUMMARY_READ` |
| S8 | Extraction budget expiry and fallback | a fact message when the model is slow | Observed, not forced | `outcome="BUDGET_TIMEOUT"`; `INLINE_EXTRACTION` capped near the 1.5 s budget |
| S9 | Operational timeout | observed, not forced | n/a | `ask_turn_failures_total{timeout="true"}` |

Run each scenario enough times for a stable p50 and p95 at the histogram's bucket resolution, and report the sample count. Do not invent a failure to fill S8 or S9; report them as unobserved if they did not occur.

## 6. Owner request (operational owner: repository owner, to confirm)

Run S1–S7 against the deployed backend, then return the following. Query output only, with no homeowner content:

1. Deployment revision (git SHA of the running image) and whether it includes the Phase 3 instrumentation (it must, or `REQUEST_SETUP`, `REQUEST_TOTAL` and the new counters will be empty).
2. Time range and scrape interval.
3. For each scenario, the queries below, with the sample count.
4. Any scenario that could not be run and why.

Existing histograms are worth reading first: the pre-Phase-3 stages already answer part of the question for the execution phase. Only `REQUEST_SETUP`, `REQUEST_TOTAL`, the failure counters, the extraction outcomes and the real property-summary cost need a deployment that contains Phase 3.

```promql
# p50 / p95 per stage (replace [1h] with the measurement window)
histogram_quantile(0.5,  sum by (le, stage) (rate(ask_turn_stage_duration_seconds_bucket[1h])))
histogram_quantile(0.95, sum by (le, stage) (rate(ask_turn_stage_duration_seconds_bucket[1h])))

# the same for one operation
histogram_quantile(0.95, sum by (le, stage) (rate(ask_turn_stage_duration_seconds_bucket{operation="PROPERTY_SUMMARY"}[1h])))

# sample counts per stage
sum by (stage) (increase(ask_turn_stage_duration_seconds_count[1h]))

# mean of each additive stage and of the request total, to report the unattributed remainder
sum by (stage) (rate(ask_turn_stage_duration_seconds_sum[1h])) / sum by (stage) (rate(ask_turn_stage_duration_seconds_count[1h]))

# failures by the last completed stage, and timeouts
sum by (after_stage, timeout) (increase(ask_turn_failures_total[1h]))

# inline extraction outcomes
sum by (outcome) (increase(ask_inline_extraction_total[1h]))
```

The histogram's finest bucket is 5 ms and its largest finite bucket is 30 s, so a p50 or p95 outside that range cannot be read exactly; say so when it happens.

## 7. Decision note (written only after the measurements exist)

After the owner returns the evidence, a short note chooses the smallest remedy the evidence supports: remove redundant reads or writes, batch independent event persistence, move optional work after the durable response boundary, or design a progressive transport. Streaming is not the default conclusion. The note records the evidence it rests on, the approved FR-PERF-001 targets, and the stage that motivated the choice. Until then this phase is measurement only, and optimization implementation does not begin.
