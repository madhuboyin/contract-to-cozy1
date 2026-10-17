# Ask Cozy Conversational Presentation Quality & Standardization

## Functional Requirements Document

**Version:** 1.0

**Date:** October 14, 2026

**Status:** Living implementation specification

**Decision:** Extend the existing Ask Cozy presentation infrastructure; do not create a separate presentation engine.

---

## 1. Purpose

This FRD defines how Ask Cozy must consistently turn C2C facts, decisions, records, and actions into understandable, trustworthy, actionable homeowner guidance.

It consolidates the requirements needed to move from an architecture audit into incremental implementation. It does not replace the detailed audit evidence, the Ask Cozy Interaction Model, the Inline Workspace requirements, or the Skill Platform. It makes their shared conversational-presentation expectations measurable and implementation-ready.

The intended experience remains:

```text
Answer first → Explain what matters → Show relevant information
→ Offer the next useful action → Allow deeper exploration
```

The conversational response owns the narrative. Structured UI owns exploration and interaction. Domain logic owns facts, risk, urgency, and recommendations.

---

## 2. Authority and relationship to existing documents

### 2.1 Normative authority

This document extends, and must be interpreted consistently with:

1. `ASK_COZY_INLINE_WORKSPACE_FRD.md`, especially §§10–18 and Appendix C.11.
2. `ASK_COZY_INTERACTION_MODEL_UI_FRD.md`.
3. `CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md`.
4. `ASK_COZY_MESSAGE_FIRST_FRD.md`.
5. Security, authorization, property-access, confirmation, idempotency, and canonical domain requirements in their owning specifications.

If this FRD conflicts with an existing safety, authorization, data-integrity, canonical-domain, or consequential-action requirement, the stricter existing requirement wins. A conflict involving product behavior must be resolved explicitly rather than silently implemented.

### 2.2 Evidence documents

The six audit documents under `docs/architecture/ask-cozy/presentation-audit/` remain the evidence base:

- `CONVERSATIONAL_PRESENTATION_AUDIT.md`
- `TOOL_PRESENTATION_INVENTORY.md`
- `PRESENTATION_ARCHITECTURE.md`
- `CONVERSATIONAL_UX_FINDINGS.md`
- `PRESENTATION_PATTERN_MATRIX.md`
- `ARCHITECTURE_RECOMMENDATION.md`

They are not duplicated here. This FRD is the current implementation specification and may be refined as implementation evidence improves it; the audits remain authoritative for the observations and code evidence recorded at the time of review.

### 2.3 Current baseline

Static audit evidence found:

- 197 registered Ask operations;
- 112 message-routable operations;
- 85 internal or declared-action-only operations;
- 30 registered top-level block renderers;
- nine practical presentation patterns;
- 196 deterministic operation contracts and one remote-generation operation contract.

These are working-tree registry counts, not proof of deployed availability. Runtime controls, account eligibility, property context, role policy, Skill health, adapters, and dependencies may reduce availability for a particular homeowner.

### 2.4 Development-stage implementation principles

ContractToCozy is in active development and testing with no production homeowners. Implementation prioritizes development velocity, architectural simplicity, practical validation, and iterative improvement. The five phases in this FRD are an implementation sequence, not approval milestones.

1. **No formal approval gates.** This FRD is a living specification. Update it when implementation reveals a clearer, simpler, or better-supported requirement.
2. **No unnecessary backward-compatibility engineering.** Preserve current functional contracts where practical. Do not create migration frameworks, adapters, or compatibility layers solely for obsolete development responses or historical test data.
3. **Test-driven iteration.** Implement a coherent increment, run relevant automated checks, review representative conversations and screenshots, and correct issues before expanding the change.
4. **Minimal documentation overhead.** Keep requirement IDs, concise implementation notes, validation results, and a prioritized limitation backlog. Do not create formal exception registers, approval workflows, sign-off records, or review calendars.
5. **Reuse before abstraction.** Extend existing contracts, renderers, state, and interaction infrastructure. Add a shared abstraction only when concrete implementation across multiple producers or a required journey demonstrates the need.
6. **Practical UX validation.** Use representative homeowner questions, multi-turn conversations, and desktop/mobile screenshots. Do not substitute process artifacts for inspecting the actual experience.
7. **Fix defects immediately.** Confirmed correctness, security, authorization, and data-integrity defects do not wait for a phase approval.
8. **Allow architectural refinement.** Refactor existing implementation when it simplifies the system or improves consistency. Avoid parallel implementations and compatibility layers without a concrete need.
9. **Progressive adoption.** Validate shared changes with the three representative tools, then extend them to other applicable operations.
10. **Keep implementation focused.** Do not add enterprise-scale release governance, rollout machinery, or organizational process before real product needs justify it.

The working loop is:

```text
Implement → Test → Review UX → Refine
```

The following remain strict engineering safeguards: truthful status and recommendation output; property access and authorization; confirmation for consequential actions; data integrity and idempotency; extension of the existing Ask architecture rather than a competing framework; and regression protection for existing capabilities.

---

## 3. Product outcome

Ask Cozy must behave as a knowledgeable homeowner advisor, not a catalog of tool outputs.

For the three primary homeowner jobs, it must:

1. **Daily attention:** identify and prioritize what needs attention without presenting every available record.
2. **Decision support:** answer the decision question, explain the material tradeoffs, and make uncertainty visible.
3. **Life events:** preserve context across sequential decisions and help the homeowner safely move work forward.

Success is not the presence of a summary block, card, or action. Success is that a homeowner can understand the answer, why it matters, what is known or uncertain, and what useful step is available next.

---

## 4. Scope

### 4.1 Included

- Ask response composition and hierarchy.
- Intent-sensitive presentation behavior.
- The nine shared presentation patterns.
- Collection delivery, visibility, disclosure, and paging semantics.
- Trust, evidence, freshness, uncertainty, and estimate-basis presentation.
- Action hierarchy and contextual continuation.
- Cross-operation and cross-Skill conversation continuity.
- Compatibility with current functional response contracts and current result/view state, without unnecessary migration machinery for obsolete development data.
- Quality evaluation, fixtures, journey tests, responsive review, and accessibility.
- The first five representative validation scenarios.

### 4.2 Excluded

- A new presentation service or standalone presentation engine.
- LLM-selected React components or executable UI definitions.
- Replacing the operation registry, Skill Platform, Interaction Model, or block registry.
- A redesign of canonical domain logic.
- A database schema solely for presentation preferences.
- Implementing every declared interaction type before a validated journey requires it.
- Making every answer use an identical visual template.
- A full redesign of traditional tool pages.

---

## 5. Governing principles

**PRES-PR-001 — Answer quality over component presence.** A response is not answer-first merely because it contains `SUMMARY`. The text must resolve the primary question or clearly state why it cannot.

**PRES-PR-002 — Semantic ownership remains upstream.** The browser never infers urgency, safety, risk, confidence, recommendation, or business priority from age, color, labels, ordering, or prose.

**PRES-PR-003 — Structure earns its space.** Rich UI is used only when it materially improves scanning, comparison, interaction, evidence review, or progress.

**PRES-PR-004 — Initial restraint, available depth.** The first meaningful viewport prioritizes the conclusion, rationale, and useful next step. Secondary detail remains accessible.

**PRES-PR-005 — Facts, estimates, and predictions remain distinct.** Presentation must not turn age-based estimates into measured physical condition or general guidance into home-specific assessment.

**PRES-PR-006 — View actions are not conversation or business actions.** Expanding, filtering, or changing layout must not create a message or persistent mutation unless the declared interaction requires it.

**PRES-PR-007 — Continuity before rediscovery.** Follow-ups continue the current subject and intent before offering generic discovery.

**PRES-PR-008 — Safe degradation.** Missing data, dependency failure, unsupported interaction, access loss, and stale results must fail visibly and honestly.

**PRES-PR-009 — Incremental evolution.** Prefer additive shared semantics when they keep current functional contracts simple. Breaking cleanup is allowed during development when it materially simplifies the system and affected code/tests are updated together; do not preserve obsolete development formats without a concrete dependency.

---

## 6. Responsibility model

| Responsibility | Owner |
|---|---|
| Canonical facts and source records | Domain service |
| Risk, urgency, priority, and eligibility | Domain logic or governed decision service |
| Recommendation and rationale | Producer or governed reasoning layer |
| Narrative hierarchy and declared pattern/profile | Ask operation producer under this FRD |
| Schema validation and operation-specific block allow-list | Existing Ask contracts and trust validation |
| Visual rendering and responsive transformation | Shared frontend renderer |
| Expansion, layout choice, and local filtering | Result view state |
| Routing and contextual continuation | Ask orchestration and governed suggested actions |
| Durable mutation | Existing authorized operation, confirmation, receipt, and reconciliation infrastructure |

**PRES-OWN-001:** Renderers must display producer-declared semantics faithfully and must not repair missing business judgment through heuristics.

**PRES-OWN-002:** Producers must not encode visual layout through prose, HTML, arbitrary component names, or block IDs when a shared typed semantic field exists.

**PRES-OWN-003:** LLM output may propose language, extraction candidates, or reasoning within existing governance. It cannot establish canonical truth, priority, authorization, completion, availability, or UI structure.

---

## 7. Conversational Quality Contract

Every applicable representative fixture and journey must be evaluated against the following dimensions. Passing requires semantic correctness, not only structural presence.

| Dimension | Acceptance criterion |
|---|---|
| Directness | The primary question is answered before optional exploration, or the response clearly identifies the one blocking fact or limitation. |
| Relevance | Initial content prioritizes information that changes the answer or next decision. |
| Explanation | A material recommendation states a concise governed rationale. |
| Disclosure | Secondary records and evidence remain reachable without overwhelming the initial response. |
| Actionability | When a useful safe action exists, one action is visually dominant and contextually relevant; when none exists, no artificial CTA is added. |
| Trust | Estimates, uncertainty, missing data, source basis, and freshness are stated where they affect interpretation. |
| Continuity | Follow-ups preserve the relevant property, entity, result, decision thread, and intent when those references remain valid. |
| Restraint | A simple factual question does not trigger an unnecessary dashboard, workflow, or unrelated capability list. |
| Safety | Emergency or consequential guidance uses the appropriate boundary, permission, and confirmation behavior. |
| Recovery | Empty, partial, stale, unavailable, access-lost, and failed states provide an honest explanation and safe next step. |

### 7.1 Quality levels

- **Fail:** incorrect, unsafe, misleading, loses required context, or cannot complete the required action.
- **Needs improvement:** correct but materially unclear, cluttered, weakly explained, or unnecessarily repetitive.
- **Pass:** meets every applicable criterion with no material usability issue.
- **Exemplary:** pass, plus concise language and useful depth without avoidable interaction.

**PRES-QUAL-001:** Release acceptance is scenario-based. Counting block types, actions, or words cannot independently produce a passing quality result.

**PRES-QUAL-002:** Each first-slice fixture must declare which quality dimensions apply and why any dimension is not applicable.

**PRES-QUAL-003:** Automated checks should cover deterministic properties such as block order, counts, action identity, basis/freshness presence, and continuation context. Human or browser review covers clarity, density, perceived hierarchy, and interaction coherence.

---

## 8. Response profile and intent sensitivity

The existing Appendix C.11 semantic modes remain authoritative. This FRD defines five optional presentation profiles for validation and composition; they are not automatically persisted enums or new renderer families:

| Profile | When used | Required behavior |
|---|---|---|
| `DIRECT_ANSWER` | One fact, status, or explanation answers the question | Lead with the answer; supporting evidence is compact or disclosed. |
| `COLLECTION` | The homeowner asks to see or explore records | State scope/count honestly, show the most relevant records, and provide real disclosure or paging. |
| `ATTENTION` | The homeowner asks what matters or needs action | Lead with assessed priority and rationale; unknown is not silently treated as good. |
| `COMPARE` | Alternatives or scenarios must be evaluated | Show material differences, assumptions, uncertainty, and recommendation only when governed evidence permits. |
| `GUIDE` | The homeowner is completing or understanding a task/workflow | Show current objective, safe next step, progress source, and completion semantics without inventing workflow state. |

**PRES-PROF-001:** The same operation or domain may produce different profiles based on intent.

**PRES-PROF-002:** Profile selection is producer/orchestrator-owned and deterministic from validated intent and result shape. An LLM may assist intent understanding but does not select arbitrary renderers.

**PRES-PROF-003:** A direct warranty-expiration question should normally remain a direct answer. “Show all warranties” is a collection. “Which warranties need attention?” is an attention result.

**PRES-PROF-004:** A profile field is added to a persisted contract only if implementation cannot validate required behavior without it and stored-response fallback is defined.

---

## 9. Shared pattern behavioral specifications

### 9.1 Direct answer / status summary

- Must state the answer or status in the first narrative unit.
- May use chips/metrics only when they clarify—not repeat—the answer.
- Must not attach a large collection unless the intent asks for breadth or the records are necessary to support the conclusion.
- Missing information that prevents a conclusion must be named before an all-clear statement.

### 9.2 Prioritized action list

- Priority and rationale come from the producer.
- Initial content shows the most consequential items, not merely the first records returned.
- Unknown, watch, optional, completed, and unavailable remain distinct.
- A dominant action is offered only for the leading useful next step.

### 9.3 Record explorer

- Must state collection scope, filters, delivered count, visible count, and total when known.
- Supports detail on demand without requiring a new conversation turn.
- Record corrections and mutations use exact entity identity and registered operations.
- Large collections use authoritative paging or honest bounded delivery.

### 9.4 Comparison / financial insight

- Leads with the decision or material tradeoff, not a table of numbers.
- Identifies assumptions, basis date, estimate/prediction status, and material limitations.
- Visually emphasizes differences that affect the decision.
- A recommendation must explain why; balanced evidence may legitimately yield no recommendation.

### 9.5 Timeline / milestone

- Preserves chronological meaning and timezone/date precision.
- Distinguishes deadlines, estimates, historical events, and planned dates.
- Current or next milestone is apparent without hiding the complete sequence.
- Filtering does not rewrite the original historical answer.

### 9.6 Guided decision / task guide

- Identifies the current objective and source of progress.
- Does not imply a stateful stepper when the source provides only a single instruction.
- Help or explanation does not advance progress.
- Completion follows the canonical domain workflow and proof policy.

### 9.7 Document / evidence insight

- Maps evidence to the supported claim or record.
- Distinguishes recorded, document-derived, inferred, conflicted, and unverified information.
- Does not expose raw technical payloads.
- Promotion or attachment actions remain governed mutations.

### 9.8 Monitor / proactive insight

- States what is monitored, threshold, cadence, source boundary, and current state.
- Explains why the insight appears now.
- Pause/stop/change operations are explicit and do not silently alter unrelated records.

### 9.9 Empty / error / recovery

- Distinguishes no matching records, missing setup, unavailable source, access loss, retryable failure, and out-of-scope request.
- Never represents missing data as an all-clear.
- Offers only actions that can resolve or safely continue the actual state.

---

## 10. Collection and progressive-disclosure contract

The following quantities must remain distinct:

| Field | Meaning |
|---|---|
| `sourceTotal` | Total matching canonical records, if the source can determine it. |
| `fetchedCount` | Records retrieved from the source for this result computation. |
| `deliveredCount` | Records included in the response payload. |
| `visibleCount` | Records currently shown by local UI state. |
| `nextPageAvailable` | Whether another authoritative request can retrieve more records. |
| `deliveryTruncated` | Whether records fetched or known at the source were omitted from the response payload. |

Exact field names may differ after contract review, but their meanings must not be conflated.

**PRES-COLL-001:** “Show more” may reveal already delivered records. It must not imply that undelivered records have been retrieved.

**PRES-COLL-002:** If more records exist outside the payload, the UI must say so and provide authoritative paging, a scoped continuation, or an honest boundary explaining where the rest can be accessed.

**PRES-COLL-003:** Section counts must state whether they represent source, fetched, delivered, or filtered records whenever those values differ.

**PRES-COLL-004:** Local expansion changes only `visibleCount`. Server paging/refinement may update current result state but must preserve original-response history and result identity rules.

**PRES-COLL-005:** Collection defaults are pattern- and intent-sensitive. A direct answer may show zero records; an attention result shows leading actionable items; a collection request may show a broader initial set.

**PRES-COLL-006:** Every collection has deterministic behavior for 0, 1, 5, 20, 50, and 100+ matching records.

---

## 11. Trust, evidence, freshness, and uncertainty

**PRES-TRUST-001:** Material recommendations and financial/risk estimates identify their governing basis and applicable as-of date or freshness state.

**PRES-TRUST-002:** General guidance, climate/location guidance, recorded home facts, homeowner-confirmed facts, document-derived facts, and predictions use distinguishable homeowner-facing language.

**PRES-TRUST-003:** Missing or conflicted information that could change a recommendation is visible before the recommendation is treated as reliable.

**PRES-TRUST-004:** Raw internal confidence scores are not shown by default. Producers translate evidence quality and uncertainty into governed language.

**PRES-TRUST-005:** A source/evidence region may remain collapsed when the answer is simple and low-risk. Material decisions require accessible evidence and assumptions without forcing them into the initial viewport.

**PRES-TRUST-006:** Age and expected lifespan may support replacement planning but must not be presented as measured physical condition without inspection or other governed evidence.

---

## 12. Action hierarchy

### 12.1 Action classes

1. **View actions:** expand, collapse, layout, local filter, detail selection.
2. **Conversation actions:** ask why, refine scope, continue a decision, supply context.
3. **Business actions:** create, update, complete, dismiss, schedule, share, confirm, or otherwise mutate durable state.

**PRES-ACT-001:** View actions do not create an execution unless authoritative data must be fetched.

**PRES-ACT-002:** Conversation and business actions use declared operation/entity identity; the client does not depend on reinterpreting button labels.

**PRES-ACT-003:** Business actions preserve authorization, role floors, confirmation, idempotency, cancellation, receipts, conflicts, and reconciliation.

**PRES-ACT-004:** At most one action is visually dominant in a normal response. Balanced comparisons, confirmation choices, emergencies, and no-action answers may legitimately have none.

**PRES-ACT-005:** `DISMISS`, `REMIND_LATER`, item `CONFIRM`, item `EDIT_PROPOSAL`, and item `NAVIGATE` are implemented only when a validated journey requires them and their target/persistence semantics are specified. Until then they continue to fail visibly and safely.

---

## 13. Conversation continuation and cross-tool context

**PRES-CONT-001:** A follow-up must preserve the active property and, when still valid, the selected entity, source execution/result, decision thread, work item, and relevant intent.

**PRES-CONT-002:** Context is not preserved blindly. Deleted, inaccessible, stale, ambiguous, or superseded entities require revalidation, disclosure, or clarification.

**PRES-CONT-003:** Contextual follow-ups outrank generic capability discovery and global starters.

**PRES-CONT-004:** A follow-up that changes domain—such as appliance replacement priority to warranty lookup—must carry exact entity identity through the registered target operation or governed Skill handoff.

**PRES-CONT-005:** Ask should not require the homeowner to repeat an entity already established and still unambiguous in the active result.

**PRES-CONT-006:** Local filter, expand, and layout changes do not create conversational history. A new substantive question or business action does.

**PRES-CONT-007:** Multiple results may coexist in a conversation. Actions target the intended result/entity using stable identity, not nearest-message position.

---

## 14. Representative journey coverage matrix

These journeys are acceptance fixtures, not demonstrations only.

| Journey | Primary jobs | Required coverage |
|---|---|---|
| Status Board | Daily attention | answer-first status, mutually exclusive unknown/good classification, honest counts, disclosure, correction, refresh |
| Refinance or HVAC decision | Decision support | comparison, assumptions, evidence, recommendation rationale, scenario follow-up, consequential-action boundary |
| Maintenance / seasonal care | Daily attention | governed priority, compact plan, contextual next action, setup confirmation, guide continuity |
| Warranty lookup → repair/replace | Cross-tool decision | entity retention, warranty evidence reuse, repair-versus-replace transition, no repeated identification |
| Home Buyer closing guidance | Life event | deadlines, missing/conflicted context, sequential decisions, role/access behavior, authorized task action |

### 14.1 Journey acceptance questions

Every journey must answer:

1. Was the correct operation or governed sequence selected?
2. Was existing property/entity context reused?
3. Were missing and conflicting facts handled honestly?
4. Did the first response provide a clear conclusion or next question?
5. Did structured UI improve comprehension rather than duplicate prose?
6. Did follow-ups preserve context across operation/Skill boundaries?
7. Could the homeowner take the useful action without unsafe shortcuts?
8. Were original response, current view, refreshed data, and durable changes kept distinct?

---

## 15. First vertical slices

### 15.1 Status Board

Required first:

- UNKNOWN/missing-date records are mutually exclusive from Good in the Ask summary and condition presentation.
- Counts use explicit collection semantics.
- Per-condition delivery limits are disclosed.
- Existing correction, refresh, role, confirmation, and boundary behavior remains intact.
- Tests include the defect case that existing Status Board suites missed.

### 15.2 Refinance or HVAC

- Comparison leads with the decision-relevant conclusion.
- Assumptions, evidence basis, freshness, and limitations are accessible.
- Scenario changes preserve the subject and do not mutate canonical records without confirmation.
- A no-recommendation result is permitted when evidence is insufficient or balanced.

### 15.3 Maintenance / seasonal care

- Urgency and priority remain server-owned.
- Initial content is compact and action-oriented.
- Setup or task creation is visibly proposed until confirmed.
- A focused guide does not invent persistent progress.

---

## 16. Current-contract compatibility and history

**PRES-COMP-001:** Prefer optional additive changes when they are the simplest way to preserve current functional contracts. A direct contract cleanup is allowed when it is simpler and all current producers, consumers, fixtures, and tests are updated in the same increment.

**PRES-COMP-002:** Current supported stored-response fixtures lacking new optional fields render through conservative defaults without inventing semantics. Obsolete development-only formats may be retired instead of accumulating compatibility code.

**PRES-COMP-003:** Newer unsupported block/schema versions use the existing safe fallback and never expose raw payloads.

**PRES-COMP-004:** `originalResponse`, current blocks, local view state, refreshed result, and persisted business changes remain distinct.

**PRES-COMP-005:** For response history the product currently supports, refreshing an old result must not silently replace the meaning of its historical answer. The UI discloses refreshed/current data according to existing lifecycle rules. This does not require migration support for abandoned development data.

---

## 17. Accessibility, responsive behavior, and performance

**PRES-UI-001:** All interactive controls support keyboard use, visible focus, programmatic labels, and non-color state communication.

**PRES-UI-002:** Touch targets meet the existing application standard; dense desktop controls transform into readable mobile layouts without horizontal page scrolling.

**PRES-UI-003:** Dynamic expansion, refresh, paging, and action outcomes provide appropriate focus and announcement behavior.

**PRES-UI-004:** Reduced-motion preferences are respected; automatic carousels or rotating results are prohibited.

**PRES-UI-005:** Performance optimization and lazy loading are evidence-driven. Do not split renderers solely because the registry is large.

**PRES-UI-006:** Runtime validation must include narrow mobile, standard desktop, large collections, long labels, empty/error states, and at least one assistive-technology review before broad adoption across applicable tools is considered complete.

---

## 18. LLM role and deterministic fallback

LLMs may materially improve:

- ambiguous intent interpretation;
- bounded fact/event extraction;
- recommendation explanation where governed evidence is supplied;
- concise narrative generation;
- context-aware follow-up phrasing.

LLMs do not own:

- authorization or operation availability;
- canonical facts;
- risk/priority rules unless a governed decision service explicitly does so;
- renderer selection;
- action identity;
- persistence or completion state.

**PRES-LLM-001:** Every required presentation path has a deterministic structured fallback when remote generation is disabled, unavailable, invalid, or rejected by trust validation.

**PRES-LLM-002:** LLM-generated narrative cannot omit or contradict required producer-declared limitations, evidence basis, or safety boundaries.

---

## 19. Validation strategy

### 19.1 Static and contract checks

- operation and handler registration integrity;
- block-schema and renderer exhaustiveness;
- presentation-profile/result-shape compatibility;
- collection count invariants;
- action identity and authorization metadata;
- required basis/freshness fields for material fixtures;
- stored-response fallback.

### 19.2 Producer/component tests

- answer content and order;
- priority/rationale semantics;
- disclosure and paging;
- empty/partial/error/access-loss states;
- keyboard, ARIA state, focus, and non-color cues;
- no client inference of domain priority.

### 19.3 Journey tests

- all five journeys in §14;
- multi-turn entity retention;
- operation/Skill transitions;
- clarification only when material;
- action confirmation and reconciliation;
- stale/deleted/access-lost entity recovery.

### 19.4 Runtime review

The first three vertical slices require representative browser fixtures and screenshots on desktop and narrow mobile. Before broad adoption across applicable tools, the five journeys require targeted runtime validation against an available controlled environment. Runtime checks must not be claimed when only fixtures or static rendering were used.

---

## 20. Implementation sequence and completion checks

The phases below organize work and dependencies. They are not approval gates or release sign-offs. Work proceeds when the relevant implementation is coherent, applicable tests pass, and focused UX review finds no unresolved correctness, security, data-integrity, or material usability defect.

### Phase 1 — Correctness and baseline

Scope:

- Status Board UNKNOWN/GOOD correction.
- Stale operation/material-command governance counts.
- Capital-timeline source-reading assertion after orchestrator decomposition.
- Misleading collection counts discovered in the first slices.
- Baseline fixtures/screenshots for the three initial slices.

Completion check:

- confirmed correctness defects are fixed;
- focused regression and governance suites pass;
- Status Board defect fixture fails before and passes after the correction;
- baseline presentation evidence is recorded.

### Phase 2 — Shared presentation contracts

Scope:

- collection semantics;
- optional presentation profiles where justified by implementation evidence;
- evidence/freshness/basis semantics;
- action hierarchy;
- stored-response fallbacks.

Completion check:

- three representative producers use the shared semantics;
- no producer relies on a new block-id workaround for the shared need;
- old response fixtures render safely;
- schema, renderer, and interaction tests pass.

### Phase 3 — Conversational experience quality

Scope:

- answer-first producer rules;
- recommendation rationale;
- progressive disclosure;
- contextual continuation;
- nine-pattern behavioral fixtures;
- quality rubric evaluation.

Completion check:

- the three initial slices pass every applicable quality criterion;
- simple-answer restraint and large-result behavior are both demonstrated;
- material recommendations meet trust requirements;
- desktop/mobile fixture review is recorded.

### Phase 4 — End-to-end journey validation

Scope:

- warranty → repair/replace;
- buyer closing guidance;
- multi-turn versions of the first three slices;
- cross-operation/Skill context preservation.

Completion check:

- five journeys pass the §14 acceptance questions;
- no unnecessary entity repetition in valid contexts;
- authorized actions and stale/access-loss recovery are verified;
- unresolved journey gaps are documented and prioritized.

### Phase 5 — Broader rollout and visual QA

Scope:

- migrate other applicable producers by pattern and risk;
- remove demonstrated duplicate/block-id workarounds incrementally;
- accessibility, performance, responsive, empty/error, and consistency review.

Completion check:

- applicable operations meet shared standards or known limitations are recorded in the prioritized backlog;
- runtime validation covers the representative matrix;
- documentation and implementation status are current;
- no parallel presentation authority exists.

---

## 21. Prioritization

### P0

- Status Board UNKNOWN/GOOD overlap.
- Any presentation issue that misstates safety, status, authorization, persistence, or a material financial decision.

### P1

- Stale governance tests blocking trustworthy validation.
- Inconsistent collection counts/truncation.
- Answer-first quality requirements.
- Trust/freshness/basis for material recommendations.
- Intent-sensitive presentation profiles.
- Cross-tool continuation in required journeys.
- Runtime/mobile/accessibility validation before broad adoption across applicable tools.

### P2

- Incremental reduction of grouped-list block-id coupling.
- Additional pattern adopters and secondary journey refinements.
- Interaction types not required by the initial journeys.

### P3

- Optional polish and evidence-driven bundle optimization.
- Historical documentation cleanup outside currently governing references.

---

## 22. Metrics

During pre-launch implementation, use deterministic fixture and journey measures rather than production adoption metrics:

- percentage of representative fixtures passing all applicable quality dimensions;
- percentage of material-decision fixtures with basis, freshness, and limitations;
- percentage of collection fixtures with honest source/delivered/visible semantics;
- contextual follow-up success across the five journeys;
- number of required journeys that repeat an already-known unambiguous entity;
- number of new block-id-specific renderer branches introduced;
- accessibility and narrow-width defects by severity;
- fallback success when remote generation is unavailable.

These measures support review; they do not replace qualitative homeowner-experience evaluation.

---

## 23. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Quality contract becomes a rigid response template | Evaluate outcomes and intent-sensitive profiles, not identical block sequences. |
| Renderer begins making business decisions | Enforce the responsibility model and producer-declared semantics. |
| New fields break stored responses | Additive optional contracts and conservative fallbacks. |
| “Show more” misrepresents incomplete data | Separate source, fetched, delivered, and visible counts. |
| Cross-tool continuity uses stale/wrong entity | Stable identity plus server revalidation and clarification. |
| Rich results overwhelm the conversation | First-viewport restraint and profile-specific disclosure. |
| LLM outage breaks presentation | Deterministic structured fallbacks. |
| Refactor displaces correctness work | Phase 1 defects precede abstraction cleanup. |

---

## 24. Explicit deferrals

- Dedicated Conversational Presentation Engine.
- LLM-driven renderer or component selection.
- New presentation-only database state.
- Wholesale migration of all 197 operations before representative patterns are validated.
- Universal implementation of all interaction types.
- Generalized stateful guides beyond their defined domain workflow designs.
- Broad visual redesign before the first five journeys are validated.
- Compatibility machinery solely for nonexistent production users, unless stored development fixtures or current contracts require it.

---

### 24.1 Implementation status (2026-10-14)

Phase 1 is implemented: the Status Board no longer presents unknown condition as Good (the server authors a mutually exclusive "Missing information" section), registry governance checks use derived invariants instead of hand-kept counts, and a static baseline of the Status Board, seasonal plan and refinance scenario strip is pinned in `apps/backend/tests/ask/presentationQualityBaseline.test.js`. Details, findings and the Phase 2 backlog are in `docs/architecture/ASK_COZY_CONVERSATIONAL_PRESENTATION_QUALITY_IMPLEMENTATION_PLAN.md` section 14.1. Phase 2 is implemented for three adopters: an optional collection descriptor on grouped lists (Status Board, Inventory, Home Event Radar), a dated-benchmark and assumptions disclosure on the refinance scenario, and a pure presentation-quality evaluator (`apps/backend/src/services/ask/presentation/`). Details and remaining adoption are in plan section 14.2. Phase 3 is implemented: a fixture harness with one behavioral fixture for each of the nine patterns, a Status Board that leads with the most urgent item and states its estimation basis, a refinance scenario answer that leads with the tradeoff, and seasonal care that declares what it left out. Details are in plan section 14.3. Phase 4 is complete at the contract level: five journeys are tested through declared actions, which found and fixed a stale-board gap after corrections, a viewer-visible action the server refuses, and a warranty answer that ignored the selected item. Runtime validation of the journeys against a real backend is pending (plan section 14.4).

Phase 5 is partially complete: Documents, the four Maintenance-domain reads, eleven Buyer-domain operations, five Claims-and-Coverage operations, eight Inspection-and-Negotiation operations, thirteen Home-Intelligence operations, four DIY-and-Guidance operations, Appliance Failure Risk, and Maintenance Task Update have completed collection review. Break-even and coverage review were audited, HVAC decisions carry the item-scoped warranty action, operation-specific continuations cover all 197 registered operations through 190 governed recipes, two contextual surfaces and five bounded exemptions, and an operation-level presentation-adoption ledger classifies every operation. Home Intelligence adds exact producer declarations for complete and bounded collections, preserves the Intelligence Envelope's genuine cursor with an honestly unknown global total, and records Room Create and Inventory Item Create as list-free capture/confirmation workflows rather than inventing collections from their broad command allow-lists. DIY and Guidance declare authoritative active-project, reviewed-template, surfaced-journey and live-step collection semantics without advertising unsupported continuations. Appliance Failure Risk now declares the complete service-evaluated collection across its capped lifespan and missing-age rows, while Maintenance Task Update declares the complete task set behind its bounded ambiguous-target choice list. A conservative descriptor (no fetched or source-total claim, only "no continuation") remains derived for lists that withhold rows without declaring them; financing carries a dated rate basis as structured evidence; all trust/rationale and specialized-workflow operations have completed producer review, including answer-first, scope and source-freshness corrections for Capability Discovery, Home Change, Buyer readiness and Incident Continuation; and accessibility attribute tests cover every pattern family. The remaining implementation-only ledger backlog is 26 producer-declared collection adoptions. Real narrow-width, assistive-technology, zoom and reduced-motion review and a live-backend journey run remain user-owned validation work (plan sections 14.5 and 14.6).

**Overall status:** Phases 1-3 complete; Phase 4 contract implementation complete with runtime validation pending; Phase 5 partially complete. The FRD is substantially implemented, not fully complete.

## 25. Implementation completion

This FRD is implemented when:

1. Phase 1 correctness and governance defects are closed.
2. Shared collection, trust, action, and profile semantics are implemented additively.
3. The first three vertical slices pass the Conversational Quality Contract.
4. All five representative journeys pass cross-tool continuation and action acceptance.
5. Desktop, narrow-mobile, accessibility, fallback, and large-result behavior is validated and honestly reported.
6. Applicable operation updates have documented coverage; remaining limitations are in the prioritized backlog.
7. Existing authorization, confirmation, idempotency, reconciliation, Skill, and canonical-domain behavior remains intact.
8. No separate presentation engine or competing business-logic layer has been introduced.

---

## Appendix A — Concise traceability

| FRD area | Audit evidence | Existing authority |
|---|---|---|
| Architecture choice | `ARCHITECTURE_RECOMMENDATION.md` | Inline Workspace §§11.3–11.6; Skill Platform §§7–16 |
| Quality contract | `CONVERSATIONAL_PRESENTATION_AUDIT.md`, review feedback | Inline Workspace Appendix C.11 |
| Collection semantics | `CONVERSATIONAL_UX_FINDINGS.md` | Interaction Model result/view/freshness requirements |
| Pattern behavior | `PRESENTATION_PATTERN_MATRIX.md` | Inline Workspace §§11.5–11.6 |
| Tool coverage | `TOOL_PRESENTATION_INVENTORY.md` | operation registry and Skill manifests |
| Continuation | `PRESENTATION_ARCHITECTURE.md` | Interaction Model §§5–13; suggested-next-action policy |
| Status Board | `CONVERSATIONAL_UX_FINDINGS.md` | Status Board handler/service and existing product requirements |

## Appendix B — Implementation-planning rule

Use a short implementation note for each phase or coherent increment. It references requirement IDs from this FRD, names the affected producers/renderers/contracts, states current-contract behavior, records validation actually run, and lists known limitations in the ordinary prioritized backlog. It is not an approval or sign-off artifact and must not restate the full FRD.
