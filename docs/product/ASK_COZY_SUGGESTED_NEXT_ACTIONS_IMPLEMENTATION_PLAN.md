# Ask Cozy High-Precision Suggested Next Actions — Implementation Plan

**Date:** October 4, 2026
**Status:** Proposed implementation plan
**Product requirement:** Preserve unrestricted homeowner input while making app-authored next actions accurate, contextual, and easy to select
**Primary references:** `AI_HOME_CONCIERGE_ASK_REDO_FRD.md` v1.7; `ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` ACUI-009; `ASK_COZY_ARCHITECTURE_EXPLAINED.md`

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
  | 'FILTER_RESULT'
  | 'MUTATE_RECORD'
  | 'START_WORKFLOW'
  | 'NAVIGATE';

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
  priority: {
    tier: 'CONTINUE' | 'RECORD_ACTION' | 'RELATED' | 'DISCOVERY';
    score: number;
  };
}
```

Contract rules:

- `id`, `label`, `message`, and `operationId` are required.
- `operationId` must exist in `ASK_OPERATION_DEFINITIONS`.
- `label` is concise UI copy; `message` is natural transcript text.
- `message` is not reparsed to decide the operation for a selected app-authored action.
- Property and entity context are explicit nullable values rather than absent ambiguous fields.
- `ELIGIBLE` is required for an immediately selectable action.
- A `NEEDS_CONTEXT` action is selectable only when every advertised missing fact has a registered typed capture path.
- An `UNAVAILABLE` candidate may support explanation in a capability catalog but is not rendered as an ordinary follow-up chip.
- Reason codes are bounded registered tokens, not homeowner data.
- Scores are deterministic and need not be exposed in the calm UI.

## 5. Candidate model

Introduce an internal `SuggestedNextActionCandidate` that contains the target contract plus evaluation inputs. Producers nominate candidates; they do not declare final visibility.

### 5.1 Candidate producers

1. Operation-result producer
   - Converts current handler suggestions and receipt continuations.
   - Requires an explicit operation target for every migrated recommendation.

2. Entity-action producer
   - Converts existing typed item actions.
   - Preserves exact entity id and interaction type.

3. Missing-detail producer
   - Uses canonical incomplete fields and supported correction/capture definitions.
   - Produces concrete actions such as “Add the microwave brand”.

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

Deduplication identity should be derived from:

```text
operationId
+ interactionType
+ propertyId
+ entityType/entityId
+ normalized intended outcome
```

Do not deduplicate on label or message alone. Different wording can represent the same action, and the same wording can target different entities.

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

8. Context readiness
   - Required facts are present or have registered typed captures.

9. Interaction conflict
   - Do not compete with an active clarification, capture, or confirmation unless the action explicitly continues or safely cancels it.

10. History suppression
    - Suppress the current operation/entity outcome, recently completed equivalent actions, and already asked equivalent prompts.

11. Safety and boundary compatibility
    - Emergency and restricted boundaries suppress promotional actions and retain only safe recovery actions.

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

Do not use generated prose or an unreviewed model score to make an action executable. A model may later help order already eligible, bounded candidates only after an evaluation proves deterministic ranking insufficient.

### 7.3 Cross-surface winner selection

- Merge candidates before presentation.
- Group by semantic identity.
- Keep the highest-priority eligible candidate.
- Merge non-sensitive provenance reason codes from suppressed duplicates.
- Reserve at most one broad discovery action when a stronger continuation or record action exists.
- Return at most four actions.

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
- Keep `suggestions: string[]` temporarily so producers can migrate incrementally within the branch.
- Add a compatibility adapter that converts only explicitly mapped strings; do not infer operation ids from arbitrary text.
- Preserve persisted historical executions whose result JSON contains only strings.

Exit:

- Old persisted results still render.
- New typed results validate on backend and frontend.
- The composer behavior is unchanged.

### Phase 2 — Candidate, eligibility, ranking, and deduplication services

Add focused modules under `apps/backend/src/services/ask/suggestedActions/`:

- `suggestedNextAction.contract.ts`
- `suggestedNextActionCandidate.ts`
- `suggestedNextActionEligibility.ts`
- `suggestedNextActionRanking.ts`
- `suggestedNextActionDeduplication.ts`
- `suggestedNextActionPolicy.ts`

Reuse rather than duplicate:

- operation registry and capability-handler validation;
- effective Skill policy and health;
- property access;
- audience policy;
- capture-definition registry;
- `askSuggestionPolicy` history rules;
- capability readiness and launch contracts; and
- existing context-version helpers owned by each domain.

Exit:

- Pure tests cover all eligibility reasons, tier ordering, semantic identity, source precedence, diversity, limits, and deterministic repeatability.

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

Exit:

- Every newly produced compact follow-up is typed and auditable.
- Arbitrary homeowner input remains unchanged.

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
- On selection, submit `message` with operation and entity launch context.
- Preserve the unrestricted composer beside or below the suggestions.
- Do not auto-send merely because only one action exists.
- Disable an action only while its own request is pending; do not globally disable unrelated text input longer than necessary.
- Preserve horizontal scrolling, keyboard access, focus visibility, accessible names, reduced motion, and narrow-width behavior.
- If selection returns a stale/invalid result, retain the original answer and show the server-provided recovery action.
- Avoid rendering the same semantic action in both a result card and the follow-up row.

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
- suppression category; and
- source surface.

Do not log label/message text, entity ids, addresses, financial values, document content, or other homeowner data in general analytics.

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
- Startup validation confirms producer operation ids and Skill ownership where applicable.
- A typed action cannot be sourced from generated model prose.

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

### 12.4 Frontend

- Label rendering and transcript message preservation.
- Operation/entity launch context dispatch.
- Composer accepts arbitrary text before and after actions render.
- Keyboard, focus, screen reader, 390-pixel width, horizontal overflow, and reduced motion.
- Pending, stale, access-lost, and failed states.
- Historical string-only execution compatibility while retained.

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

## 14. Skill and adapter governance follow-up

This work is related but separable from typed action delivery. Do not silently assign ownership because doing so changes runtime policy and health enforcement.

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
- one server policy owns eligibility, ranking, and cross-surface deduplication;
- stale, unauthorized, unavailable, and inapplicable actions fail safely;
- the calm surface shows at most four concrete actions and avoids filler;
- consequential actions still require review and confirmation;
- analytics measure precision, completion, clarification, suppression, and manual-input escape without collecting raw homeowner text;
- documentation parity checks cover operations, Skills, adapter keys, governed adapters, handlers, handoffs, and typed action producers; and
- the architecture guide, Ask Redo FRD, conversational UI audit, and implementation plan remain mutually consistent.
