# Ask Cozy High-Precision Suggested Next Actions — Implementation Plan

**Date:** October 4, 2026
**Status:** Phases 1-2 implemented and inventory converted (October 4, 2026; not live-verified). Delivery was simplified on October 4, 2026: see Appendix C, which supersedes the staged-migration language in §9, §12 and §16 where they differ.
**Product requirement:** Preserve unrestricted homeowner input while making app-authored next actions accurate, contextual, and easy to select
**Primary references:** `docs/product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md` v1.14; `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` ACUI-009; `docs/architecture/ASK_COZY_ARCHITECTURE_EXPLAINED.md`

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

### 3.3 Precision over inventory size

- The calm surface renders at most four actions.
- Two or three high-confidence actions are preferable.
- A weak fourth action is omitted rather than used as filler.
- Broad discovery ranks below active continuation, missing-detail completion, and exact-entity actions.

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
- Return at most four actions.

Result-card and block actions publish the same semantic identity fields to response finalization even when they remain rendered in their richer surface. They do not need to become follow-up candidates, but their identities suppress equivalent compact candidates before the response is persisted.

### 7.4 Pipeline placement and performance budget

Create one shared `finalizeSuggestedNextActions` service. The normal read path invokes it from `executeOperation.ts`'s `finalize()` seam after the operation result, Skill handoff, and platform boundary state exist, replacing the current standalone `suppressRepeatedAskSuggestions` call before answer-trust validation. The confirmation path invokes it from `askConfirm.ts` after the confirmed result and Skill handoff exist but before confirmed-completion validation and persistence. Clarification creation, resumption, expiry, invalid selection, and retryable-failure branches in `askClarification.ts` invoke it before persisting their result JSON. Confirmation expiry/conflict, retryable/terminal execution failure, cancellation, and every other branch that displays recovery actions also pass through the service. No result may persist a newly produced compact action by bypassing this shared finalizer.

The finalized action set flows through the applicable answer-trust validator and is persisted in `AskExecution.resultJson` before return. The execution id is already allocated before operation execution and is available for provenance. A refresh regenerates the set with deterministic ids and atomically replaces the stored offered-action ledger for that execution. An id removed by refresh becomes stale immediately and returns typed recovery if selected. The orchestrator assembles one bounded evaluation context with batched property access, entity, health, pending-work, and recent-history data; producers must not perform unbounded per-candidate queries.

Initial implementation budgets:

- no more than 12 nominated candidates per producer and 60 total before deduplication;
- batch entity and authorization reads by property/domain;
- no remote model call in eligibility, ranking, or executable-action construction;
- record pipeline duration, query count, dropped-producer count, and candidate counts; and
- if the budget or a nonessential producer fails, return the safe answer with fewer actions rather than delaying or failing the execution.

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
- No more than four actions render.
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
- the calm surface shows at most four concrete actions and avoids filler;
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
| "Link <event> to an inventory item" (`LINK_INVENTORY_ITEM`) | REPAIR, MAINTENANCE, INSPECTION | no linked item and the home has at least one visible inventory item |
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
