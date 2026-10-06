# Ask Cozy — Conversational Presentation Implementation Plan

**Date:** October 6, 2026

**Type:** Focused phased plan; no implementation or schema change in this document

**Product authority:** `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.184, especially Appendix C.11

**Audit context:** `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md` and `docs/architecture/ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md`

## 1. Objective and boundary

Make Ask Cozy consistently lead with an answer or judgment, show the decision-driving support, offer a primary action when justified, and continue the current context without replacing its response contract, operation registry, domain intelligence, action infrastructure, or canonical data models. Formal evidence remains progressive unless safety, trust, or comprehension requires it earlier. Emergency guidance, clarification, balanced comparison, and confirmation may legitimately use a different hierarchy or no primary action.

The first delivery is a presentation-consistency slice. It does not create a stateful walkthrough engine, silently capture facts, add a database, introduce seven renderer families, or make recommendation priority a client heuristic.

## 2. Verified reusable baseline

- The backend response contract already provides typed presentation blocks, suggestions/typed next actions, confirmation, capture, child executions, evidence, boundaries, and execution history.
- The frontend has an exhaustive block registry with safe unsupported fallback.
- Seasonal home care already produces a summary, Do soon/Can wait grouped list, personalization boundary, and contextual actions.
- `SeasonalPlanResultList` already supports compact metadata and progressive task detail.
- `TASK_GUIDE` already presents one recorded task or habit as a focused guide.
- `interactionDispatch.ts` already separates conversation continuation, mutation, filtering, refresh, and visibly unsupported interactions.
- `BOUNDARY` already distinguishes INFO, CAUTION, and EMERGENCY.
- Adaptive presentation already separates semantic server declarations from lossless client layout choices, although some switches remain too broadly exposed.

## 3. Root causes to verify in Phase 1

1. Producers and response sequences do not consistently lead with the answer or judgment even when the correct information exists.
2. Generic grouped-list/table renderers sometimes give ordinary attributes too much visual weight.
3. View controls are exposed from renderer capability rather than from demonstrated homeowner utility in every case.
4. Response-level continuation can compete with generic discovery suggestions or unrelated next-task actions.
5. `TASK_GUIDE` is sometimes interpreted as a walkthrough although its source contract contains no authored steps or progress state.
6. Personalization and “general guidance” disclosures can read as system disclaimers rather than useful conversational context.

Each cause must be confirmed against the current producer and rendered reference fixture before editing; a screenshot alone is not proof of the producing path.

The audit and implementation belong to the same Phase 1 task. Complete and save the audit before editing code. If repository evidence supports the approved requirements without material ambiguity, continue directly into the smallest coherent implementation. Stop and request direction only when the audit exposes an unresolved conflict in product behavior, safety, persistence, data ownership, or architecture that repository evidence cannot resolve.

## 4. Phase 1 — Presentation consistency

### 4.1 Audit artifacts

Write the findings to `docs/architecture/ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_1_AUDIT.md`, following `docs/architecture/AUDIT_METHODOLOGY.md`. The focused audit holds trace evidence and the pre-edit conclusions; the FRD remains the source of requirements. After implementation, update that audit with the actual changes and validation, then add concise status/link updates to this plan and `docs/product/ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md`.

For winter preparation, furnace-filter guidance, and home-safety basics, record:

- routed operation and handler;
- exact response blocks and their order;
- semantic source of priority, safety, personalization, and actions;
- renderer selected at desktop and narrow width;
- local-only versus conversational versus durable actions;
- generic suggestions that survive downstream suppression/deduplication;
- current focused tests and fixture coverage.

Use `graphify query` first, then direct code reading to verify the complete path. Locate the home-safety producer during this trace; do not assume that an existing home-basics component or documented block id proves which route handled the reported prompt.

### 4.2 Minimal implementation rules

- Prefer changes in the existing producer/builder when the missing behavior is judgment, ordering, grouping, disclosure, or action selection.
- Prefer changes in a shared renderer only when the same semantic contract is already correct and the defect is visual hierarchy, density, accessibility, or local disclosure.
- Reuse `SUMMARY`, `GROUPED_LIST`, `PRIORITY_LIST`, `TASK_GUIDE`, `BOUNDARY`, and existing typed actions before adding a block.
- Suppress view controls for focused answers whose alternative view adds no meaningful utility; retain useful comparison, timeline, and dense-record choices.
- Never derive urgency, priority, safety, personalization, or a recommendation in the browser.
- Preserve old execution parsing and the safe registered fallback.

### 4.3 Expected first files to inspect, not a predetermined change list

- `apps/backend/src/services/ask/support/seasonalHomeCare.ts`
- the home-basics/safety producer located by the Phase 1 trace
- `apps/backend/src/productFramework/ask/ask.contract.ts`
- `apps/frontend/src/components/ask/SeasonalPlanResultList.tsx`
- `apps/frontend/src/components/ask/TaskGuideBlock.tsx`
- `apps/frontend/src/components/ask/AdaptiveTableBlock.tsx`
- `apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx`
- `apps/frontend/src/features/ask/adaptivePresentation.ts`
- the response-level suggested-action composition in `ExecutionCard`/workspace support

The audit decides the actual edit set. Do not touch all listed files merely because they are listed. The written audit is a prerequisite to edits, not a separate approval checkpoint unless it identifies the unresolved material ambiguity described in section 3.

### 4.4 Acceptance

- Winter preparation leads with a climate/season judgment, visibly prioritizes the governed tasks, progressively discloses detail, truthfully states personalization, and does not persist tasks before confirmation.
- Furnace-filter guidance is one compact current-task guide. It does not claim multi-step state and does not make an unrelated next task the dominant action.
- Home-safety basics leads with the few most important items, reveals the remainder progressively, handles gas present/absent/unknown honestly, and gives emergency instructions their existing semantic boundary.
- Auto/List/Cards/Table controls are absent from focused answers where they add no utility and remain available for explicitly justified lossless alternatives.
- Contextual continuations outrank unrelated discovery actions.
- Stored executions, role policy, access loss, confirmation, idempotency, and reconciliation continue to behave as before.

### 4.5 Status (October 6, 2026)

Phase 1 is implemented and statically/component-tested; runtime, browser and layout behavior are unverified. See [`ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_1_AUDIT.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_1_AUDIT.md) §9 for files changed, before/after shapes, validation run and not run, and limitations. Notable outcomes: producer-declared `initialVisibleCount` gives true progressive disclosure; the furnace-filter guide declares no primary action because no current-task help capability exists; the gas emergency is an `EMERGENCY` boundary, which places the safety guide in safe-recovery suggestion mode by design. Phase 2 is complete with no new contract: see [`ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_2_INVENTORY.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_2_INVENTORY.md). R1 (next-steps cards honor declared action style), a seasonal-specific lead helper (winter plan and recorded checklist), and the R3 content increment (hiring guide reordered with a lead three; renovation “Other open items” collapsed to five; monthly routine unchanged) are implemented; the renovation 20-item truncation remains a separate open issue. Next separately approved increment: truncation copy or paging for the renovation checklist, or the Phase 3 design gate.

## 5. Phase 2 — Reusable semantic composition

After Phase 1, inventory every local special case introduced. If two or more producers need the same missing semantic field or ordering policy, propose the smallest additive contract. Candidate additions must specify producer ownership, schema validation, old-response fallback, skill-manifest impact, frontend rendering, accessibility, and history compatibility.

Do not add a persisted `responseIntent` or seven block types solely to mirror the policy vocabulary. Add one only if producers or clients otherwise cannot express or validate behavior without string/block-id inference.

## 6. Phase 3 — Stateful GUIDE design gate

Before implementation, produce and approve a focused design answering all decisions in FRD C.11.8. The design must identify the canonical step source and authoring governance, state lifetime, versioning, completion/proof policy, pause/resume/skip behavior, relationship to maintenance and seasonal records, child-turn behavior for help, capture/confirmation integration, and history/access-loss semantics.

Likely affected areas may include the response contract, execution/session continuation, a step-content catalog, and frontend guide controls. No database change is assumed. If existing execution state cannot meet cross-session requirements, document the evidence and proposed schema change; per repository policy, update Prisma and contracts but do not create migration scripts.

### 6.1 Status (October 6, 2026)

The design gate is written and was reviewed once: [`ASK_COZY_STATEFUL_GUIDE_DESIGN.md`](ASK_COZY_STATEFUL_GUIDE_DESIGN.md) revision 2. The central recommendation (durable progress in the DIY domain, Ask as a continuation view over template-sourced projects) was accepted; revision 1 was **not approved** because several existing DIY defects were treated as acceptable boundaries. Revision 2 resolves all nine review findings: provable template review (immutable revisions or re-review on edit), a decided ownership and role model plus a role-floor fix on the DIY page, actor-aware and version-checked transitions, a durable outbox for completion effects with no read-time repair, defined optional-step semantics, local-only help in v1, reverse maintenance-to-DIY reconciliation, and an incident-effects audit. It asks 13 decisions (O1-O13) and lists seven prerequisites (P0-P6). **Awaiting approval; nothing is implemented and no schema is changed.**

## 7. Phase 4 — ASSESS and safety knowledge capture

Define an assessment-turn contract that asks one material question, records conversation-only state separately from canonical facts, and routes any durable fact through existing governed capture and confirmation. Start with one safety question whose answer demonstrably changes guidance. Conditional safety recommendations must use canonical Property Context and distinguish present, absent, unknown, conflicted, and stale when those states are supported.

## 8. Validation strategy

Use requirements review, Graphify/code-path tracing, contract inspection, and focused environment-independent tests. Add producer tests before renderer snapshots when judgment semantics change. Add component tests for hierarchy, disclosure, keyboard behavior, ARIA state, focus, non-color urgency, and narrow-width behavior. Run existing lightweight typecheck/build or focused tests only when dependencies are already available.

Do not start or troubleshoot services, databases, Docker, Playwright, or any other browser-based test infrastructure for this work, including a fixture-only Playwright run. Component tests and static/build checks do not prove actual browser layout; report desktop, narrow-width, and runtime behavior as unverified unless an already-available non-prohibited check directly establishes it.

After every code phase: correct findings from lightweight validation; update the Phase 1 audit, this plan's status, the conversational gap audit, and any materially affected FRD requirement or implementation-status note; then run `graphify update .` as the final repository-maintenance step. Do not rewrite an approved requirement merely to accommodate an implementation shortcut.

## 9. Principal regression risks

- Changing generic grouped-list behavior can damage record collections with real per-item actions.
- Removing all view switches would violate IW-PRES-008 for comparisons, timelines, and dense records.
- Reordering blocks can separate actions from the evidence or identity they govern.
- Treating generic climate guidance as home-specific creates false personalization.
- Treating a guide interaction as completion can falsely certify physical work.
- Reusing capture UI without its canonical writer can create conversation-only shadow data.
- Refreshing historical answers from live data can rewrite the meaning of the original conversation.
- New block types require contract, registry, manifest, fallback, stored-response, and startup-validator coverage.

## 10. Deliverable after each phase

Report current-architecture findings, confirmed root causes, reused contracts/components, exact files changed, before/after response shape for the three reference scenarios, tests and static checks actually run, prohibited or unavailable checks not run, remaining limitations, and the next separately approved increment. Link the Phase 1 audit and distinguish code-traced, statically tested, component-tested, and runtime-unverified claims.
