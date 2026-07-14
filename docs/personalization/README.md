# ContractToCozy Personalization Engine

**Status:** Discovery baseline with pilot implementation strategy

**Review date:** 2026-07-13

**Decision:** Feasible with moderate refactoring; implement first as a module inside the existing Express backend.

This directory began as the evidence-backed discovery package and Functional Requirements Document (FRD). The active delivery strategy is now the data-free pilot in `09-implementation-roadmap.md`; larger target-architecture sections remain long-term reference material, not current commitments.

## Decision summary

| Decision | Recommendation |
|---|---|
| Runtime boundary | Modular monolith under `apps/backend/src/modules/personalization/` |
| Primary store | Existing PostgreSQL through Prisma; relational core plus validated JSON rule AST and snapshot payloads |
| Rules | Custom, deliberately small typed evaluator; no executable database code |
| Evaluation | Pilot: opt-in/read-triggered recomputation; add event-driven work only after measured need |
| Queue | No personalization queue or nightly sweep during the pilot |
| Graph/vector database | Neither is justified for Phases 0–3 |
| AI | Assist extraction, summaries, and authoring; never eligibility, safety gates, authorization, or financial math |
| UI | One opt-in pilot surface with at most three explainable recommendations |
| Feasibility | **Feasible with moderate refactoring** |

## Document map

1. [Codebase assessment](01-codebase-assessment.md)
2. [Current-state architecture](02-current-state-architecture.md)
3. [Feasibility study](03-feasibility-study.md)
4. [Target architecture](04-target-architecture.md)
5. [Data model](05-data-model.md)
6. [API design](06-api-design.md)
7. [Frontend experience](07-frontend-experience.md)
8. [Personalization FRD](08-personalization-frd.md)
9. [Implementation roadmap](09-implementation-roadmap.md)
10. [Testing strategy](10-testing-strategy.md)
11. [Risks and open questions](11-risks-and-open-questions.md)
12. [Codebase evidence index](codebase-evidence.md)
13. [Pilot operations](pilot-operations.md)

## Reading conventions

- Repository paths are relative to the monorepo root.
- “Household collaborator” means the current authenticated `HouseholdMember`; “household profile” means the proposed non-account demographic/lifestyle aggregate.
- “Recommendation definition” is catalog content and rules; “personalized recommendation” is a property/household-specific evaluated instance.
- Prior architecture passes under `docs/` were used as navigation aids only. Conclusions here were checked against source.

## Scope boundary

All recommendations must concern the home, ownership, household safety, maintenance, cost, risk, comfort, sustainability, value, or local homeowner experience. Generic family, health, lifestyle, or pet management is out of scope.
