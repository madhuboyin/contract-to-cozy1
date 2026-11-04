# Ask Cozy — Staged Response Delivery: Stage Contract Design (D-03)

**Status:** Design for approval. Nothing here is built. Companion to `ASK_COZY_UX_CONSOLIDATED_IMPLEMENTATION_PLAN.md` §5 D-03 and Phase 7B.
**Date:** 2026-11-03
**Evidence labels (per `AUDIT_METHODOLOGY.md` #1):** **[traced]** = read in source, not run; **[inferred]** = extrapolated; **[decision]** = a choice this document asks the owner to make. Nothing in this document is *executed*: no turn was timed, no database or browser ran.

## 1. Recommendation in one paragraph

Do not build streaming yet. Approve the contract below as the target, but make implementation conditional on timing evidence from the `ask_turn_stage_duration_seconds` histogram (§3). The code shows that the work after the base result is already persisted is small and bounded, so the case for staging rests on one number the histogram will supply: how long synthesis and action finalization take *before* the first durable write. If that number is small, the right move is to ship nothing and keep the single-response contract. If it is large, build **Tier 1** (§8): split the single persist into a validated base write and a later enrichment write, delivered by bounded polling over a new monotonic revision. SSE is **Tier 2** and is justified only if polling latency itself proves visible.

## 2. What exists today [traced]

All of this is read from source; nothing was run.

1. **One request, one response.** `createAskExecution` returns the whole `AskExecutionResponse` when the turn finishes (`apps/backend/src/services/ask/execution/createAskExecution.ts`). The client waits on that `POST` (`useAskRequest.ts`). There is no server-sent-event or stream endpoint anywhere in `apps/backend/src` or `apps/frontend/src` (a search for `text/event-stream` found nothing).
2. **The row is `RUNNING` during the whole turn, with no partial content.** The execution is created `RECEIVED`, flipped to `RUNNING` once routed, and written again only at the end.
3. **The single durable result write comes after synthesis, action finalization and trust validation.** Order in the code: route and execute → `maybeSynthesizeDeterministicResult` → `finalizeSuggestedNextActions` → `validateAskAnswerTrustPipeline` → one `prisma.askExecution.update` carrying `status`, `resultJson`, `completedAt`. Consequence: a "base result first" design cannot just publish earlier. It has to **split this write**, and the trust validator today validates the *presented* (synthesized, actions-finalized) result, not the base.
4. **After that write**: audit events, then inline extraction under a **1,500 ms budget** (`INLINE_EXTRACTION_BUDGET_MS`), with a durable `ASK_EXTRACTION_REQUESTED` event and a worker fallback. If the budget expires, children are created later and the homeowner is told by a notification, not by the response.
5. **Late children are already durable and reload-visible.** `getAskSession` returns every execution row in the session, children included, so a reload shows children that arrived after the response.
6. **The client merges by `executionId` and `updatedAt`, plus `viewState.revision` for result views** (`mergeResultExecutions`). There is **no per-execution revision**. `updatedAt` is a wall-clock `@updatedAt` timestamp, so two writes in the same millisecond, or clock skew between app instances, cannot be ordered by it.
7. **Orphan recovery already exists** for `RUNNING` rows: after `executionTimeoutMs + 30 s` (`reclaimOrphanedRunningExecution`) the row becomes `FAILED_RETRYABLE`. Any staged design must stay compatible with this.
8. **Timing metrics already exist** (Phase 7A): `ROUTE_AND_EXECUTE`, `SYNTHESIS`, `ACTIONS_FINALIZE`, `TRUST_VALIDATION`, `PERSIST_BASE`, `POST_PERSIST_EVENTS`, `INLINE_EXTRACTION`, `PROPERTY_SUMMARY` are per-stage deltas; `DURABLE_BASE_RESULT` and `TURN_TOTAL` are cumulative from turn start.

## 3. The decision gate (what the data must show)

Everything after the first durable write is bounded by the extraction budget plus a property-summary read, so the maximum latency staging can recover after `DURABLE_BASE_RESULT` is roughly `INLINE_EXTRACTION` + `POST_PERSIST_EVENTS`. The part that staging could recover *before* it is `SYNTHESIS` + `ACTIONS_FINALIZE`. Staging is worth building only if, over a representative period, for the operations that matter:

| Question | Read from | Build Tier 1 only if |
|---|---|---|
| Does synthesis dominate time-to-first-durable-result? | p75/p95 of `SYNTHESIS` vs `DURABLE_BASE_RESULT` | synthesis is a material share (suggested threshold: p75 over 1.5 s **and** over 30% of `DURABLE_BASE_RESULT`) for a deterministic operation that the homeowner sees often |
| Does extraction hold the response open? | p95 of `INLINE_EXTRACTION` | it regularly sits at the 1.5 s ceiling |
| Is the total long enough to feel slow? | p75/p95 `TURN_TOTAL` | p75 over a threshold the owner chooses |

**[decision]** The thresholds are suggestions. The owner picks them, or says "stage regardless." No metric has been collected yet, so this document makes no claim about current latency.

## 4. Stages: names and terminality

Stages describe what is **durably persisted**, not what a process is doing. Each is a value of a new execution-level field `stage` (§6).

| Stage | Meaning | Terminal? |
|---|---|---|
| `ROUTED` | Operation chosen, row `RUNNING`, no result yet (today's state after routing) | no |
| `BASE_RESULT_READY` | Deterministic blocks persisted **and trust-validated** | no |
| `PRESENTATION_ENRICHED` | Optional synthesized summary persisted and **re-validated** | no (optional, may be skipped) |
| `ACTIONS_READY` | Governed next actions finalized and persisted | no |
| `CAPTURE_READY` | Deduplicated child capture executions attached | no (optional, may be skipped) |
| `SETTLED` | No further stage is expected | **yes** |

Rules:
- Stages are monotonic; a row never moves backwards. Skipped stages are allowed (a turn with no synthesis goes `BASE_RESULT_READY` → `ACTIONS_READY`).
- `SETTLED` is the only terminal stage. The existing `status` (`ANSWERED`, `COMPLETED`, `FAILED_*`, …) keeps its meaning and its terminality rules; `stage` is additive. A row can be `status = ANSWERED` and `stage = BASE_RESULT_READY` while enrichment is pending.
- `SETTLED` carries a **declared late-stage outcome**: `settledReason ∈ {COMPLETE, SYNTHESIS_SKIPPED, SYNTHESIS_FAILED, EXTRACTION_TIMED_OUT, EXTRACTION_FAILED, ACTIONS_UNAVAILABLE}` so a failure after the base is recorded, not inferred from absence.

## 5. Persisted versus transient

**Persisted (on the execution row, so reload and any other client see the same thing):** `stage`, `revision`, `settledReason`, and the result JSON as of that revision.

**Transient (never persisted, never relied on for correctness):** "Cozy is still preparing more" spinner state, stream connection state, and the client's polling timer. Losing every transient value must leave a correct, readable transcript.

**Not persisted as stage state:** anything derivable from rows already stored (child executions come from `parentExecutionId`; they are not copied into the parent).

## 6. Monotonic revision

Add to `AskExecution` a non-null integer `revision` (default 0) and a `stage` (default `SETTLED` so existing rows read as settled). **[decision: schema change]** Per the repo rule, edit `schema.prisma` and run `prisma db push`; no migration file.

Every stage write is a **compare-and-set**, the same pattern as the 3B reconciliation fix:

```
UPDATE ... SET stage = :next, revision = revision + 1, resultJson = :json
WHERE id = :id AND revision = :expected AND stage = :expectedPrev
```

Zero rows updated means another writer advanced the row; the stale writer stops without writing (`AUDIT_METHODOLOGY.md` #19: the commit, not just the start, re-checks the claim). `updatedAt` is not used for ordering by staged clients.

The response carries `{ stage, revision }`. The client merge rule becomes: for the same `executionId`, higher `revision` wins; equal revision is a no-op (duplicate delivery is harmless); `updatedAt` remains only a tiebreak for legacy rows with no revision.

**Why a column and not `AskExecutionEvent` rows as the cursor:** events are append-only audit and are not read on the hot path; a cursor on the row makes "latest persisted revision" one primary-key read, which is exactly what reload and polling need. Events still record each transition for audit and for the telemetry in §13.

## 7. Trust-validation timing

This is the highest-risk part of the design, so the rule is conservative:

1. **Nothing becomes visible before it is validated.** `BASE_RESULT_READY` is written only with the output of `validateAskAnswerTrustPipeline` run on the **base** result. This is a change: today validation runs once, on the fully presented result [traced, §2.3].
2. **Enrichment is validated again before it replaces anything.** `PRESENTATION_ENRICHED` writes only a result that passed the same pipeline. If it fails, the base stays and the turn settles with `SYNTHESIS_FAILED`.
3. **Enrichment may add or replace the summary block only.** It may not remove, reorder or change evidence blocks, figures or actions of the base. This keeps "the answer I started reading" stable. **[decision]** If the owner wants enrichment to be able to change any figure, the contract must also forbid readers acting on the base until `SETTLED`; this document recommends against that.
4. The existing rule that action ids must be allowlisted and the "never link to desktop pages" validator both run at every stage that carries actions or links.

## 8. When actions become actionable

- Actions are **absent from `BASE_RESULT_READY`** unless the operation's own result already includes governed actions that do not depend on suggested-next-action finalization. `finalizeSuggestedNextActions` (an async, governed step today [traced]) results appear at `ACTIONS_READY`.
- A control is rendered **disabled with a plain reason** ("Options are still loading") until the stage that governs it is durable. The client enables a control only after reading a `revision` whose stage includes it; it never infers readiness from a timer.
- Confirmation, capture and any write path are **never** staged: a `NEEDS_CONFIRMATION` or `NEEDS_CONTEXT` result is delivered in one piece with its card, exactly as today. Staging applies only to read/answer turns (status `ANSWERED`/`COMPLETED`/`READY_WITH_LIMITATIONS` from deterministic operations). This avoids any interaction with the consent rules (D-02) and with the CAS-guarded reconciliation of 3B.

### Delivery tiers

**Tier 1 — polling (recommended first).** The `POST` returns as soon as `BASE_RESULT_READY` is persisted, with `stage` and `revision`. The client polls `GET /ask/executions/:id` (already exists, authenticated, owner-scoped [traced]) with a bounded schedule (suggested: 400 ms, 800 ms, 1.6 s, then every 2 s, stopping at `SETTLED` or a 20 s cap). Each poll returns the full latest result and revision. No new transport, no new auth surface, and reload behaves identically because it is the same read.

**Tier 2 — authenticated stream (only if Tier 1 is visibly too slow).** An SSE endpoint per execution emits `{executionId, stage, revision}` notifications; the client then reads the full result with the same `GET`. Events are hints, never the data source, so a dropped, duplicated or reordered event cannot corrupt state, and polling remains the fallback. SSE is new infrastructure on this platform: none exists today, and production runs on a Raspberry Pi behind k3s [from project memory], so proxy buffering and idle-timeout behavior must be verified live before it is relied on. **[decision]** Tier 2 is not approved by this document.

## 9. Reload and reconnect

- A reload reads the latest row via the normal session read. It shows whatever stage is durable. If `stage` is not `SETTLED` and the row is younger than the settle deadline, the client resumes polling from the current revision; otherwise it shows the row as-is.
- **Settle deadline and abandonment.** A staged row whose process died would otherwise be unsettled forever. Extend the existing orphan reclaim: a row with `stage != SETTLED` and no revision advance for `executionTimeoutMs + 30 s` is moved to `SETTLED` with `settledReason = INTERRUPTED`, keeping the persisted base. Unlike today's reclaim of a `RUNNING` row (which replaces the result with an error), a staged row that already has a validated base **keeps** it. [traced: current reclaim overwrites `resultJson` with an error block; this is a deliberate difference to specify.]
- The original request connection is never required. If the `POST` response is lost after the base was persisted, the client's existing idempotent retry (`userId + clientRequestId` unique) finds the row and returns its latest state.

## 10. Child-execution ordering and deduplication

- Children already deduplicate by `userId_clientRequestId` and are created in one transaction with a durable event and claim [traced]. This design adds no new child creation path.
- `CAPTURE_READY` is a **parent stage** meaning "the set of children for this turn is final." The parent's revision advances once when extraction settles, whether children were found, none were found, or extraction timed out and the worker will deliver them later (`settledReason = EXTRACTION_TIMED_OUT`; the worker's notification path is unchanged).
- Children never reorder user turns: a child is a separate execution row ordered by `createdAt` within the session, as today. A child that arrives after the parent settled appears beneath the parent through the normal session read; the client merges it by `executionId`.
- The 3B reconciliation (filling the parent's routed event form) already bumps the parent's `resultJson`; under this design it also bumps `revision` through the same CAS, so a staged client sees it as one more revision, and the CAS guarantees it cannot clobber a newer stage.

## 11. Late-stage failure presentation

- The base answer is **never erased** by a later failure (acceptance criterion in the plan). A failed enrichment or action stage leaves the base visible and settles with the matching `settledReason`.
- The user sees, at most, one calm line under the answer ("Some extras couldn't load. Your answer above is complete."), never an error card replacing content. Extraction failure shows nothing extra, because the homeowner did not ask for children; the worker retry and notification remain the recovery path.
- Retry is not offered for enrichment (it is optional). It remains the existing retry for a failed base.

## 12. Accessibility announcements

- One polite live region per execution card, announcing only **user-meaningful transitions**: "Answer ready" at `BASE_RESULT_READY`, "More details added" at `PRESENTATION_ENRICHED` (only if the visible summary changed), "Options available" at `ACTIONS_READY`. Duplicate or skipped stages announce nothing.
- No announcement for revisions that change nothing visible. Content swaps must not move focus or scroll position; the summary replacement occurs in place at fixed block identity. Disabled-pending actions are exposed with `aria-disabled` and their reason as accessible description, not removed from the tab order. `prefers-reduced-motion` already disables the card's reveal motion and applies here.

## 13. Telemetry

Keep the existing histogram. Add: first-durable-result vs settled time as separate series (`DURABLE_BASE_RESULT` exists; add `SETTLED_TOTAL`), a counter of `settledReason`, a counter of CAS-lost writes, and poll count per execution. **No query text or answer content is recorded** (consistent with the search and analytics rules).

## 14. Compatibility and rollout

- **Old clients** ignore `stage` and `revision` and receive, for a staged turn, a base result with status `ANSWERED`: they would render it as final and never poll, missing enrichment. To avoid a half-answer for them, the server stages **only when the request declares support** (a new optional request field, `acceptsStagedDelivery`); otherwise it behaves exactly as today. This keeps the single-response contract fully intact as the default.
- Operations opt in individually (deterministic read operations first). No operation changes behavior until it is listed.
- Rollback is removing operations from the opt-in list; rows already written remain valid because `stage` defaults to `SETTLED`.

## 15. Adversarial pass (`AUDIT_METHODOLOGY.md` #7)

For each strong claim, the scenario that would falsify it:

1. *"Nothing is visible before it is validated."* **Falsifier:** the base is persisted by an existing code path that skips validation (for example `reclaimOrphanedRunningExecution` or the failure branch writing `resultJson`). **Check needed at build time:** every writer of `resultJson` on a staged row must go through the CAS helper; add a test that scans for direct `askExecution.update` with `resultJson` in the ask services.
2. *"Duplicate events are harmless."* **Falsifier:** two app instances serve polls and a lagging replica returns revision N after the client saw N+1. **Mitigation:** client ignores any lower revision; the DB is single-primary [inferred: no read replicas were found, not searched exhaustively].
3. *"A reload converges."* **Falsifier:** the process dies between `BASE_RESULT_READY` and the next stage, so the row is unsettled. **Covered by** the §9 interruption rule; its timing relies on `executionTimeoutMs`, which is configurable (default 15 s, max 120 s [traced]) so the deadline must read the control, not a constant.
4. *"Staging helps."* **Falsifier:** synthesis is fast and extraction is bounded at 1.5 s, so there is nothing to recover. **This is why §3 gates the build on data**, not on this design.
5. *"Actions never fire early."* **Falsifier:** the base result already embeds actions from the operation itself (`block.actions`). **Rule needed:** only actions present in the validated base are enabled at `BASE_RESULT_READY`; the client must not enable anything from a later stage ahead of its revision.
6. *"Children don't reorder turns."* **Falsifier:** a child persisted before its parent's `BASE_RESULT_READY` revision becomes visible via the session read. **Today** the child is created after the parent's single write [traced], so this cannot happen; under Tier 1 the base write still precedes extraction, so it still cannot. The ordering invariant to protect: extraction must start only after `BASE_RESULT_READY` is durable.
7. *Non-claims.* This document does not claim current latency is a problem, that SSE works on the production proxy, or that the CAS will not add lock contention on a hot row; the last is expected to be negligible (one writer per row) but is unmeasured.

## 16. What is needed from the owner

1. Approve the stage vocabulary and the "validated before visible" rule (§4, §7), or amend.
2. Approve `stage`/`revision`/`settledReason` columns (schema change, `db push`, no migration file) (§6).
3. Approve opt-in-per-client staging via `acceptsStagedDelivery` (§14).
4. Choose Tier 1 polling as the first delivery mechanism and defer Tier 2 (§8).
5. Choose the gate thresholds in §3, or state that staging proceeds regardless of data.

**Until items 1–5 are decided, no staged-delivery code should be written.** Phase 7A's overlaps and the timing histogram stay as shipped.
