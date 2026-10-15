# Ask Cozy Conversational Presentation Audit

**Date:** October 14, 2026

**Scope:** Audit only; no production code, schema, dependency, or UI changes.
**Evidence standard:** Current working-tree code was traced statically. Runtime behavior is not claimed unless an existing test was executed. Existing FRDs describe intent; current contracts and handlers describe implementation.

## Executive summary

Ask Cozy already has most of the infrastructure a dedicated “presentation engine” proposal would try to create: a canonical operation registry, capability-handler registry, typed response blocks, an exhaustive frontend renderer registry, typed interaction dispatch, result identity, original/current response separation, local view state, confirmation workflows, and safe unsupported fallbacks. The smallest justified evolution is therefore **Option B: extend the existing shared presentation infrastructure**, not a replacement engine.

The current registry contains **197 operations**: **112 message-routable** and **85 internal/declared-action-only**. All operations declare an `AskOperationResult` contract and a bounded allow-list drawn from **30 registered presentation block types**. There are **30 renderer registrations**, but fewer conceptual patterns: **nine reusable presentation patterns** cover the current inventory. The architecture is already capable of 100+ operations structurally; consistency is limited primarily by producer-authored narrative/order, large-result policy, block-id special cases inside the generic grouped-list renderer, and incomplete interaction support—not by absence of a rendering framework.

The most important confirmed defect is in the Ask Status Board adapter: the domain service explicitly distinguishes missing install-date data from “good,” but the Ask summary and Good section count by `condition === 'GOOD'`, so unknown items can still be narrated and tab-counted as “in good shape.” The UI adds a separate Missing info chip, creating overlapping categories. This is a presentation-mapping defect, not evidence that the underlying Status Board condition algorithm is wrong.

## Overall assessment

### Strengths to preserve

- `ASK_OPERATION_DEFINITIONS` is the authoritative operation catalog and declares family, access floor, execution mode, adapter, and allowed block types.
- `capabilityHandlerRegistry` separates execution from routing and validates adapter coverage at startup.
- `AskPresentationBlock` is a typed, versioned structured result contract with summary, list, comparison, timeline, decision, evidence, limitation, empty/error, lifespan, progress, and guide forms.
- `ASK_BLOCK_RENDERERS` is exhaustive at compile time and has an honest runtime fallback.
- `interactionDispatch.ts` distinguishes view filtering/refresh from conversation and mutation paths.
- `originalResponse`, `viewState.resultId`, revisions, and local `ResultView` prevent ordinary expand/filter controls from rewriting conversation history.
- The Skill Platform already supports standardized operation contracts, policies, adapters, context providers, and handoffs.

### UX maturity

Ask Cozy is beyond “chat plus dashboards”: many producers emit answer-first summaries, semantic groupings, evidence, boundaries, and typed next actions. Its strongest experiences are focused task guides, seasonal/home-basics guidance, maintenance priority presentation, appliance lifespan, and decision-comparison flows. Its weaker experiences are large record collections and command-heavy administrative surfaces where the answer is generic, every row exposes similar controls, or continuation depends on a traditional page.

## Top 10 findings

| Rank | ID | Priority | Classification | Finding | Affected scope | Effort |
|---:|---|---|---|---|---|---|
| 1 | CP-01 | P0 | Confirmed defect | Status Board unknown-date items are counted and grouped as Good while also appearing under Missing info. | `HOME_STATUS_BOARD` | S |
| 2 | CP-02 | P1 | Confirmed defect | Registry governance is stale: `askGovernance.test.js` asserts 142 operations and 63 material commands while the live values are 197 and 106. | All operations | S |
| 3 | CP-03 | P1 | UX deficiency | Result-size behavior is not contractually uniform. Some blocks page, some truncate, some disclose locally, and Status Board returns up to 100 while displaying at most 25 per condition with no collection offset. | Record/list tools | M |
| 4 | CP-04 | P1 | Architectural limitation | `GroupedListBlock` contains block-id-specific branches and imports 13 domain result components; the central block registry is strong, but one renderer remains a secondary dispatch hub. | Grouped-list tools | M |
| 5 | CP-05 | P1 | UX deficiency | Answer-first quality remains producer-owned and cannot be guaranteed by block registration alone; allowed block types validate safety, not order or narrative quality. | Cross-tool | M |
| 6 | CP-06 | P1 | Architectural limitation | Nine declared item interaction types exist, but `DISMISS`, `REMIND_LATER`, item `CONFIRM`, item `EDIT_PROPOSAL`, and item `NAVIGATE` deliberately resolve to visible unsupported states. | Interactive results | M/L |
| 7 | CP-07 | P2 | UX deficiency | Trust metadata is expressive but inconsistent across producers: evidence/source/freshness/confidence are optional and not uniformly shown. | Decision and estimate tools | M |
| 8 | CP-08 | P2 | Architectural limitation | Same-tool intent variation is possible through multiple operations/producers, but presentation selection has no explicit intent/presentation-profile contract; it relies on routing and producer choices. | Warranties, maintenance, records | M |
| 9 | CP-09 | P2 | Unverified risk | Several renderer paths use horizontal tables or dense cards; component code is responsive, but real narrow-width and assistive-technology behavior was not exercised in this audit. | Table/comparison/detail tools | M |
| 10 | CP-10 | P3 | Documentation gap | Older audits and FRD status notes contain obsolete operation counts and historical architecture descriptions. | Architecture docs | S |

### Resolution status (added 2026-10-14; the findings above are the original audit and are not rewritten)

| ID | Status | Where |
|---|---|---|
| CP-01 | Resolved. Unknown is a server-authored, mutually exclusive section and is excluded from Good. | Plan section 14.1 |
| CP-02 | Resolved. Counts were replaced by derived invariants; masked assertions were exposed and handled. | Plan section 14.1 |
| CP-03 | Resolved for Status Board, Inventory, Documents, Home Event Radar and the seasonal plan (a producer-declared `collection` descriptor and a Next control gated on it). Maintenance, Home Events and other collections are not yet migrated. | Plan sections 14.2, 14.5 |
| CP-04 | Partly addressed. Each fixed block id was classified; the one id-keyed pager became field-keyed; three ids with no current producer are retained pending an owner decision. | Plan section 14.5 |
| CP-05 | Addressed by a test-time evaluator and nine pattern fixtures; not a runtime guarantee. | Plan sections 14.2, 14.3 |
| CP-06 | Not changed; still deliberate. | none |
| CP-07 | Resolved for the refinance scenario (assumptions, dated benchmark); other decision tools unchanged. | Plan section 14.2 |
| CP-08 | Not changed; profiles are a test-time input, not a persisted contract. | Plan section 4.2 |
| CP-09 | Partly addressed by deterministic attribute tests; real browser and assistive-technology review remains manual. | Plan section 14.5 |
| CP-10 | Partly addressed; stale counts in the governing tests were corrected. Historical audits were left as written. | Plan section 14.1 |

## Root-cause summary

Presentation responsibility is intentionally split: domain handlers own facts, judgment, order, and actions; the contract validates shapes and operation-specific block allow-lists; shared renderers own visual behavior; result state owns local exploration. Most inconsistencies arise where producer semantics are underspecified or where `GROUPED_LIST` became a catch-all for domain-specific interaction.

## Scalability assessment

The platform can register 100+ operations without one component per operation: all 197 current operations use the same 30 block registrations. The limiting factor is the integration ritual and semantic quality, not raw renderer count. A new operation commonly requires registry, semantic package, trust corpus, interaction coverage, adapter/handler, optional Skill manifest/policy, and tests. New frontend code is only required when existing blocks cannot express the experience; nevertheless, repeated block-id exceptions show that richer semantic fields should be added when two or more producers share the need.

## Recommended direction

Choose **Option B**. Keep the operation, Skill, block, action, and result-state architecture. Add a small semantic composition layer inside existing contracts: explicit collection policy, optional answer anatomy metadata, standardized source/freshness annotations, and a pattern-selection policy keyed by user intent and result shape. Do not create a parallel presentation engine or let an LLM select component structure.

## Prioritized roadmap

1. Correct Status Board unknown/good mapping and add focused contract/component tests.
2. Restore registry-count governance and derive counts rather than hard-code them where possible.
3. Add a shared collection policy (`initialVisibleCount`, delivered/total count, page cursor/offset, truncation explanation) and migrate Status Board plus two representative collections.
4. Reduce `GroupedListBlock` block-id dispatch by moving repeated semantics into declared presentation patterns or typed fields.
5. Standardize answer-first producer checks and evidence/freshness rules in the interaction-quality harness.
6. Implement only the interaction types demanded by validated journeys; keep safe unsupported handling for the rest.

## Explicit answers to the 18 audit questions

1. **Actually exposed:** 197 registered operations; 112 accept ordinary message routing and 85 are internal or declared-action-only. Runtime enablement can reduce this through controls, Skill policy, and property/account eligibility.
2. **Distinct presentation implementations:** 30 registered block renderers; grouped-list additionally contains several specialized sub-renderers. Conceptually, nine reusable patterns cover the inventory.
3. **Tools sharing reusable UI:** all 197 declare only shared block types; none owns an operation-exclusive top-level renderer. Some grouped-list tools invoke specialized sub-renderers.
4. **Strongest:** seasonal/home-basics plans, focused task guides, maintenance priority stack, appliance lifespan, refinance/HVAC comparisons.
5. **Weakest:** Status Board classification copy, very large record collections, and command/review tools with repetitive row controls or page handoffs.
6. **Five cross-tool UX problems:** inconsistent answer-first narrative, inconsistent large-result behavior, variable trust metadata, uneven contextual continuation, and incomplete interaction vocabulary.
7. **Five architectural limitations:** grouped-list block-id dispatch, no uniform collection contract, producer-only answer order, incomplete action execution coverage, and a high multi-registry integration ritual.
8. **100+ support:** structurally yes—the current 197 prove it—but consistent quality needs shared semantic policies and derived governance.
9. **Minimum patterns:** nine.
10. **Intent variation:** yes, by routing to different operations or producer branches; an explicit intent-to-presentation profile would make it more systematic.
11. **Interaction Model:** largely yes for view, conversation, refresh, mutation, and confirmation; not all nine declared item actions are implemented.
12. **Skill Platform:** yes; it already standardizes operation, adapter, policy, context, health, and handoff contracts.
13. **LLMs:** use for ambiguous intent, bounded extraction, reasoning, and optional narrative improvement; keep renderer selection, authorization, prioritization rules, and fallbacks deterministic.
14. **Dedicated engine necessary:** no.
15. **Preserve:** registries, typed blocks, renderers, result identity/state, interaction dispatch, confirmation/receipt flows, Skill contracts, design system.
16. **Smallest increment:** fix Status Board mapping, then add one shared collection-policy field without changing business logic.
17. **Three validation tools:** Status Board (status/list), refinance or HVAC (comparison/decision), and maintenance/seasonal care (prioritized plan/actions).
18. **Defer:** generalized LLM presentation planning, a new schema version, renderer plug-in loading, broad action-vocabulary completion, and pixel-level redesign until user validation.

## Audit limits

No browser, service, database, Docker, Playwright, or live LLM was used. Static inspection does not prove runtime data quality, latency, visual layout, or deployed operational-control state.

## Validation executed

`node --test tests/ask/askGovernance.test.js tests/ask/statusBoardCapabilitySlice.test.js tests/ask/statusBoardCommands.test.js` ran 48 tests: **45 passed and 3 failed**. Both Status Board suites passed. The governance suite failed on two stale hard-coded counts (197 vs 142 operations; 106 vs 63 material commands) and one source-reading assertion that still searches the decomposed orchestrator facade for `capitalTimelineBlock(...)` instead of its handler source. These failures were observed and documented only; this audit did not modify production code or tests.
