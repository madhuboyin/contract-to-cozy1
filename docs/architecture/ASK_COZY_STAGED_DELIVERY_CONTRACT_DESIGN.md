# Ask Cozy — Staged Response Delivery: Stage Contract Design (D-03)

**Status:** Revision 2 (2026-11-03, after external review). Conditionally approved as a **dormant target architecture**: no Prisma or staged-delivery code until the §3 gate passes. Nothing here is built except one timing metric (`SUGGESTION_FINALIZE`). Companion to `ASK_COZY_UX_CONSOLIDATED_IMPLEMENTATION_PLAN.md` §5 D-03 and Phase 7B.
**Date:** 2026-11-03
**Evidence labels (per `AUDIT_METHODOLOGY.md` #1):** **[traced]** = read in source, not run; **[inferred]** = extrapolated; **[decision]** = a choice this document asks the owner to make. Nothing in this document is *executed*: no turn was timed, no database or browser ran.

## 1. Recommendation in one paragraph

Do not build streaming yet. Keep this contract as a dormant target and let measurement decide whether Tier 1 is ever built (§3). The code shows that the work after the base result is persisted is small and bounded, and that suggested-action finalization already happens *before* synthesis. So the only latency staging can recover is synthesis time before the first durable write, plus the bounded inline-extraction wait. If the gate in §3 does not pass, ship nothing and keep the single-response contract. If it passes, build **Tier 1**: split the single persist into a validated base write and a later enrichment write, delivered by bounded polling over a new monotonic revision. SSE (Tier 2) is justified only if polling latency itself proves visible.

## 2. What exists today [traced]

All of this is read from source; nothing was run.

1. **One request, one response.** `createAskExecution` returns the whole `AskExecutionResponse` when the turn finishes (`apps/backend/src/services/ask/execution/createAskExecution.ts`). The client waits on that `POST` (`useAskRequest.ts`). There is no server-sent-event or stream endpoint anywhere in `apps/backend/src` or `apps/frontend/src` (a search for `text/event-stream` found nothing).
2. **The row is `RUNNING` during the whole turn, with no partial content.** The execution is created `RECEIVED`, flipped to `RUNNING` once routed, and written again only at the end.
3. **Actions are finalized, and trust is validated, *inside* `executeOperation`, before synthesis.** For an ordinary operation, `executeOperation()` calls `finalizeSuggestedNextActions()` and then `validateAskAnswerTrustPipeline()` before returning [traced: `executeOperation.ts` `finalize`]. Back in `createAskExecution`, the order is: `executeOperation` (includes action finalization and a first trust validation) → `maybeSynthesizeDeterministicResult` → (for routing clarifications only) `finalizeSuggestedNextActions` → a second `validateAskAnswerTrustPipeline` on the synthesized result → one `prisma.askExecution.update` carrying `status`, `resultJson`, `completedAt`. Consequences: (a) the base result already contains its governed actions; synthesis runs on the action-finalized result; (b) validation runs twice for an ordinary answer; (c) a "base first" design splits the final write, but a separate `ACTIONS_READY` stage would require extracting the finalizer out of `executeOperation`, which is a much larger change and is **not** proposed (§4).
4. **After that write**: audit events, then inline extraction under a **1,500 ms budget** (`INLINE_EXTRACTION_BUDGET_MS`), with a durable `ASK_EXTRACTION_REQUESTED` event and a worker fallback. If the budget expires, children are created later and the homeowner is told by a notification, not by the response.
5. **Late children are already durable and reload-visible.** `getAskSession` returns every execution row in the session, children included, so a reload shows children that arrived after the response.
6. **The client merges by `executionId` and `updatedAt`, plus `viewState.revision` for result views** (`mergeResultExecutions`). There is **no per-execution revision**. `updatedAt` is a wall-clock `@updatedAt` timestamp, so two writes in the same millisecond, or clock skew between app instances, cannot be ordered by it.
7. **Orphan recovery already exists** for `RUNNING` rows: after `executionTimeoutMs + 30 s` (`reclaimOrphanedRunningExecution`) the row becomes `FAILED_RETRYABLE`. Any staged design must stay compatible with this.
8. **Timing metrics (Phase 7A).** `ROUTE_AND_EXECUTE`, `SYNTHESIS`, `ACTIONS_FINALIZE`, `TRUST_VALIDATION`, `PERSIST_BASE`, `POST_PERSIST_EVENTS`, `INLINE_EXTRACTION`, `PROPERTY_SUMMARY` are per-stage deltas; `DURABLE_BASE_RESULT` and `TURN_TOTAL` are cumulative from turn start. **Correction to revision 1:** `ACTIONS_FINALIZE` times real work only for routing clarifications; for ordinary answers it is the time to assign a variable, and the real finalizer time is inside `ROUTE_AND_EXECUTE`. A new `SUGGESTION_FINALIZE` stage now times the finalizer inside `executeOperation` (it overlaps `ROUTE_AND_EXECUTE`, so do not add the two). Samples exist only from the first deploy that includes it; `TRUST_VALIDATION` likewise times only the second validation.

## 3. The decision gate (what the data must show)

Do not stage regardless of data. Build Tier 1 only when a representative sample shows **all** of:

1. At least **100 eligible turns across at least 7 days**, with enough per-operation volume that one rare slow operation cannot drive the decision. "Eligible" means a deterministic read/answer operation (§8), not confirmation, capture or write turns.
2. Eligible-operation `TURN_TOTAL` **p75 ≥ 2.5 s**.
3. `SYNTHESIS` **p75 ≥ 1.5 s** and at least **30%** of `DURABLE_BASE_RESULT`.
4. A modeled base-first split improves p75 time to first validated result by **at least 750 ms**.
5. The slow operations are at least **10% of eligible Ask turns**.

Track `INLINE_EXTRACTION` separately. Frequent 1.5 s extraction timeouts justify returning before extraction or improving extraction; they do not by themselves justify a multi-stage synthesis contract. `SUGGESTION_FINALIZE` is recorded so that, if action finalization turns out to be slow, that can be seen and weighed on its own; no threshold depends on it today.

## 4. Stages, status and completion

### Stage vocabulary

| Stage | Meaning | Terminal? |
|---|---|---|
| `ROUTED` | Operation chosen, row `RUNNING`, no result yet | no |
| `BASE_RESULT_READY` | Deterministic blocks, **including governed actions**, persisted and trust-validated | no |
| `PRESENTATION_ENRICHED` | Optional synthesized summary persisted and re-validated | no (may be skipped) |
| `SETTLED` | Nothing further is expected on this execution | **yes** |

There is **no `ACTIONS_READY` stage**: actions are finalized before synthesis today (§2.3), so they are part of the base. There is **no `CAPTURE_READY` stage**: children are separate executions that are discovered independently (§10). If `SUGGESTION_FINALIZE` later proves slow, a separate actions stage can be added by extracting the finalizer from `executeOperation`; that is a distinct design, not part of this one.

### Settled reasons (complete enum)

`COMPLETE`, `SYNTHESIS_SKIPPED`, `SYNTHESIS_FAILED`, `ACTIONS_UNAVAILABLE`, `INLINE_EXTRACTION_TIMED_OUT`, `INLINE_EXTRACTION_FAILED`, `INTERRUPTED_AFTER_BASE`.

Interruption **before** any validated base is not a settled reason: it follows the existing path (`FAILED_RETRYABLE`, error block). Interruption **after** a validated base keeps the base and settles as `INTERRUPTED_AFTER_BASE`, a recoverable partial success.

### Status and completion model (chosen)

For staged rows, **`status` stays `RUNNING` until settlement**, and completion is defined by `stage === SETTLED`. This is the recommended model from review, chosen because every existing consumer of a terminal status (below) then keeps its meaning without an audit of each one for early firing. The validated base is readable meanwhile because the row's `resultJson` holds it and the response exposes `stage`, `revision` and the base blocks.

At `SETTLED`, in one compare-and-set write: `status` becomes the validated result's own semantic status (`ANSWERED`, `COMPLETED`, `READY_WITH_LIMITATIONS`, …), `completedAt` is set, and `settledReason` is recorded. **`completedAt` is written only on settlement.** All of the following happen **at settlement, not at base readiness**, after that write succeeds:

| Behavior today [traced in `createAskExecution.ts`] | Staged rule |
|---|---|
| `completedAt` set when the status is terminal | only at `SETTLED` |
| `recordSuggestedActionCompleted` retires a selected suggested action | only at `SETTLED` |
| `recordAskCapabilityLifecycle(…, 'RESULT')` | only at `SETTLED` |
| `askExecutionsTotal` and duration histogram | recorded once, at `SETTLED`; `DURABLE_BASE_RESULT` separately records first-valid-result time |
| Completed-history and "recent completed turns" queries | a `RUNNING` row is not completed, so an unsettled row is excluded exactly as today |
| Orphan reclaim (`reclaimOrphanedRunningExecution`, selects `status = RUNNING`) | still selects the row; for a staged row with a validated base it settles `INTERRUPTED_AFTER_BASE` and keeps the base instead of replacing it with an error |
| Pending-work listing | **audit item** (below) |

**Pre-build consumer audit (required, not done):** before any staged write is enabled, list and review every reader of `status`, `completedAt`, and `RUNNING`, including pending work (`getAskPendingWork`), history/recent queries, the front end's handling of a `RUNNING` row that carries blocks (the response schema must permit blocks on a `RUNNING` staged row), analytics, and the notification/continuation services. This document asserts the model; it does not claim the audit has been done.

## 5. Persisted versus transient

**Persisted (on the execution row, so reload and any other client see the same thing):** `stage`, `revision`, `settledReason`, and the result JSON as of that revision.

**Transient (never persisted, never relied on for correctness):** "Cozy is still preparing more" spinner state, stream connection state, and the client's polling timer. Losing every transient value must leave a correct, readable transcript.

**Not persisted as stage state:** anything derivable from rows already stored (child executions come from `parentExecutionId`; they are not copied into the parent).

## 6. Monotonic revision

Add to `AskExecution` a non-null integer `revision` (default 0), a `stage` (default `SETTLED` so every existing row and every non-staged new row reads as settled), and a nullable `settledReason` (null for non-staged rows). A staged turn creates its row at `ROUTED`, revision 0. `completedAt` stays null until settlement (§4). **Not changed in the repository yet:** the schema edit waits for the §3 gate. Per the repo rule, edit `schema.prisma` and run `prisma db push`; no migration file.

Every stage write is a **compare-and-set**, the same pattern as the 3B reconciliation fix:

```
UPDATE ... SET stage = :next, revision = revision + 1, resultJson = :json
WHERE id = :id AND revision = :expected AND stage = :expectedPrev AND status = 'RUNNING'
```

Zero rows updated means another writer advanced the row; the stale writer stops without writing (`AUDIT_METHODOLOGY.md` #19: the commit, not just the start, re-checks the claim). `updatedAt` is not used for ordering by staged clients.

The response carries `{ stage, revision }`. The client merge rule becomes: for the same `executionId`, higher `revision` wins; equal revision is a no-op (duplicate delivery is harmless); `updatedAt` remains only a tiebreak for legacy rows with no revision.

**Why a column and not `AskExecutionEvent` rows as the cursor:** events are append-only audit and are not read on the hot path; a cursor on the row makes "latest persisted revision" one primary-key read, which is exactly what reload and polling need. Events still record each transition for audit and for the telemetry in §13.

## 7. Trust-validation timing

This is the highest-risk part of the design, so the rule is conservative:

1. **Nothing becomes visible before it is validated.** `BASE_RESULT_READY` is written only with the output of `validateAskAnswerTrustPipeline` run on the **base** result. Today an ordinary answer is validated inside `executeOperation` (on the base) and again after synthesis (on the presented result) [traced, §2.3].
2. **Enrichment is validated again before it replaces anything.** `PRESENTATION_ENRICHED` writes only a result that passed the same pipeline. If it fails, the base stays and the turn settles with `SYNTHESIS_FAILED`.
3. **Enrichment may add or replace the summary block only.** It may not remove, reorder or change evidence blocks, figures or actions of the base. This keeps "the answer I started reading" stable. **[decision]** If the owner wants enrichment to be able to change any figure, the contract must also forbid readers acting on the base until `SETTLED`; this document recommends against that.
4. The existing rule that action ids must be allowlisted and the "never link to desktop pages" validator both run at every stage that carries actions or links.

## 8. When actions become actionable

- Governed actions are **part of `BASE_RESULT_READY`**, because they are finalized before synthesis (§2.3). They are enabled as soon as the base is durable. Enrichment must not add, remove or change actions; whether `synthesizeAskResult` can currently touch actions is not verified here and must be checked (and tested) before enrichment ships.
- If a later design adds a separate actions stage, controls render disabled with a plain reason until that stage is durable, and the client enables a control only after reading a `revision` that includes it, never from a timer.
- Confirmation, capture and any write path are **never** staged: a `NEEDS_CONFIRMATION` or `NEEDS_CONTEXT` result is delivered in one piece with its card, exactly as today. Staging applies only to read/answer turns from deterministic operations. This avoids any interaction with the consent rules (D-02) and with the CAS-guarded reconciliation of 3B.

### Delivery tiers

**Tier 1 — polling (recommended first).** The `POST` returns as soon as `BASE_RESULT_READY` is persisted, with `stage` and `revision`. The client polls `GET /ask/executions/:id` (already exists, authenticated, owner-scoped [traced]) with a bounded schedule (suggested: 400 ms, 800 ms, 1.6 s, then every 2 s, stopping at `SETTLED` or a 20 s active-polling cap). After the cap, the card does **not** stay silently unsettled: it shows a passive line, "More details are still being prepared. They will appear in this conversation.", and refreshes on window focus/visibility and on session reload. The cap (20 s) is shorter than the server's settle deadline (`executionTimeoutMs + 30 s`, up to 150 s), so the passive state is the normal path for slow rows, not an edge case. Each poll returns the full latest result and revision. No new transport, no new auth surface, and reload behaves identically because it is the same read.

**Tier 2 — authenticated stream (only if Tier 1 is visibly too slow).** An SSE endpoint per execution emits `{executionId, stage, revision}` notifications; the client then reads the full result with the same `GET`. Events are hints, never the data source, so a dropped, duplicated or reordered event cannot corrupt state, and polling remains the fallback. SSE is new infrastructure on this platform: none exists today, and production runs on a Raspberry Pi behind k3s [from project memory], so proxy buffering and idle-timeout behavior must be verified live before it is relied on. **[decision]** Tier 2 is not approved by this document.

## 9. Reload and reconnect

- A reload reads the latest row via the normal session read. It shows whatever stage is durable. If `stage` is not `SETTLED` and the row is younger than the settle deadline, the client resumes polling from the current revision; otherwise it shows the row as-is.
- **Settle deadline and abandonment.** A staged row whose process died would otherwise be unsettled forever. Extend the existing orphan reclaim: a row with `stage != SETTLED` and no revision advance for `executionTimeoutMs + 30 s` is moved to `SETTLED` with `settledReason = INTERRUPTED_AFTER_BASE`, keeping the persisted base. Unlike today's reclaim of a `RUNNING` row (which replaces the result with an error), a staged row that already has a validated base **keeps** it. [traced: current reclaim overwrites `resultJson` with an error block; this is a deliberate difference to specify.]
- The original request connection is never required. If the `POST` response is lost after the base was persisted, the client's existing idempotent retry (`userId + clientRequestId` unique) finds the row and returns its latest state.

## 10. Children are their own executions

Children are not part of the parent's stage machine. They already deduplicate by `userId_clientRequestId` and are created in one transaction with a durable event and claim [traced]; this design adds no child creation path and no capture stage.

- The parent reaches `SETTLED` once **inline** extraction has ended: finished (`COMPLETE`), failed (`INLINE_EXTRACTION_FAILED`) or run past its 1.5 s budget (`INLINE_EXTRACTION_TIMED_OUT`). It does **not** claim the child set is final.
- Delayed children created later by the worker are discovered the way they are today: a durable event plus a notification, and the normal session read (`getAskSession` returns every execution row in the session). The client merges them by `executionId`. A client that stopped polling at `SETTLED` therefore loses nothing.
- Children never reorder user turns: a child is ordered by `createdAt` within the session, as today.
- The 3B reconciliation (filling the parent's routed event form) bumps the parent's `resultJson`; under staging it goes through the same CAS and bumps `revision`, so it cannot clobber a newer stage, and it must happen before settlement or as a revision after it only if the CAS permits (a settled row is `status != RUNNING`, so the CAS in §6 refuses; reconciliation after settlement is therefore not available and the event proceeds as an ordinary child, which is the safe outcome 3B already defines).

## 11. Late-stage failure presentation

- The base answer is **never erased** by a later failure (acceptance criterion in the plan). A failed enrichment leaves the base visible and settles with the matching `settledReason`.
- The user sees, at most, one calm line under the answer ("Some extras couldn't load. Your answer above is complete."), never an error card replacing content. Extraction failure shows nothing extra, because the homeowner did not ask for children; the worker retry and notification remain the recovery path.
- Retry is not offered for enrichment (it is optional). It remains the existing retry for a failed base.

## 12. Accessibility announcements

- One polite live region per execution card, announcing only **user-meaningful transitions**: "Answer ready" at `BASE_RESULT_READY`, and "More details added" at `PRESENTATION_ENRICHED` (only if the visible summary changed). Duplicate or skipped stages announce nothing.
- No announcement for revisions that change nothing visible. Content swaps must not move focus or scroll position; the summary replacement occurs in place at fixed block identity. If a later design adds a separate actions stage, disabled-pending actions are exposed with `aria-disabled` and their reason as accessible description, not removed from the tab order. `prefers-reduced-motion` already disables the card's reveal motion and applies here.

## 13. Telemetry

Keep the existing histogram. Add: first-durable-result vs settled time as separate series (`DURABLE_BASE_RESULT` exists; add `SETTLED_TOTAL`), a counter of `settledReason`, a counter of CAS-lost writes, and poll count per execution. **No query text or answer content is recorded** (consistent with the search and analytics rules).

## 14. Compatibility and rollout

- **Old clients** ignore `stage` and `revision` and receive, for a staged turn, a base result with status `ANSWERED`: they would render it as final and never poll, missing enrichment. To avoid a half-answer for them, the server stages **only when the request carries `stagedDeliveryVersion: 1`** (a new optional integer) **and the server recognizes that exact version**; otherwise it behaves exactly as today. A boolean would not distinguish future stage names, polling rules or merge rules. This keeps the single-response contract fully intact as the default.
- Operations opt in individually (deterministic read operations first). No operation changes behavior until it is listed.
- Rollback is removing operations from the opt-in list; rows already written remain valid because `stage` defaults to `SETTLED`.

## 15. Adversarial pass (`AUDIT_METHODOLOGY.md` #7)

For each strong claim, the scenario that would falsify it:

1. *"Nothing is visible before it is validated."* **Falsifier:** the base is persisted by an existing code path that skips validation (for example `reclaimOrphanedRunningExecution` or the failure branch writing `resultJson`). **Check needed at build time:** every writer of `resultJson` on a staged row must go through the CAS helper; add a test that scans for direct `askExecution.update` with `resultJson` in the ask services.
2. *"Duplicate events are harmless."* **Falsifier:** two app instances serve polls and a lagging replica returns revision N after the client saw N+1. **Mitigation:** client ignores any lower revision; the DB is single-primary [inferred: no read replicas were found, not searched exhaustively].
3. *"A reload converges."* **Falsifier:** the process dies between `BASE_RESULT_READY` and the next stage, so the row is unsettled. **Covered by** the §9 interruption rule; its timing relies on `executionTimeoutMs`, which is configurable (default 15 s, max 120 s [traced]) so the deadline must read the control, not a constant.
4. *"Completion semantics are preserved."* **Falsifier:** a staged write sets `completedAt` or retires a suggested action at base readiness. **Check at build time:** the §4 table is a test list; the consumer audit is a precondition.
5. *"Staging helps."* **Falsifier:** synthesis is fast and extraction is bounded at 1.5 s, so there is nothing to recover. **This is why §3 gates the build on data**, not on this design.
6. *"Actions never fire early."* **Falsifier:** enrichment changes an action the homeowner already used, or the base is shown before its actions were validated. **Rules:** actions are part of the validated base (§2.3); enrichment may not change them (§7); the second validation sees the whole result.
7. *"Children don't reorder turns."* **Falsifier:** a child persisted before its parent's base is durable becomes visible via the session read. **Today** the child is created after the parent's single write [traced], so this cannot happen; under Tier 1 the base write still precedes extraction, so it still cannot. The ordering invariant to protect: extraction must start only after `BASE_RESULT_READY` is durable.
8. *"Staged rows stay compatible with existing consumers."* **Falsifier:** a reader treats a `RUNNING` row with blocks as in-flight and hides them, or pending-work lists it as stuck. **Not yet checked**: this is the §4 consumer audit.
9. *Non-claims.* This document does not claim current latency is a problem, that SSE works on the production proxy, or that the CAS will not add lock contention on a hot row; the last is expected to be negligible (one writer per row) but is unmeasured.

## 16. Owner decisions (2026-11-03) and what remains

1. **Stage names and the validation rule:** conditionally approved. Revision 2 replaces the status/completion model (§4) and removes `CAPTURE_READY` and `ACTIONS_READY` (children are their own executions; actions are in the base).
2. **Schema columns `stage`, `revision`, `settledReason`:** direction approved; **do not change Prisma until the §3 gate passes.** Defaults, `completedAt` and the complete enum are specified in §4 and §6. Use `prisma db push`; no migration file.
3. **Client opt-in:** approved as the versioned integer `stagedDeliveryVersion: 1` (§14).
4. **Delivery:** polling first; streaming deferred until polling is built, measured and shown inadequate (§8).
5. **Build thresholds:** the five-part gate in §3; no staging regardless of data.

**Remaining before this can be treated as final:** the consumer audit of terminal status/`completedAt`/`RUNNING` readers (§4), confirming that synthesis cannot alter actions (§8), and collecting the §3 sample. Until the gate passes, no staged-delivery code is written; the only shipped change is the `SUGGESTION_FINALIZE` timing metric.
