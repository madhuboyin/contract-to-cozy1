# Canonical v3 Implementation Plan (Audit Findings Closure)

**Date:** April 19, 2026  
**Source of truth:** [Audit Canonical Contract (v3)](./canonical-audit-contract-v3.md)  
**Execution window:** April 20, 2026 through May 15, 2026 (4 weeks)

## 1) Objective

Close all pending launch gates in the canonical contract and move CtC from **"Beta ready with hardening gates"** to **"launch-ready"** based on measurable technical criteria.

## 2) Scope

This plan addresses all `⚠️ Pending` items in canonical v3:

- AI fallback UI for Gemini-dependent cards/flows
- API timeout and circuit-breaker hardening for AI/external dependencies
- Rate-limit verification for AI endpoints
- Health probes with real DB + Redis signal
- Frontend/backend schema parity for property create/update payloads
- Resolution-flow session replay observability
- Analytics runtime wiring for missing events:
  - `booking_initiated`
  - `outcome_win_generated`
  - `task_completed`
  - `session_started`

## 3) Workstreams

### Workstream A — Reliability Gates (P0/P1)

#### A1. AI Fallback UI (P0)

**Goal:** Keep key flows useful when AI is degraded/offline.

**Implementation**

- Add graceful fallback states in Magic Scan:
  - show actionable fallback card (manual add + retry) instead of dead-end error only.
- Add fallback rendering strategy for win surfaces:
  - if AI-derived trust/insight payload is missing, render deterministic template with explicit low-confidence labeling.
- Ensure onboarding reveal flow has non-AI fallback copy/cards.

**Primary touchpoints**

- `apps/frontend/src/components/orchestration/MagicCaptureSheet.tsx`
- `apps/frontend/src/components/shared/WinCard.tsx`
- `apps/frontend/src/app/onboarding/reveal/page.tsx`

**Acceptance criteria**

- Simulated AI 500/timeout does not strand users in Magic Scan.
- User can still complete at least one meaningful next action in each degraded flow.
- No uncaught runtime error in fallback path.

**Verification**

- Manual test matrix: success / timeout / 500 for scan + reveal.
- Add component-level tests for fallback rendering branches.

---

#### A2. API Timeouts + Circuit Breakers (P0)

**Goal:** Bound latency and failure cascade from external AI APIs.

**Implementation**

- Introduce a shared timeout helper (`withTimeout`) for AI-bound service calls.
- Apply timeout defaults (10s) to:
  - Gemini chat service
  - document intelligence analysis
  - other Gemini-dependent high-latency engines touched in core flows.
- Add lightweight circuit-breaker behavior:
  - short open window after repeated failures
  - return controlled fallback error code/message.

**Primary touchpoints**

- `apps/backend/src/services/gemini.service.ts`
- `apps/backend/src/services/documentIntelligence.service.ts`
- `apps/backend/src/controllers/gemini.controller.ts`
- `apps/backend/src/routes/document.routes.ts`
- `apps/backend/src/lib/`* (new timeout/circuit helper)

**Acceptance criteria**

- AI call duration is capped by server-side timeout.
- Repeated upstream failures do not saturate worker threads or request pools.
- Clients receive consistent, typed failure responses.

**Verification**

- Unit tests for timeout helper and breaker transitions.
- Integration test: forced slow upstream returns timeout response under 11s.

---

#### A3. Rate-limit Verification + OCR Limiter Hardening (P1)

**Goal:** Prevent runaway AI cost and ensure multi-pod consistency.

**Current state anchors**

- Gemini route already protected by Redis-backed limiter:
  - `apps/backend/src/routes/gemini.routes.ts`
  - `apps/backend/src/middleware/rateLimiter.middleware.ts`
- OCR route currently uses in-memory token bucket:
  - `apps/backend/src/middleware/ocrRateLimiter.middleware.ts`
  - `apps/backend/src/routes/inventory.routes.ts`

**Implementation**

- Convert OCR limiter to Redis-backed limiter (cluster-safe) or wrap with shared Redis store.
- Confirm all high-cost AI entrypoints have explicit limiter middleware.
- Document per-endpoint budgets and 429 UX copy.

**Acceptance criteria**

- `429` behavior consistent across pods/restarts.
- All high-cost AI endpoints have explicit limiter protection and test coverage.

**Verification**

- Load test script validates threshold + retry-after headers.
- CI smoke for `429` responses on over-limit calls.

---

#### A4. Health Probes with Real Redis Check (P1)

**Goal:** Make readiness/deep health authoritative for DB and Redis.

**Current state anchor**

- `/api/health/deep` currently marks Redis as ok without ping.
- File: `apps/backend/src/index.ts`

**Implementation**

- Replace placeholder Redis check with real `redis.ping()` using shared client:
  - `apps/backend/src/lib/redis.ts`
- Return degraded status when Redis is configured but unavailable.
- Keep internal-network guard and add operator note/runbook.

**Acceptance criteria**

- Redis outage flips deep health to degraded (`503`).
- DB failure and Redis failure are independently visible in `checks` payload.

**Verification**

- Staging fault injection: stop Redis, confirm deep health degrades.
- Curl-based smoke in deploy pipeline.

---

#### A5. Property Schema Parity (P1)

**Goal:** Eliminate frontend/backend drift for property payloads.

**Current state anchors**

- Backend schema: `apps/backend/src/utils/validators.ts` (`createPropertySchema`)
- Frontend API shape narrower than backend:
  - `apps/frontend/src/lib/api/client.ts` (`createProperty`, `updateProperty`)

**Implementation**

- Align frontend create/update payload interfaces to backend schema keys/types.
- Remove stale frontend fields not in backend contract.
- Add shared contract strategy (preferred):
  - generate shared types from backend schema/OpenAPI for frontend consumption.

**Acceptance criteria**

- Frontend can submit any backend-supported optional property field without type workaround.
- No unsupported/stale fields remain in frontend API layer.

**Verification**

- Typecheck gate on frontend + backend.
- Contract test comparing serialized payload keys for create/update.

---

### Workstream B — Analytics Wiring Closure

#### B1. Wire missing runtime events (P0)

**Goal:** Move canonical missing events from "defined" to "live".

**Events to wire**

- `session_started`
- `task_completed`
- `booking_initiated`
- `outcome_win_generated`

**Implementation map**

- `session_started`
  - emit once after authenticated dashboard bootstrap with `propertyCount`.
  - candidate touchpoints:
    - `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`
    - `apps/frontend/src/lib/auth/AuthContext.tsx` (if central session bootstrap preferred)
- `task_completed`
  - emit on successful task completion mutations.
  - candidate touchpoints:
    - `apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx`
    - `apps/frontend/src/lib/api/client.ts` (`markOrchestrationActionCompleted` call paths)
- `booking_initiated`
  - emit immediately before booking submission + include source/category.
  - candidate touchpoint:
    - `apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx`
- `outcome_win_generated`
  - emit on win impression/render (deduped per session + insight id).
  - candidate touchpoints:
    - `apps/frontend/src/components/shared/WinCard.tsx`
    - onboarding reveal win render path

**Acceptance criteria**

- Events visible in telemetry with expected property payloads.
- No duplicate storming from rerenders.

**Verification**

- Unit tests for event dispatch and dedupe.
- Staging event dashboard screenshots for each event.

---

#### B2. Analytics quality guardrails (P1)

**Implementation**

- Add lightweight event QA checklist in CI/PR template.
- Add debug logging toggle for event payload validation in non-prod.

**Acceptance criteria**

- Every newly added event has payload schema and test coverage.

---

### Workstream C — Resolution-Flow Observability + Compliance

#### C1. Resolution-flow session replay readiness (P1)

**Goal:** Capture actionable UX dead-ends in Fix/Booking journeys.

**Current state anchor**

- Sentry replay integration exists but samples only on error (`replaysSessionSampleRate: 0`).
- File: `apps/frontend/sentry.client.config.ts`

**Implementation**

- Introduce low baseline replay sample for authenticated resolution surfaces (consent-gated).
- Tag key resolution steps with breadcrumbs/context.
- Ensure privacy constraints remain strict (masking + blocked media retained).

**Acceptance criteria**

- Replay available for a statistically useful slice of Fix/Booking sessions.
- No PII policy regression.

**Verification**

- Validate replay appears for opted-in sessions.
- Privacy review sign-off.

---

#### C2. Monetization disclosure/compliance hardening (P1)

**Goal:** Mitigate referral/brokerage compliance risk noted in audit.

**Implementation**

- Add disclosure language + attribution in relevant Save/Fix booking surfaces.
- Add consent/acknowledgment logging for referral flows.
- Create policy matrix by state for brokerage/lead-fee handling (legal + product).

**Acceptance criteria**

- User-facing disclosures present where referrals influence ranking/recommendations.
- Audit trail exists for disclosure acceptance.

**Verification**

- Legal review + screenshot checklist + API logging validation.

## 4) Sequencing and Milestones

### Milestone 1 (Week of April 20, 2026)

- [x] A4 health probe fix
- [x] A3 OCR limiter migration + rate-limit verification
- [x] B1 booking/session event wiring (first pass)

Milestone 1 evidence:
- Rate-limit integration tests: `apps/backend/tests/integration/rate-limiters.integration.test.js`
- Deep health unit tests: `apps/backend/tests/unit/deepHealth.test.js`
- Rate-limit contract doc: `docs/audit-gemini/milestone1-rate-limit-contract.md`

### Milestone 2 (Week of April 27, 2026)

- A2 timeout/circuit-breaker core implementation
- A1 fallback UI in Magic Scan and onboarding reveal
- B1 task_completed wiring

### Milestone 3 (Week of May 4, 2026)

- A5 schema parity closure
- B1 outcome_win_generated wiring + dedupe
- C1 replay instrumentation for resolution flow

### Milestone 4 (Week of May 11, 2026)

- C2 compliance/disclosure rollout
- Full regression + launch gate review
- Canonical contract status flip to launch-ready (only if all criteria pass)

## 5) Definition of Done (Gate Closure Checklist)

A gate is closed only when code, tests, and staging evidence are complete.

- AI fallback UI gate closed
- API timeout/circuit-breaker gate closed
- Rate-limit verification gate closed ✅ (Milestone 1)
- Health probe gate closed (DB + Redis true checks) ✅ (Milestone 1)
- Schema parity gate closed
- Resolution replay gate closed
- `booking_initiated` live ✅ (Milestone 1 first pass)
- `outcome_win_generated` live
- `task_completed` live
- `session_started` live ✅ (Milestone 1 first pass)

## 6) Risk Register

1. **Event duplication risk** (rerenders can inflate metrics).

Mitigation: client-side dedupe keys + QA assertions.

1. **Timeout too aggressive risk** (false negatives).

Mitigation: endpoint-specific timeout config and staged tuning.

1. **Replay/privacy risk** in production.

Mitigation: keep masking defaults; enable only with consent; privacy review before rollout.

1. **Schema drift recurrence** after future backend changes.

Mitigation: adopt shared generated contract and CI parity checks.

## 7) Reporting Cadence

- Daily: implementation standup updates by workstream owner.
- Twice weekly: gate burn-down against canonical checklist.
- Weekly: update canonical contract status table + brief launch-risk memo.
