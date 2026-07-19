# Product Framework Phase 4 — Trust, Cadence, Grounded Ask, and Recurring Care

Status: Implementation-complete through Increment 7; owner-applied database acceptance and pilot validation pending

Missing human review attestations are visible but non-blocking during the no-real-user internal beta. Set `ENFORCE_HUMAN_POLICY_APPROVALS=true` before real-user launch to restore hard tier-specific activation gates. Technical trust contracts and incident controls remain enforced in both modes; see [governance modes](../governance-modes.md).

Contract version: `phase4-v1`

Date started: July 18, 2026

## Objective

Make recurring engagement useful, explainable, and governable. Phase 4 builds on the canonical Home Action and recommendation governance contracts established in Phase 0 instead of introducing a parallel trust system.

## Increment 1 — Persisted trust tiers and recommendation review queue

Implemented:

- Added typed `LOW_CONSEQUENCE`, `MATERIAL_FINANCIAL`, `REGULATED_COVERAGE`, and `SAFETY_EMERGENCY` tiers to persisted recommendation definitions.
- Added a versioned governance policy identity to every reviewed definition.
- Classified the five implemented personalization definitions and attached schema-validated professional boundaries, conservative fallbacks, and emergency escalation language.
- Added role-specific Product, Domain, Trust, Legal/Compliance, and Commercial Integrity review attestations.
- Made review decisions idempotent per definition, role, and policy version while retaining each change in the append-only personalization audit ledger.
- Blocked catalog activation until the exact tier-required roles approve the current policy version.
- Blocked activation when persisted trust metadata disagrees with the code-owned reviewed catalog.
- Added an MFA-protected admin trust queue with readiness, required roles, approvals, rejections, beta advisory activation, and enforceable pre-launch activation gating.
- Added safety tier and governance boundaries to generated personalization responses and homeowner recommendation surfaces.
- Updated the idempotent pgAdmin bootstrap to synchronize definition trust metadata while leaving rules and content in `DRAFT`.
- Added focused Phase 4 contract coverage.

## Database policy

Phase 4 Increments 1–6 change the Prisma schema but do not include a migration script. There are no real users or data-migration requirements. The repository owner applies the updated schema and reruns the canonical personalization bootstrap as appropriate.

## Increment 2 — Guidance trust tiers and safe failure contracts

Implemented:

- Added an exhaustive, code-owned safety-tier classification for all 25 guidance templates plus the generic fallback template.
- Validated every guidance template against the canonical Phase 4 recommendation-governance schema.
- Persisted the exact reviewed governance snapshot, tier, policy version, professional boundary, conservative fallback, and emergency escalation on each hydrated journey step.
- Re-hydration synchronizes current template governance onto existing steps after the repository owner applies the schema.
- Replaced the canonical guidance Home Action adapter's hard-coded `LOW_CONSEQUENCE` classification with the persisted step boundary.
- Added the required assumptions, options, and tradeoffs to material guidance actions and an escalation path to safety/emergency actions.
- Added one shared `AVAILABLE`, `LOW_CONFIDENCE`, `DATA_UNAVAILABLE`, and `UPSTREAM_FAILURE` response contract.
- Withheld material actions whenever a response is degraded and supplied explicit safe copy, missing-fact context, retryability, and a safe next action.
- Applied the failure contract to guidance API responses, personalization APIs, module placements, homeowner surfaces, and the server-side recommendation-to-maintenance mutation.
- Added focused contract coverage and no migration script.

## Increment 3 — Recommendation incident operations and quality reporting

Implemented:

- Added a recommendation-specific incident record linked to the definition, generated recommendation, and originating feedback event without conflating it with property-damage incidents.
- Added typed complaint, reversal, override, calibration, incorrect-content, safety, commercial-integrity, upstream-failure, and operator-reported incident classes.
- Added an audited `OPEN → TRIAGED → INVESTIGATING/MITIGATED → RESOLVED → CLOSED` lifecycle with controlled reopen paths.
- Required a resolution code, summary, root cause, and corrective action before resolution.
- Automatically paused the affected definition for critical, safety-harm, or safety-tier incidents; resolution remains blocked until active high-risk definitions are mitigated.
- Converted explicit homeowner complaints, recommendation reversals, overrides, and profile corrections into idempotently linked incident intake.
- Added a homeowner “Report a problem” path and an MFA-protected operator queue for manual intake, triage, investigation, resolution, and closure.
- Extended the aggregate quality snapshot with complaint, override, reversal, correction, confidence-calibration, incident-volume, criticality, resolution-rate, and median-resolution-time signals.
- Kept online tuning disabled; quality signals support manual governance review only.
- Added focused lifecycle, integration, UI contract, and quality-report tests with no migration script.

## Increment 4 — Producer-wide trust enforcement

Implemented:

- Added the recommendation response contract to every canonical Home Action regardless of source.
- Centralized response-status derivation in the source adapter for Guidance, Maintenance, Incident, Recall, Coverage, Personalization, Project, and System producers.
- Withheld Start, Schedule, Compare, Provider, Purchase, and Finance CTAs whenever confidence or required facts are degraded.
- Preserved review, evidence, fact-correction, and conservative safety-escalation actions while withholding unsupported material changes.
- Kept commercial-disclosure, professional-boundary, jurisdiction, options, assumptions, tradeoff, and emergency-escalation validation in the same schema gate.

## Increment 5 — Canonical notification policy

Implemented:

- Added canonical persisted preferences for category, channel, cadence, quiet hours, timezone, property scope, and member scope.
- Routed every backend and worker notification producer through `NotificationService.create`; direct notification writes remain only inside that service.
- Reserved immediate routing for safety, active damage, material deadlines, and workflow changes while defaulting routine delivery to the weekly Home Brief.
- Added a weekly Home Brief digest worker and prevented the daily digest from consuming weekly-policy deliveries.
- Preserved mandatory transactional account email delivery without letting general preference muting break verification or password reset.
- Added one homeowner settings surface for email cadence and quiet hours.
- Added Useful, Not relevant, Already handled, and Mute type controls with idempotent outcome records and a 30-day quality endpoint.

## Increment 6 — Grounded Ask

Implemented:

- Explicitly labels each answer as property-grounded or general.
- Returns bounded Living Home Record evidence, known facts, assumptions, missing facts, confidence, a professional/safety boundary, and a safe next action alongside answer text.
- Added schema-validated Add Fact, Correct Fact, Create Task, Start Journey, Compare Options, Upload Evidence, and Add Note proposal types.
- Requires an authenticated confirmation endpoint before a proposal can create or persist a material artifact.
- Makes Create Task confirmation transactional and idempotent through a proposal-derived action key.
- Persists confirmed proposal artifacts and linked task identity while continuing not to persist raw chat by default.
- Added a homeowner “Propose a task” interaction that creates a pending proposal, asks for confirmation, and records either confirmation or rejection.

## Increment 7 — Pilot completion hardening

Implemented:

- Isolated every AI chat by user, client session, selected property, and Living Home Record context version; changing properties now starts a new visible conversation and stale property context cannot be reused.
- Added bounded chat-session expiry and capacity controls.
- Required exact Living Home Record fact citations for property-specific model statements and limited returned evidence/confidence to cited or question-relevant facts.
- Added validated execution handlers for every Grounded Ask proposal kind: canonical fact capture/correction, idempotent task creation, user-initiated guidance journeys, quote-comparison workspaces, verified uploaded-document evidence, and durable notes.
- Exposed all seven proposal kinds from the homeowner Ask surface through one confirmation interaction.
- Kept every material execution confirmation-gated and linked it to one durable Ask artifact.
- Restricted the pilot preference API and policy resolver to the actually supported In-App and Email delivery paths so Push, SMS, and WhatsApp cannot create misleading pending deliveries.
- Added category-specific Email cadence and quiet-hour controls while explaining that In-App continuity alerts remain enabled.
- Added a gated database-backed Phase 4 acceptance harness covering owner-applied schema presence, scoped preference resolution, digest routing state, notification outcomes, confirmed Ask actions, fact capture, comparison workspaces, and idempotent replay.

## Remaining Phase 4 execution

No planned Phase 4 code increment remains. Because there are no real users, completion is implementation-complete rather than outcome-validated. The repository owner must:

- apply the current Prisma schema to the target database without a repository migration script;
- run the gated database-backed acceptance harness against an isolated target database, then complete authenticated HTTP/browser acceptance for grounded answers and homeowner controls;
- collect pilot evidence for notification noise/usefulness, recommendation calibration, incident resolution, and Ask trust before changing thresholds or enabling automated tuning.

## Validation

```bash
npx prisma validate --schema apps/backend/prisma/schema.prisma
npm -C apps/backend run build
npx tsc --noEmit -p apps/frontend/tsconfig.json
node --test apps/backend/tests/unit/phase4TrustGovernance.test.js
node --test apps/backend/tests/unit/personalizationCatalogAdmin.test.js
node --test apps/backend/tests/unit/phase4GuidanceTrustContracts.test.js
node --test apps/backend/tests/unit/phase4RecommendationIncidents.test.js
node --test apps/backend/tests/unit/personalizationRecordRecommendationFeedback.test.js
node --test apps/backend/tests/unit/personalizationQuality.test.js
node --test apps/backend/tests/unit/phase4RemainingCompletion.test.js
PHASE4_ACCEPTANCE_DATABASE_URL='postgresql://...' node --test apps/backend/tests/integration/phase4TrustCadenceGroundedAsk.db.test.js
npx tsc --noEmit -p apps/workers/tsconfig.json
```
