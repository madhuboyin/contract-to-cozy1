# Contract to Cozy - Production Gap Implementation Plan (2026)

**Date:** 2026-03-29  
**Primary Input:** `/docs/functional/PRODUCTION_READINESS_AUDIT_2026.md`  
**Program Window:** 2026-03-30 to 2026-07-31 (18 weeks)  
**Execution Model:** Independent Home Tools and AI Tools hardening in Phase 1, then broader productionization.

---

## 1) Goals and Guardrails

### Goals
- Close all P0 and P1 gaps identified in the audit.
- Raise all Phase 1 scoped tools to at least readiness `2` (Usable with targeted hardening).
- Standardize trust signals (confidence, freshness, disclaimers, determinism) across tools.
- Ship execution-oriented UX improvements so users can act on tool outputs.

### Guardrails
- Keep Home and AI tracks independent until tool-level reliability is proven.
- No Guidance Overview orchestration expansion in Phase 1.
- Safety, privacy, and determinism issues block release.
- Every fix must ship with tests and observability.

---

## 2) Scope

### In Scope (Phase 1)
- 39 scored tools from audit summary (all scored tools except Guidance Overview and unscored entries).
- All gaps listed in audit Section 5:
  - `HT-P0-*`, `HT-P1-*`
  - `AI-P0-*`, `AI-P1-*`
- Top-15 implementation board (`IMP-01` to `IMP-15`).

### Out of Scope (Phase 1)
- Guidance Overview expansion and new orchestration templates.
- New categories beyond ITEM and SERVICE (future-phase extensibility only).
- Full marketplace/provider integrations that require external contracting beyond CTA-level links.

---

## 3) Team Model and Ownership

### Workstreams
- **WS1 - Safety and Privacy:** Emergency Help, Home Digital Will, regulated disclaimers.
- **WS2 - Data Integrity and Determinism:** Budget Planner, Document Vault, signal clamping, grounded AI outputs.
- **WS3 - Financial Decision Accuracy:** Insurance Trend, Break-Even, Sell/Hold/Rent, Service Price Radar.
- **WS4 - Actionability and UX:** Quote Comparison repositioning, next-step CTAs, execution handoffs.
- **WS5 - Platform Trust Foundations:** confidence schema, stale-data surfacing, telemetry, release gates.

### Suggested owners (role-level)
- Home Platform Eng, Home Finance Eng, Home UX Eng, Home Pricing Eng
- AI Safety Eng, AI Core Eng, AI Risk Eng, AI Planning Eng, AI Insurance Eng, AI Energy Eng
- Privacy/Security Eng, QA Automation, Product + Design

---

## 4) Delivery Phases (with Dates)

## Phase 0 - Mobilization and Baselines (2026-03-30 to 2026-04-03)

### Deliverables
- Finalized backlog with parent epic per audit gap ID.
- Definition of Done and release gates ratified.
- Test harness baseline:
  - deterministic regression fixtures
  - safety classification tests
  - confidence/freshness contract tests
- Dashboard baseline for current error rate, latency, and confidence metadata coverage.

### Exit Criteria
- All `IMP-*` items have owner, estimate, and target sprint.
- CI jobs for determinism and safety checks are active.

## Phase 1 - P0 Closure (2026-04-06 to 2026-04-24)

### Target
Close all P0 items across Home and AI tracks.

### Planned Items
- `IMP-01`, `IMP-02`, `IMP-03`, `IMP-08`, `IMP-09`, `IMP-10`, `IMP-11`, `IMP-12`
- Gap IDs covered:
  - `HT-P0-1`, `HT-P0-2`, `HT-P0-3`
  - `AI-P0-1`, `AI-P0-2`, `AI-P0-3`, `AI-P0-4`

### Exit Criteria
- No open P0 gaps in production code.
- Safety and privacy regression suite green for 7 consecutive days.
- Deterministic output checks pass for Budget Planner and downstream consumers.

## Phase 2 - P1 Closure and Actionability (2026-04-27 to 2026-05-29)

### Target
Close all P1 items in Section 5 and complete missing CTA/navigation bridges.

### Planned Items
- `IMP-04`, `IMP-05`, `IMP-06`, `IMP-07`, `IMP-13`, `IMP-14`, `IMP-15`
- Gap IDs covered:
  - `HT-P1-1` through `HT-P1-5`
  - `AI-P1-1` through `AI-P1-5`

### Exit Criteria
- No open P1 gaps in Section 5.
- All targeted tools expose deterministic next-step CTAs with valid deep links.
- Mortgage-aware defaults active for Break-Even and Sell/Hold/Rent where data is present.

## Phase 3 - Tier-2 Hardening Backlog (2026-06-01 to 2026-06-30)

### Target
Address remaining high-value gaps from readiness tiers 2 and 3 not covered by the Top-15.

### Backlog tranche (priority order)
1. Negotiation Shield: AI fallback, parsing sanity checks, confidence explanation.
2. Mortgage Refinance Radar: broaden loan product modeling, rate freshness controls.
3. Status Board: cost context per item, category-weighted priority model.
4. Home Capital Timeline: bundling coordination, seasonal/climate wear adjustments.
5. Hidden Asset Finder: confidence calibration vs approved outcomes.
6. Home Habit Coach: reminder/notification channel and completion evidence hooks.
7. Cost Growth + True Cost + Cost Explainer: transparency on heuristic vs data-backed components.
8. Property Tax + Cost Volatility: ground assumptions and add action guidance.
9. Seller Prep + Price Finalization: integrate spend feedback and execution capture.
10. Home Digital Twin + Home Gazette + Renovation Risk Advisor + Plant Advisor: confidence disclosures and execution hooks.

### Exit Criteria
- At least 80% of tranche items complete with test coverage.
- Any unfinished item has a ticketed mitigation and explicit release note caveat.

## Phase 4 - Release Readiness and Scale-Up (2026-07-01 to 2026-07-31)

### Target
Production readiness certification and controlled rollout.

### Activities
- Reliability soak test (2 weeks).
- Feature flags and phased rollout:
  - 10% internal cohort
  - 25% beta cohort
  - 100% rollout after KPI gates pass
- Post-release audit refresh against Section 0 rubric.

### Exit Criteria
- Phase 1 tools meet minimum readiness `2` with no P0/P1 regressions.
- Incident response runbooks exist for safety/privacy sensitive tools.

---

## 5) Backlog Mapping (Audit IDs -> Implementation)

| Audit Gap ID | Implementation Item(s) | Sprint Target | Success Metric |
|---|---|---|---|
| HT-P0-1 | IMP-01 | Sprint 1 | Priority inflation capped and validated by regression tests |
| HT-P0-2 | IMP-02 | Sprint 1 | ACL enforcement verified via authorization tests |
| HT-P0-3 | IMP-03 | Sprint 1 | Educational labeling and gating enforced in UI + API |
| HT-P1-1 | IMP-04 | Sprint 2 | Cross-currency/state normalization correctness >= 99% test pass |
| HT-P1-2 | IMP-05 | Sprint 2 | Debt context auto-included for eligible properties |
| HT-P1-3 | IMP-01 + geo-matching extension | Sprint 2 | County/polygon match coverage increased and validated |
| HT-P1-4 | IMP-06 | Sprint 2 | Quote Comparison removed from peer nav and embedded in flow |
| HT-P1-5 | IMP-07 | Sprint 2 | CTA click-through and completion funnel instrumentation active |
| AI-P0-1 | IMP-08 | Sprint 1 | Zero regex-derived severity in code paths |
| AI-P0-2 | IMP-09 | Sprint 1 | Identical input -> identical output in golden tests |
| AI-P0-3 | IMP-10 | Sprint 1 | Auto-creation blocked below confidence threshold |
| AI-P0-4 | IMP-11 + IMP-12 | Sprint 2 | Numeric outputs include confidence/source disclosures |
| AI-P1-1 | IMP-15 | Sprint 3 | Coverage recs include actionable next step for >= 95% responses |
| AI-P1-2 | IMP-14 | Sprint 3 | Mitigation completion shows observed premium delta loop |
| AI-P1-3 | IMP-13 | Sprint 3 | Bill extraction complete with explicit fallback behavior |
| AI-P1-4 | IMP-13 + simulator messaging | Sprint 3 | Low-data runs display confidence warning consistently |
| AI-P1-5 | IMP-12 + oracle validation rules | Sprint 3 | Recommendation quality guardrails enforced |

---

## 6) Quality Plan

### Test Layers
- Unit tests for scoring, confidence, parsing, and validation utilities.
- Contract tests for API response schema changes (confidence/freshness/disclaimer fields).
- Integration tests for cross-tool data flows (Document Vault -> Status Board/Capital Timeline/Coverage Intelligence).
- Determinism snapshot tests for forecasting/simulation tools.
- Safety tests for Emergency Help classification and escalation behavior.
- Security tests for Home Digital Will ACL boundaries.

### CI Gates (blocking)
- No new P0 defects.
- Determinism suite must pass for flagged tools.
- Schema compatibility checks must pass for frontend consumers.
- Coverage threshold for changed modules >= 80%.

---

## 7) Observability and Operational Readiness

### Required telemetry
- `confidence_level`, `confidence_source`, `last_verified_at`
- `signal_age_days`
- fallback/heuristic-path counters per request
- CTA exposure -> click -> completion funnel
- severity-classification override and incident logs (Emergency Help)

### Alerting
- P0 alerts:
  - Emergency Help schema parse failure spikes
  - ACL authorization failures
  - determinism drift in Budget Planner snapshots
- P1 alerts:
  - stale data utilization above threshold
  - broken CTA/deep-link rate > 2%

---

## 8) Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| External data dependency delays (rates, regional baselines) | Slips in Sprint 2/3 | Use interim static snapshots behind explicit disclosure and freshness metadata |
| Cross-tool schema changes break UI clients | Regressions in multiple pages | Version response contracts and run consumer contract tests in CI |
| Safety/privacy fixes delayed by legal review | Release blockers | Front-load legal/security sign-off in Phase 0 |
| Parallel team contention on shared services | Merge churn | Define module ownership and weekly dependency review |

---

## 9) Governance Cadence

### Weekly
- Monday: planning and dependency resolution
- Wednesday: risk review and blocker burn-down
- Friday: demo + readiness score update per tool

### Milestone Reviews
- **2026-04-24:** P0 closure sign-off
- **2026-05-29:** P1 closure sign-off
- **2026-06-30:** Tier-2 backlog review
- **2026-07-31:** production readiness certification

---

## 10) Exit Definition

Program is complete when all are true:
- All audit Section 5 gaps (`HT-P0/P1`, `AI-P0/P1`) are closed and verified.
- No open P0/P1 regressions for 14 consecutive days.
- Phase 1 in-scope tools meet readiness target (`>=2`) under Section 0 rubric.
- Rollout metrics remain within thresholds for trust, reliability, and actionability.
