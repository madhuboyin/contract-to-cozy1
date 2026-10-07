# Ask Cozy High-Precision Suggested Next Actions — Implementation Plan

**Date:** October 4, 2026
**Status:** Phases 1-5, exact-four engagement, governed opportunity backfill, and the Phase 5 zero-producer closure are implemented (October 7, 2026; not live-verified). Appendix C records the implementation sequence and supersedes the staged-migration language in §9, §12 and §16 where they differ.
**Product requirement:** Preserve unrestricted homeowner input while making app-authored next actions accurate, contextual, and easy to select
**Primary references:** `docs/product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md` v1.25; `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` ACUI-009; `docs/architecture/ASK_COZY_ARCHITECTURE_EXPLAINED.md`

## 1. Objective

Create one server-governed Suggested Next Action system for Ask Cozy.

The system should anticipate the homeowner's most useful next request so precisely that typing is often unnecessary. It must not restrict, hide, reinterpret, or de-prioritize arbitrary homeowner input. The composer remains the permanent free-form path and continues through the existing safety, routing, clarification, authorization, capture, and confirmation pipeline.

The new system governs recommendations authored by ContractToCozy. It does not turn Ask into a menu-only interface.

## 2. Current state

Recommendation-like actions currently come from independent mechanisms:

| Source | Current shape | Current behavior |
| --- | --- | --- |
| Operation suggestions | `string[]` | Resubmitted as ordinary text and semantically routed |
| Boundary suggestions | Nested `string[]` | Displayed with the boundary or copied into top-level suggestions |
| Entity item actions | Typed action with operation and entity | Deterministic dispatch with launch context |
| Block/page actions | Typed action or URL | Continue, mutate, refresh, or navigate depending on renderer |
| Confirmation receipts | Usually `string[]` plus artifact actions | Suggest the next record operation after a write |
| Skill handoffs | `SkillHandoffSuggestion` | Allowlisted next Skill metadata converted into a prompt |
| Dynamic next actions | `CAPABILITY_LIST` | Governed capability recommendation with readiness and optional inline launch |
| Platform recovery | Shared string suggestions or retry action | Recover from property, permission, expiry, cancellation, or availability states |
| Landing starters | Prompt descriptors | Start a new turn from the calm launch state |

The result is locally correct behavior with global inconsistencies:

- identical destinations can appear in more than one surface;
- string suggestions can be misrouted even though the application authored them;
- eligibility and freshness are evaluated differently by source;
- provenance is not normalized;
- generic fillers compete with exact entity actions;
- suggestion documentation drifts from handler branches; and
- telemetry cannot compare recommendation sources consistently.

## 3. Product and architecture decisions

### 3.1 Unrestricted composer

- The composer accepts arbitrary homeowner text whenever the execution state safely permits input.
- Suggested Next Actions are optional shortcuts, never an allowlist.
- The UI must not replace the composer with chips or require a suggested action to continue.
- Typed launch context is accepted only for an application-authored action; typed homeowner text follows ordinary routing.

### 3.2 Server ownership

- Candidate creation, eligibility, ranking, deduplication, and provenance are backend-owned.
- The frontend renders the returned order and does not invent operations, entities, priority, or eligibility.
- The frontend may hide actions already consumed locally while a refreshed response is pending, but it does not permanently suppress a server-eligible action.

### 3.3 Exact-four engagement without promotional filler

- Every settled, normal, property-scoped answer renders exactly four distinct typed Suggested Next Actions. The fixed count may be reconsidered when Ask Cozy becomes the main product entry point; until then it is four, not a variable target.
- The exact-four invariant does not apply while the homeowner must finish a clarification, inline capture, confirmation, property selection, safe recovery, or emergency/restricted flow. Those states show only the controls and safe recovery actions appropriate to that state.
- Current-answer continuations and time-sensitive home work rank first. When the selected home's **actionable profile completeness** is below 90%, the remaining positions prioritize applicable missing profile details. Strongly relevant homeowner opportunities backfill any positions that remain.
- Discovery must describe a homeowner outcome rather than advertise a tool. It ranks below active continuation, urgent work, missing-profile completion, and exact-entity actions, and no more than one unrelated exploration action may appear in a row.
- A fourth action may come from a governed fallback inventory, but it may not be fabricated, ineligible, stale, duplicative, promotional, or semantically routed free text merely to satisfy the count.

### 3.4 Safety is unchanged

- Operation hints and entity context prevent app-authored actions from being semantically misrouted.
- They do not grant authorization or bypass policy.
- The selected operation rechecks property access, household role, lifecycle applicability, operation/Skill health, entity identity, freshness, required context, and confirmation requirements.
- Consequential actions continue through review and confirmation.

### 3.5 No new database schema in the initial implementation

The contract, ranking, deduplication, and dispatch changes can use the existing execution result JSON, execution events, launch context, and analytics pipeline. No Prisma schema change is required unless later measurement shows a need for a durable recommendation-impression ledger. If such a need is approved, update Prisma and affected contracts but leave migration creation to the user.

## 4. Target contract

Add the contract to the backend Ask schema and mirror its inferred/generated type in the frontend.

```ts
type SuggestedNextActionInteractionType =
  | 'CONVERSATION_CONTINUE'
  | 'MUTATE_RECORD'
  | 'START_WORKFLOW';

type SuggestedNextActionSource =
  | 'OPERATION_RESULT'
  | 'ENTITY_ACTION'
  | 'MISSING_DETAIL'
  | 'SKILL_HANDOFF'
  | 'CAPABILITY_RECOMMENDATION'
  | 'ACTIVE_GOAL'
  | 'PLATFORM_STATE';

interface SuggestedNextAction {
  id: string;
  outcomeKey: SuggestedNextActionOutcomeKey;
  label: string;
  message: string;
  operationId: AskOperationId;
  interactionType: SuggestedNextActionInteractionType;
  entityContext: {
    propertyId: string | null;
    entityType: string | null;
    entityId: string | null;
    contextVersion: string | null;
  };
  eligibility: {
    state: 'ELIGIBLE' | 'NEEDS_CONTEXT' | 'UNAVAILABLE';
    reasonCodes: string[];
    missingFactKeys: string[];
  };
  provenance: {
    source: SuggestedNextActionSource;
    sourceOperationId: AskOperationId | null;
    sourceExecutionId: string | null;
    reasonCodes: string[];
  };
  createdAt: string;
  expiresAt: string;
  priority: {
    tier: 'CONTINUE' | 'RECORD_ACTION' | 'RELATED' | 'DISCOVERY';
    score: number;
  };
}
```

Contract rules:

- `id`, `label`, `message`, and `operationId` are required.
- `outcomeKey` is a bounded registry value owned by the target operation; it is never derived from `label` or `message`.
- `operationId` must exist in `ASK_OPERATION_DEFINITIONS`.
- `label` is concise UI copy; `message` is natural transcript text.
- `message` is not reparsed to decide the operation for a selected app-authored action.
- Property and entity context are explicit nullable values rather than absent ambiguous fields.
- `ELIGIBLE` is required for an immediately selectable action.
- A `NEEDS_CONTEXT` action is selectable only when every advertised missing fact has a registered typed capture path.
- An `UNAVAILABLE` candidate may support explanation in a capability catalog but is not rendered as an ordinary follow-up chip.
- Reason codes are bounded registered tokens, not homeowner data.
- Scores are deterministic and need not be exposed in the calm UI.
- `createdAt` and `expiresAt` define the offered action's presentation lifetime. Selection always revalidates current state even before expiry.
- Navigation links and result-local filter/refinement controls are not Suggested Next Actions. They retain their existing allowlisted-link or result-control contracts and publish semantic presentation identity only for cross-surface deduplication.
- Default TTL is 30 minutes for `MUTATE_RECORD` and `START_WORKFLOW`, and 24 hours for `CONVERSATION_CONTINUE`. Every expiry is capped at the source execution's fixed `expiresAt`; a registry may choose a shorter TTL for a more volatile operation.

### 4.1 Selection proof and launch contract

The client must not prove app authorship merely by echoing an `operationId`. A selected action submits:

```ts
interface SuggestedNextActionSelection {
  suggestedActionId: string;
  suggestedActionFromExecutionId: string;
  message: string;
}
```

For answer follow-ups, the source execution's persisted result JSON is the offered-action ledger. The server loads that execution by user and session, verifies its property scope, finds the exact unexpired action id, and copies the registered message, operation, entity context, outcome key, and provenance from the stored action. The submitted `message` exists for compatibility with the execution request and must exactly match the stored message; the server uses the stored value and rejects/audits a mismatch. Client-supplied operation or entity fields are not authoritative. The action expiry may never exceed the fixed source-execution expiry. A missing or purged source maps to the same typed stale/invalid-action recovery result and never silently falls back to semantic routing.

Landing starters have no source execution and are deliberately kept simple: they are ordinary suggested prompts that go through normal routing, with no signed proof, no dedicated secret and no deterministic-dispatch attribution. There are no real customers yet, so the added machinery was removed; if starters ever need app-authored dispatch, add a server-side starter registry then.

Selection uses the ordinary `clientRequestId` as its idempotency key. Replaying the same request returns the same resulting execution. After successful completion, equivalent actions are suppressed by semantic identity unless the operation registry explicitly declares the outcome repeatable and current eligibility still allows it. Failed and cancelled results must persist their safe recovery actions in result JSON before those actions can be displayed.

Ordinary homeowner text and existing non-suggestion typed actions continue to use their current launch contracts. Rich entity item actions keep their present operation/entity launch contract and publish semantic identity for deduplication. If one is promoted into the compact Suggested Next Action row, it becomes a ledger-backed Suggested Next Action. `sourceExecutionId` retains its refresh/reconciliation meaning, and `handoffFromExecutionId` retains its Skill-handoff telemetry meaning; neither is overloaded as the Suggested Next Action selection id.

## 5. Candidate model

Introduce an internal `SuggestedNextActionCandidate` that contains the target contract plus evaluation inputs. Producers nominate candidates; they do not declare final visibility.

### 5.1 Candidate producers

1. Operation-result producer
   - Converts current handler suggestions and receipt continuations.
   - Requires an explicit operation target for every migrated recommendation.

2. Entity-action producer
   - Nominates compact equivalents of eligible existing typed item actions without replacing the rich action's current launch contract.
   - Preserves exact entity id and interaction type.

3. Missing-detail producer
   - Uses canonical incomplete fields and supported correction/capture definitions.
   - Produces concrete actions such as “Add the microwave brand”.
   - Resolves each missing fact through a registered `missingFactKey -> captureKey -> operationId` mapping; it cannot advertise a capture that has no active definition.

4. Pending-work producer
   - Continues active clarification, capture, confirmation, monitor, or workflow state.

5. Skill-handoff producer
   - Converts eligible `SKILL_HANDOFF_DEFINITIONS` results without losing allowlist validation or continuity context.

6. Capability-recommendation producer
   - Adapts current `askNextActions.ts` capability results and inline launches.

7. Active-goal producer
   - Preserves the current sell/hold/rent goal bias and supports future governed durable goals.

8. Platform-recovery producer
   - Handles property-required, permission, unavailable, lifecycle-mismatch, expired, cancelled, and retry states.

9. Landing-starter producer
   - Out of scope for typed actions: landing starters stay ordinary prompts (see §4.1).

### 5.2 Candidate identity

Deduplication identity is derived from registered fields:

```text
operationId
+ interactionType
+ propertyId
+ entityType/entityId
+ outcomeKey
```

Do not infer an outcome from label or message. Each target operation declares its bounded outcome keys and tests their uniqueness. Different wording can represent the same action, and the same wording can target different entities.

Action ids are deterministic hashes of a canonical serialization of:

```text
action schema version
+ sourceExecutionId
+ operationId
+ interactionType
+ propertyId
+ entityType/entityId
+ outcomeKey
```

Prefix the encoded hash with the action schema version. Do not include label, message, score, producer, timestamps, or array position. This keeps an action id stable when the same execution is refreshed or producer precedence changes, while any material target/outcome change receives a new id.

### 5.3 Producer inventory and failure isolation

Before migration, generate a categorized inventory of every `suggestions:` declaration and compact action producer. The October 4, 2026 repository scan found 104 source files containing the broad `suggestions:` token; this is a discovery count, not a claim that all 104 are Ask follow-up producers. Classify each occurrence as an Ask compact follow-up, persistence-boundary producer, boundary action, domain-local recommendation, capability result, test fixture, or unrelated type. Persistence-boundary inventory explicitly includes every raw suggestion site in `askConfirm.ts`, `askClarification.ts`, execution failure/expiry/cancellation branches, and refresh persistence—not only operation handlers and domain producers.

Each producer has a bounded candidate limit and may nominate only statically registered operation/outcome combinations. Static registry errors fail validation and CI. At runtime, an invalid or failed producer is reported and its candidates are dropped; it must not crash application startup or invalidate an otherwise safe answer.

## 6. Eligibility pipeline

Create a pure, ordered evaluator where possible. Each rule returns a state and reason code; it must not silently mutate a candidate.

1. Registry validity
   - Operation exists and its handler is registered.

2. Operational health
   - Ask, operation, Skill, dependencies, and route are available.

3. Property scope
   - Required property exists and matches the source execution.

4. Authorization
   - Current property access meets the effective operation/Skill floor.

5. Audience applicability
   - Buying, owning, selling, or general stage permits the operation.

6. Entity validity
   - Entity exists, belongs to the property, and is supported by the operation.

7. Freshness
   - Context version is current where material; otherwise selection triggers a safe refresh or current-target recovery.
   - Maintain a domain freshness matrix listing the authoritative version function for versioned domains and the current-record requery rule for domains without a version today. “Where material” is not an implementation decision.

8. Context readiness
   - Required facts are present or every missing fact resolves through the registered fact-to-capture-to-operation mapping.

9. Interaction conflict
   - Do not compete with an active clarification, capture, or confirmation unless the action explicitly continues or safely cancels it.

10. History suppression
    - Suppress the current operation/entity outcome, recently completed equivalent actions, and already asked equivalent prompts.

11. Safety and boundary compatibility
   - Emergency and restricted boundaries suppress promotional actions and retain only safe recovery actions.

The evaluator supports a `SAFE_RECOVERY_ONLY` mode for emergency, restricted, unavailable, expired, and cancellation results. In that mode only retry, correction, safe read, property selection, cancellation recovery, or unrestricted new-question actions can survive; discovery and promotional candidates are excluded.

The evaluator returns structured reasons for audit and tests. Selection repeats all authoritative checks through the existing invocation path.

## 7. Ranking and deduplication

### 7.1 Priority tiers

| Tier | Default priority | Examples |
| --- | --- | --- |
| `CONTINUE` | Highest | Complete an open confirmation; answer the next required capture; retry the same failed execution |
| `RECORD_ACTION` | High | Add a missing brand; change a room floor; act on the selected task |
| `RELATED` | Medium | Review replacement outlook after inventory detail; review coverage after a claim |
| `DISCOVERY` | Lowest | Explore a broader tool unrelated to immediate unfinished work |

### 7.2 Deterministic score inputs

- tier base score;
- exact entity match;
- current-result ownership;
- active durable goal match;
- missing-detail materiality;
- readiness;
- recency and completion suppression;
- source-specific confidence; and
- diversity penalty for repeated operation/domain destinations.

**First release ranks by tier only** (`RANKING_MODE = TIER_ONLY` in the registry): tier, then the fixed tie-break sequence below, with no boosts, penalties or minimum score. The weighted scoring described here is built and tested but ships switched off; enable it (`WEIGHTED`) only if real chips feel wrong in practice, and bump the policy version when you do. Define versioned integer weights before enabling it. Tier bases must not overlap after bounded adjustments. The final ordering is `score DESC`, producer precedence, `operationId`, `outcomeKey`, entity type, entity id, then action id. A minimum display score omits weak candidates. These constants and the ranking policy version belong in one registry and are snapshot-tested.

Do not use generated prose or an unreviewed model score to make an action executable. A model may later help order already eligible, bounded candidates only after an evaluation proves deterministic ranking insufficient.

### 7.3 Cross-surface winner selection

- Merge candidates before presentation.
- Group by semantic identity.
- Keep the highest-priority eligible candidate.
- Merge non-sensitive provenance reason codes from suppressed duplicates.
- Reserve at most one broad discovery action when a stronger continuation or record action exists.
- For a settled, normal, property-scoped answer, return exactly four eligible actions by backfilling from the governed home-opportunity inventory after result-specific candidates are ranked. For exceptional interaction, recovery, and safety states, return only the eligible actions allowed by that state.

Result-card and block actions publish the same semantic identity fields to response finalization even when they remain rendered in their richer surface. They do not need to become follow-up candidates, but their identities suppress equivalent compact candidates before the response is persisted.

### 7.4 Pipeline placement and performance budget

Create one shared `finalizeSuggestedNextActions` service. The normal read path invokes it from `executeOperation.ts`'s `finalize()` seam after the operation result, Skill handoff, and platform boundary state exist, replacing the current standalone `suppressRepeatedAskSuggestions` call before answer-trust validation. The confirmation path invokes it from `askConfirm.ts` after the confirmed result and Skill handoff exist but before confirmed-completion validation and persistence. Clarification creation, resumption, expiry, invalid selection, and retryable-failure branches in `askClarification.ts` invoke it before persisting their result JSON. Confirmation expiry/conflict, retryable/terminal execution failure, cancellation, and every other branch that displays recovery actions also pass through the service. No result may persist a newly produced compact action by bypassing this shared finalizer.

The finalized action set flows through the applicable answer-trust validator and is persisted in `AskExecution.resultJson` before return. The execution id is already allocated before operation execution and is available for provenance. A refresh regenerates the set with deterministic ids and atomically replaces the stored offered-action ledger for that execution. An id removed by refresh becomes stale immediately and returns typed recovery if selected. The orchestrator assembles one bounded evaluation context with batched property access, entity, health, pending-work, and recent-history data; producers must not perform unbounded per-candidate queries.

Initial implementation budgets:

- no more than 12 nominated candidates per producer and 60 total before deduplication;
- batch entity and authorization reads by property/domain;
- no remote model call in eligibility, ranking, or executable-action construction;
- record pipeline duration, query count, dropped-producer count, and candidate counts; and
- if the budget or a nonessential producer fails, fail closed rather than delaying or failing the answer; a settled normal answer with fewer than four actions is a measurable degraded-state exception, never a reason to fabricate padding.

The exact latency and query thresholds must be set from the existing Ask service budget during Phase 2 and encoded in tests/telemetry before producer migration begins.

## 8. Copy policy

Labels should answer “what happens if I select this?”

Good:

- Add the microwave brand
- Set this item’s purchase date
- Change the guest room floor
- Show the 3 overdue tasks
- Review the water heater replacement outlook

Avoid:

- Add details
- Continue
- Learn more
- Open tool
- What should I do next?

Rules:

- Name the entity when known.
- Name the intended outcome or record field.
- Prefer a verb-first label.
- Keep transcript `message` natural and independently understandable.
- Do not disclose internal ids, fact keys, policy terms, or reason codes.
- Do not imply a write has happened before confirmation.

## 9. Backend implementation sequence

### Phase 1 — Contract and compatibility boundary

Primary files:

- `apps/backend/src/productFramework/ask/ask.contract.ts`
- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/frontend/src/features/ask/types.ts`

Work:

- Add schema, enums, limits, and validation.
- Add `suggestedNextActions` to the execution result/response.
- Persist the offered typed actions in the source execution result and add the verified selection request fields from §4.1.
- Keep `suggestions: string[]` temporarily so producers can migrate incrementally within the branch.
- Add a compatibility adapter that converts only explicitly mapped strings; do not infer operation ids from arbitrary text.
- Preserve persisted historical executions whose result JSON contains only strings.
- Update `followUps.ts` and response parsing to prefer typed actions when present and fall back to historical strings only when typed actions are absent.
- Keep `suppressRepeatedAskSuggestions` during migration, but generalize its history input to registered semantic identities; remove the independent string-only branch when Phase 5 completes.
- Inventory persistence-boundary producers in `executeOperation.ts`, `askConfirm.ts`, `askClarification.ts`, refresh, failure, expiry, conflict, and cancellation paths before migrating domain producers.

Exit:

- Old persisted results still render.
- New typed results validate on backend and frontend.
- The composer behavior is unchanged.
- A forged, expired, cross-session, cross-user, or cross-property action selection is rejected as a typed recovery result.

### Phase 2 — Candidate, eligibility, ranking, and deduplication services

Add focused modules under `apps/backend/src/services/ask/suggestedActions/`:

- `suggestedNextAction.contract.ts`
- `suggestedNextActionCandidate.ts`
- `suggestedNextActionEligibility.ts`
- `suggestedNextActionRanking.ts`
- `suggestedNextActionDeduplication.ts`
- `suggestedNextActionPolicy.ts`
- `suggestedNextActionRegistry.ts` for outcome keys, producer declarations, capture mappings, weights, and ranking policy version
- `suggestedNextActionClock.ts` or an injected clock interface for deterministic creation/expiry and tests
- `finalizeSuggestedNextActions.ts` as the only persistence-boundary producer of compact actions

Reuse rather than duplicate:

- operation registry and capability-handler validation;
- effective Skill policy and health;
- property access;
- audience policy;
- capture-definition registry;
- `askSuggestionPolicy` history rules;
- capability readiness and launch contracts; and
- existing context-version helpers owned by each domain.

Run the pipeline at the response-finalization boundary described in §7.4. Build a domain freshness matrix and a categorized baseline producer inventory before migrating domain output.

Exit:

- Pure tests cover all eligibility reasons, safe-recovery-only mode, tier ordering, exact weight/tie-break behavior, semantic identity, source precedence, diversity, limits, selection proof, expiry, producer failure isolation, and deterministic repeatability.
- Phase 3 may not begin until versioned weights and minimum score, latency/query thresholds, the domain freshness matrix, the complete missing-fact capture mapping, TTL rules, producer precedence, and injected-clock tests are approved and executable.

### Phase 3 — High-value producer migration

Migrate the domains with the strongest exact context first:

1. Inventory missing details and item-create receipts
2. Rooms
3. Maintenance task detail and receipts
4. Warranties
5. Home events and Home Event Radar
6. Claims and inspection findings

For each producer:

- replace string output with explicit operation and entity context;
- use structured capture for bounded values;
- add a current-data eligibility check;
- add a stale-selection recovery test; and
- remove the corresponding string compatibility mapping after the domain is complete.

Each domain exits only when its producer inventory is zero for unmapped compact strings, its operation/outcome declarations pass static validation, its freshness source is recorded, and its focused read/write/role/stale journeys pass. Domain completion is independent: one migrated domain must not depend on the remaining string producers.

Exit:

- Every displayed migrated action reaches the intended operation/entity without semantic routing.
- Viewer/contributor/owner differences are correct.
- Confirmation behavior is unchanged.

### Phase 4 — Cross-cutting source migration

Migrate:

- Skill handoffs;
- dynamic capability recommendations;
- active-goal recommendations;
- platform recovery suggestions;
- confirmation receipts not covered in Phase 3; and

Landing starters stay ordinary prompts and are not part of the typed-action pipeline (see §4.1). Platform recovery candidates use `SAFE_RECOVERY_ONLY` policy rather than competing with normal discovery actions.

Refactor `askNextActions.ts` to nominate capability candidates into the shared policy rather than append an independently rendered list when the destination can be represented as a Suggested Next Action. Retain rich `CAPABILITY_LIST` blocks for genuine multi-capability comparison/discovery results; do not flatten those results into four chips.

Exit:

- One deduplication policy covers all compact recommendation surfaces.
- Rich discovery lists remain available where the list itself is the requested answer.

### Phase 5 — Remove free-text-only producers

- Remove `suggestions: string[]` from new-operation result construction.
- Retain read compatibility only for historical persisted results if required by existing stored conversations.
- Move `FollowUpRow` and related hooks to typed actions.
- Delete string-to-operation compatibility mappings.
- Make CI reject a newly added raw suggestion producer.
- Remove the string-only history-suppression branch after historical rendering compatibility is isolated from new production.

Exit:

- Every newly produced compact follow-up is typed and auditable.
- Arbitrary homeowner input remains unchanged.
- Static validation and environment-independent tests—not production telemetry—show that every categorized compact producer and persistence seam is migrated.

## 10. Frontend implementation

Primary files:

- `apps/frontend/src/features/ask/types.ts`
- `apps/frontend/src/features/ask/followUps.ts`
- `apps/frontend/src/features/ask/interactionDispatch.ts`
- `apps/frontend/src/components/ask/calm/FollowUpRow.tsx`
- `apps/frontend/src/components/ask/workspace/ExecutionCard.tsx`
- `apps/frontend/src/components/ask/AskWorkspace.tsx`

Requirements:

- Render `label`, not the transcript message, on the chip/button.
- On selection, submit `message`, `suggestedActionId`, and `suggestedActionFromExecutionId`. Do not treat client-echoed operation/entity context as proof of authorship.
- Preserve the unrestricted composer beside or below the suggestions.
- Do not auto-send merely because only one action exists.
- Disable an action only while its own request is pending; do not globally disable unrelated text input longer than necessary.
- Preserve horizontal scrolling, keyboard access, focus visibility, accessible names, reduced motion, and narrow-width behavior.
- If selection returns a stale/invalid result, retain the original answer and show the server-provided recovery action.
- Avoid rendering the same semantic action in both a result card and the follow-up row.
- Hide or disable actions whose `expiresAt` has passed and refresh/recover through the server; never silently send expired actions as ordinary text.
- Use server-returned presentation identities to suppress overlap with rich result-card and block actions.
- A rich entity button retains the lifetime and revalidation rules of its existing card contract; expiry of a compact promoted copy does not disable the rich button.

## 11. Analytics and evaluation

### 11.1 Events

- `ask_suggested_action_impression`
- `ask_suggested_action_selected`
- `ask_suggested_action_suppressed`
- `ask_suggested_action_outcome`

Safe properties:

- action id;
- source category;
- source and target operation ids;
- priority tier;
- eligibility and reason codes;
- entity type, not entity id;
- intended-operation match;
- clarification required;
- completion state;
- stale rejection;
- suppression category;
- source surface;
- selection id and resulting execution id as the non-sensitive outcome join;
- source execution id, with analytics access controls equivalent to existing execution telemetry.

Do not log label/message text, entity ids, addresses, financial values, document content, or other homeowner data in general analytics.

The selection event creates one correlation record in the existing execution-event/analytics path linking the verified offered action to the resulting execution. Do not reuse `handoffFromExecutionId` for this purpose. Selection id, source execution id, and resulting execution id are restricted operational identifiers: they are permitted in access-controlled execution telemetry, excluded from general product-analytics exports, follow Ask execution retention/deletion, and are not joined with raw message text or entity ids in general analytics. Outcome attribution follows that join through completion, governed pending state, intentional deferral, stale rejection, or abandonment.

### 11.2 Quality measures

- **Suggestion coverage:** the next completed homeowner intent was among the offered actions.
- **Operation precision:** a selection reached the declared operation without reclassification.
- **Entity precision:** a selection targeted the declared entity or safely rejected stale context.
- **Click-to-completion:** selected action reached its intended terminal or governed pending state.
- **Clarification-after-click:** lower is better for an app-authored action.
- **Manual-input escape rate:** homeowner typed instead of selecting after suggestions were visible; interpret with task context, not as failure by itself.
- **Duplicate suppression:** duplicate semantic destinations removed across sources.
- **Abandonment:** action selected but neither completed nor intentionally deferred.

Optimize for operation/entity precision and successful completion, not raw click-through rate.

## 12. Validation strategy

### 12.1 Contract and governance

- Schema rejects unknown operations, invalid interaction types, excessive labels/messages, unbounded reason codes, and malformed entity context.
- Static validation and CI confirm producer operation ids, outcome keys, capture mappings, and Skill ownership where applicable.
- Runtime candidate validation degrades by dropping and reporting an invalid producer; registry drift must not create an application startup crash loop.
- A typed action cannot be sourced from generated model prose.
- A client cannot forge app authorship by supplying an operation id or entity id; selection is resolved from the stored source execution.

### 12.2 Eligibility and security

- Owner, contributor, viewer, revoked access, and cross-property cases.
- Disabled operation/Skill/dependency and unavailable route cases.
- Lifecycle mismatch and no-property cases.
- Missing, deleted, reassigned, and stale entities.
- Emergency and restricted-boundary suppression.
- Confirmation remains mandatory for governed writes.

### 12.3 Ranking and deduplication

- Active continuation outranks record completion.
- Record completion outranks related capability.
- Related capability outranks discovery.
- Exact entity beats generic domain action.
- Semantic duplicates across every source collapse to one winner.
- Exactly four actions render for settled, normal, property-scoped answers; exceptional interaction, recovery, safety and degraded-pipeline states render only what their policy permits.
- Deterministic inputs produce deterministic order.
- Exact score ties follow the documented registry tie-break sequence.
- Rich result-card identities suppress equivalent compact actions.

### 12.4 Frontend

- Label rendering and transcript message preservation.
- Verified action/source selection dispatch using server-stored message, operation, and entity context.
- Composer accepts arbitrary text before and after actions render.
- Keyboard, focus, screen reader, 390-pixel width, horizontal overflow, and reduced motion.
- Pending, stale, access-lost, and failed states.
- Historical string-only execution compatibility while retained.
- Action expiry, forged selection, and cross-session/source-execution rejection.
- Message-mismatch rejection, purged-source recovery, idempotent replay, and completed-equivalent suppression.
- Deterministic action-id stability and atomic ledger replacement across refresh.
- Rich entity buttons remain usable under their existing card contract independently of expiry of a compact promoted copy.
- Clarification retry/resumption, retryable failure, terminal failure, confirmation expiry, confirmation conflict, refresh, and cancellation persist only shared-finalizer recovery actions.

### 12.5 Focused integrated journeys

- Incomplete microwave → Add brand → capture/review → confirm → next useful item action.
- Room map → Change guest room floor → review → confirm → return to room map.
- Maintenance task → Snooze reminders → confirmation → current task receipt.
- Claim completion → eligible coverage handoff without duplicate capability chip.
- Viewer sees useful reads but no unauthorized write shortcut.
- Homeowner ignores all suggestions and types a completely different valid request.

## 13. Documentation automation

Add a repository script that reads:

- `ASK_OPERATION_DEFINITIONS`;
- `SKILL_DEFINITIONS`;
- `SKILL_ADAPTER_DEFINITIONS`;
- capability-handler registrations;
- `SKILL_HANDOFF_DEFINITIONS`; and
- statically declared Suggested Next Action producer definitions.

It should generate or verify:

- operation, Skill, adapter-key, governed-adapter, and handler counts;
- operation-to-Skill ownership;
- adapter binding and effect;
- handoff inventory; and
- action templates and scenario branches.

CI should fail on missing/extra ids, mismatched adapter effects, unowned operations not present in an explicit platform allowlist, undeclared typed action operations, and stale documentation tables.

The generated Suggested Next Action report also lists producer source, target operation, outcome key, capture mapping, supported entity types, freshness strategy, and presentation surface. Documentation paths are `docs/architecture/ASK_COZY_ARCHITECTURE_EXPLAINED.md`, `docs/product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md`, and `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md`.

## 14. Skill and adapter governance follow-up

This work is related but separable from typed action delivery. Do not silently assign ownership because doing so changes runtime policy and health enforcement.

Track these decisions in a companion governance plan or ticket set. They are not prerequisites for completing the typed-action pipeline unless a migrated action targets an operation whose current ownership is itself unresolved.

Recommended decisions:

1. Create a Recalls Skill for `RECALL_REVIEW` and `RECALL_MATCH_UPDATE`.
2. Evaluate assigning `SELL_HOLD_RENT_GOAL_CAPTURE` to the Sell, Hold, or Rent Skill.
3. Decide whether the four `CAPTURE_*` operations belong to one conversational-capture Skill or to their canonical domain Skills.
4. Keep capability discovery, emergency/unsafe/out-of-scope boundaries, and grounded guidance platform-owned.
5. Add a versioned platform-adapter definition for platform-owned operations with owner, effect, timeout, retry safety, idempotency, and health semantics equivalent to `SkillAdapterDefinition`.
6. Update startup validation so every operation has exactly one of:
   - a governed Skill owner and Skill adapter; or
   - an explicit platform owner and platform adapter.

Each ownership decision requires tests for effective authorization floor, operational controls, dependency health, routing, and degraded behavior.

## 15. Completion criteria

The increment is complete when:

- the composer remains unrestricted and is covered by explicit tests;
- all newly produced compact next actions use the typed contract;
- migrated actions reach the declared operation/entity without semantic reclassification;
- every selected action is verified against the unexpired offered set stored on its source execution;
- one server policy owns eligibility, ranking, and cross-surface deduplication;
- normal, confirmation, failure, expiry/conflict, and cancellation persistence seams use the shared finalizer;
- deterministic action ids remain stable across refresh and atomic ledger replacement invalidates removed ids;
- outcome identity, capture routing, weights, tie-breaks, and domain freshness strategies are registered rather than inferred from prose;
- stale, unauthorized, unavailable, and inapplicable actions fail safely;
- every settled, normal, property-scoped answer shows exactly four distinct typed actions, while active interaction, recovery, and safety states remain intentionally exempt;
- below 90% actionable profile completeness, eligible missing-profile actions outrank general opportunity discovery;
- opportunity backfill is outcome-led, governed, deduplicated, cooldown-aware, and never a promotional tool carousel;
- consequential actions still require review and confirmation;
- analytics measure precision, completion, clarification, suppression, and manual-input escape without collecting raw homeowner text;
- documentation parity checks cover operations, Skills, adapter keys, governed adapters, handlers, handoffs, and typed action producers; and
- the architecture guide, Ask Redo FRD, conversational UI audit, and implementation plan remain mutually consistent.

## 16. Delivery, rollback, and verification

There are no real customers or production customer data. Do not add a feature flag, cohort rollout, canary, pilot, or runtime kill switch for this increment. Use the additive typed/string compatibility boundary to migrate producers incrementally while preserving historical reads.

Rollback before Phase 5 is explicitly a code revert plus rebuild and redeploy: restore the affected producer's explicit string compatibility mapping while historical typed results remain readable. It is not an instant runtime switch. Phase 5 occurs only after all categorized compact producers and persistence seams are migrated and static validation, pure policy tests, frontend component tests, and environment-independent integrated journeys show no unresolved selection-authorship, stale-action, recovery, or operation/entity precision defects. This is repository validation evidence, not production-user telemetry.

Verification follows repository policy: requirements review, Graphify/code-path tracing, contract inspection, static registry validation, pure policy tests, frontend component tests, and environment-independent integrated journeys. A later live-environment checklist may verify representative selection, stale recovery, confirmation, and analytics correlation when such an environment exists; unavailable local databases or browser infrastructure do not block implementation completion and must not be claimed as executed.

## Appendix A — Phase 1 implementation record

**What shipped (backend).** `SuggestedNextActionSchema`, `SuggestedNextActionSelectionSchema`, and the `suggestedNextActions` response field live in `ask.contract.ts`; the selection is accepted only as a top-level `suggestedActionSelection` (strict: a client `operationId` or entity field is rejected, not ignored). Service modules under `apps/backend/src/services/ask/suggestedActions/`: `suggestedNextAction.contract.ts` (registry membership, ledger read, TTL defaults, expiry cap), `suggestedNextActionIdentity.ts` (deterministic versioned ids, semantic key and hash), `suggestedNextActionClock.ts`, `suggestedNextActionSelection.ts` (ledger resolver), and `suggestedNextActionCompatibility.ts` (explicit-mapping-only; the shipped table is empty). `createAskExecution.ts` verifies a selection before it can influence routing, rebinds `input` from the stored action (stored message, operation, entity and context version win), emits the `SUGGESTED_ACTION_SELECTED` correlation event, and on any verification failure persists a typed `UNAVAILABLE` execution (`ASK_SUGGESTED_ACTION_STALE` or `ASK_SUGGESTED_ACTION_INVALID`) with a recovery summary and a bounded `SUGGESTED_ACTION_REJECTED` event. Typed history suppression (`suppressRepeatedSuggestedNextActions`) runs in `finalize()` next to the string path, keyed by semantic-key hashes from this session's `SUGGESTED_ACTION_SELECTED` events.

**What shipped (frontend).** `SuggestedNextAction` and `SuggestedNextActionSelection` types; `followUpItems` prefers typed actions (hiding expired ones, never filtering them by asked text, capped at four) and falls back to strings only when the answer has no typed actions; `FollowUpRow` renders `label` and hands the whole item back; `AskWorkspace` submits a typed action with only its id and the offering execution id, and keeps the turn in the offering execution's property.

**Deviations and decisions made while implementing (review these).**

1. **Simplification (October 4, 2026, at the owner's direction).** An earlier Phase 1 added a signed landing-starter token (HMAC-SHA-256, a dedicated `ASK_SUGGESTED_ACTION_SIGNING_SECRET` and key-rotation variables). It was removed because there are no real customers yet and starters carry no consequential action: landing starters are ordinary prompts through normal routing, and the selection contract is only `suggestedActionId` + `suggestedActionFromExecutionId` + `message`. The signer module, its env variables, the starter id derivation and the `LANDING_STARTER` source value are gone.
2. A rejected selection creates its own `UNAVAILABLE` execution row (rather than a transport error) so the transcript keeps a typed, retained recovery result; it stores the submitted message as the question and no launch context.
3. Property scope is strict: the offered action, its source execution, and the request must agree, including `null`. A property-less request cannot select a property-scoped action.
5. The repeatable-outcome exception to completed-equivalent suppression (§4.1) is deferred to Phase 2 because it needs the per-operation outcome registry.
6. Not done in Phase 1, by design: the shared `finalizeSuggestedNextActions` service, eligibility, ranking, deduplication, producers, the fact-to-capture mapping, freshness matrix, weights and thresholds (all Phase 2 entry gates), analytics impression/outcome events, and the docs-parity script.

**Persistence-boundary inventory (baseline, 2026-10-04).** 16 files and 39 result-write sites; checked in at `docs/architecture/ask-suggested-actions-persistence-sites.json` and enforced by `tests/ask/askSuggestionPersistenceSites.test.js` (regenerate with `node scripts/ask-suggestion-sites.js --write`).

| Category | Files | Sites |
| --- | --- | --- |
| Execution lifecycle (`execution/`: create, execute/refresh, confirm, clarification, capture, retry, feedback, sessions) | 8 | 25 |
| Confirm handlers (`handlers/*Confirm.handler.ts`) | 5 | 10 |
| Conversational capture | 1 | 2 |
| Other Ask services (`askNotificationContinuation.service.ts`, `support/executionState.ts` schema-fallback) | 2 | 2 |

The five confirm handlers and conversational capture were not named in the plan's seam list; they persist results too and must route through the shared finalizer or be explicitly classified as producing no compact actions.

**Raw `suggestions:` declarations (same script, source only, tests excluded).** 81 files and 524 declarations: operation handlers 46 files / 439; Ask services 16 / 42; execution lifecycle 7 / 27; other domains 8 / 10; contracts 3 / 5; suggested-actions module 1 / 1. This is a discovery count, not a count of compact follow-up producers; Phase 3 classifies each.

**Verification (executed locally; no live backend, browser, or database).** `tsc --noEmit` clean on the backend. New tests: `tests/ask/suggestedNextActionsPhase1.test.js` (contract invariants, deterministic ids, ledger resolver rejections, compatibility boundary; the signer tests were removed with the signer) and `tests/ask/askSuggestionPersistenceSites.test.js` (4); frontend `followUps` and `calmShellChrome` suites extended. Full `npm run test:ask:chunked` run: 2 tests this work broke were found and fixed (a source-window assertion in `askGovernance` and the single-`askExecution.findMany` guard in `askNextActions`); the remaining 6 failures (`askGovernance` golden routing, `askImportGraphGuardrails` support re-exports, `askRoutingCalibration` reserve prompts, `correctionHandlersRuntime` inventory item actions, `healthGapCapture` derived capture, `skillEvaluationRegistry` routing fixtures) fail identically on an unmodified HEAD checkout and are not caused by this work. Frontend `src/components/ask` + `src/features/ask`: 4 pre-existing failures in `maintenanceShelves` and `displayPatterns` (extra `WORKSPACE` argument on item-action callbacks, in files this work does not touch). Not run: `next build`, the DB-backed integration suite, any browser verification. The `createAskExecution` rejection/rebind path is covered by resolver unit tests and source-shape guards, not by an executed end-to-end request; that and the live-environment checklist remain open.

## Appendix B — Phase 2 implementation record and Phase 3 entry-gate packet

### B.1 What shipped

New modules under `apps/backend/src/services/ask/suggestedActions/`: `suggestedNextActionRegistry.ts` (limits, budget, ranking policy `sna-rank-1`, tier bases, weights, minimum score, source precedence, per-operation outcome vocabularies, the missing-fact capture mapping, TTL overrides, the domain freshness matrix, and `validateSuggestedNextActionRegistry()`), `suggestedNextActionCandidate.ts` (strict candidate schema; a candidate cannot declare state, score, id or expiry; materialization with registry TTL capped at the source execution), `suggestedNextActionEligibility.ts` (the eleven ordered rules as a pure evaluator over one pre-batched context, each failing with its own bounded reason code), `suggestedNextActionRanking.ts`, `suggestedNextActionDeduplication.ts` (semantic-identity grouping, reason-code merge, rich-card presentation-identity suppression), `suggestedNextActionPolicy.ts` (validate, evaluate, score, deduplicate, diversity re-scoring, discovery reserve, limit four, with counted diagnostics), `suggestedNextActionProducers.ts` (static producer registry), `suggestedNextActionEntityValidators.ts` (batched per-entity-type validators), `suggestedNextActionPresentationIdentities.ts`, `suggestedNextActionHistory.ts`, and `finalizeSuggestedNextActions.ts` (the shared finalizer).

**Seams.** The finalizer is called from `executeOperation.ts` `finalize()` (read path, clarification resumption, property selection, capture and the conflict-refresh path, which atomically replaces the stored ledger), from `askConfirm.ts` for confirmed results, and from `createAskExecution.ts` for routing clarifications. `scripts/ask-suggestion-sites.js` now carries a reviewed finalizer classification for every persisting file (WIRED, VIA_EXECUTE_OPERATION, PENDING_INTERACTION, RECOVERY_PHASE_4, LEDGER_PRESERVING); an unclassified file fails `tests/ask/askSuggestionPersistenceSites.test.js`, which also asserts every WIRED file calls the finalizer and that only the finalizer and candidate module mint typed actions.

**Behaviour guarantees (tested).** No nomination means no reads at all (no availability, entity, history or expiry query). Producer errors and over-budget nonessential producers are dropped and counted. A failed context load or entity validator ships the safe answer with no typed actions. An entity type with no registered validator fails closed. A handler cannot smuggle a final typed action; only candidates are accepted and the internal candidate field is never persisted. Output is deterministic under an injected clock, including under shuffled input.

**Supporting change.** `discoverableAskOperationIds` is now a thin wrapper over the new `evaluateAskOperationAvailability`, which returns the first failing reason per operation (boundary, health, authorization, audience). The eligibility rules read that single source of truth, so there is no second copy of the filter to drift. Behaviour of the original function is unchanged (its capability-discovery tests pass).

### B.2 Deviations and decisions made while implementing (review these)

1. **`PENDING_WORK` added to the action source enum.** The plan listed a pending-work producer but no matching source value. Nothing has been persisted with the enum yet, so the addition is safe.
2. **Minimum display score is 1060**, not an unspecified value. The plan asked for a minimum score; at lower values it could never omit anything. At 1060 a DISCOVERY action must earn 60 points of readiness, confidence or signal; every higher tier clears it comfortably. The registry validator rejects values that never omit.
3. **`SUPPRESSED` verdict.** The plan names three eligibility states; interaction-conflict, history and safety-mode outcomes are intentional suppressions rather than "unavailable", so the evaluator returns an internal `SUPPRESSED` for them. It is never persisted or shown.
4. **Rich item actions may declare `outcomeKey`** (optional, additive on the item action schema). Only an action that declares a registered outcome on a compact interaction publishes a presentation identity; nothing is inferred from label or message.
5. **The Phase 1 stand-in `suppressRepeatedSuggestedNextActions` was removed**; typed history suppression now lives in eligibility rule 10 via `suggestedNextActionHistory.ts`. The string suppression stays until Phase 5.
6. **`currentOutcomeKeyHashes` is plumbed but empty.** Only a domain's own handler knows what outcome it just produced; each Phase 3 migration fills it for its operation.
7. **The string-compatibility producer is all-or-nothing per result**, because the frontend renders typed actions instead of strings; a partially mapped result would otherwise lose its unmapped chips.
8. **Open Phase 3 task: the non-calm shell.** `AskWorkspace` renders `execution.suggestions` under each answer outside the calm shell and does not read typed actions. Calm-first is the product direction, but each migrated domain must also render typed actions there or accept that the non-calm shell shows its legacy strings.
9. **The recovery branches remain string-only** (classified RECOVERY_PHASE_4): failure, expiry, cancel, conflict and stale-selection results. They become the platform-recovery producer in Phase 4, in SAFE_RECOVERY_ONLY mode, which the evaluator already supports.

### B.3 Entry-gate packet (the Phase 3 gate in §9 requires your approval of these values)

| Gate | Where | Value / status |
| --- | --- | --- |
| Versioned weights (**shipped OFF**: first release is `RANKING_MODE = TIER_ONLY`; weights apply only if switched to `WEIGHTED`) | `SCORE_WEIGHTS`, `SUGGESTED_NEXT_ACTION_RANKING_POLICY_VERSION = sna-rank-1` | exact entity +100, current-result ownership +60, active goal +80, materiality 0/20/40/60, ready +40, confidence up to +40, recency penalty -150, diversity -50 per repeat capped at -150. Snapshot-pinned by hash in `suggestedNextActionsPhase2.test.js`. |
| Tier bases | `TIER_BASE_SCORE` | CONTINUE 4000, RECORD_ACTION 3000, RELATED 2000, DISCOVERY 1000. Tests prove no tier can cross another after adjustments (max +380, min -300). |
| Minimum score (**shipped OFF**, WEIGHTED mode only) | `MIN_DISPLAY_SCORE` | 1060 (see B.2.2). |
| Limits | `SUGGESTED_NEXT_ACTION_LIMITS` | 4 shown, 12 per producer, 60 total, 1 discovery action beside a stronger one. |
| Latency / query thresholds | `SUGGESTED_NEXT_ACTION_BUDGET` | 250 ms pipeline budget (nonessential producers dropped first), at most 6 batched context queries. Initial values chosen for the Raspberry Pi; measured p50/p95 from `ask_suggested_actions_pipeline_duration_seconds` should replace them once typed producers exist. The 6-query ceiling is declared and documented, not yet enforced by a runtime counter. |
| Source precedence | `SOURCE_PRECEDENCE` | PENDING_WORK, PLATFORM_STATE, ENTITY_ACTION, MISSING_DETAIL, OPERATION_RESULT, SKILL_HANDOFF, ACTIVE_GOAL, CAPABILITY_RECOMMENDATION. |
| TTL rules | `SUGGESTED_NEXT_ACTION_DEFAULT_TTL_MS`, `OUTCOME_TTL_OVERRIDES_MS` | 30 min write/workflow, 24 h continue, per-outcome overrides (none yet), always capped at the source execution expiry. |
| Domain freshness matrix | `DOMAIN_FRESHNESS_MATRIX` | Version helpers exist for inventory item, room, maintenance task, warranty, home event, radar match and inspection finding (a test confirms the exported ones still exist). **Claims has no exported helper**: it derives its version inline in `claims.handler.ts`, so its strategy is an explicit requery rule until the Claims migration step extracts one. |
| Fact -> capture -> operation mapping | `MISSING_FACT_CAPTURES` | Complete for the 13 inventory correction fields (a test asserts it equals `INVENTORY_CORRECTION_FIELDS`). **Rooms, warranties, home events, maintenance and claims have no missing-detail mapping yet**; each domain adds its own with its migration, because the plan's missing-detail examples are inventory-only. |
| Injected clock | `suggestedNextActionClock.ts` | Used by materialization; determinism tested. |
| Outcome vocabularies | `SUGGESTED_ACTION_OUTCOMES` | `INVENTORY_ITEM_CORRECT` (13 outcomes) and `CAPTURE_FACT_CONFIRM`. Other domains declare theirs as they migrate; an operation with no entry cannot nominate a typed action. |

**Decisions (October 4, 2026, owner):** start with the simple tier-only ranking and add weights later only if the chips feel wrong in practice; the weights and minimum score stay in the code, switched off. Still open: confirm the 250 ms budget, that the 6-query ceiling stays declared but unenforced, and that per-domain missing-detail mappings are added with each domain.

### B.4 Verification

Executed locally: backend `tsc --noEmit` clean; `tests/ask/suggestedNextActionsPhase2.test.js` (40 tests), `suggestedNextActionsPhase1.test.js`, `askSuggestionPersistenceSites.test.js`, `askNextActions`, `askGovernance`, `askImportGraphGuardrails` and `askCapabilityDiscovery` run; the full chunked Ask run result is recorded in the commit message of the implementing change. The two failures in those files, `askGovernance` golden routing and `askImportGraphGuardrails` support re-exports, also fail on an unmodified checkout. Not run: any DB-backed suite, any live request. The finalizer's default loaders (`ensurePropertyAccess`, `evaluateAskOperationAvailability`, the execution-expiry read) and the three seam call sites are exercised only through injected dependencies and source-shape guards, never against a real database, and no typed producer exists yet, so the finalizer returns an empty ledger in production until Phase 3.

## Appendix C — Simplified delivery (owner decision, October 4, 2026) and inventory conversion

### C.1 What changed in the plan

There are no real customers, so the plan is no longer a staged migration with a compatibility boundary. The decisions are:

1. **Convert handlers directly to typed candidates; no migration phases.** "Migrating" only ever meant rewriting a handler to return typed candidates instead of plain strings. There are no per-domain exit gates, rollback story or "domain A must not depend on domain B" rules.
2. **No string-compatibility layer.** The explicit string-mapping table, the all-or-nothing string producer and their tests were deleted. An unconverted handler keeps returning plain strings, which render as ordinary text chips through the typed-first fallback in `followUps.ts` and the existing string history suppression. That fallback is the only compatibility behaviour left.
3. **Convert the six priority domains only**: inventory, rooms, maintenance, warranties, home events (and radar), claims and inspection. The other ~40 handlers (about 440 string declarations, mostly generic prompts) stay as plain-text chips unless a later need appears.
4. **Ranking is tier-only** (`RANKING_MODE = TIER_ONLY`); the weights and minimum score are built but switched off until real chips show a need.
5. **Landing starters are ordinary prompts**, with no signing, secret, token or special ranking.
6. **Per-domain mappings, outcomes, entity validators and freshness entries are added in the same change as the domain's conversion**, not up front.
7. **Not required before conversion:** the 250 ms budget stays as a safety net; the 6-query ceiling stays declared and unenforced.

### C.2 Conversion recipe (what each domain does)

1. The handler builds candidates (`SuggestedNextActionCandidate`: operation, interaction type, registered outcome key, exact entity and context version) and returns them as `suggestedNextActionCandidates`; the shared finalizer does the rest.
2. Declare the domain's outcome keys in `SUGGESTED_ACTION_OUTCOMES`, and any missing-fact mapping in `MISSING_FACT_CAPTURES`.
3. Register a batched entity validator under `suggestedActions/entityValidators/` and add it to `registerAll.ts`; put the version helper in `domainVersions.ts` if the handler's own module would create an import cycle.
4. If the target operation re-reads its message to choose what to do (as the inventory correction did), have it read the registered outcome from `launchContext.outcomeKey` instead.
5. Replace the handler's ambiguous strings for that result with a plain fallback string; add tests for ordering, eligibility, stale/deleted/other-property entities, viewer authorization, and the wiring.

### C.3 Inventory (converted)

**Where typed actions appear.** On the two inventory receipts in `recordConfirm.handler.ts`: after an item is created and after a field is corrected, Ask now offers the details that same item is still missing (purchase date, brand, model, serial number, in that order, at most three), each naming the exact item. The create receipt previously suggested "Set the purchase date for this inventory item", an item-ambiguous string; that is gone. The plain fallback is `Show my home inventory` and only displays when the item has nothing left to add.

**What shipped.** `inventoryMissingDetailCandidates` in `inventory.handler.ts`; `domainVersions.ts` (the shared leaf `inventoryItemContextVersion`, re-exported by the handler); the batched `INVENTORY_ITEM` validator (`entityValidators/inventoryItem.ts`, one query for all candidates, registered through `registerAll.ts` and loaded by the finalizer); `correctionFieldForOutcome` in the registry; `launchContext.outcomeKey` set by the server from the stored offer; and `inventoryCorrectionFieldFor`, which makes a selected action pick its correction field from the outcome instead of re-reading the message. That last change fixes a latent routing bug: free-text parsing looked for words like "room" or "brand" anywhere in the message, so an item named "Room AC" redirected a brand correction to the room link.

**Deliberately not changed.** The inventory lookup answer's own generic prompts ("Show incomplete inventory records", and so on) remain plain strings, and its item rows already carry rich action buttons that perform the same corrections, so adding compact chips there would only duplicate them. The non-calm shell still shows the plain fallback string instead of typed chips; calm is the default and the shell most users see.

### C.4 Verification

Executed: backend `tsc --noEmit` clean; `suggestedNextActionsInventory.test.js` (12 tests: candidate order and completeness, schema validity, label bound, shared version function, outcome-over-message field selection including the "Room AC" case, finalizer with the real validator including one batched query, deleted/other-property/stale item rejection, viewer authorization, completed-outcome suppression, wiring guards), plus the Phase 1 and Phase 2 suites and the persistence-site guard. Not run: any DB-backed suite or live request; the two receipt handlers and `createAskExecution`'s rebind path are covered by pure-function tests, stubbed-Prisma tests and source-shape guards, not by an executed end-to-end confirmation.

### C.5 Rooms (converted)

**Where typed actions appear.** On the two room receipts in `recordConfirm.handler.ts` (`confirmRoomCreate`, `confirmRoomRename`, which also covers type and floor-level corrections). Each offers one `DISCOVERY` action, "Add an item to <room>", naming the exact room. The plain fallback `Show my rooms` is unchanged.

**Product decision.** Floor level is not offered. It is optional and cosmetic: it only groups rooms in Ask's room map and appears in the Service Price Radar room summary line; no insight, score, coverage, maintenance or recommendation reads it. A room has no other optional fact, so the add-item action is the only chip.

**What shipped.** `roomAddItemCandidates` in `inventory.handler.ts` (next to the add-item message the target handler gates on); outcome `ADD_ITEM_TO_ROOM` on `INVENTORY_ITEM_CREATE`; `roomContextVersion` moved to the leaf `domainVersions.ts` (re-exported by `homeRecordWrites.handler.ts`); batched `INVENTORY_ROOM` validator (`entityValidators/inventoryRoom.ts`, registered in `registerAll.ts`). The freshness-matrix key `ROOM` was renamed `INVENTORY_ROOM`, the entity type the add-item handler already reads from `launchContext` to preselect the room, so no handler change was needed for recipe step 4: selecting the action reaches the same code path as the existing "Add an item" button on a room card.

**Version stamping.** The create receipt has no room read and the rename receipt reads the room before the update, so neither stamps a version (`contextVersion: null`); freshness is then the validator's existence and property checks. This matches the inventory create receipt.

**Verification.** Executed: backend `tsc --noEmit` clean; `suggestedNextActionsRooms.test.js` (9 tests: candidate shape, schema validity, no floor-level outcome, label bound, shared version function, finalizer with the real validator and one batched query, deleted/other-property/stale room rejection, viewer authorization, wiring guards) plus the Phase 1, Phase 2, inventory and persistence-site suites (85 pass). Not run: any DB-backed suite or live request; the receipts are covered by source-shape guards, not an executed confirmation.

### C.6 Maintenance (converted)

**Where typed actions appear.** On the maintenance update receipt (`confirmMaintenanceTaskUpdate`): after a task is **cancelled**, Ask offers "Reopen <task>"; after reminders are **snoozed**, it offers "Resume reminders for <task>". Both are `RECORD_ACTION` undos on `MAINTENANCE_TASK_UPDATE`, name the exact task, and carry the task version the receipt just read, so a later change to the task hides the chip. The receipt's old string `Reopen <title>` is gone; the plain fallback is `What maintenance is pending?`.

**Deliberately not changed.** There is no standalone task-detail result: open tasks are rows in the maintenance list, and each row already has Complete, Reschedule, Remove and "Why is this important?" buttons, so chips there would duplicate them (same reasoning as inventory rows). The **created** receipt stays plain: the task is new and complete, and an "Assign" chip would need a household-membership query on every receipt for a feature that nearly every home (single user) cannot use (owner decision). The **completed** receipt stays plain: nothing is missing, and `actualCost` cannot be edited after completion, so a "record the cost" chip would have no destination.

**What shipped.** `maintenanceUndoCandidates` and the outcome-to-action table in `maintenance.handler.ts`; outcomes `REOPEN_TASK` and `RESUME_REMINDERS` on `MAINTENANCE_TASK_UPDATE`; `maintenanceTaskVersion` moved to the leaf `domainVersions.ts` (re-exported by the handler); the batched `MAINTENANCE_TASK` validator (`entityValidators/maintenanceTask.ts`, one query). `maintenanceUpdateAction(message, outcomeKey)` now prefers the outcome, and `maintenanceTaskUpdateResult` takes `launchContext.outcomeKey` from the `maintenance.update` capability. For a selected suggestion it also skips every other message-derived field (due date, priority, recurrence, service category, snooze date).

**Latent bug fixed.** Free-text parsing matched keywords anywhere in the message, in a fixed order (`remove` before `reopen`), so "Reopen the maintenance task 'Remove old paint'" was read as a permanent delete, and a task titled "Urgent..." added a priority change. A test executes `maintenanceTaskUpdateResult` both ways and shows the delete reading without the outcome and a plain reopen with it.

**Verification.** Executed: backend `tsc --noEmit` clean; `suggestedNextActionsMaintenance.test.js` (12 tests, including the executed update operation with stubbed reads and the finalizer with the real validator: one batched query, deleted/other-property/stale rejection, viewer authorization); Phase 2 and the existing `maintenanceRemoveAction` suites. Not run: any DB-backed suite or live request; the update receipt is covered by source-shape guards, not an executed confirmation.

### C.7 Warranties (converted)

**Where typed actions appear.** On the warranty-recorded receipt (`confirmCaptureWarranty`, which also serves "Add a warranty") and on the warranty-corrected receipt (`confirmWarrantyCorrect`), the latter only when the corrected field is the **expiry date** (the reminder deadline is driven by expiry alone, so a start-date, cost or provider change never triggers it). One `RELATED` action: "Remind me before the <provider> warranty expires", on the exact warranty, offered only while the expiry is still ahead and not when an active reminder already exists for that warranty at the date the monitor would set (the reminder task key `ask-deadline:WARRANTY:<id>` is shared with the confirmation, which remains deduplicated as a second layer). A reminder pinned to an old expiry date, or a cancelled or completed one, does not suppress the action, because confirming moves or recreates it. The plain fallback `Show my warranties` is unchanged.

**Rationale for the other fields.** Policy number, coverage details and cost are real data (cost feeds warranty and savings analysis; policy number and coverage details feed property context and matching), but correcting them has low action value, so they do not justify a suggestion of their own. The warranty-to-inventory-item association is a legitimate product gap that matters to per-item coverage; no chip is offered until Ask has an operation that can set that relationship.

**Exact-target defect fixed.** `homeDeadlineMonitorResult` chose the earliest future warranty on the home from the word "warranty" in the message, so a generated message for a later warranty could have created a reminder for the wrong record. It now takes an optional verified `exactWarranty` target (set only by the `home-deadline.monitor` capability when `launchContext.outcomeKey` is `MONITOR_WARRANTY_EXPIRY` on a `WARRANTY` entity). With a target it reminds about that warranty or nothing: a deleted, other-property, expired or version-changed warranty returns the standard stale-suggestion recovery (`ASK_SUGGESTED_ACTION_STALE`) and the earliest-warranty search is never run. Free text without a target keeps the existing behaviour. The lead time for a targeted reminder is the shared default (`HOME_DEADLINE_DEFAULT_LEAD_DAYS`, 30); digits in a generated message cannot change it.

**What shipped.** `warrantyExpiryReminderCandidates` and `warrantyReminderActionKey` in `warranties.handler.ts`; outcome `MONITOR_WARRANTY_EXPIRY` on `HOME_DEADLINE_MONITOR`; `warrantyContextVersion` moved to the leaf `domainVersions.ts` (re-exported by `homeRecordWrites.handler.ts`) and reused by the existing `WARRANTY` freshness entry; the batched `WARRANTY` validator (`entityValidators/warranty.ts`); the capability wiring and exact-target branch in `miscHandlers.handler.ts`.

**Verification.** Executed: backend `tsc --noEmit` clean; `suggestedNextActionsWarranties.test.js` (12 tests, including the monitor operation executed with stubbed reads: two future warranties pick the exact one, free text keeps the earliest, a forged other-property id, a deleted, changed and expired target each give the stale recovery with no earliest-warranty search, the existing-reminder suppression, and the finalizer with the real validator). Not run: any DB-backed suite or live request; the two receipts and the reminder confirmation are covered by source-shape guards, not an executed confirmation.

### C.8 Home events (converted); Home Event Radar (intentionally plain)

**Where typed actions appear.** On the event-recorded receipt (`captureEventConfirmResult`, which also serves "Add an event") and the event-corrected receipts (`confirmHomeEventCorrect`'s `finish`, and the capture-correction path). Both build their suggestions from the **complete replacement record** (type, amount, inventory item, revision), so they are re-evaluated after every correction: correcting the type, amount or item changes what is still missing.

| Action | Event types | Offered when |
|---|---|---|
| "Link <event> to an inventory item" (`LINK_INVENTORY_ITEM`) | REPAIR only (narrowed from REPAIR/MAINTENANCE/INSPECTION on October 4, 2026, see C.11) | no linked item and the home has at least one visible inventory item |
| "Add the cost of <event>" (`ADD_AMOUNT`) | REPAIR only | no amount recorded (an amount of 0 counts as recorded) |

Both are `RECORD_ACTION` on `HOME_EVENT_CORRECT`; the existing correction dropdown remains the way the value is actually chosen.

**Why these.** Replace-or-repair analysis and the do-nothing simulator read an item's events by `inventoryItemId`, so an unlinked repair-like event is invisible to them. A missing amount does not remove an event from the analysis (it still counts, with zero spend), so the cost action is lower value and is limited to REPAIR. The analysis currently adds INSPECTION and MAINTENANCE amounts to "repair spend"; prompting for an inspection fee would push it into repair history and could bias the result toward replacement, so no cost action is offered for them until those semantics are decided. Room links, importance and visibility are not promoted (timeline filtering only; visibility is a sharing decision).

**Open question for the owner.** Should inspection fees (and maintenance spend) count as repair spend in `replaceRepairAnalysis.service.ts`? Until that is decided, the cost action stays REPAIR-only.

**Exact targeting and recovery.** `launchContext.outcomeKey` now decides the correction field (`LINK_INVENTORY_ITEM` -> `inventoryItemId`, `ADD_AMOUNT` -> `amount`, through `MISSING_FACT_CAPTURES`), replacing keyword matching for a selected action; free text keeps the keyword path. This fixes a latent collision: "Correct the amount of … 'Room Addition permit'" was read as the room field. A selected action's event is authoritative: if it is not among the current, visible events, or its version (`id + revision`) moved on, `homeEventCorrectResult` returns the shared stale-suggestion result (`suggestedActions/staleSuggestedActionResult.ts`, now also used by the warranty reminder) and does not fall back to a title match. A correction creates a new revision with a new id, so a stale chip for the superseded event is rejected rather than silently retargeted.

**Validator.** `entityValidators/homeEvent.ts` (batched, one query) counts an event only while it is the current revision, not deleted, in the same property, and visible to the requester (a PRIVATE event only to its creator), with `homeEventContextVersion` (moved to the leaf `domainVersions.ts`).

**Analysis invalidation (verified by reading, not executed).** The persisted replace-or-repair and do-nothing analyses are marked stale inside `HomeEventsService` (`createHomeEvent` and `updateHomeEvent`, three call sites), which Ask's capture and correction both call, so Ask writes invalidate them exactly as the timeline page does. This is distinct from Ask's own result reconciliation.

**Radar is intentionally plain.** The radar receipts (mark done, feedback, planned task, notification settings) are terminal. The radar detail card already exposes Plan this action, Mark done, Feedback and Notification settings, and repeating them after completion would only dilute the suggestion strip. The visibility receipt also stays plain. Tests assert that neither radar file nominates candidates.

**Verification.** Executed: backend `tsc --noEmit` clean; `suggestedNextActionsHomeEvents.test.js` (16 tests, including the correction operation executed with stubbed reads for the "Room Addition" collision, a superseded or changed target, and an unchanged free-text path, and the finalizer with the real validator for superseded, deleted, other-property, private-to-someone-else and wrong-version events); Phase 2 suite. Not run: any DB-backed suite or live request; the two receipts are covered by source-shape guards, not an executed confirmation.

### C.9 Claims and inspection findings (closed as terminal, by decision)

**Decision (October 4, 2026).** No typed action is added for claims or inspection findings. A chip is worth offering only if a downstream feature consumes the missing fact and the action is not already a control on the result; neither holds here.

**Claims.** The draft-created receipt and the status-updated receipt are terminal. Every valid next status is already a button on the claim row (`claimItemActions`, from the canonical lifecycle). The one real next step after a draft is finishing its checklist (documents), which Ask cannot do, and "Submit" would be blocked by that checklist (`CLAIM_SUBMIT_BLOCKED`). The claims answer's generic prompts ("What do I need for an insurance claim?") are unchanged. The version helper was **not** extracted from `claims.handler.ts` / `workflowConfirm.handler.ts` because no validator needs it; `DOMAIN_FRESHNESS_MATRIX.CLAIM` keeps its requery rule. Extract one only when a claim action is added.

**Inspection findings.** Accept as work, Dismiss and Mark resolved are controls on the card deck, and the batch and single receipts end with the plain `Show remaining inspection findings`. The one change: the findings answer used to suggest `Accept <system> finding <raw finding id> as work` for its first two findings. That string showed a raw database id to the homeowner and was returned regardless of role, so a viewer was offered a write. It is removed (`suggestions: []`); the deck's controls are the actions. A test lists the findings as both a contributor and a viewer and asserts no chips.

### C.10 Phase 3 closeout

**Complete:** inventory (C.3), rooms (C.5), maintenance (C.6), warranties (C.7), home events (C.8; radar intentionally plain), claims and inspection (C.9; terminal by decision). The other ~40 handlers keep plain-text chips. Original Phases 4 and 5 are replaced by Appendix C and are not scheduled.

**Open owner question.** Should inspection fees and maintenance spend count as repair spend in `replaceRepairAnalysis.service.ts` (about line 396)? Until decided, the event cost action is REPAIR-only.

**Not verified.** No domain was exercised against a real database, a live request, `next build` or a browser; tests use stubbed reads and source-shape guards. The chunked Ask run has the same 6 failures as an untouched HEAD. The non-calm shell still shows only the plain fallback strings, not typed chips (accepted).

**Manual checklist for a real backend (calm Ask shell).** Use sarah@example.com (owner) and check one chip per domain; each should name the exact record and, when selected, open a review or form for that record only.
1. *Inventory:* add an item with no brand or model -> receipt offers up to three "Add the ..." chips for that item; select one -> the correction card is for that field and item.
2. *Rooms:* add a room -> receipt offers "Add an item to <room>"; select it -> the add-item form opens with that room preselected.
3. *Maintenance:* cancel a task through Ask -> receipt offers "Reopen <task>"; snooze one -> "Resume reminders for <task>". Select each -> review card for that task. Try a task titled "Remove old paint" to confirm it reopens rather than deletes.
4. *Warranties:* add a warranty that expires in the future -> receipt offers "Remind me before the <provider> warranty expires"; with two warranties, select it for the later one -> the reminder review names that provider, not the earliest. Correct a start date -> no chip; correct the expiry date -> chip. Confirm the reminder, correct the expiry again -> chip reappears for the new date.
5. *Home events:* record a repair event with no item and no cost -> receipt offers the link and the cost chips; a maintenance or inspection event -> link only; a note -> none. Select the link chip -> the card's dropdown lists the home's items.
6. *Stale:* offer a chip, change the record elsewhere (edit the warranty, correct the event), then select the old chip -> "That suggestion is no longer available".
7. *Viewer:* as a viewer account, the write chips above should not appear, and the inspection findings answer should show no chips.
8. *Inspection findings:* open the findings answer -> no "Accept ... finding <id>" chip; the deck's controls still work.

### C.11 Repair-history semantic correction (owner decision, October 4, 2026)

**Decision.** Inspection fees and routine maintenance do not count as repair spend or as failure evidence; replacements are not repairs; until corrective maintenance is structurally distinguishable from preventive maintenance, only canonical `HomeEventType.REPAIR` counts, for both repair count and repair spend. This answers the open question in C.8.

**What changed (outside Ask).** One shared definition, `services/repairHistory.ts` (`repairHistoryEventWhere()`: `REPAIR`, `isCurrent: true`, `deletedAt: null`; 30-month lookback), now used by all four consumers: `replaceRepairAnalysis.service.ts` (generic items), `decisionPlatform/hvacRepairReplaceEngine.service.ts`, `homeActionSourcePromotion.service.ts` (recurring-failure enrichment; its evidence label and copy now say repairs only), and `doNothingSimulator.service.ts` (still property-wide, 36-month window; classification by type, not title). In the generic analysis the title-keyword "replace" signal that could force `REPLACE_NOW` was removed, the persisted assumption names changed from `repairsLast24m` / `repairSpendLast24mCents` to `repairEventCountLast30Months` / `repairSpendCentsLast30Months` (only that service reads them), and the "has history" confidence signal now means "has a repair event". Compound rule `RECURRING_FAILURE_REPAIR_REPLACE_READINESS` is version 1.1; the Home Intelligence FRD is v1.33 and the Capital audit item 8 is marked resolved.

**Behaviour changes to expect.** Items whose only history is inspections, routine maintenance or a "replace" titled event will show lower failure probability and fewer replace verdicts than before; a repair titled "Replace ..." no longer forces `REPLACE_NOW` by itself; Home Actions stop citing maintenance as recurring-failure evidence. Existing stored analyses keep their old assumption names until recomputed (they are marked stale when events change).

**Deliberately not added.** No separate maintenance or inspection spend metrics (they would need a reliable classification and no ownership-cost consumer needs them yet). Inspection findings can still inform the decision through condition and severity; the inspection fee itself is not evidence of failure.

**Ask chips.** The event link chip is narrowed to REPAIR (C.8 table); the cost chip was already REPAIR-only.

**Verification.** Executed: `tsc --noEmit` clean; `tests/unit/repairHistoryClassification.test.js` (8 tests: the generic analysis and the HVAC context composition executed with stubbed reads that apply the query's own filters, so inspection/maintenance/"Replace furnace"/superseded/deleted/out-of-window rows are proven to change nothing while a real repair still counts; source-shape guards for Do-Nothing, which is not executed because it needs scenario and preference state); the Home Action recurring-failure suite (updated to apply the query's filters, plus a new test with five non-repair rows); the Ask event tests. Fixture changes were limited to those two recurring-failure expectations (copy "repair events", no maintenance evidence label). Not run: any DB-backed suite or live request. Three `tests/decisionPlatform` tests (change-emitter governance x2, HVAC routing x1) fail on an untouched HEAD as well.

### C.12 Review follow-up: stale selection everywhere, and the suggestion strip while loading (October 4, 2026)

An external review of Phases 1-3 raised three findings; each was checked against the code.

1. **Stale selection (fixed; wider than reported).** Inventory correction, maintenance update and "add an item to a room" ignored the offered `contextVersion`, and when the offered record was missing they fell back to matching the message text (`exactEntityMatch`, `maintenanceCompletionMatch`), which could open a review for a different record with a similar name. Home events and the warranty reminder already treated their target as authoritative (C.7, C.8). A shared `suggestedActions/typedTarget.ts` (`resolveTypedActionTarget`) now does it once: a launch that names a registered outcome on the handler's entity type is a typed target; missing or version-moved is stale and returns `staleSuggestedActionResult()`; an unregistered outcome is ignored; row buttons without an outcome keep their existing resolution. A receipt that stamped no version (`contextVersion: null`) is checked for existence only. Tests execute each handler with a deleted or changed record alongside a similarly named record.
2. **`currentOutcomeKeyHashes` is always empty (recorded, not changed).** True, but covered: the history loader already includes the current execution's own selection, so a selected action's outcome is suppressed as `EQUIVALENT_COMPLETED`, and every producer builds candidates from the updated record, so a just-filled field is not re-offered. It would matter only for a handler that nominates an outcome it just performed from a free-text request; none does. A real fix needs handlers to declare the outcome they produced. Left as is by decision; revisit if such a producer is added.
3. **Strip hidden while loading (fixed).** `FollowUpRow` returned nothing while the global loading flag was true. It now stays rendered; the chip that started the request is disabled with `aria-busy` and a spinner (`pendingFollowUpKey` in `AskWorkspace`), and the others stay visible but `aria-disabled` and inert, because `ask()` refuses to start a second request, so a live click would be a silent no-op. This is slightly stricter than "disable only the selected action" (plan §10) and is the deliberate trade-off of the one-request-at-a-time workspace. A request started another way (a typed question) leaves every chip inert and none pending.

### C.13 Phase 4 — platform recovery: branch inventory (owner-approved scope; IMPLEMENTED October 4, 2026, not live-verified)

Scope is recovery only. A branch gets a typed `SAFE_RECOVERY_ONLY` chip only if it can name all five of: label, target operation, entity source, outcome key, and why it is safe and useful. Otherwise it produces no chip. Skill handoffs, `askNextActions.ts`, active goals, Phase 5 string removal and cancellation chips stay out of scope. Findings below are code-traced, not executed.

| Branch (code site) | Label | Target operation | Entity source | Outcome key | Safe / useful, or why no chip |
| --- | --- | --- | --- | --- | --- |
| Retryable failure (`createAskExecution` catch, `askClarification` x2, `askSessions` orphan reclaim, `FAILED_RETRYABLE`/`UNAVAILABLE`) | none | n/a | n/a | n/a | **No chip.** `ExecutionCard` already renders "Try again with current records" from `correctionCapabilities.retryResponse`, and it calls `retryAskExecution`, which pins the stored operation and reruns every check. A chip would duplicate a button. The string chip "Ask this question again" is removed. |
| Expired confirmation (`askConfirm` ~189), expired clarification (`askClarification` ~50), expired pending work (`askSessions` `expirePendingInteraction`) | "Start <task> again" | the execution's stored `operationId` | the stored `launchContextJson` entity (type/id/version), re-validated | `RESTART_AFTER_EXPIRY` | Reruns through `createAskExecution`, so authorization, applicability and freshness run again, and a write operation produces a fresh confirmation. Chip only if the operation is still registered and not unavailable, and the entity (if any) still validates. `<task>` comes from the operation definition's title; with no title there is no chip. |
| Confirmation conflict (`askConfirm` ~332, `ASK_CONFIRMATION_CONFLICT`) | "Review current <item name>" | `INVENTORY_LOOKUP` with the exact item as launch entity | the conflicted execution's `launchContextJson` when `entityType` is `INVENTORY_ITEM`; item re-read for existence and name | `REVIEW_CURRENT_RECORD` | Read-only. **Only inventory items qualify.** Maintenance task, warranty, home event and room have no exact-entity read operation, so those conflicts get no chip. |
| Stale selection (`staleSuggestedActionResult`, `suggestedActionRecoveryResultJson`) | "Show current <item name>" | same as conflict | the rejected action's `entityContext` | `REVIEW_CURRENT_RECORD` | Same exact-read requirement: inventory items only, and only if the item still exists (deleted means no chip). Rejections that are not version staleness (message/property mismatch, unregistered, not offered, expired) get no chip. |
| Cancellation (`askConfirm` ~510 and ~546) | none | n/a | n/a | n/a | No chip by decision. The two plain strings ("Ask a new question", `command.cancellation.suggestion`) are removed. |
| Unavailable / disabled (`askConfirm` ~59/~149, `askCapture` ~251) | none | n/a | n/a | n/a | No chip; no retry while eligibility reports unavailable. Any string the branch produces is removed. |
| Property required (`createAskExecution` ~79 "Help me with <choice>") | unchanged | existing continuation | n/a | n/a | Left as is; not a generic recovery chip. |
| Fallbacks (`executionState` unsupported schema, `askNotificationContinuation`) | none | n/a | n/a | n/a | No actions. |

**Owner decisions (approved):** (1) the retry branch yields no chip because a button already exists, and `retryResponse` also covers most `UNAVAILABLE` executions, so an unavailable execution may still show that button even though it gets no Suggested Next Action chip; Phase 4 does not change the retry contract; (2) conflict and stale chips cover inventory items only; (3) only the top-level compact `suggestions` are removed from the cancel and unavailable results, and explanatory blocks, boundary content (including the block-level suggestions inside the operational-boundary block), card actions, the composer and the retry button are untouched.

**Implementation record.**
- `suggestedActions/recoveryCandidates.ts` holds the three builders: `restartAfterExpiryCandidates`, `reviewCurrentInventoryItemCandidates` and `finalizeRecoveryActions` (runs candidates through the shared finalizer; passes an empty message so the "already asked" rule does not suppress a restart, which repeats the stored message by design; returns `[]` on any failure).
- Registry: `RESTART_AFTER_EXPIRY_LABELS` is the reviewed, bounded label registry. It lists `MAINTENANCE_TASK_CREATE`, `REFINANCE_RATE_MONITOR` and `QUOTE_COMPARISON_CREATE`, the operations whose stored message alone recreates the request (message-routable, no target entity, no read of `launchContext.outcomeKey`/entity). `RESTART_AFTER_EXPIRY` is declared per labelled operation in `SUGGESTED_ACTION_OUTCOMES` (never globally), `INVENTORY_LOOKUP` declares `REVIEW_CURRENT_RECORD`, and both are repeatable because recovery can recur. Confirmation-bearing operations that are reached only by a declared action or depend on launch context (corrections, captures, room/inventory create, guidance journey create) are deliberately not listed, so their expiry gets no chip.
- Wiring: expired confirmation (`askConfirm`), expired clarification (`askClarification`) and expired pending work (`askSessions.expirePendingInteraction`) attach the restart chip; the confirmation conflict attaches "Review current <item>" when the stored launch entity is an inventory item that still exists; the inventory correction handler's stale-selection result passes the same item to `staleSuggestedActionResult`; the other stale callers pass nothing.
- Strings removed: "Ask this question again" (all branches, including skill-binding expiry), "Ask a new question", the command cancellation suggestion, and the top-level suggestions of `operationalUnavailableResult` and the capture/confirm unavailable paths. The audience-inapplicable branch keeps its suggestions (not part of the approved scope). Property-required continuation is unchanged.
- Skill-binding expiry (`executionState`) loses its string but gets no restart chip: it expires because the skill policy changed, which is outside the approved list.
- Persistence-site baseline: `RECOVERY_PHASE_4` is replaced by `RECOVERY_FINALIZED`; `tests/ask/suggestedNextActionsRecovery.test.js` covers the builders, the registry rules, SAFE_RECOVERY_ONLY and the removed strings.
- Review follow-up (both findings verified against the code, fixed): the recovery item lookup and the shared `INVENTORY_ITEM` validator now apply `visibleInventoryItemWhere()`, as normal inventory reads do, so a hidden or not-present item gets no "Review current" chip (and no inventory chip of any kind); and a failure while building recovery actions is logged and counted (`ask_suggested_actions_producer_failures_total{producer="platform.recovery"}`), so it is distinguishable from an intentional no-chip decision.
- Not executed against a real backend; manual checks: let a maintenance-task confirmation expire and select the restart chip; confirm a stale inventory correction (edit the item elsewhere first) shows "Review current <item>"; confirm a retryable failure shows only the existing retry button.

### C.14 Phase 5 raw-producer closure (containment adopted October 4; completed October 7, 2026)

The October 4 owner decision first adopted a CI-only containment ratchet. That intermediate state preserved the reviewed legacy strings while preventing new producer sites. It is retained here as implementation history; the October 7 closure below supersedes its runtime behavior and baseline.

**Original containment guarantee (superseded):** no new raw string-suggestion producer file and no additional raw producer site could be introduced in production Ask code; existing producers remained bounded at a reviewed per-file baseline.

**Original containment behavior (superseded):** existing string chips, the typed-first frontend fallback, `suppressRepeatedAskSuggestions`, and unconverted handlers were initially preserved. The string-to-operation compatibility mapping layer had already been removed earlier (Appendix C.1).

**Mechanism.** `apps/backend/scripts/ask-raw-suggestion-producers.js` parses `src/services/ask/**` with the TypeScript AST and counts a `suggestions:` property in an object literal whose value contains a string or template literal. It does not count `suggestions: []`, pass-throughs (`result.suggestions`, `stored.suggestions ?? []`, shorthand), a block's own metadata (an object with a string-literal `type`), test files, typed candidates, or anything outside `src/services/ask`. The reviewed per-file counts are in `docs/architecture/ask-raw-suggestion-producers.json` (232 producers in 54 files at adoption; the largest are `buyerPlan.handler.ts` 36 and `hvacDecision.handler.ts` 21). `tests/ask/askRawSuggestionProducers.test.js` (part of `test:ask:chunked`) fails on a new producer file or on an increase above a file's baseline, and prints each file with its count delta. A decrease never fails, and a drop in one file buys no headroom in another. `node scripts/ask-raw-suggestion-producers.js --check` runs the same check; `--write` rewrites the baseline.

**Full Phase 5 completed (October 7, 2026).** After exact-four activation supplied the governed replacement inventory, every remaining top-level raw producer was reviewed and deleted rather than mechanically converted: 229 direct initializers across 52 production files, plus 13 indirect `result.suggestions` mutations. Rich block/page actions, typed result-specific candidates, recovery candidates, profile gaps, urgent work, active plans, governed capabilities and curated starters remain the intentional destinations. The raw-producer baseline is now pinned at zero and CI rejects any reintroduction; it may no longer be raised through an “approved increase.” The independent `suppressRepeatedAskSuggestions` branch is removed because typed eligibility owns semantic history suppression. Notification-created Ask executions persist an empty raw list with the governed marker. Both calm and non-calm shells render governed typed actions; raw strings render only from historical executions that lack `suggestedNextActionsGoverned`. No database/schema change. Static and environment-independent verification is recorded with this implementation; live database/browser verification remains outside the repository validation policy.

The final scanner also counts later `.suggestions = ...` assignments whose right-hand side constructs text. Indirect pass-throughs remain allowed only for historical persisted results; the persistence-site baseline (C.1/C.13) covers where results are written. The zero baseline is an invariant and must not be raised.

### C.15 Exact-four engagement and governed opportunity backfill (owner-approved scope; NOT IMPLEMENTED)

**Decision.** Ask Cozy is an active guide, not a result page that leaves the homeowner at a one-chip dead end. Every settled, normal, property-scoped answer must therefore show exactly four distinct typed Suggested Next Actions. This decision replaces the earlier “at most four / prefer an empty slot” rule. Four is the fixed count for this increment; a later decision may raise it when Ask Cozy becomes the main product entry point.

**Exceptions.** “Exactly four” does not apply while the homeowner is already being asked to complete a property selection, clarification, inline capture, confirmation, safe recovery, or emergency/restricted interaction. Adding unrelated choices in those states would compete with the required step or weaken the safety boundary. Retryable failures retain their dedicated retry control. Non-property answers require a separately approved global-opportunity inventory and are not silently filled from a selected or guessed home.

**Selection order.** The shared policy fills the four positions in this order, with authorization, applicability, freshness, history suppression and cross-surface deduplication applied before selection:

1. Continue unfinished work or the exact workflow opened by the current answer.
2. Act on urgent or time-sensitive home work.
3. Complete or correct the exact record currently in view.
4. While actionable profile completeness is below 90%, capture the highest-value applicable missing home-profile details.
5. Act on another ranked, current home opportunity.
6. Explore a governed capability whose homeowner outcome is timely for this home.
7. Use a safe curated property-scoped starter only when the stronger inventories still contain fewer than four eligible actions.

The finalizer must backfill after result-specific ranking rather than asking each handler to manufacture four candidates. All displayed items are ledger-backed `SuggestedNextAction` objects; legacy strings cannot satisfy an exact-four position. A visible row, card, deck or page action with the same semantic destination suppresses the compact candidate, including the maintenance result's current “Create a task” / legacy “Create a maintenance task” duplication.

#### C.15.1 Actionable profile completeness

The 90% threshold is **not** the existing broad `getContextCompleteness()` percentage without further classification. That percentage spans all scopes in the snapshot and includes derived facts and operational records. Requiring a homeowner to create a claim, project, report, scenario or tool output merely to improve a profile score would be false completion and promotional product use.

Add a versioned actionable-profile definition over the canonical fact catalog. Its denominator contains only facts that are:

- applicable to this property after the catalog's `notApplicableWhen` rules;
- useful inputs to one or more live downstream insights, decisions, reminders or recommendations; and
- answerable or correctable by this household through a registered inline capture or canonical edit flow.

It may include property type/use/occupancy, core dimensions and age, structure, major systems, safety equipment, responsibility, relevant exterior context, rooms and major inventory coverage, plus financing details only when mortgage applicability is established. It excludes derived/read-only facts, product setup state, facts the household cannot correct, operational-record existence (claims, projects, permits, reports, scenarios and similar tool outputs), non-applicable facts, and reviewed optional skips. Conflicted or stale actionable facts remain incomplete. The definition and its materiality weights are registry data with a version, not handler prose.

Below 90%, missing-profile candidates normally consume every unfilled position after current-answer, urgent and exact-record actions. The policy may reserve **at most one** position for a strongly relevant opportunity so Ask can expose useful capabilities without allowing discovery to displace profile completion. At or above 90%, ranked home opportunities may fill all positions not occupied by stronger current work.

Each missing-detail chip must state the concrete value or bounded group being requested and launch its registered capture directly. Examples include “Add your current mortgage rate” only when an active mortgage applies and that exact value is missing, or “Add light details for the living room” when room-light context is missing and consumed by plant guidance. A chip must not collect a fact that no downstream feature consumes.

#### C.15.2 Opportunity discovery without tool promotion

Opportunity backfill is selected because it helps the homeowner now, not because a tool needs exposure. Labels lead with the outcome and do not use the internal product name unless the name is necessary for comprehension. Prefer “Compare selling, renting, and staying”, “Find plants that fit your rooms”, and “Prepare essential home information for someone you trust”; do not use “Try Sell / Hold / Rent”, “Open Plant Advisor”, or “Set up Digital Will”. The transcript may explain why the opportunity is relevant, and the destination may be the canonical tool.

Every opportunity requires a registered operation/outcome, a direct Ask launch or bounded capture path, current capability health/readiness, a non-sensitive reason code, and a “why now” signal. Random rotation, paid placement, inventory balancing and repeated exposure solely to advertise a capability are prohibited. The row shows at most one opportunity unrelated to the current answer. Recently shown, dismissed, declined or completed opportunities use governed cooldown/suppression; a repeated opportunity must have a material state change or explicit repeatability rule.

Example governance:

- **Ownership outlook:** “Compare selling, renting, and staying” may appear when ownership outlook is unknown or a governed property/life-stage signal makes the decision timely. Asking whether the homeowner plans to sell is allowed only when the answer is stored in a canonical planning/goal record and changes downstream recommendations.
- **Plant guidance:** “Find plants that fit <room>” requires an eligible room and its required light/context facts. When those facts are absent, a higher-priority actionable-profile chip captures them first. The chip launches `PLANT_CARE_OUTLOOK` or its registered prerequisite capture, never an unpinned free-text prompt.
- **Home continuity:** homeowner copy uses “Home Continuity Plan”, not “Digital Will”, and never implies a legal will. This capability is highly sensitive and currently requires an explicit trigger; it is not generic backfill. It may appear only when a governed continuity/handoff signal satisfies that policy, unless the capability-governance owner separately approves changing the explicit-trigger rule.
- **Mortgage details:** a rate/balance/term chip appears only when mortgage applicability is established, the fact is missing or stale, the household role may provide it, and the selected action opens the governed financing capture. A recorded `NO_MORTGAGE` state suppresses mortgage-detail actions; when applicability is unknown, confirming mortgage status outranks requesting a rate.

#### C.15.3 Required implementation work

This scope is not achieved by changing `maxShown` or padding the frontend. It requires:

- a batched, nonessential cross-domain home-opportunity producer registered with the shared finalizer;
- the actionable-profile registry, score and materiality ordering, with direct fact-to-capture mappings;
- adapters for canonical urgent work, active goals/plans and capability recommendations rather than scraping labels from rendered blocks;
- outcome registry entries and deterministic launch contracts for every backfill action;
- exact-four selection after semantic and presentation deduplication, with the exceptional-state modes above;
- impression/dismissal/completion cooldown semantics that do not store raw homeowner text;
- removal or typed conversion of legacy strings that duplicate richer controls; and
- documentation-parity, pure-policy, role/applicability, stale-selection, frontend and integrated-journey tests.

**Acceptance examples.** A maintenance answer that already renders “Create a task” must not repeat that destination in the chip row. If the current answer has no other compact continuation and the selected home is below 90% actionable completeness, the row may instead contain four verified actions such as an applicable missing system fact, a missing safety fact, an applicable missing mortgage fact, and one strongly relevant home opportunity. At 90% or above, the remaining positions come from ranked urgent work, active plans and governed capabilities. Selecting any chip reaches its registered operation/capture without semantic reclassification or requiring the homeowner to restate the request.

#### C.15.4 Clarification decisions and delivery order (owner-approved; NOT IMPLEMENTED)

- **Shortage:** exactly four remains the product invariant. After every governed source and safe starter is exhausted, fewer than four is allowed only as a bounded, measured degraded exception; never pad with an ineligible, stale, duplicate, fabricated or string-routed action.
- **TTL:** keep the existing defaults—24 hours for `CONVERSATION_CONTINUE`, 30 minutes for `MUTATE_RECORD` and `START_WORKFLOW`, all capped by source-execution expiry. Longer outcome-specific lifetimes require registry review.
- **Cooldown persistence:** add the dedicated bounded lifecycle record specified in Ask Redo FRD v1.25 §27.7a, scoped by user/property/operation/outcome with optional bounded reason and entity scope. Initial registry defaults are 7 days after an unrelated opportunity impression, 24 hours after a missing-profile impression, 30 days for “Not now”, indefinite-until-material-change for “Not relevant”, and semantic suppression after completion. Current-answer/urgent/exact-record actions receive no generic impression cooldown.
- **Dismissal:** only explicit “Not now” or “Not relevant” is dismissal. Ignoring a chip, typing another message, selecting another chip or leaving is not. Missing-profile “Doesn’t apply” routes through applicability correction rather than suppression.
- **Registry packet:** before wiring, review included/excluded facts, applicability, downstream consumers, materiality, capture/outcome mappings, roles, grouping, skips, stale/conflicted treatment, mortgage ordering, representative scores, cooldown schema and defaults.
- **Legacy strings:** keep the C.14 ratchet. Review every remaining producer and convert valuable result-specific outcomes, delete duplicates/no-value items, or retain only for historical/exempt use. Exact-four does not require mechanical conversion of every handler, but settled normal rows are typed-only.
- **Home Continuity:** exclude it from generic backfill until a separately approved continuity/handoff signal defines source, timeliness, consent/visibility, suppression and resurfacing. Do not weaken its explicit-trigger/highly-sensitive governance.
- **Sequence:** (1) pure policy/finalizer and degraded diagnostics; (2) actionable-profile registry, mappings, score fixtures, cooldown schema/defaults; (3) owner review; (4) persistence lifecycle and opportunity producer; (5) frontend dismissal, typed-only rendering, deduplication and string disposition; (6) acceptance tests and documentation reconciliation. No partial phase activates exact-four; activation is atomic after the scope can meet the invariant without routine shortages.

### C.16 Exact-four step 1 implemented (pure policy and diagnostics; NOT wired, October 4, 2026)

**What shipped (C.15.4 step 1).** `suggestedNextActionExactFourPolicy.ts` selects four actions in the C.15 slot order from a pool built by the shared stages 1-3 (validation, eligibility, scoring, semantic/presentation deduplication). `suggestedNextActionExactFourRegistry.ts` holds the reviewed constants (count 4, 90% threshold, one unrelated opportunity, reserve rule, cooldown-exempt classes, bounded exempt and shortage reason tokens, policy version `sna-exact-four-1`). `suggestedNextActionExactFourDiagnostics.ts` maps a result to FULL / DEGRADED / EXEMPT and increments `ask_suggested_actions_exact_four_total{result}` (one increment per execution) and `ask_suggested_actions_exact_four_reasons_total{result,reason}` (one per reason; never sum as an answer count). `suggestedNextActionPolicy.ts` was refactored so `evaluateSuggestedNextActionPool` is shared; `selectSuggestedNextActions` behaves as before. The candidate schema gained an optional `slotClass`.

**Not wired.** Nothing in the live finalizer calls the new policy or records the metric; activation stays atomic at step 6. No Prisma change and no database access.

**Decisions I made while implementing (review these).**
1. **Slot classes are requests, not grants (revised after owner review).** A server-owned `PRODUCER_SLOT_GRANTS` registry decides which classes a producer id may occupy; a request outside the grant (explicit `slotClass`, tier, source or trait) is demoted to the grant's fallback, counted as `slotClassDenied`, and then subject to cooldown and the one-unrelated-opportunity cap. Unregistered producers are `HOME_OPPORTUNITY` only. Derivation when granted:  Pending work / CONTINUE tier is continue-work; MISSING_DETAIL on a named entity or any RECORD_ACTION / ENTITY_ACTION is the exact record; MISSING_DETAIL with no entity is a profile gap; CAPABILITY_RECOMMENDATION is a governed capability; the rest are home opportunities. `URGENT_WORK` and `CURATED_STARTER` are never inferred; a producer must declare them.
2. **"Strongly relevant" opportunity** (revised after owner review) needs a contextual signal: ownership by the current answer, an active-goal match, or a **registered** why-now reason; confidence (at least 0.5) only qualifies it and never creates it. `REGISTERED_WHY_NOW_REASONS` is empty until the step 4 review. The reserved slot is held below 90% only when at least two positions are open.
3. **Unknown completeness** (null) fails profile-first (same regime as below 90%) and is reported as `completenessUnknown`, also named `COMPLETENESS_UNKNOWN` on a shortage.
4. **Cooldown is applied before deduplication** so a cooled-down twin can never shadow an equivalent urgent or exact-record candidate. Cooldown data is an input (`cooldownSemanticKeyHashes`); persistence is step 4.
5. **Exempt states** (safe-recovery mode, pending interaction, no property) delegate to the existing at-most-four policy and report EXEMPT; they are never padded.
6. **Only the unrelated-opportunity cap is enforced.** There is no per-operation diversity cap beyond semantic deduplication; add one if real rows look repetitive.

**Producer identity (second and third owner reviews).** The producer id used for grants and cooldown exemption is the registered nominations-map key. As of the third review `producerId` is **removed** from `SuggestedNextActionCandidateSchema` (a candidate that supplies one is invalid) and the identity travels beside the candidate (`producerByCandidate`, `SelectedCandidate.producerId`), so no later code can read an untrusted value. Five handler files and `recoveryCandidates.ts` no longer set a label.

**Registry draft (not wired).** `suggestedActions/actionableProfileRegistry.ts` holds the provisional actionable-profile facts and weights, the server-owned `outcomeKey -> area -> permitted fact keys` mapping (D3), the audience-aware denominator (D12) and a pure `computeActionableCompleteness`. It excludes address identity facts (D11) and the hazard/geography facts (deferred). Revision 4: consumers are bounded `feature:`/`evidence:` references resolved by tests (`PROFILE_CONSUMER_EVIDENCE` holds out-of-registry consumers; the source check is textual presence); the seven outdoor-only dependents are governed by `hasPrivateOutdoorSpace`, with governor-first `askNowFactKeys`; weights are re-scored by a derivable rule and frozen at `actionable-profile-1` by a hash test. Tested by `tests/ask/actionableProfileRegistry.test.js` (17 tests).

**Verification.** `tests/ask/suggestedNextActionsExactFour.test.js` (31 tests: registry, server-owned grants, why-now,  slot derivation, schema, exemptions, slot order, reserve rule, 90% boundary, unknown completeness, opportunity cap, starters, presentation duplicate, cooldown, history, no-padding, shortage reasons, metric recording, determinism) plus the existing Phase 1, 2, recovery, ratchet and persistence-site suites: all pass; `npm run typecheck` clean. `tests/ask/actionableProfileConsumerEvidence.test.js` (11 tests) executes three real consumers (seasonal applicability, radar compound sump rule) to prove registry facts change their decisions. Executed locally with injected inputs only; nothing ran against the real backend.

**Step 2 draft.** The registry packet for owner review (revision 2, after the owner's step 1 review) is `docs/product/ASK_COZY_EXACT_FOUR_REGISTRY_PACKET.md`. It now carries the D2 evidence matrix, corrected D6 and lifecycle identity (offer-based cooldown), and the D5/D7 designs. Seven findings in it affect scope (area-scoped launcher, over-asking area flow, missing mortgage status capture, no room-light Ask capture, low starting completeness, viewer shortages, non-persisted skips).

**Step 5: lifecycle persistence (implemented, not wired, October 4, 2026).** `AskSuggestedActionLifecycle` and `AskSuggestedActionDismissalReason` were added to `schema.prisma` (identity: user, property, operation, outcome, entity scope; `lastReasonCode` is metadata; offer-based timestamps; no text). **The owner must run `npx prisma db push` and `npx prisma generate` in `apps/workers/`.** The service (`askSuggestedActionLifecycle.service.ts`) and cooldown defaults (`COOLDOWN_MS`, `offerCooldownMs`, `lifecycleKey` in the exact-four registry) are covered by `tests/ask/askSuggestedActionLifecycle.test.js` (12 tests, fake delegate, nothing run against a database). 215/215 across the suggested-action, registry and lifecycle suites; typecheck clean. Remaining order: mortgage status fact, assembler entry and atomic capture; governed audience adapter; profile and opportunity producers; viewer fixture as an activation gate; atomic wiring.

**Step 6: mortgage status (implemented, not wired, October 4, 2026).** New fact `financial.mortgageStatus` (catalog + financial assembler) and `capturePropertyMortgageStatus`, an atomic `UNKNOWN`-only capture (single conditional UPDATE as the precondition, evidence rolled back on refusal, NO_MORTGAGE never wipes details). No schema change. `tests/unit/capturePropertyMortgageStatus.test.js` (11 tests: catalog, assembler, transitions, conflicts, rollback, replay, authorization, 8-way concurrency with a race-detecting control) uses a fake that models lock, atomic update, rollback and interleaving; nothing ran against Postgres. Finding recorded in the packet: `financial.currentMortgage` stays UNKNOWN after a rate-only capture, so the rate chip must read `interestRateBps` from the financing profile. Remaining order: governed audience adapter; profile and opportunity producers; viewer fixture as an activation gate; atomic wiring.

**Step 5 review corrections (implemented, not wired, October 4, 2026).** Every offer is persisted (cooldown only where a class has one); `loadLifecycleState` returns `cooldownKeys` and `completedKeys`, and completion now suppresses in every slot class; offers never overwrite the dismissal fingerprint and `NOT_RELEVANT` requires one; ownership and active-goal claims count only under new producer grants and the policy's `evaluated` output feeds the lifecycle; curated starters rotate softly over seven days (oldest fills the row). Dismissal endpoint rules are recorded in the packet as required before activation. No further schema change.

**Step 6 review correction (committed separately, October 4, 2026).** Step 6 itself is commit `6fb2286c` (already on `origin/main`). The correction closes a cross-writer race: `capturePropertyFinancingFact` now writes through `writeMortgageRateGuarded` (create as `MORTGAGED`, or one conditional update while the status is `UNKNOWN` or `MORTGAGED`, refusing `NO_MORTGAGE` and rolling the evidence back), and a rate capture sets the status to `MORTGAGED`. New mixed concurrency test (300 seeded interleavings, race-detecting control: 17 violations with the old write). `financial.currentMortgage` excluding rate-only profiles is a recorded contract defect, not changed here; Step 8 reads `interestRateBps` from the financing profile.

**Corrected step 6 regression record.** Catalog and context selection (116 files): 1118 tests, 1104 pass, **14 fail**, and the same 14 fail on a clean checkout of `HEAD`: `ask/correctionHandlersRuntime` (inventory item actions...), `ask/healthGapCapture` (a derived capture is shown inline...), `unit/homeActionProjectSafetyTier` (coverage-dependent funding...), `unit/phase2HomeActions` (unified Home...), `unit/phase4ProjectCompliancePolicy` (mutations enforce context...), `unit/phase7AggregationContextPolicy` (remaining Phase 7 consumers...), `unit/phase8ArchetypeExitGate` (whole file), `unit/phase8CleanupGuard` (canonical item ownership aliases...), `unit/propertyContextJustInTimeSlice1` (Resolution Center keeps optional context capture open...), `unit/propertyContextJustInTimeSlice4` (new property safety answers remain unknown...), `unit/propertyContextJustInTimeSlice4Completion` (aggregate notices...), `unit/propertyContextJustInTimeSlice4Planning` (Neighborhood Radar...), `unit/propertyContextJustInTimeSlice5Tranche2` (every adopted inline contract...), `unit/propertyContextRemediation` (property forms expose canonical fields...). After this correction, the capture-path selection (390 tests) has 7 failures: six of those same baseline tests plus `unit/refinanceLoanEstimateExtraction` (renders and OCRs a scanned Loan Estimate PDF), which fails here because the `sharp` native module is missing for darwin-arm64 (environmental, unrelated).

**Step 7: governed audience adapter (implemented, not wired, October 4, 2026).** `profileAudienceAdapter.ts` activates BUYER from an active `HomeBuyerChecklist` and SELLER from a live `PropertySaleCase`, nothing else; failed lookups are never guessed. `tests/ask/profileAudienceAdapter.test.js` (8 tests: pure rules, enum parity with Prisma, union and sorting, query shape, partial failure, completeness integration, and a source-text governance guard). Finding for the owner: no recorded goal qualifies as an "explicit active selling or buying goal" (the sell/hold/rent thread is speculative intent; no buyer goal exists), so goals are not a source today. Open owner decisions: whether to add a governed goal record, whether to narrow BUYER by stage, and confirmation that onboarding `ownershipState` stays unused. Remaining order: profile and opportunity producers; viewer fixture as an activation gate; atomic wiring.

**Review corrections to steps 5 and 6 (implemented, not wired, October 4, 2026).** (1) `recordMortgageRate` announces `financial.mortgageStatus` (with `SYSTEM_DERIVED` evidence) alongside `financial.currentMortgage` whenever a rate capture implicitly moves the status. (2) Result-producer ownership now requires a registered relationship between the trusted current execution operation and the candidate's target outcome (`RESULT_OWNERSHIP_RELATIONSHIPS`, `currentOperationId` input), instead of a blanket grant. (3) Lifecycle selection and completion return true only for exactly one updated row and count a missing row separately (`ask_suggested_actions_lifecycle_missing_row_total`). The finalizer, when wired, must pass its own `operationId` as `currentOperationId`. No schema change.

**Step 7 review corrections (implemented, not wired, October 5, 2026).** Owner decisions: no governed goal record for the first activation (introduce one later only with defined creation, review, completion, cancellation and consumers); BUYER narrowed to the pre-closing stages (`EXPLORING`, `OFFER_CONTRACT`, `DUE_DILIGENCE`, `CLOSING_PREP`), stopping at `CLOSED`; onboarding `ownershipState` confirmed unused. Implemented: the stage rule (`BUYER_ACTIVE_STAGES`, unclassified stages inactive, Prisma enum parity test) and uncertainty propagation (`audienceUncertain` on `computeActionableCompleteness` and the exact-four policy; uncertain fails profile-first and reports `AUDIENCE_UNCERTAIN`). The finalizer wiring must pass `audienceUncertain: !state.ok`.

**Step 8a: outcomes, typed launch and fact allowlist (implemented, not wired to producers, October 5, 2026).** The seven area outcomes are registered; the area-capture handler resolves its scope from the verified action's outcome key (not the message) and, for typed launches, enforces a server-computed exclusion set (`excludedFactKeys`) at every site that reproduces the question; a failed allowlist computation fails closed. New: `profileAreaAllowlist.ts`, `tests/ask/profileAreaAllowlist.test.js` (11 tests). Changed: `askCapture.ts`, `propertySummary.handler.ts`, `recordConfirm.handler.ts`, `support/capture.ts`. 374 tests across the area-capture and suggested-action suites: 373 pass; the one failure (`askGovernance`: quote comparison prompt routes to `INVENTORY_ITEM_CREATE`) is identical on a clean checkout of `HEAD`. Open: a registered operation for the mortgage status launch (new operation, needs your scope decision); the opportunity inventory and its why-now signals; then the producers, the viewer fixture and the atomic wiring. Typed-launch end-to-end behavior needs a real run against the database.

**Step 8b: opportunity and starter inventory (draft for owner review, October 5, 2026).** `docs/product/ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY.md` proposes seven opportunities, ten curated starters and the urgent and continuation sources, with executed role, audience and safety facts for each. Seven findings affect scope, chiefly: viewer rows are carried by starters (at most one unrelated opportunity; viewers cannot use profile or mutation chips); read-only outcomes must be declared repeatable or completion suppression exhausts them; Ask's operating mode comes from the onboarding `ownershipState`, so an unknown state makes every mode-limited opportunity ineligible and disagrees with the workflow-based profile audiences. Nine decisions requested; no code written.

**Step 8b review corrections (revision 2, October 5, 2026).** (1) `RECALL_REVIEW` is allowed today (skill-less, so no audience evaluation; absence means discoverable); an explicit all-mode viewer policy was added and tested to remove the fragility. (2) The starter bar of "eight defined, six eligible" is withdrawn and replaced by a behavior-level invariant: four deterministic eligible fallbacks for every minimum supported state (role, mode, data, current answer, degraded availability, session history), enforced by an enumerating test; if a state cannot be proven, exact-four is not activated. (3) Suppression is split: session-level (active, via `completedSemanticKeyHashes`) versus durable lifecycle (implemented, not active until wiring). O1 to O3 are approved conceptually and verified: O3 is message-free; O1 needs a horizon alignment check; O2 is message-dependent and must share `WARRANTY_EXPIRING_DAYS`. Repeatability is narrowed to specifically reviewed outcomes.

**Step 8c: availability measurement (executed, October 5, 2026).** `tests/ask/exactFourStarterPoolMeasurement.test.js` (10 tests) is an arithmetic measurement (not the activation gate) of how many deterministic starters the exact-four row needs, using the real availability function, eligibility rules and policy; the real gate still needs seeded-data readiness, real producers and handler results, and lifecycle states (inventory section 4b). Findings: presentation deduplication cannot remove a starter (identities need an entity); the finalizer's current-outcome set is empty; the prompt-history rule (last 5 completed messages plus the current one) ignores repeatability and is the dominant removal. Minimal dependable pool: 11 under current rules (12 if the current outcome were excluded), 5 (6) with a starter-specific prompt-history exemption (a separate registry property, not a global change keyed on repeatability, which would also alter the four existing repeatable outcomes). The four provisionally measured starters fail the invariant (RED). Decisions D-O10 (starter-specific form) to D-O12 requested; no production rule changed.

**D-O10 implemented (October 5, 2026).** Owner approved the starter-specific prompt-history exemption. `PROMPT_HISTORY_EXEMPT_OUTCOMES` is a new registry property, separate from `REPEATABLE_OUTCOMES`; the `EQUIVALENT_PROMPT_ASKED` eligibility rule is the only place that reads it. It ships **empty** (no starter is approved yet, D-O4). Registry validation restricts entries to registered outcomes of read-only (`RECORD_QUERY`, `STATUS_SUMMARY`), viewer-floor, standard-safety, property-scoped operations. `tests/ask/promptHistoryExemption.test.js` (7 tests) pins the rule, the concept separation (repeatable completion does not exempt a prompt), that the four existing repeatable outcomes are unchanged, and the validation. The starter-pool measurement now uses the real mechanism and reproduces the numbers: 5, or 6 with the current outcome excluded. This changes production eligibility behavior only for outcomes registered as exempt, and none are. Remaining before the availability gate can be established: approve and verify the starter list on empty and seeded homes, populate the current-outcome set (D-O11), decide entity-less presentation identity (D-O12), the real producers, and lifecycle states (inventory 4b).

**Step 8d: starter readiness on an empty home (executed and code-read, October 5, 2026).** `tests/ask/starterEmptyHomeReadiness.test.js` (9 tests) executes the pure result builders of seven candidate starters with an empty home and pins their empty-state reason codes; the rest are classified from source in inventory section 4c. Result: only `PROPERTY_SUMMARY` (two starters via focus) and `CAPABILITY_DISCOVERY` are data-independent, a pool of at most three against the required five or six, so the empty-home viewer state is not currently satisfiable. The earlier claim of "about four dependable starters" was wrong (S2 `HOME_STATUS_BOARD` is an empty state; S4 `MAINTENANCE_FORECAST` is `NOT_APPLICABLE`). Decisions D-O13 to D-O15 requested. No production code changed.

**Step 8d review corrections (revision 7, October 5, 2026).** (1) The starter-pool measurement now models starters individually and fails them by shared operation: with `PROPERTY_SUMMARY` supplying two starters the required pool is 6 (7 with the current outcome excluded), not 5 (6); the rule is four plus the largest number of starters one operation supplies. It also exposed a structural cap: the policy truncates each producer's nominations to 12 before eligibility (executed: 14 nominated, 2 dropped). (2) The "viewers hit a dead end" claim is restated as a product judgment: executed classification shows each empty state offers exactly one navigation action a viewer can open, with no typed or contributor-only action. (3) `PROPERTY_SUMMARY` is now executed on an empty home against a stubbed data layer (`propertySummaryEmptyHome.test.js`, 6 tests), for a viewer and a contributor and for both starter messages; `CAPABILITY_DISCOVERY` remains code-read. The data-independent pool is at most three against a required six or seven, so the gap is three to four.

**Decision-summary corrections (October 5, 2026).** D-O14 requires three or four new starters (not two or three): the gap is 6 minus 3, or 7 minus 3 when D-O11 applies. D-O11 applies only to executions carrying a verified launch outcome; the outcome is never inferred from the operation or message. D-O12, if approved, uses `operationId + interactionType + outcomeKey + property scope`, not operation alone. A seasonal/regional starter counts as data-independent only if the minimum property contract guarantees the region input and the answer has a local fallback. D-O15 requires deciding whether a property-less starter's identity and lifecycle are global or per-property.

**Second decision-summary correction (October 5, 2026).** The new-starter count depends on D-O15: approved, three or four; rejected (data-independent set is only the two `PROPERTY_SUMMARY` outcomes), four or five. The inventory's opening finding no longer carries the withdrawn "eight defined, six eligible" heuristic.

**Third decision-summary correction (October 5, 2026).** `CAPABILITY_DISCOVERY` cannot receive the D-O10 history exemption today (the validation admits only property-scoped operations), so the "D-O15 approved" counts hold only if D-O15 also widens the exemption and the measurement is re-run. Section 4 no longer calls S1 to S4 dependable: only the two `PROPERTY_SUMMARY` outcomes are proven content-bearing on an empty property.

**Fourth decision-summary correction (October 5, 2026).** The inventory state-matrix row now treats current-answer removal (D-O11) and entity-less presentation removal (D-O12) as conditional, not current behavior; the verdict names the proven baseline (two `PROPERTY_SUMMARY` outcomes, optionally `CAPABILITY_DISCOVERY`) instead of S1 to S4; and the Step 8c entry says "provisionally measured" rather than "dependable".

**Fifth decision-summary correction (October 5, 2026).** The inventory's "what the invariant implies today" paragraph is conditional on D-O11/D-O12 (today neither removes a starter), and the session-history row now requires both a repeatable outcome declaration and a `PROMPT_HISTORY_EXEMPT_OUTCOMES` entry; `CAPABILITY_DISCOVERY` cannot take the second today.

**Sixth decision-summary correction (October 5, 2026).** The inventory status line now names both implemented code changes (the `RECALL_REVIEW` policy and the empty-shipping D-O10 exemption), and its next-work section starts with the owner decisions and the section 4b gate dimensions; the measurement is listed as existing and not the gate.

**Owner decisions D-O13 and D-O14 (approved October 5, 2026).** D-O13: an empty-state answer does not count as a deterministic fallback for a viewer, and `NOT_APPLICABLE` never does; for contributors and owners an actionable empty state is acceptable. D-O14: VIEWER x empty home is a supported minimum state for exact-four, so the gate must prove it and the starter inventory must close the gap (three or four if D-O15 is approved with the exemption widened, four or five otherwise; one more with D-O11). D-O15, D-O11, D-O12 and D-O4 remain open.

**Owner decision D-O15 (approved October 5, 2026, with the exemption widened).** A property-less `CAPABILITY_DISCOVERY` may be a starter and the D-O10 exemption is to be widened narrowly to cover it, so the baseline is three data-independent starters and three new starters are needed (four with D-O11). Not implemented: the validation rules (property-scoped, read-only family allowlist) still reject it, and its global versus per-property identity and lifecycle must be specified first. D-O11, D-O12, D-O4 and the dismissal bound remain open.

**D-O15 exemption widening implemented (October 5, 2026; per-property identity approved).** `PROMPT_HISTORY_EXEMPT_PROPERTYLESS_OPERATIONS` = {`CAPABILITY_DISCOVERY`} lets the registry validation accept that one property-less, deterministic, standard-safety, no-role-floor operation as an exempt starter, without relaxing the rules for any other operation (4 new tests in `promptHistoryExemption.test.js`, 11/11; typecheck clean). Identity is per property via `entityContext.propertyId`; no schema change. The registry still ships empty (no registered `CAPABILITY_DISCOVERY` outcome; D-O4 open). Remaining: execute `CAPABILITY_DISCOVERY` and re-measure with it counted.

**CAPABILITY_DISCOVERY executed and re-measured (October 5, 2026).** `tests/ask/capabilityDiscoveryStarterReadiness.test.js` (4 tests) runs the real router, capability catalog/matcher and availability adapter with only the DB readiness lookups stubbed. Generic discovery messages answer "Tell me what outcome you want" (a no-match prompt with one navigation action, the empty-state class D-O13 does not count for viewers); "What can Cozy do?" and "Show me the tools available" do not route to it (they fall to `GROUNDED_GUIDANCE`); goal-bearing messages depend on release-gate and rollout configuration. The pool arithmetic is unchanged, but the baseline stays at the two `PROPERTY_SUMMARY` outcomes, so the working gap is four new starters (five with D-O11) unless a routable, configuration-independent starter message is designed or D-O15 is revisited. The D-O15 widening stays implemented with an empty registry.

**D-O15 revisited: CAPABILITY_DISCOVERY is not a starter (owner decision, October 5, 2026).** After execution showed it is not dependable, the approval is withdrawn and the exemption widening is removed (`PROMPT_HISTORY_EXEMPT_PROPERTYLESS_OPERATIONS` and its validation branch); the D-O10 exemption is property-scoped only again (`promptHistoryExemption.test.js` 8/8, typecheck clean). The baseline is the two `PROPERTY_SUMMARY` outcomes; four new starters are needed (five with D-O11). D-O11, D-O12, D-O4 and the dismissal bound remain open.

**D-O4 candidate analysis (code-read, October 5, 2026; inventory section 4d).** No existing deterministic, viewer-floor, standard-safety operation is data-independent beyond `PROPERTY_SUMMARY`; every data-reading operation answers an empty state on an empty home, so the four or five missing starters need new read-only operations. One credible source: a seasonal/regional home-care read from the local seasonal catalog (state and zip are required columns; `ClimateZoneService` is local with a `MODERATE` fallback; every season has asset-free templates), pending an executed empty-home run. Two outcomes from one operation do not close the gap (the pool requirement is four plus the largest group). A second and third source are not yet identified. No code changed.

**Seasonal home-care read, stage 1 (October 5, 2026; owner approved in principle).** Pure builder `services/ask/support/seasonalHomeCare.ts` plus `seasonalHomeCareEmptyHome.test.js` (7 tests, typecheck clean); not registered, no live behavior change. Executed on an empty home: 19 of 20 season x climate-region cells return asset-free content; FALL x TROPICAL is a catalog hole (limited state). New decision D-O16 (author tropical fall templates, fall back to WARM with a stated approximation, or accept the degraded cell); recommendation: author them. Operation registration (a live-routing, roughly 30-file slice) awaits your go-ahead. D-O4 still needs two or three more starters beyond this operation's two outcomes.

**D-O16 option (a) implemented (October 5, 2026).** Three asset-free tropical fall templates added to `seasonalTaskTemplates.json` (44 total; no existing template changed); all 20 season x region cells now return content (`seasonalHomeCareEmptyHome.test.js` 8/8, unrelated seasonal suites 31/31, typecheck clean). The checklist reads the DB, so the owner must re-run the seasonal seed for tropical checklists to match; not run. Template wording is a draft for content review. Operation registration still awaits go-ahead; D-O4 still needs two or three more starters beyond this operation.

**SEASONAL_HOME_CARE registered (October 5, 2026; owner approved).** Non-routable, skill-less, launch-only read in `ASK_INTERNAL_OPERATION_IDS` and `KNOWN_UNGOVERNED_OPERATIONS` (the `GUIDANCE_JOURNEY_CONTINUE`/`RECALL_REVIEW` precedents), so it cannot capture or compete with the existing seasonal routing to `MAINTENANCE_STATUS` (verified: identical routing before and after for ten seasonal phrasings). Handler `seasonalHomeCare.handler.ts` over the pure builder; registries, audience, trust, coverage matrix, semantic and certification entries added; count assertions bumped to 119. All boot-time validators return no issues. No starter producer, no outcome entry and no finalizer wiring yet. D-O4 still needs two or three more starters from other operations.

**Seasonal starter nominations (October 5, 2026; unwired).** `starterCandidates.ts` (two typed `CURATED_STARTER` candidates), the two `SEASONAL_HOME_CARE` outcomes in the outcome registry, and a `CURATED_STARTER`-only grant for `starter.seasonal-home-care`; `seasonalStarterCandidates.test.js` 5/5 with the related suites 68/68, typecheck clean. Not in the producer list, not called by the finalizer, and no D-O10 exemption entry (that waits for D-O4); until it exists a recently asked seasonal starter is suppressed by prompt history. D-O4 still needs two or three more starters from other operations.

**D-O12 measured (October 5, 2026).** `presentationIdentityStarterMeasurement.test.js` (3 tests): only five operations declare outcomes on presented actions, none a starter operation, and `PROPERTY_SUMMARY` has no registered outcome, so entity-less presentation identity would remove 0 starters today and adds nothing to the pool requirement. The test guards the claim. The decision (build the entity-less collector or not) is still open; D-O11, D-O4 (two or three more starters) and the dismissal bound remain open.

**D-O11 implemented (October 5, 2026; owner approved).** The shared finalizer's `currentOutcomeKeyHashes` is now loaded from this execution's verified `SUGGESTED_ACTION_SELECTED` event (`loadCurrentOutcomeKeyHashes`, injectable via deps, failing to an empty set); typed questions have no such event and are unchanged. `currentOutcomeExclusion.test.js` 4/4, related finalizer, exact-four, lifecycle, starter and exemption suites 124/124, typecheck clean. This is a live behavior change to the existing finalizer (a launched repeatable outcome is no longer re-offered on its own answer). Pool requirement 7 for launched starters, 6 for typed questions.

**Dismissal control built, cap of 30 (October 5, 2026; owner approved; unwired to any surface).** `POST /api/ask/executions/:executionId/suggested-actions/:actionId/dismiss` with body `{reason: 'NOT_NOW' | 'NOT_RELEVANT'}` (strict; no client operation or entity). `dismissSuggestedAction` resolves everything from the stored offered-action ledger (operation, outcome, property), by user, and requires current property access. What may be dismissed is a fail-closed registry (`dismissalReasonsFor`): the two seasonal starters take both reasons, a home-profile gap takes "Not now" only, and everything else (continuing work, urgent work, exact-record fixes) is not dismissible. A starter's "Not relevant" carries a fixed versioned fingerprint (`STARTER:<op>:<outcome>:v1`), so it lapses only when the starter is revised; opportunities get none yet (no producer). **Supported bound:** `SUPPORTED_DISMISSALS_PER_PROPERTY` = 30 active dismissals per user and property; `enforceDismissalCap` lifts the oldest beyond the newest 30 (clearing dismissal state, and a "not now" row's suppression), leaves other users and properties alone, is idempotent and fails open. `dismissSuggestedAction.test.js` 8/8; typecheck clean. Not run against a real database; no frontend affordance yet.

**Habit-template starter source: finding before building (October 5, 2026).** The 16 seeded habit templates (`prisma/seedHabitTemplates.ts`) yield at most one clearly home-independent template (`general_monthly_walkthrough`, category GENERAL, no targeting rules). The smoke and CO detector tests have no rules but sit in the SAFETY category, which the governed applicability policy gates on `responsibility.commonSafety`; the HVAC, plumbing and appliance templates assume the home has that equipment. The rows are database content, so what exists depends on the owner's seed state, which cannot be checked locally. Not built; awaiting a product call.

**Authored home-basics read built (October 5, 2026; owner approved).** `HOME_BASICS_GUIDE`: non-routable, skill-less, launch-only (the `SEASONAL_HOME_CARE` pattern), authored evergreen content (safety basics; a monthly routine) with no data dependency. Registries, audience, trust, coverage matrix, semantic and certification entries, handler, two starter candidates, outcomes, a `CURATED_STARTER`-only grant and dismissibility added; count assertions bumped to 120; `homeBasicsGuide.test.js` 6/6, boot-time validators clean. Supply is now 6 starters on 3 operations: typed questions are satisfied (6), launched answers are one short (7). Content is a draft needing product and safety review. Still unwired; no D-O10 exemption entry yet.

Harness note for the home-basics slice: the starter-pool measurement draws its hypothetical starters only from operations with no real outcome entry (its `registerProvisional` never touches a real entry); `HOME_BASICS_GUIDE` sorts early and, once it had real outcomes, produced an unregistered hypothetical starter and a false +1. The filter fixes the harness; the measured numbers (11/5, 12/6, 6/7, 12/13) are unchanged and the full ask suite shows only the six pre-existing failures.

**Owner decisions on the open items (October 5, 2026).** D-O4 conditionally approved: seven starters on four operations, each needing BOTH a prompt-history exemption and a repeatable entry (not yet added; waits on seasonal-template and home-safety content review, executing both `PROPERTY_SUMMARY` paths on a real empty property, and verification through the real producer and finalizer path). A fourth operation was built: `HIRING_GUIDE`, one authored outcome, so supply is 7 and a launched answer is no longer short. D-O12 declined for now (guard test retained). `starterRegistryPinned.test.js` (5), `hiringGuide.test.js` (4); with both entries applied every pinned state reaches four; `PROPERTY_SUMMARY` has real starter outcomes and a grant. Unwired.

**Content review of the starter wording (October 5, 2026).** 34 of 34 items approved by the owner with no edits (tropical fall templates, home safety and monthly routine, hiring guide, seasonal boundary, seven starter buttons). D-O4 conditions (1) and (2) are met; (3) the real-empty-property run of both `PROPERTY_SUMMARY` paths and (4) producer and finalizer verification remain before the exemption and repeatable entries are added.

**Exact-four ACTIVATED (October 5, 2026; atomic change; owner chose to merge before the real-property check).** Four starter producers registered; exact-four selection in the shared finalizer with lifecycle (cooldown, dismissal, completed, rotation), `currentOperationId`, lazy completeness and `audienceUncertain`; offers, selection and completion recorded; the seven starters are both repeatable and prompt-history exempt; a property-scoped turn that nominates nothing reports the bounded shortage diagnostic. `exactFourActivation.test.js` (14) verifies the real finalizer path end to end with hard four-or-bounded-diagnostic assertions. Existing tests that pinned the pre-activation state were updated. Requires the lifecycle table (`prisma db push`, done) and a backend rebuild and rollout restart. Rollback is a revert of the activation commit. Not verified against a real database; the owner's real-empty-property check of `PROPERTY_SUMMARY` is still outstanding.

**Starter dismissal control in the calm UI (October 5, 2026).** `FollowUpRow` gains an optional `onDismiss`: a curated starter (a recommendation-class DISCOVERY action; `isDismissibleStarterAction`) shows a small dismiss control opening "Not now", "Not relevant" and "Cancel" inline. `useStarterDismissal` calls the new `api.dismissSuggestedAction` and hides the chip only after the server accepts; the server stays the authority on what is dismissible, and a refusal or failure leaves the chip. Extracted into its own workspace hook so `AskWorkspace.tsx` stays at its 450-line ceiling (the split-guardrail list now names the hook). `followUpDismiss.test.tsx` (4), the ask jest suites 545 passing with 5 pre-existing failures in `displayPatterns` and `maintenanceShelves` (verified identical on a clean HEAD), and a real `next build` that succeeds. Not exercised in a browser or against the real backend.

**P1 audit remediation started (October 7, 2026).** Newly finalized results persist `suggestedNextActionsGoverned: true`; the frontend permits string fallback only for historical results without that marker, so a context failure or bounded exact-four shortage cannot revive a newly authored free-text chip. The persistence finalizer now also removes raw `suggestions` from every newly governed result, containing the remaining legacy handler strings while their individual disposition is reviewed. The first missing shared source is live: `profile.actionable-gaps` performs one batched actionable-profile read and nominates at most one governed `PROFILE_GAP` action per area with askable facts, using the existing outcome-to-area launch and server-recomputed exclusion allowlist. Best-effort, text-free product analytics record impression, suppression, selection and terminal outcome events using restricted action/execution joins.

**P1 producer tranche 2 (October 7, 2026).** `handoff.skill` converts only a handoff already verified by the Skill-handoff policy and a matching server definition into a registered typed action; the compact row then owns the destination and the duplicate legacy handoff card is removed. `home-actions.urgent` reads the canonical governed Unified Home feed and nominates a property-scoped `HOME_ACTIONS` continuation only when its `NOW` bucket is non-empty; it does not reproduce urgency ranking or infer a mutation/entity target. Both producers have server-owned slot grants and registered outcomes. Focused Skill-handoff, urgent-work, finalizer, exact-four, policy and backend typecheck suites pass. Remaining producer work is deliberately bounded by existing product decisions: there is no governed active-goal record for the first activation, and O1/O2 opportunity wiring still needs the documented horizon-alignment/shared-expiry decisions; these must not be invented in an adapter. Generic capability recommendations beyond verified Skill handoffs and the approved curated starters still require a reviewed canonical-source mapping.

**P1 producer tranche 3 (October 7, 2026).** The O1-O3 conditions are now resolved against the handlers themselves and wired through `home-opportunities.signals`, which performs one authorized Property Context read for FINANCIAL, COVERAGE and INSPECTION. O1 uses a 24-month why-now predicate and a stored prompt with no explicit 5/10-year override, so `CAPITAL_RESERVE_PLAN` retains its existing/default 10-year horizon. O2 imports the handler's `WARRANTY_EXPIRING_DAYS` (60) and uses an explicitly expiring prompt. O3 remains message-independent. All three are registered repeatable read outcomes with reviewed why-now tokens and no mutation/entity target. `active-plan.decision-thread` reuses the same canonical cross-session sell/hold/rent thread selector already used by Ask capability ranking; only a unique active thread produces a `CONTINUE_WORK` action, while none/ambiguous states produce nothing. No generic goal record was invented. Generic capability conversion remains blocked on a reviewed subset of the existing inline-launch mapping because that mapping includes `HOME_DIGITAL_WILL`, which this plan explicitly excludes from generic backfill.

**P1/P2 continuation and budget hardening (October 7, 2026).** The active-plan producer now also reads canonical property-scoped HVAC Decision Threads and Guidance Journeys. It emits exact focused continuations carrying `DECISION_THREAD` or `GUIDANCE_JOURNEY` identity; new batched validators require the entity to remain active, on the same property and at the same `updatedAt` version before presentation. None or stale entities fail closed. The declared 250 ms producer budget now applies to an in-flight nonessential producer through a real deadline; a slow optional source is dropped and measured as `BUDGET` instead of holding the answer indefinitely, and its eventual rejection remains observed. Essential current-result and verified Skill-handoff nominations remain fail-safe and are not timed out. Focused typecheck and 60-test continuation/finalizer/exact-four selection pass; database-backed and browser checks remain intentionally unrun under the repository validation policy.

**Governed capability conversion (October 7, 2026).** `capability.recommendations` consumes only the already-governed `CAPABILITY_LIST` output and only its declared inline launches. A second fail-closed registry check admits property-scoped, VIEWER-floor, STANDARD-safety `RECORD_QUERY`/`STATUS_SUMMARY` operations; material-decision, contributor-only, workflow, command, page-only and sensitive Home Continuity launches cannot become compact actions. The shared generic outcome is registered only for operations satisfying that rule. After exact-four selection, only capability cards whose exact operation destination was selected into the compact row are removed; unselected richer cards remain. Backend typecheck and 97 focused capability/finalizer/exact-four tests pass.

**Property Context source-read consolidation (October 7, 2026).** The profile-gap producer, O1-O3 opportunity producer and exact-four completeness ordering now share one lazy, authorized, union-scoped Property Context snapshot per finalization. The governed buyer/seller audience lookups run once alongside that snapshot; pure adapters derive the two consumer states, and the completeness decision reuses the profile result instead of issuing a third context read. Explicit producer/completeness dependency injections remain independent for focused tests. Environment-independent tests pin the union scope and prove the real finalizer invokes the shared loader once.

**Raw-producer ratchet repair (October 7, 2026).** Three post-baseline inventory-detail strings are removed instead of approving a C.14 increase: a deleted-item fallback, an already-complete detail fallback, and the bulk detail-completion receipt's coverage prompt. Newly governed finalization already strips these strings; the first two have no exact live entity destination, and the receipt already owns an exact in-Ask item action plus governed missing-detail candidates. The ratchet therefore returns to (or below) its reviewed per-file ceilings without weakening the baseline.
