# ContractToCozy Personalization Engine

**Status:** Internal validation with default property personalization

**Review date:** 2026-07-14

**Decision:** Feasible with moderate refactoring; implement first as a module inside the existing Express backend.

This directory began as the evidence-backed discovery package and Functional Requirements Document (FRD). The active delivery strategy is internal validation with no real-user cohort: reviewed property-based guidance is available by default, while additional household-profile collection remains optional and explicitly consented. Larger target-architecture sections remain long-term reference material, not current commitments.

## Decision summary

| Decision | Recommendation |
|---|---|
| Runtime boundary | Modular monolith under `apps/backend/src/modules/personalization/` |
| Primary store | Existing PostgreSQL through Prisma; relational core plus validated JSON rule AST and snapshot payloads |
| Rules | Custom, deliberately small typed evaluator; no executable database code |
| Evaluation | Read/manual recomputation for reviewed property rules; add event-driven work only after measured need |
| Queue | No personalization queue or nightly sweep during internal validation |
| Graph/vector database | Neither is justified for the current Phase 4 transparency slice |
| AI | Assist extraction, summaries, and authoring; never eligibility, safety gates, authorization, or financial math |
| UI | Default property guidance plus optional “Improve recommendations” profile; shared placements; internal catalog approval |
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
13. [Personalization operations](personalization-operations.md)
14. [Personalization USP showcase strategy](personalization-usp-showcase-strategy.md)
15. [Phase 1 completion audit](phase1-completion-audit.md)
16. [Phase 2 implementation audit](phase2-implementation-audit.md)
17. [Phase 3 initial implementation audit](phase3-implementation-audit.md)
18. [Phase 4 initial implementation audit](phase4-implementation-audit.md)

## Reading conventions

- Repository paths are relative to the monorepo root.
- “Household collaborator” means the current authenticated `HouseholdMember`; “household profile” means the proposed non-account demographic/lifestyle aggregate.
- “Recommendation definition” is catalog content and rules; “personalized recommendation” is a property/household-specific evaluated instance.
- Prior architecture passes under `docs/` were used as navigation aids only. Conclusions here were checked against source.

## Scope boundary

All recommendations must concern the home, ownership, household safety, maintenance, cost, risk, comfort, sustainability, value, or local homeowner experience. Generic family, health, lifestyle, or pet management is out of scope.
