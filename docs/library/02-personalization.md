# Personalization Engine

[Library home](README.md) · [Flags](FLAGS.md)

24 documents. Flag key: 🔴 conflicting/superseded · 🟠 status lags reality or cites missing code · 🟡 historical snapshot. Blank = no issue found (not proof it is current - check *Last changed*).

## Requirements (FRD/PRD) (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟠 C5 | [08 — Functional Requirements Document: Personalization Engine](../personalization/08-personalization-frd.md) | v1.0 · Proposed; implementation not authorized by this document \| | 2026-07-14 | 445 |

## ADR (decision) (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟡 C5 | [ADR-0001: Personalization module foundation (Phase 0 "first implementation step")](../personalization/adr-0001-personalization-module-foundation.md) | Superseded as an implementation plan; retained as Phase 0 history** | 2026-07-14 | 153 |
| 🟡 C5 | [ADR-0002: Phase 1 foundation — migration steps 1–3](../personalization/adr-0002-phase1-foundation-migration-steps-1-3.md) | Superseded by the greenfield strategy in `09-implementation-roadmap.md`** | 2026-07-14 | 140 |

## Plan (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [09 — Phased Implementation Roadmap](../personalization/09-implementation-roadmap.md) |  | 2026-07-15 | 106 |
|  | [Personalization catalog — Phase 0 content plan](../personalization/catalog-plan.md) | DRAFT / PLANNING ONLY**. This is the "20–40 definition content plan" | 2026-07-15 | 122 |

## Feature reference (9)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
| 🟡 C5 | [04 — Current Target Architecture](../personalization/04-target-architecture.md) |  | 2026-07-15 | 138 |
|  | [10 — Testing Strategy](../personalization/10-testing-strategy.md) |  | 2026-07-15 | 109 |
|  | [Personalization internal-validation operations](../personalization/personalization-operations.md) |  | 2026-07-15 | 110 |
|  | [Personalization USP showcase and limited-user validation strategy](../personalization/personalization-usp-showcase-strategy.md) | Recommended next product slice before full Phase 3 learning or | 2026-07-15 | 295 |
|  | [05 — Current Personalization Data Model](../personalization/05-data-model.md) |  | 2026-07-14 | 112 |
|  | [02 — Current-State Architecture](../personalization/02-current-state-architecture.md) |  | 2026-07-13 | 152 |
|  | [06 — API Design](../personalization/06-api-design.md) |  | 2026-07-13 | 124 |
|  | [07 — Frontend Experience](../personalization/07-frontend-experience.md) |  | 2026-07-13 | 107 |
|  | [11 — Risks, Guardrails, and Open Questions](../personalization/11-risks-and-open-questions.md) |  | 2026-07-13 | 77 |

## Audit / analysis (7)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [Phase 2 implementation audit — revised greenfield scope](../personalization/phase2-implementation-audit.md) |  | 2026-08-21 | 60 |
|  | [03 — Feasibility Study](../personalization/03-feasibility-study.md) |  | 2026-07-15 | 129 |
|  | [Phase 1 completion audit — default personalization](../personalization/phase1-completion-audit.md) |  | 2026-07-15 | 45 |
|  | [01 — Codebase Assessment](../personalization/01-codebase-assessment.md) |  | 2026-07-14 | 128 |
|  | [Phase 3 implementation audit — initial greenfield slice](../personalization/phase3-implementation-audit.md) |  | 2026-07-14 | 42 |
|  | [Phase 4 implementation audit — initial greenfield slice](../personalization/phase4-implementation-audit.md) |  | 2026-07-14 | 48 |
| 🟠 C19 | [Codebase Evidence Index](../personalization/codebase-evidence.md) |  | 2026-07-13 | 223 |

## Status / phase record (2)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [ContractToCozy Personalization Engine](../personalization/README.md) | Internal validation with default property personalization | 2026-07-16 | 56 |
|  | [Phase 2.5 demo data setup through the UI](../personalization/phase2-5-demo-data-setup.md) |  | 2026-07-15 | 145 |

## Data / asset (1)

| | Document | Status (as written) | Last changed | Lines |
|---|---|---|---|---|
|  | [ContractToCozy-Personalization-Operations-Runbook.docx](../personalization/ContractToCozy-Personalization-Operations-Runbook.docx) |  | 2026-07-15 |  |

## Flag details for this area

- 🟠 **personalization/08-personalization-frd.md** - Status "Proposed; implementation not authorized" but modules/personalization exists in code and README says internal validation is live.
- 🟠 **personalization/codebase-evidence.md** - Six cited code paths are gone, including orchestration.routes.ts and ActionCenter.tsx; use as discovery-time evidence, not current architecture.
