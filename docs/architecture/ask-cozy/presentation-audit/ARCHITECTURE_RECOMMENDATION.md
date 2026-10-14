# Ask Cozy Presentation Architecture Recommendation

## Options

| Dimension | A — Improve tool-specific renderers | B — Extend shared infrastructure | C — Dedicated presentation engine |
|---|---|---|---|
| Existing-code reuse | High | Very high | Medium |
| Complexity | Low initially, grows per tool | Medium | High |
| Disruption | Low | Low/medium, additive | High |
| Scalability | Weak/medium | High | High in theory |
| UX consistency | Uneven | High | High if adopted fully |
| Testing | Repeated per tool | Shared contracts + representative slices | New engine plus migration |
| Maintenance | Proportional to tools | Proportional mainly to patterns | Parallel abstraction risk |
| LLM dependency | None required | None required | Risk of over-centralized planning |
| Extensibility | Local | Strong typed extension points | Strong but duplicative |
| Risk | Drift | Controlled evolution | Rewrite/migration and split authority |

## Recommendation

Adopt **Option B**. The current operation registry, typed response contract, renderer registry, adaptive patterns, interaction dispatch, and result state already constitute a conversational presentation framework. Naming a second engine would duplicate authority and create migration work without solving the verified defects.

## Minimal viable evolution

### Increment 1 — Correctness and governance

- Fix Status Board UNKNOWN versus GOOD mapping.
- Replace or update stale hard-coded operation/material-command counts and the capital-timeline source-reading assertion broken by orchestrator decomposition.
- Add focused tests for mutual-exclusive counts and missing-info rendering.

### Increment 2 — Shared collection contract

- Add optional delivered count, total count, paging/offset, and initial disclosure fields to collection sections.
- Define honest truncation copy and authoritative paging behavior.
- Validate with Status Board, documents/inventory, and maintenance.

### Increment 3 — Semantic composition

- Add only reusable fields demonstrated by at least two producers: answer profile, “why it matters,” evidence basis/freshness, and primary/secondary action grouping.
- Move repeated block-id behavior into typed declarations.
- Preserve safe fallback for old stored executions.

### Increment 4 — Quality harness

- Add producer-level checks for answer-first order, material-estimate basis, collection honesty, action eligibility, and empty/error states.
- Use three representative vertical slices: Status Board, refinance/HVAC, maintenance/seasonal care.

## Components to reuse

All current registries, block schemas/renderers, typed actions, confirmation and capture flows, result identity/state, Skill policies, and design-system primitives.

## Components to extend

`GROUPED_LIST` collection semantics, producer quality validation, trust annotations, and selected interaction dispatch branches.

## Components that may need creation

A small shared collection footer/pager and a producer-side presentation-profile validator. Neither requires a separate runtime engine.

## Risks and dependencies

- Stored-response compatibility requires additive optional fields and fallbacks.
- Semantic priority must remain server-owned; the browser must not infer urgency.
- Business actions must continue through authorization, confirmation, idempotency, and reconciliation.
- Bundle impact should be measured before adding more domain-specific sub-renderers; lazy loading is only justified by measured cost.

## Explicit deferrals

- no renderer chosen by LLM;
- no new database schema solely for presentation;
- no wholesale operation/Skill migration;
- no universal implementation of every declared interaction before a journey needs it;
- no separate presentation service or plug-in runtime;
- no broad visual redesign before user validation.
