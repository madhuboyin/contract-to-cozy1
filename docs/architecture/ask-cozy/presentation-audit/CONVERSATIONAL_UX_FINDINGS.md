# Ask Cozy Conversational UX Findings

## Method

The audit evaluated answer-first behavior, insight, hierarchy, progressive disclosure, actions, continuity, trust, consistency, and degradation through contracts, handlers, renderers, focused tests, and existing requirements. Claims are code-traced unless explicitly marked unverified.

## Cross-tool findings

| Dimension | Assessment |
|---|---|
| Answer first | Supported by `SUMMARY` and several strong producers; not enforced globally. |
| Insight | Rich where handlers emit reasons/evidence; generic lists can remain descriptive rather than advisory. |
| Hierarchy | Tone, chips, priority lists, grouped sections, and actions exist; producer order is decisive. |
| Progressive disclosure | Strong primitives exist, but collection behavior differs by tool. |
| Actions | Typed and server-authorized; several declared item-action kinds are safely unsupported. |
| Continuity | Session/execution/result identities and typed next actions are mature. |
| Trust | Evidence, limitations, boundaries, confidence, and freshness exist but are inconsistently populated. |
| Responsive/accessibility | Components use responsive CSS, semantic controls, ARIA state, and focus styles; browser/AT behavior is unverified here. |
| Degradation | `EMPTY_STATE`, `ERROR_STATE`, `LIMITATION`, `BOUNDARY`, unsupported-block fallback, and operational unavailable results exist. |

## Status Board reference case

### What works

- The answer begins with a concise condition count and uses a dedicated `STATUS_ACCORDION` presentation.
- The backend marks the result `READY_WITH_LIMITATIONS` for truncation or missing dates.
- Missing-date items get a contextual **Add install date** action through the existing inventory-correction flow.
- Other rows get a confirmation-governed **Correct this item** action for contributors/owners.
- Refresh is explicit and confirmation-governed; the read path is now read-only.
- The UI shows only one condition tab at a time and expands one row at a time, so it no longer renders every item’s detail simultaneously.
- The boundary clearly states that condition is estimated, not inspected.

### Confirmed defect: unknown overlaps Good

The domain service computes `dataStatus: 'UNKNOWN'` when an item lacks the install date needed for prediction and excludes such items from `summary.good` (`homeStatusBoard.service.ts:859-872`, `:936-942`). The Ask adapter ignores both fields. It counts and sections solely by `item.condition`, so an unknown item whose effective condition defaults to `GOOD` is included in “in good shape” (`statusBoard.handler.ts:65`, `:74-78`, `:89-93`). The renderer also creates a separate Missing info collection from `needsInfo`, so the same record appears in both categories (`StatusAccordionView.tsx:23-30`, `:48-55`).

This is a confirmed presentation defect. It is not proof of a faulty condition algorithm, because the service already models unknown separately.

### Scale behavior

- Backend fetch cap: 100.
- Per-condition payload cap: 25, with section `count` based on fetched rows.
- A top-level limitation explains when total exceeds fetched items, but no message explains that a condition with more than 25 delivered rows is locally cut to 25.
- The accordion maps all delivered items in the active tab; it has no internal batching or authoritative paging.

At 5–20 items the design is reasonable. Around 50 it is usable but scroll-heavy in a large condition. At 100, silent per-condition slicing and lack of page controls are correctness/trust concerns, not merely aesthetics.

### Smallest improvement

1. Build the Ask summary and sections from `dataStatus`/the service summary so UNKNOWN is mutually exclusive with Good.
2. Add a real Missing info section rather than a client-derived overlapping chip.
3. Declare delivered count versus total and provide shared paging/batched disclosure for any section over its payload cap.
4. Keep the current business rules, correction flow, refresh command, and accordion renderer.

## Interaction audit

| Kind | Current behavior |
|---|---|
| Navigate | Supported in response actions/links; item-action `NAVIGATE` is visibly unsupported because item actions lack an href. |
| Filter | Runs through an Ask refinement without forcing a row entity; view/result identity is preserved. |
| Expand | Local React/view state; no message or durable write. |
| Correct | Typed mutation routed with registered operation and entity, then server authorization/confirmation. |
| Refresh | Re-reads current execution; distinct from normal message submission. |
| Dismiss | Declared but item dispatch returns a visible unsupported state unless implemented by a domain command. |
| Remind later | Same limitation as dismiss. |
| Execute | Registered operation, role floor, policy, confirmation, idempotency/receipt where required. |
| Ask follow-up | Typed suggested next actions or ordinary conversational continuation. |

## Trust and transparency

The contract can distinguish facts, estimates, boundaries, assumptions, evidence, confidence, and freshness. The gap is adoption consistency. A shared rule should require estimate basis and freshness for material recommendations, without forcing evidence cards into simple factual answers.

## Unverified risks

- Real mobile density and focus movement after refresh/paging.
- Screen-reader announcement quality for dynamic result replacement.
- Actual latency and partial response behavior under unavailable LLM/domain dependencies.
- Runtime enablement/health distribution across deployed Skills.
