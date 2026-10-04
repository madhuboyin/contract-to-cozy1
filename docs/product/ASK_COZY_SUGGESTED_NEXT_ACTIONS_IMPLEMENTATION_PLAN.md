# Ask Cozy High-Precision Suggested Next Actions — Implementation Plan

**Date:** October 4, 2026
**Status:** Proposed implementation plan
**Product requirement:** Preserve unrestricted homeowner input while making app-authored next actions accurate, contextual, and easy to select
**Primary references:** `docs/product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md` v1.10; `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` ACUI-009; `docs/architecture/ASK_COZY_ARCHITECTURE_EXPLAINED.md`

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
  | 'PLATFORM_STATE'
  | 'LANDING_STARTER';

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
  suggestedActionFromExecutionId: string | null;
  signedStarterToken: string | null;
  message: string;
}
```

For answer follow-ups, the source execution's persisted result JSON is the offered-action ledger. The server loads that execution by user and session, verifies its property scope, finds the exact unexpired action id, and copies the registered message, operation, entity context, outcome key, and provenance from the stored action. The submitted `message` exists for compatibility with the execution request and must exactly match the stored message; the server uses the stored value and rejects/audits a mismatch. Client-supplied operation or entity fields are not authoritative. The action expiry may never exceed the fixed source-execution expiry. A missing or purged source maps to the same typed stale/invalid-action recovery result and never silently falls back to semantic routing.

Landing starters have no source execution. They use a 15-minute server-signed starter token bound to the current user, session, property, starter/action id, operation and outcome registry versions, a preallocated `clientRequestId`, issued-at time, and expiry. The request must use that exact `clientRequestId`: the first submission creates the execution, an identical replay returns it, and a changed request id invalidates the token. The backend verifies the signature and scope, resolves the server-declared starter, and repeats eligibility checks before dispatch. A starter without valid proof may still be submitted as ordinary homeowner text, but it does not receive app-authored deterministic-dispatch attribution.

Starter tokens use HMAC-SHA-256 with constant-time signature verification and a dedicated `ASK_SUGGESTED_ACTION_SIGNING_SECRET`; do not reuse `JWT_SECRET`. A versioned token header/claim identifies the active signing-key version. Deliberate rotation may accept the immediately previous key version for no longer than the 15-minute token lifetime. Implementation must add the new secret to `apps/backend/.env.example` and the deployed backend secret configuration. The secret is configuration, not a feature flag.

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
   - Converts property-aware launch prompts when they target a registered operation.

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

Before migration, generate a categorized inventory of every `suggestions:` declaration and compact action producer. The October 4, 2026 repository scan found 104 source files containing the broad `suggestions:` token; this is a discovery count, not a claim that all 104 are Ask follow-up producers. Classify each occurrence as an Ask compact follow-up, boundary action, domain-local recommendation, capability result, test fixture, or unrelated type.

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

Define versioned integer weights before implementation. Tier bases must not overlap after bounded adjustments. The final ordering is `score DESC`, producer precedence, `operationId`, `outcomeKey`, entity type, entity id, then action id. A minimum display score omits weak candidates. These constants and the ranking policy version belong in one registry and are snapshot-tested.

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

Create one shared `finalizeSuggestedNextActions` service. The normal read path invokes it from `executeOperation.ts`'s `finalize()` seam after the operation result, Skill handoff, and platform boundary state exist, replacing the current standalone `suppressRepeatedAskSuggestions` call before answer-trust validation. The confirmation path invokes the same service in `askConfirm.ts` after the confirmed result and Skill handoff exist but before confirmed-completion validation and persistence. Confirmation expiry, confirmation conflict, retryable failure, terminal failure, cancellation, and other branches that display recovery actions also pass through the service before persisting those actions. No result may persist a newly produced compact action by bypassing this shared finalizer.

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
- `suggestedNextActionSigner.ts` for purpose-bound starter signing, verification, and key-version rotation
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
- landing starters.

Landing starters share the action vocabulary and renderer but remain a separate ranking surface because they do not follow a source execution. Platform recovery candidates use `SAFE_RECOVERY_ONLY` policy rather than competing with normal discovery actions.

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
- On follow-up selection, submit `message`, `suggestedActionId`, and `suggestedActionFromExecutionId`; on starter selection, submit the signed token and its bound preallocated `clientRequestId`. Do not treat client-echoed operation/entity context as proof of authorship.
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
- Signed landing-starter verification, message-mismatch rejection, purged-source recovery, idempotent replay, and completed-equivalent suppression.
- Deterministic action-id stability and atomic ledger replacement across refresh.
- Rich entity buttons remain usable under their existing card contract independently of expiry of a compact promoted copy.
- Retryable failure, terminal failure, confirmation expiry, confirmation conflict, and cancellation persist only shared-finalizer recovery actions.

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
- landing starters use dedicated-secret signed proof with a token-bound request id;
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
