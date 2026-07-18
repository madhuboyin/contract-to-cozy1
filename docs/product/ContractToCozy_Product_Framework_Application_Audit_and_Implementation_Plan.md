---
title: "ContractToCozy Product Framework — Application Audit and Implementation Plan"
version: "1.0"
date: "July 18, 2026"
status: "Implementation planning baseline"
framework: "ContractToCozy Product Framework v1.0 — July 2026"
code_snapshot: "aa1f4b7"
---

# ContractToCozy Product Framework — Application Audit and Implementation Plan

## Executive summary

ContractToCozy has already built many of the hard platform primitives required by the updated product framework. The application contains a longitudinal property model, evidence and provenance, document ingestion, action orchestration, guidance journeys, repair-versus-replace analysis, quote evaluation, provider and booking workflows, project execution, household collaboration, notifications, and outcome records.

The principal problem is not a lack of functionality. It is that those capabilities are distributed across a very broad application and exposed as separate tools, dashboards, modes, and segment-specific experiences. The current product behaves more like a collection of homeowner utilities than one coherent system that recognizes a homeowner's situation, recommends a next action, guides completion, and learns from the result.

> **Audit verdict** — The codebase is platform-capable but experience-misaligned. The fastest path to the product framework is to unify, connect, and govern existing capabilities before adding more surface area.

The repository currently contains:

- 210 frontend page routes, including 178 authenticated dashboard routes;
- 121 backend route files;
- 304 Prisma models;
- 26 registered guidance journey templates; and
- multiple parallel navigation, action, recommendation, checklist, and notification systems.

These counts are not defects by themselves. They are evidence that ContractToCozy has accumulated a large capability surface before establishing a single product operating model.

### Overall assessment

| Dimension | Maturity | Summary |
| --- | ---: | --- |
| Strategic positioning in the product | 2 / 5 | Current copy and IA still emphasize tools, AI, scores, savings, and new-home ownership rather than the framework promise. |
| Trigger-first onboarding and first value | 1.5 / 5 | Address lookup is strong, but there is no active-trigger qualification, entry-path routing, or credible trigger-specific first-value sequence. |
| Dashboard and navigation | 2 / 5 | A next-best-action concept exists, but nine primary jobs, four modes, mobile/desktop divergence, and many direct tool destinations compete with it. |
| Living Home Record | 4 / 5 | Property facts, evidence, documents, events, systems, work, household roles, and provenance form a strong foundation. They are not yet presented or governed as one user-facing record. |
| Stay Ahead | 3.5 / 5 | Maintenance, incidents, recalls, seasonal work, coverage, a daily snapshot, snooze, dismiss, and completion are implemented. Ranking, cadence, and feedback remain fragmented. |
| Decide With Confidence | 3.5 / 5 | Repair/replace, quote, price, coverage, cost-of-delay, and decision traces are substantive. They do not all implement one recommendation contract. |
| Major Repair / System Replacement | 3 / 5 | An eight-step journey connects diagnosis through booking. Post-service verification, record updates, future-care reset, and durable outcome measurement are missing. |
| Buying an Existing Home | 2 / 5 | Inspection, home-buyer checklists, and moving capabilities exist, but they are tenure-gated, partly user-scoped, and not one inspection-to-90-day-to-recurring-care journey. |
| Brand-new-home journey | 0.5 / 5 | Isolated builder-warranty and punch-list concepts exist, but there is no dedicated entry path or journey. |
| Recommendation trust and governance | 2.5 / 5 | Confidence, evidence, traces, context status, correction, and audit primitives exist. Safety tiers, commercial disclosures, uniform assumptions/options, and review gates are incomplete. |
| Notifications and cadence | 2.5 / 5 | Multi-channel delivery and several settings exist. Preferences are distributed, email policy is coarse, and there is no unified immediate-versus-digest attention policy. |
| Privacy, permission, and transfer | 3 / 5 | Household roles, consent, share links, deletion, and privacy-request operations exist. Property-history transfer and household-data separation are not a complete homeowner workflow. |
| Measurement | 2.5 / 5 | A typed event catalog and admin analytics exist. The framework north star and its importance, early, and successful-action components are not operationalized. |

Maturity scale: 0 = absent, 1 = isolated fragment, 2 = partial implementation, 3 = connected capability, 4 = strong implementation ready for focused validation, 5 = framework target proven with real outcome evidence.

### Highest-priority gaps

1. The product does not ask why the homeowner is here before asking for data.
2. There is no canonical attention-item and recommendation contract shared across signals, guidance, maintenance, personalization, incidents, and notifications.
3. Default navigation exposes product architecture and tools rather than the homeowner's current situation and next action.
4. The major-repair journey stops at booking instead of verifying the result and strengthening the Living Home Record.
5. The existing-owner, existing-home buyer, and brand-new-home paths are represented by a binary `HOME_BUYER` / `EXISTING_OWNER` segment that conflates tenure, property condition, and intent.
6. Trust controls are feature-specific rather than enforced by recommendation safety tier.
7. The product measures many interactions, but not the complete framework outcome: important actions identified early and completed successfully.
8. Commercial relationships and provider-ranking influences do not have a canonical disclosure contract.

### Recommended delivery strategy

Do not begin by building another major feature. Execute the framework as a sequence of integration releases:

1. Establish the canonical product contracts, baseline metrics, and route disposition.
2. Launch trigger-first onboarding and a unified first-value experience for existing owners.
3. Unify the dashboard, attention feed, recommendation presentation, and feedback ledger.
4. Close the existing major-repair journey through verified completion and recurring care.
5. Apply trust tiers, notification cadence, commercial integrity, and grounded Ask behavior.
6. Convert existing-home buyer capabilities into an acquisition journey.
7. Validate and then build the specialized brand-new-home path.
8. Extend to other major moments only after the first journey meets completion and trust thresholds.

For one dedicated cross-functional product squad, the committed core through the complete major-repair loop is approximately 18–24 weeks. Acquisition and specialized paths follow in another 8–12 weeks. Multiple squads can parallelize platform, experience, and trust work after the canonical contracts are settled.

---

## 1. Audit scope and method

### Scope

This audit compares the current repository against `docs/product/ContractToCozy_Product_Framework.md`, with particular attention to:

- customer strategy and entry paths;
- the three customer jobs;
- Living Home Record architecture;
- onboarding and cold start;
- dashboard and navigation;
- attention, recommendation, and action contracts;
- major-event orchestration;
- notifications and cadence;
- trust, safety, commercial integrity, privacy, and transfer;
- measurement and product operations; and
- implementation dependencies, cutover order, and acceptance criteria.

### Evidence reviewed

The audit inspected current frontend routes and components, backend services and routes, Prisma schema, analytics contracts, guidance templates, onboarding, dashboard composition, navigation, chat, notifications, household permissions, project completion, and relevant prior audits and functional documents.

Key evidence includes:

- `apps/frontend/src/lib/navigation/jobsNavigation.ts`
- `apps/frontend/src/lib/navigation/ctcModeRoutes.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/components/CommandCenterTemplate.tsx`
- `apps/frontend/src/app/onboarding/address/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/GuidanceOverviewClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/components/AIChatWindow.tsx`
- `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts`
- `apps/backend/src/services/notification.service.ts`
- `apps/backend/src/services/gemini.service.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/src/lib/analytics/events.ts`

### Limitations

This is a source and architecture audit, not a production-behavior certification. It does not claim:

- that every route was exercised against production data;
- that current telemetry represents real customer behavior;
- that recommendation accuracy has been domain-validated;
- that provider quality or commercial neutrality has been externally audited; or
- that the framework's market hypotheses have been proven.

Those are explicit validation workstreams in the implementation plan.

### Pre-user delivery assumption

As of this audit, ContractToCozy has no real users and no production user data that must be preserved. The implementation plan therefore assumes a clean pre-launch cutover:

- no user-data backfill;
- no legacy-data reconciliation;
- no dual-read or dual-write compatibility period;
- no preservation of synthetic development records;
- direct Prisma schema changes when a phase requires them; and
- no database migration scripts created as part of this plan or its implementation work. The repository owner will generate and apply database migrations separately.

Development and test databases may be reset and reseeded after schema changes. Compatibility work should be retained only where it protects code integration, saved internal test fixtures, or external contracts that are independently known to exist—not for hypothetical users.

---

## 2. Current-state architecture

### 2.1 Product surface

The application currently exposes two overlapping information architectures:

1. A primary navigation with Today, My Home, Protect, Save, Fix, Vault, Neighbours, Personalized Guidance, and Home Lab.
2. A mode switch with Overview, Protect, Save, and Fix.

Within these destinations, users can reach dozens of specialized engines directly. This structure reflects internal capability groupings and historic feature development. It does not match the framework's direction to use the three jobs as an operating model while organizing the actual experience around the homeowner's present situation.

The dashboard contains a next-best-action hero, health, savings, and risk metrics, a command-center wrapper, separate mobile experiences for home buyers and existing owners, room snapshots, and read-only personalized suggestions. These are useful ingredients, but they do not yet form the framework's five-part default dashboard:

1. What needs attention;
2. Decisions to make;
3. Active major moment;
4. Home at a glance; and
5. Ask ContractToCozy.

### 2.2 Domain and data foundation

The domain model is considerably stronger than the user experience suggests.

Strong reusable foundations include:

- `PropertyFactEvidence` for source, observation state, confidence, freshness, verification, and supersession;
- `PropertyContextCaptureReceipt` for just-in-time context capture and auditability;
- `Document` for property linkage, OCR, verification lifecycle, parser version, integrity metadata, and downstream relations;
- `HomeEvent` for a property timeline with source badge, confidence, money, documents, and guidance linkage;
- `GuidanceSignal`, `GuidanceJourney`, `GuidanceJourneyStep`, `GuidanceJourneyEvent`, and `GuidanceStepEvidence` for stateful decision workflows;
- `OrchestrationActionEvent`, `OrchestrationActionSnooze`, `OrchestrationActionCompletion`, and `OrchestrationDecisionTrace` for user action and explainability;
- `ReplaceRepairAnalysis`, `QuoteComparisonWorkspace`, and `PriceFinalization` for material decisions;
- projects, milestones, issues, payments, change orders, and completion checklists;
- household members, invitations, roles, activity, and per-member notification settings; and
- personalized recommendation instances, structured explanation records, explicit feedback, and suppression.

The missing layer is a canonical product contract that composes these models into one homeowner-facing action system.

### 2.3 Current major-repair flow

The `asset_lifecycle_resolution` guidance template is the best-aligned existing implementation. It contains:

1. Verify issue and service history;
2. Decide repair versus replace;
3. Check coverage and deductible exposure;
4. Validate fair market price;
5. Compare quotes;
6. Prepare negotiation strategy;
7. Finalize accepted terms and price; and
8. Book service execution.

The journey already carries template version, evidence, context requirements, readiness, step status, branching, and decision-stage metadata. Quote and price workspaces accept guidance journey context, and booking is guarded by journey prerequisites.

This should become the first major-event engine. It should not be replaced.

Its critical gap is the absence of a durable post-booking sequence:

- track work execution;
- capture changes, exceptions, and final cost;
- verify the repair or commissioning result;
- collect invoice, warranty, serial/model, before/after evidence, and provider outcome;
- update system condition and repair history;
- create the relevant `HomeEvent`;
- reset or generate maintenance;
- schedule follow-up or replacement planning; and
- close the journey into the recurring attention loop.

### 2.4 Segment architecture

`HomeownerSegment` currently has only `HOME_BUYER` and `EXISTING_OWNER`. This binary is used to select dashboards, maintenance behavior, checklist services, service categories, and Moving Concierge access.

That model conflicts with the updated framework because it combines three different concepts:

- homeowner tenure or transaction state;
- property condition and provenance; and
- the active reason for using the product.

A recent buyer of a 40-year-old home may have an inspection report and urgent repairs. An established owner may be planning a move. A brand-new-home buyer may need warranty and punch-list coordination rather than generic home-buyer tasks. These situations cannot be represented reliably by one binary field.

### 2.5 Intelligence and action systems

There are at least four partially overlapping recommendation/action concepts:

- orchestration actions and decision traces;
- guidance signals and journeys;
- personalized recommendation instances and feedback;
- maintenance, seasonal, incident, recall, and notification-specific action states.

Each has useful behavior, but their identity, ranking, lifecycle, display fields, and feedback semantics are not uniform. The result is duplicate or inconsistent actions, multiple urgency vocabularies, and feature-specific completion logic.

---

## 3. Framework alignment audit

### 3.1 Strategic foundation and market wedge

**Framework target:** Existing homeowners with an active trigger are the primary launch audience. Recent buyers of existing homes and buyers of brand-new homes are distinct acquisition paths with tailored value propositions.

**Current evidence:**

- The README still describes the product as a platform connecting new homeowners with providers.
- Address onboarding promises a “Digital Twin,” instant health score, potential savings, AI analysis, and zero manual entry.
- The product profile primarily distinguishes `HOME_BUYER` from `EXISTING_OWNER`.
- Several services and dashboards route behavior from that binary segment.

**Gap:** The updated wedge exists in strategy but is not encoded in acquisition, onboarding, segmentation, content, or the first product session.

**Required change:** Introduce entry path and active trigger as first-class product context. Update marketing and lifecycle copy to the product promise: understand what matters, decide what to do, and follow through, whether the home has been owned for ten days or ten years.

### 3.2 Customer jobs

#### Stay Ahead

**Implemented:** Maintenance, seasonal checklists, warranties, coverage deadlines, incidents, recalls, risk signals, a daily snapshot, action completion, snooze, dismiss, and notification delivery.

**Gaps:**

- No one canonical attention feed joins all sources.
- Urgency uses several vocabularies instead of Now, Soon, Plan, and Consider.
- Daily-check-in streaks encourage engagement frequency that the framework explicitly says not to optimize in isolation.
- Immediate versus weekly digest policy is inconsistent and distributed.
- “Not relevant,” “already done,” “remind me later,” and correction exist in some systems but not across all attention sources.
- Attention items do not uniformly expose expected outcome, evidence, confidence, and missing context.

#### Decide With Confidence

**Implemented:** Repair/replace, coverage checks, service price benchmarks, quote comparison, negotiation, price finalization, cost-of-delay tools, provider search, and decision traces.

**Gaps:**

- Recommendation output fields differ by tool.
- Options, tradeoffs, assumptions, “wait/do nothing,” confidence, and next action are not enforced as a shared contract.
- Household constraints and preference profiles are not consistently applied to every decision.
- Recommendation feedback and overrides are split between guidance, orchestration, personalization, and generic feedback.
- Material financial and regulated outputs do not share a safety-tier launch gate.

#### Navigate Major Moments

**Implemented:** Guidance journeys, claims, Moving Concierge, seller preparation, project tracking, incidents, documents, household collaboration, and booking.

**Gaps:**

- Capabilities are separate domains rather than instances of one reusable major-event contract.
- Stable event fields such as target outcome, participants, dependencies, exception states, documents, and completion are not consistently represented.
- The strongest journey, major repair/system replacement, ends too early.
- Multiple additional journeys exist before one journey has proven end-to-end outcome quality.

### 3.3 Living Home Record

**Framework target:** A permissioned, longitudinal property context that becomes more useful after every fact, document, decision, action, and outcome.

**Implemented:** The schema supports facts, evidence, observations, documents, rooms, inventory, systems, insurance, warranties, expenses, claims, inspections, projects, home events, timeline data, guidance evidence, provenance, and household access.

**Gaps:**

- The user-facing model is fragmented among My Home, Vault, inventory, rooms, reports, timeline, digital twin, and numerous tools.
- Canonical ownership of several overlapping facts and derived snapshots remains difficult to understand from product behavior.
- The UI does not consistently show what is known, inferred, missing, stale, or disputed in one place.
- Action completion does not uniformly update the record entities that caused the action.
- Correction flows are feature-specific.
- Transferable property history and non-transferable household data are not packaged into a homeowner-controlled transfer workflow.

**Assessment:** This is a presentation, governance, and write-back problem more than a core persistence problem.

### 3.4 Onboarding and cold start

**Framework target:** Start with the active concern, accept flexible context, demonstrate useful guidance early, and progressively enrich the record. An inspection report must not be required for existing-owner value.

**Current flow:** Address lookup → public-record reveal → confirmation/setup. The experience promises an instant score and savings, with manual fallback when lookup fails.

**Gaps:**

- No “What brought you here?” trigger step.
- No differentiation among repair, replacement, quote, maintenance backlog, insurance, project, renewal, planning, existing-home purchase, or new-home warranty/setup.
- No conversational or document-first path tied to the trigger.
- First value is score-centric rather than a trigger recommendation plus Home Health Baseline and prioritized plan.
- Public-record fallbacks risk presenting generalized insight with more confidence than the evidence supports.
- Onboarding state records steps and setup score, but not entry path, trigger, first-value output, or activation milestone.

### 3.5 Dashboard and navigation

**Framework target:** A situation-first dashboard, a light durable IA, and deep tools invoked contextually rather than exposed as the primary promise.

**Strengths:**

- A next-best-action hero exists.
- A command-center component can collapse secondary modules.
- Action, risk, savings, health, rooms, and personalized modules are available.
- Resolution Center and Action Center already aggregate some cross-domain work.

**Gaps:**

- Nine primary navigation jobs and four modes compete for the user's mental model.
- Protect, Save, Fix, Vault, Personalized Guidance, Neighbours, and Home Lab expose feature taxonomy.
- Mobile and desktop dashboards use different composition and segment branches.
- The dashboard does not have a stable major-moment slot.
- Ask is a floating generic assistant, not a first-class property-grounded action surface.
- A large number of duplicate global and property-scoped destinations increases routing complexity and weakens continuity.

### 3.6 Recommendation experience

**Framework contract:** Outcome, evidence, assumptions, options, tradeoffs, confidence, commercial disclosure, next action, and feedback.

| Contract element | Current status | Gap |
| --- | --- | --- |
| Outcome | Partial | Present in some cards, but not mandatory or consistently measurable. |
| Evidence | Strong foundation | Evidence models and trust strips exist; presentation varies by feature. |
| Assumptions | Partial | Strong in some calculators and analyses; absent from many action cards. |
| Options | Partial | Strong in repair/replace and quote tools; weak for many generated recommendations. |
| Tradeoffs | Partial | Feature-specific and not guaranteed. |
| Confidence | Partial-to-strong | Confidence models exist, but labels, calibration, and missing-context behavior vary. |
| Commercial disclosure | Weak | No canonical relationship, compensation, sponsorship, or ranking-influence contract. |
| Next action | Strong | Most implemented features have a CTA, but destinations can be disconnected tools. |
| Feedback | Partial-to-strong | Snooze, dismiss, completion, and personalization feedback exist in different systems. |

### 3.7 Notification and cadence model

**Implemented:** In-app notifications, email delivery, queues for push/SMS, incident-specific logic, daily pulse settings, seasonal timing, per-household-member categories, read/unread state, and action URLs.

**Gaps:**

- Notification preferences are split across homeowner JSON, household booleans, climate settings, and individual feature settings.
- General notification creation primarily honors a coarse `emailEnabled` preference.
- The importance allowlist focuses on booking and claim events rather than the framework attention priority model.
- In-app delivery cannot be disabled or tuned by category.
- No canonical digest bundling policy for low-priority attention items.
- Notification success is not tied to timely action completion and usefulness.

### 3.8 Ask ContractToCozy

**Implemented:** A chat UI and backend model integration can receive a bounded property-context envelope when a `propertyId` is provided. Missing facts are explicitly represented and AI resilience controls exist.

**Gaps:**

- The main chat UI does not pass `propertyId`, so the default assistant is often generic.
- Chat sessions are in memory and are not a durable part of the Living Home Record.
- Responses are unstructured text without cited record facts, confidence, corrections, or a canonical next action.
- Ask cannot reliably create or update an attention item, guidance journey, task, decision, or home event.
- No safety-tier routing governs high-consequence questions.

**Assessment:** The current assistant is precisely the “general-purpose AI assistant disconnected from verified home context” that the framework places on the not-now list unless it is constrained and integrated.

### 3.9 Trust and safety

**Strengths:** Evidence provenance, confidence scores, source badges, decision traces, missing-context states, verification, audit events, conservative incident flows, privacy consent, and AI timeouts/circuit breaking.

**Gaps:**

- No central recommendation safety tier is assigned to every recommendation definition or journey step.
- No tier-specific required controls or launch checklist are enforced in code or CI.
- Professional-advice boundaries and jurisdiction checks vary by feature.
- There is no shared complaint, reversal, calibration, or recommendation-incident review queue.
- Some onboarding and dashboard copy uses “verified,” “live signals,” or high confidence as static presentation rather than an obvious derivation from the displayed evidence.
- AI output does not consistently return evidence identifiers and uncertainty in a machine-checkable shape.

### 3.10 Commercial integrity and provider selection

**Implemented:** Provider profiles, credentials, eligibility, compliance, portfolios, availability, reviews, booking, service zones, and outcome ratings provide a strong marketplace foundation.

**Gaps:**

- No canonical commercial-relationship or compensation disclosure appears in the recommendation domain.
- Provider ranking does not expose a durable snapshot of criteria, weights, exclusions, sponsorship, and homeowner preference fit.
- Local updates permit sponsored content, but sponsorship policy is not part of the broader recommendation contract.
- Provider quality feedback is not consistently joined to the original recommendation and downstream home outcome.
- Non-commercial alternatives and user-directed search are not guaranteed alongside monetized options.

### 3.11 Privacy, permission, and transfer

**Implemented:** Owner/contributor household roles, invitations, activity logs, per-member notifications, optional-profile consent, analytics consent, share-link creation/revocation, account deletion, and admin privacy-request handling.

**Gaps:**

- Household roles do not fully express co-owner, occupant, professional, and temporary collaborator semantics.
- Selective provider sharing is document/report oriented rather than a reusable least-privilege workspace.
- Ownership transfer is referenced operationally but not implemented as a guided product journey.
- There is no homeowner-facing review of what property history transfers and what household data is withheld or deleted.
- Correction is possible in individual features but not organized as a Living Home Record control center.

### 3.12 Measurement and operating model

**Implemented:** The frontend has a typed analytics catalog covering acquisition, activation, trust, retention, workflow, recommendations, actions, savings, and incidents. The backend has persisted product analytics and an admin dashboard.

**Gaps:**

- The north star is represented by generic outcome events, not an operational composite.
- “Important,” “identified early,” and “completed successfully” have no shared definitions in the action domain.
- Intentional defer and deliberate dismiss are not consistently counted as understood successful resolutions.
- No standard event links signal → recommendation → action → decision → execution → verification → outcome.
- Trust metrics such as comprehension, calibration, reversals, overrides, complaint rate, and disclosure understanding are incomplete.
- Feature work is not gated by a repository template requiring job, outcome, evidence, trust tier, learning, and metric.

---

## 4. Gap register

Priority definitions:

- **P0:** Required to make the core product coherent or safe.
- **P1:** Required to prove the launch wedge and first major journey.
- **P2:** Required for scalable engagement and acquisition expansion.
- **P3:** Extend only after core outcome and trust gates are met.

| ID | Priority | Gap | Consequence | Reusable foundation | Required outcome |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | P0 | No entry-path and active-trigger model | Onboarding cannot deliver situation-specific first value | Address lookup, property onboarding, guidance start flow | Every activated user has a property, entry path, trigger, and first-value state |
| GAP-02 | P0 | No canonical Home Action / recommendation contract | Duplicate, inconsistent, and hard-to-measure actions | Orchestration ledger, guidance, personalization explanations | All default surfaces consume one stable contract |
| GAP-03 | P0 | Competing navigation systems | Users browse architecture instead of acting | Today, Command Center, Resolution Center, route resolver | Default IA is Home, Plan & Projects, Home Record, Ask, plus profile/settings |
| GAP-04 | P0 | Dashboard is not the five-zone attention view | Next-best action competes with metrics and modules | Command Center, action summaries, rooms, chat | One responsive dashboard serves all homeowner situations |
| GAP-05 | P0 | North star is not operational | Product cannot optimize for framework success | Analytics catalog, admin analytics, action events | Signal-to-success lineage and framework metric dashboard |
| GAP-06 | P1 | Existing-owner first value is score-centric | Primary wedge is not proven | Property context, guidance, baseline data | Trigger guidance + credible baseline + prioritized 12-month plan |
| GAP-07 | P1 | Major repair ends at booking | No verified outcome or learning loop | Eight-step journey, booking, projects, completion, HomeEvent | Repair journey closes into record and recurring care |
| GAP-08 | P1 | Trust tiers are not enforced | High-consequence advice can vary by feature | Evidence, confidence, traces, audit | Tiered policies, schemas, reviews, and safe fallbacks |
| GAP-09 | P1 | Commercial disclosure absent from core contract | Provider monetization can erode trust | Provider eligibility, compliance, reviews | Visible relationship, ranking, and alternative disclosure |
| GAP-10 | P1 | Ask is generic and text-only | AI activity does not create durable homeowner value | Property-context envelope, chat, guidance | Grounded answers cite facts and can create controlled actions |
| GAP-11 | P2 | Notification policy and preferences are fragmented | Alert fatigue and inconsistent delivery | Notification service, climate and household prefs | Unified category, urgency, channel, cadence, and quiet-hours policy |
| GAP-12 | P2 | Existing-home buyer capabilities are not one journey | Acquisition does not convert cleanly into recurring ownership | Inspection Hub, buyer checklist, Moving Concierge | Inspection-led 90-day plan and Living Home Record |
| GAP-13 | P2 | Living Home Record has no unified product surface | Strong data foundation feels like storage and tools | Facts, evidence, documents, timeline, inventory | Known/inferred/missing/stale/correctable property view |
| GAP-14 | P2 | Segment conflates tenure, condition, and intent | Incorrect dashboard and feature eligibility | Homeowner profile and property context | Orthogonal entry path, ownership state, property state, and trigger |
| GAP-15 | P2 | Provider outcome is weakly linked to original decision | Recommendation quality cannot learn from service results | Booking, reviews, completion, guidance | Outcome-linked provider quality and recommendation feedback |
| GAP-16 | P2 | Route/tool surface has no disposition governance | Continued feature sprawl | Route analytics and redirects | Keep, invoke-contextually, merge, hide, admin-only, or retire decision for every route |
| GAP-17 | P3 | No brand-new-home specialized journey | Weak value for low-history homes | Warranties, projects, inventory, maintenance | Punch-list, registration, builder follow-up, warranty, one-year inspection path |
| GAP-18 | P3 | No selective property-history transfer journey | Living Home Record loses continuity at ownership change | Household roles, share links, deletion | Reviewable transfer package with private household data excluded |

---

## 5. Target product architecture

### 5.1 Target experience shell

The default homeowner navigation should be reduced to:

| Destination | Purpose | What it replaces or absorbs |
| --- | --- | --- |
| Home | What needs attention, decisions, active journey, home snapshot, Ask | Today, most Protect/Save/Fix overview pages, personalized guidance landing |
| Plan & Projects | Active guidance journeys, major moments, projects, deferred plans | Resolution Center, project lists, buyer/moving plans, selected Fix flows |
| Home Record | Systems, history, documents, coverage, work, people, timeline | My Home, Vault, inventory, rooms, reports, digital twin as separate concepts |
| Ask | Property-grounded questions and controlled action creation | Generic floating assistant |
| Profile & Settings | Household, permissions, notifications, privacy, integrations | Distributed settings routes |

Specialized tools remain available through:

- an attention-item CTA;
- a decision or journey step;
- Home Record context;
- Ask with controlled tool invocation;
- command search for advanced users; or
- an explicitly labeled Expert Tools area outside the default path during migration.

The three customer jobs remain planning and measurement pillars, not top-level tabs.

### 5.2 Canonical Home Action contract

Create a shared application contract over existing domain sources. Do not migrate every source model before proving the read model.

```ts
type HomeAction = {
  id: string;                     // Stable canonical identity
  propertyId: string;
  source: {
    kind: 'GUIDANCE' | 'MAINTENANCE' | 'INCIDENT' | 'RECALL' |
          'COVERAGE' | 'PERSONALIZATION' | 'PROJECT' | 'SYSTEM';
    entityId: string;
    version?: string;
  };
  job: 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT';
  state: 'OPEN' | 'IN_PROGRESS' | 'SNOOZED' | 'COMPLETED' |
         'DEFERRED' | 'DISMISSED' | 'SUPERSEDED';
  priority: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
  signal: string;
  whyItMatters: string;
  recommendedAction: string;
  expectedOutcome: string;
  timing: { dueAt?: string; windowStart?: string; windowEnd?: string; rationale: string };
  evidence: EvidenceReference[];
  assumptions: Assumption[];
  options?: DecisionOption[];
  tradeoffs?: Tradeoff[];
  confidence: { score?: number; label: 'LOW' | 'MEDIUM' | 'HIGH'; missing: string[] };
  safetyTier: 'LOW' | 'MATERIAL_FINANCIAL' | 'REGULATED' | 'SAFETY_EMERGENCY';
  commercialDisclosure?: CommercialDisclosure;
  primaryCta: ActionLink;
  secondaryCtas: ActionLink[];
  feedbackControls: Array<'COMPLETE' | 'DEFER' | 'SNOOZE' | 'DISMISS' |
                          'ALREADY_DONE' | 'NOT_RELEVANT' | 'CORRECT_FACT'>;
  relatedJourneyId?: string;
  createdAt: string;
  lastEvaluatedAt: string;
};
```

Implementation direction:

1. Create adapters from existing orchestration, guidance, maintenance, incident, recall, project, and personalized-recommendation sources.
2. Use the existing orchestration event, snooze, completion, and decision-trace models as the initial shared action ledger where possible.
3. Add a stable signal-to-action lineage identifier and idempotency rule.
4. Return one ranked property action collection to dashboard, notifications, Ask, and plans.
5. Introduce persisted canonical action projections only if performance, consistency, or audit requirements justify them.

### 5.3 Entry and activation context

Replace binary segment-driven behavior with orthogonal fields.

Recommended concepts:

| Concept | Example values | Purpose |
| --- | --- | --- |
| Ownership state | Shopping, under contract, recent owner, established owner, preparing transfer | Lifecycle context, not product eligibility by itself |
| Property origin/condition | Existing home, new construction, unknown; age and condition facts | Select evidence and specialized setup logic |
| Entry path | Existing-owner trigger, existing-home purchase, new-home setup, major moment, exploration | Acquisition and first-value routing |
| Active trigger | Repair, replacement, quote, maintenance backlog, insurance, renewal, project, cost planning, other | Immediate intent and activation |
| Trigger entity | HVAC system, roof, policy, project, document, free-text concern | Scope guidance and context capture |

Add these fields to an activation/entry record associated with the property and user rather than overloading `HomeownerProfile.segment`. Because there are no real users, replace segment-based business rules directly once the new context policy is implemented; do not build a legacy segment compatibility layer.

### 5.4 Major-event contract

Use `GuidanceJourney` as the initial state engine and extend it with a reusable major-event projection:

- event type and target outcome;
- current stage and milestone;
- participants and responsibility;
- documents/evidence required and produced;
- dependencies and blocking reasons;
- decisions and selected options;
- exceptions and escalations;
- execution records;
- verification and completion criteria;
- record write-backs; and
- follow-up actions.

Do not create a second workflow engine. Add typed relationships and adapters between guidance, booking, project, document, HomeEvent, and inventory domains.

### 5.5 Living Home Record view

Build one read model with sections for:

- Home summary and identity;
- Systems and components;
- Work and service history;
- Documents and evidence;
- Coverage and warranties;
- Costs and projects;
- People and providers;
- Decisions and recommendations;
- Timeline; and
- Data quality: known, inferred, missing, stale, disputed, and verified.

Every displayed fact must offer source/freshness and an appropriate correction path. Derived scores and recommendations link back to the exact record facts they used.

---

## 6. Implementation plan

### Delivery assumptions

The estimates assume one stable cross-functional squad with product, design, two frontend engineers, two backend/platform engineers, data/analytics support, QA automation support, and part-time domain/trust review. “Sprint” means two weeks. Estimates are ranges for sequencing, not commitments.

The database is treated as pre-launch and disposable. When a phase requires persistence changes, update `apps/backend/prisma/schema.prisma`, generated client types, seeds, fixtures, and application code. Do not create Prisma or SQL migration scripts; the repository owner will perform the database migration separately.

### Phase 0 — Align contracts, evidence, and baseline

**Duration:** 2–3 sprints

**Objective:** Stop further divergence and establish the contracts on which all later releases depend.

**Implementation status:** Technical exit criteria completed July 18, 2026. Executable contracts, all declared source adapters, typed runtime lineage, event-backed north-star aggregation, golden fixtures, route-disposition enforcement, feature-brief requirements, and role-based recommendation launch gates are documented in `docs/product/phase0/`. The repository owner must still apply the schema migration, and accountable humans must record product, domain, trust, legal/compliance, and commercial approvals where the launch gate requires them.

#### Deliverables

1. Approve the `HomeAction` contract, lifecycle, stable identity, priority vocabulary, and source adapters.
2. Approve entry path, ownership state, property origin, active trigger, and trigger-entity taxonomy.
3. Define the north-star metric and signal-to-outcome event lineage.
4. Inventory all homeowner routes and classify each as keep, merge, contextual-only, redirect, admin-only, or retire.
5. Define recommendation safety-tier policy and tier-specific required fields.
6. Define commercial disclosure and provider-ranking explanation contracts.
7. Establish golden test homes for existing-owner repair, quote, existing-home buyer, new construction, low-context, conflicting-data, and emergency cases.
8. Update repository product language and new feature templates to match the framework.

#### Code areas

- `apps/backend/src/services/orchestration.service.ts`
- `apps/backend/src/services/guidanceEngine/`
- `apps/backend/src/modules/personalization/`
- `apps/backend/src/services/analytics/`
- `apps/frontend/src/lib/analytics/events.ts`
- `apps/frontend/src/lib/navigation/`
- `apps/backend/prisma/schema.prisma`
- `.github/` issue/PR templates and launch checks

#### Exit criteria

- Contract fixtures pass for every action source.
- Every current default-nav route has a disposition decision.
- Metric definitions specify numerator, denominator, eligibility, timing, and data owner.
- Safety-tier matrix is signed off by product, domain, trust, and legal/compliance owners where applicable.
- No new homeowner-facing feature can launch without job, outcome, action, evidence, tier, learning, and metric fields.

### Phase 1 — Trigger-first activation for existing owners

**Duration:** 3–4 sprints

**Objective:** Prove the updated launch wedge without requiring an inspection report.

#### Target flow

1. Ask “What brought you here?” before or immediately after address confirmation.
2. Capture one active trigger and optional scope through selection, conversation, photo, quote, invoice, email/PDF, or free text.
3. Confirm the minimum relevant facts; explicitly show unknowns.
4. Produce immediate trigger guidance using the canonical recommendation contract.
5. Generate a Home Health Baseline limited to supported evidence.
6. Generate a prioritized 12-month plan with Now, Soon, Plan, and Consider buckets.
7. Ask the user to complete, defer, dismiss, or begin one action.

#### Data changes

- Add an activation/entry model or extend `PropertyOnboarding` with:
  - `entryPath`;
  - `ownershipState`;
  - `propertyOrigin`;
  - `activeTriggerType`;
  - `activeTriggerText`;
  - `triggerEntityType` / `triggerEntityId`;
  - `firstValueType` / `firstValueAt`;
  - `firstActionResolvedAt`; and
  - source and consent metadata.
- Remove direct `HomeownerSegment` eligibility checks as the new context policy is adopted. Delete the enum and profile field once all application references are removed; no data backfill or compatibility mapping is required.

#### Experience changes

- Replace “Claim your Digital Twin” with an outcome-led entry promise.
- Preserve address lookup as a low-friction enrichment step.
- Add a manual and low-context path that never invents specificity.
- Route repair/replacement and quote triggers directly into the existing guidance system.
- Route maintenance, insurance, renewal, project, and planning triggers to the best existing action adapter.

#### Acceptance criteria

- Existing owner can reach useful trigger guidance with address plus trigger and without an inspection report.
- Missing public data does not block activation.
- Every first-value recommendation displays evidence, assumptions, confidence, next action, and correction.
- Trigger, first-value view, and first-action resolution are analytically linked.
- Pilot target: 60% complete minimum setup; 50% identify one useful/new recommendation; 30% resolve one action within 30 days.

### Phase 2 — Unified Home and action system

**Duration:** 3–4 sprints

**Objective:** Make the application feel like one calm operating system rather than a tool catalog.

#### Backend

1. Implement `GET /api/properties/:propertyId/home-actions` using adapters over existing sources.
2. Implement canonical complete, defer, snooze, dismiss, already-done, not-relevant, and correct-fact commands.
3. Add deduplication and suppression rules across source types.
4. Rank by consequence, urgency, confidence, household relevance, and actionability.
5. Add priority explanations and missing-context penalties.
6. Emit stable lineage events for shown, opened, acted, resolved, superseded, and verified.

#### Frontend

Build one responsive Home surface:

1. **What needs attention** — limited ranked actions with clear timing and feedback.
2. **Decisions to make** — active material decisions and their status.
3. **Active major moment** — current stage, blocker, and next milestone.
4. **Home at a glance** — systems, recent changes, coverage, and record completeness.
5. **Ask ContractToCozy** — property-grounded input with suggested questions and controlled actions.

Consolidate navigation to the target shell. Update all internal links, notification URLs, tests, and guidance route templates in the same cutover. Temporary development redirects are optional, but long-lived user-compatibility redirects are not required before launch.

#### Acceptance criteria

- Desktop and mobile consume the same Home data contract and use the same hierarchy.
- No more than five primary destinations are visible to a homeowner.
- A source action appears once in the default experience.
- All default actions support at least complete, defer/snooze, dismiss/not relevant, and correction where applicable.
- Specialized tools are reachable from context but are not default navigation peers.
- Route-contract tests confirm that every supported CTA and journey step reaches its intended destination after cutover.

### Phase 3 — Complete Major Repair / System Replacement

**Duration:** 4–5 sprints

**Objective:** Deliver the first complete recognize–decide–act–learn major moment.

#### Extend the existing journey

Retain the current first eight steps and add adaptive execution/closure stages:

9. **Confirm scope and provider** — selected quote, price, credentials, schedule, coverage, and commercial disclosure.
10. **Track work** — booking/project status, milestones, changes, delays, and issues.
11. **Verify outcome** — system works, commissioned/tested, safety checks, inspection if applicable, unresolved exceptions.
12. **Capture proof** — invoice, warranty, model/serial, permits, photos, provider rating, actual cost, and work date.
13. **Update the home** — condition, service history, install date, replacement cost, coverage, and HomeEvent.
14. **Set future care** — maintenance reset, next inspection, warranty deadlines, replacement horizon, and follow-up.

Steps 9–14 must adapt to repair versus replacement, DIY versus provider, covered versus self-paid, and project complexity. Minor work should not force a full project object; major work should create or link one automatically.

#### Relationship hardening

- Add explicit typed relationships or a journey-entity linkage table for quote workspace, price finalization, booking, project, document, inventory item, expense, warranty, and HomeEvent.
- Make completion idempotent and transactional where multiple record updates occur.
- Store journey/template/rule versions used for the material recommendation.
- Preserve before/after evidence and exceptions.

#### Provider and commercial integrity

- Display ranking criteria and homeowner-fit rationale.
- Verify credentials relevant to category and jurisdiction.
- Show sponsored, compensated, owned, or referral relationships before provider selection.
- Always offer non-commercial alternatives or user-supplied provider entry.
- Join provider review to scope, journey, timeliness, cost variance, and verified outcome.

#### Acceptance criteria

- One pilot can progress from trigger through verified closure without leaving the canonical journey context.
- Quote, decision, provider, booking/project, final cost, proof, and outcome are linked.
- Journey completion creates or updates HomeEvent, inventory/system history, relevant documents, and future care.
- Failed, disputed, delayed, incomplete, and unsafe outcomes have explicit exception states.
- The journey returns the user to an updated attention feed and plan.
- Outcome metrics include completion, blocked time, price variance, recommendation override, provider result, and follow-up health.

### Phase 4 — Trust, cadence, grounded Ask, and recurring care

**Duration:** 3–4 sprints

**Objective:** Make recurring engagement useful, explainable, and governable.

#### Trust tiers

- Add `safetyTier` to recommendation definitions, guidance templates/steps, and generated actions.
- Validate required contract fields by tier.
- Create safe low-confidence, unavailable-data, and upstream-failure responses.
- Add professional-review and emergency escalation paths.
- Establish a recommendation review queue and incident process.
- Measure calibration, reversals, complaints, overrides, and correction outcomes.

#### Notification policy

- Create one preference service with category, urgency, channel, cadence, quiet hours, digest, and per-property/per-member scope.
- Migrate homeowner JSON, household booleans, climate settings, and feature settings behind the canonical service.
- Reserve immediate alerts for safety, active damage, near-term material deadlines, and explicit workflow changes.
- Bundle Soon/Plan/Consider items into a weekly Home Brief.
- Add “mute this type,” “not relevant,” and “already handled” controls.
- Tie notification quality to timely resolution, usefulness, and noise—not send volume.

#### Grounded Ask

- Require property selection or explicitly label general answers.
- Retrieve exact Living Home Record evidence and return evidence references with the answer.
- Show known facts, assumptions, missing facts, confidence, safety boundary, and next action.
- Allow only schema-validated action proposals: add fact, correct fact, create task, start journey, compare options, or upload evidence.
- Require user confirmation before any material state change.
- Persist useful conversation artifacts as facts, decisions, actions, or notes—not raw chat by default.

#### Acceptance criteria

- All material recommendations pass tier-specific contract validation.
- No provider CTA can render without required commercial disclosure state.
- A user controls cadence and category from one settings surface.
- Low-priority notification volume falls without reducing high-priority timely completion.
- Ask answers for property questions cite record evidence and never silently infer missing private facts.
- Ask-created actions are auditable, reversible where appropriate, and linked to the originating conversation proposal.

### Phase 5 — Existing-home buyer acquisition journey

**Duration:** 3–4 sprints

**Objective:** Convert inspection and transaction context into a durable 90-day ownership plan.

#### Reuse and connect

- Inspection Hub and document extraction;
- transaction and warranty documents;
- home-buyer checklist and Moving Concierge content;
- guidance journeys for material findings;
- maintenance, seasonal, coverage, inventory, and Living Home Record;
- household setup and provider continuity.

#### Target journey

1. Confirm purchase/ownership stage and property.
2. Import inspection, disclosure, warranty, and relevant transaction documents.
3. Verify extracted high-impact findings and unknowns.
4. Separate negotiation/pre-close items from post-close ownership items.
5. Produce a prioritized 90-day plan.
6. Start material repair journeys where required.
7. Set utilities, safety, access, coverage, and household responsibilities.
8. Transition automatically into the recurring Home attention feed.

#### Required refactors

- Move buyer tasks from user-level assumptions to property and journey context.
- Remove blanket `HOME_BUYER` access gates; use ownership state and entry path.
- Reuse the canonical Home Action and major-event contracts.
- Ensure one user can manage different lifecycle states across multiple properties.

#### Acceptance criteria

- Inspection findings become verified facts, actions, decisions, or dismissed items with lineage.
- The 90-day plan has priorities, owners, timing, and completion state.
- Material findings can branch into the major-repair journey.
- On day 91, the home remains useful through the standard recurring loop without a dashboard switch.

### Phase 6 — Specialized new-home path and controlled expansion

**Duration:** 3–4 sprints after validation

**Objective:** Serve low-history brand-new homes with a proposition based on rights, setup, and early evidence rather than invented history.

#### Journey scope

- walkthrough and punch-list capture;
- builder responsibility and follow-up;
- warranty term extraction and deadline alerts;
- appliance/system model and serial registration;
- permit, inspection, and commissioning evidence where available;
- seasonal setup and homeowner maintenance responsibilities;
- 30-day, 90-day, and one-year inspection preparation; and
- transition into the standard Living Home Record and attention feed.

#### Gate before build

Validate demand, document availability, builder follow-up pain, willingness to engage, and channel economics. If the specialized path does not produce meaningful completed actions and recurring use, keep it selective rather than making it a primary acquisition promise.

#### Expansion gate

Do not launch additional major moments until the repair/replacement journey demonstrates:

- acceptable milestone completion;
- low unresolved-blocker time;
- trustworthy recommendation comprehension;
- verified outcome write-back;
- provider-quality visibility; and
- conversion into recurring care.

---

## 7. Epic backlog

| Epic | Priority | Scope | Key dependencies | Definition of done |
| --- | --- | --- | --- | --- |
| PF-001 Canonical Home Action contract | P0 | Schema, DTO, adapters, identity, lifecycle | None | All default action sources map to one validated contract |
| PF-002 Trigger and entry taxonomy | P0 | Entry path, ownership state, property origin, trigger | None | Taxonomy approved and versioned; clean schema and code cutover defined |
| PF-003 North-star lineage | P0 | Signal-to-outcome IDs and metric definitions | PF-001 | Admin query can trace eligible important actions to resolution |
| PF-004 Route disposition | P0 | Inventory, keep/merge/hide/redirect/retire decisions | None | 100% homeowner routes classified with owner and cutover action |
| PF-005 Product language alignment | P0 | README, landing, onboarding, navigation, empty states | PF-002 | Default copy matches framework language and avoids unsupported certainty |
| PF-006 Trigger-first onboarding | P1 | Trigger capture, flexible input, low-context fallback | PF-002 | Existing owner reaches guidance without inspection requirement |
| PF-007 Home Health Baseline | P1 | Evidence-bounded baseline with known/missing/stale | PF-006 | Baseline exposes evidence and no fabricated specificity |
| PF-008 Prioritized 12-month plan | P1 | Now/Soon/Plan/Consider projection | PF-001, PF-007 | Actions are ranked, resolvable, and linked to record context |
| PF-009 Unified Home API | P0 | Five-zone dashboard read model | PF-001 | One API powers responsive Home surface |
| PF-010 Navigation consolidation | P0 | Target shell and redirect telemetry | PF-004, PF-009 | No more than five homeowner primary destinations |
| PF-011 Canonical action feedback | P0 | Complete, defer, snooze, dismiss, irrelevant, correction | PF-001 | Every Home action supports appropriate feedback and ledger events |
| PF-012 Cross-source deduplication | P0 | Identity, suppression, merge policy | PF-001 | Same homeowner obligation renders once |
| PF-013 Major-repair execution | P1 | Booking/project execution stages | PF-001 | Journey tracks work after provider selection |
| PF-014 Verified outcome closure | P1 | Verification, proof, actual cost, exceptions | PF-013 | Journey cannot close without resolved completion criteria |
| PF-015 Home Record write-back | P1 | HomeEvent, inventory, docs, warranty, maintenance | PF-014 | Verified completion updates all relevant canonical records |
| PF-016 Provider ranking snapshot | P1 | Criteria, fit, credentials, exclusions | PF-001 | User can understand why each provider is shown |
| PF-017 Commercial disclosure | P1 | Relationship, compensation, sponsorship, alternatives | PF-016 | Disclosure appears before commercial action and is logged |
| PF-018 Safety-tier policy engine | P1 | Tier tagging, validators, fallbacks, escalation | PF-001 | Material output cannot publish without tier controls |
| PF-019 Recommendation quality ops | P1 | Review queue, calibration, complaint/reversal metrics | PF-018, PF-003 | Trust owner can audit quality and incidents by tier/version |
| PF-020 Unified notification preferences | P2 | Category, cadence, channels, quiet hours, digest | PF-001 | One settings service governs all homeowner notifications |
| PF-021 Weekly Home Brief | P2 | Bundle low-priority actions with feedback | PF-009, PF-020 | Brief reduces noise and each item resolves canonically |
| PF-022 Grounded Ask | P1 | Evidence retrieval, structured response, action proposals | PF-001, PF-018 | Property answers cite evidence and controlled actions require confirmation |
| PF-023 Living Home Record surface | P2 | Unified sections, status, source, correction | PF-015 | Facts and events are understandable and correctable in one place |
| PF-024 Existing-home buyer journey | P2 | Inspection-to-90-day-to-recurring flow | PF-006–PF-015 | Buyer path converts to the same Home and action system |
| PF-025 Segment decoupling | P2 | Replace tenure gates with context policy | PF-002, PF-024 | No core eligibility depends only on binary segment |
| PF-026 New-home validation | P2 | Concierge tests and channel research | PF-002 | Evidence supports build/no-build decision |
| PF-027 New-home specialized journey | P3 | Punch list, warranty, registration, one-year inspection | PF-026 | Journey produces meaningful actions and recurring-care conversion |
| PF-028 Property-history transfer | P3 | Review, redact, consent, accept, audit | PF-023 | Transfer package excludes private household context by policy |

---

## 8. Route and capability cutover strategy

### Retain and elevate

- Home/dashboard shell;
- guidance engine and guidance overview;
- Resolution/Action Center logic as the basis of Home Action adapters;
- repair/replace;
- coverage intelligence;
- service price radar;
- quote comparison;
- price finalization;
- provider, booking, project, and completion;
- documents, evidence, HomeEvent, and property context;
- household and permission capabilities;
- analytics and admin governance surfaces.

### Merge into the default product

- Today, Protect, Save, and Fix overviews → Home sections and ranked actions;
- Resolution Center and guidance lists → Plan & Projects with Home summaries;
- My Home, Vault, rooms, inventory, reports, digital twin, and timeline → Home Record sections;
- generic personalized suggestions → canonical Home Actions;
- chat launcher → first-class grounded Ask.

### Keep contextual, not primary

- calculators and simulators;
- specialized financial optimization tools;
- permit, tax, energy, refinance, cost, and neighborhood tools;
- detailed comparison workspaces;
- Home Lab capabilities.

These should open when a recommendation, journey, record, or explicit command makes them relevant.

### Validate before retaining prominent placement

- daily streaks and engagement mechanics;
- broad neighborhood/community surfaces;
- standalone scores without an action consequence;
- duplicate global/property routes;
- features that cannot identify an observable homeowner outcome or record learning.

### Cutover controls

- No real-user URL preservation period is required.
- Update inbound application links, notification URLs, tests, analytics route names, and journey templates before deleting a route.
- Use temporary redirects only where they simplify incremental development; remove unnecessary compatibility redirects before launch.
- Maintain a rollback flag for the new shell until internal acceptance testing is complete.
- Do not delete a route until repository references and generated/test fixtures have been updated.
- Update `routePath` values and add route-contract tests because guidance steps currently copy route paths at creation.

---

## 9. Schema evolution and database reset plan

### Database policy

There are no real users and no production user data to migrate. Schema work should optimize for the target model rather than preserve unused legacy structures.

- Make required model, field, enum, relation, index, and constraint changes directly in `apps/backend/prisma/schema.prisma`.
- Update application code, generated Prisma client types, seed data, factories, fixtures, and tests in the same implementation change.
- Do not create files under `apps/backend/prisma/migrations/` and do not create standalone SQL migration scripts.
- The repository owner is responsible for generating, reviewing, and applying database migrations.
- Reset and reseed development/test databases after the owner applies the schema migration.
- Do not implement backfill jobs, reconciliation reports, compatibility views, or dual-read/dual-write paths.

### Schema changes

1. Add versioned entry/trigger context, then remove the binary segment field and enum after code references are replaced.
2. Add safety tier and commercial disclosure references to recommendation-producing definitions.
3. Add stable action lineage and source references.
4. Add typed journey-entity relationships or a generic audited link table.
5. Add completion verification and follow-up state.
6. Add provider ranking snapshot and commercial relationship records.
7. Replace distributed notification-preference storage with canonical notification preference records.

These changes are phase deliverables, not prerequisites for maintaining this planning document. No immediate Prisma schema edit is necessary merely to record the revised implementation strategy.

### Clean cutover sequence

1. Edit the target Prisma schema without adding a migration script.
2. Update seeds, factories, fixtures, API contracts, services, and UI types.
3. Remove obsolete segment, preference, relationship, and action code paths rather than retaining compatibility branches.
4. Run Prisma validation and TypeScript checks against the updated schema.
5. Hand the schema diff to the repository owner for migration generation and application.
6. Reset/reseed non-production databases and run contract, domain, and end-to-end tests.

---

## 10. Measurement specification

### North-star composite

> **North star** — Percentage of eligible important home actions identified early and completed successfully.

Define each component explicitly:

#### Important

An action qualifies when at least one condition applies:

- safety or active-damage consequence;
- expected financial consequence above a calibrated threshold;
- material deadline, coverage lapse, warranty loss, or compliance consequence;
- homeowner-declared important trigger;
- dependency that blocks a major-event milestone; or
- reviewed domain rule assigns material importance.

#### Identified early

The action is surfaced before its action window closes, using a domain-specific lead-time policy. Examples include before a warranty deadline, before a maintenance due date, before avoidable escalation, or before a project dependency becomes blocking.

#### Completed successfully

One of the following occurs with understood and recorded state:

- verified completion with the target outcome met;
- intentional defer with a valid future trigger/date and accepted consequence;
- deliberate dismiss/not relevant with a reason and no unresolved safety requirement; or
- safe escalation to an appropriate professional or emergency path.

For material repair work, booking alone is not completion.

### Required metric families

| Family | Measures |
| --- | --- |
| Activation | Trigger capture, minimum useful context, time to first guidance, baseline viewed, first action resolved |
| Stay Ahead | Eligible actions surfaced early, before-due completion, weekly brief usefulness, dismissal/noise rate |
| Decide | Confidence before/after, option selected, recommendation accepted/overridden, reason, outcome recorded |
| Major Moment | Stage conversion, blocked time, milestone timeliness, exception rate, verified completion |
| Living Home Record | Verified fact growth, evidence coverage, freshness, correction, conflict, write-back success |
| Trust | Evidence viewed, explanation comprehension, calibration, reversal, complaint, escalation, disclosure understanding |
| Provider | Match-to-book, response, cost variance, completion, quality, dispute, repeat use |
| Business | Qualified activation cost, retention by trigger, paid conversion, revenue per verified outcome, trust impact |

### Event lineage

Every material flow should carry:

`entryId → triggerId → signalId → actionId → recommendationVersion → journeyId → decisionId → executionId → verificationId → outcomeId`

The lineage may contain null steps, but identities must remain stable and queryable.

### Metrics to remove from goal status

Track these operationally, but do not treat them as product success alone:

- daily streak length;
- notification volume;
- documents stored;
- AI messages;
- tool opens;
- provider leads; and
- raw route count.

---

## 11. Quality, testing, and launch gates

### Automated tests

#### Contract tests

- Every action adapter produces a valid `HomeAction`.
- Required recommendation fields vary correctly by safety tier.
- Commercial provider actions cannot omit disclosure state.
- Route resolution preserves journey context.
- Correction and feedback commands are idempotent.

#### Domain tests

- Ranking under conflicting urgency, confidence, and consequence.
- Cross-source deduplication.
- Low-confidence suppression and safe fallback.
- Major-repair branch logic for repair, replace, DIY, covered, provider, delay, failure, and dispute.
- Transactional record write-back and rollback.
- Transfer redaction and household-data exclusion.

#### End-to-end tests

1. Existing owner + free-text repair trigger + no inspection.
2. Existing owner + contractor quote upload.
3. Low-context address lookup failure + manual activation.
4. Full HVAC replacement from trigger to verified outcome and future maintenance.
5. Existing-home buyer inspection to 90-day plan.
6. Safety/emergency question through conservative escalation.
7. Sponsored/compensated provider option with disclosure and non-commercial alternative.
8. Household contributor permissions and selective sharing.

#### Golden recommendation set

Maintain reviewed fixtures for:

- high-confidence supported recommendation;
- missing critical fact;
- stale/conflicting evidence;
- do nothing/wait as a valid option;
- material financial decision;
- insurance/legal/tax boundary;
- active safety hazard;
- provider sponsorship/conflict; and
- incorrect homeowner profile with correction.

### Launch gates

| Gate | Required evidence |
| --- | --- |
| Outcome | Named homeowner outcome and measurable resolution |
| Data | Required facts, provenance, freshness, missing-data behavior |
| Trust | Tier, assumptions, options, confidence, correction, escalation |
| Commercial | Relationship, ranking influence, alternatives, disclosure |
| Privacy | Purpose, consent, access, sharing, retention, deletion/transfer |
| Reliability | Failure fallback, idempotency, observability, support runbook |
| Measurement | Lineage, funnel, outcome, override, complaint, and quality metrics |
| Operations | Named owner, domain reviewer, rollback, incident response |

---

## 12. Risks and mitigations

| Risk | Likely failure | Mitigation |
| --- | --- | --- |
| Integration complexity | Canonical layer becomes another parallel system | Start with adapters and one ledger; prohibit new standalone action states |
| Route migration | Broken saved links, notification links, and journey paths | Redirect registry, context-preservation tests, telemetry, staged rollout |
| Schema breadth | A broad clean cutover can break many application references | Sequence schema changes by phase, update all references atomically, reset/reseed test data, and validate before owner-managed migration |
| Recommendation inconsistency | Common UI masks different quality underneath | Tier validation, golden fixtures, evidence requirements, domain review |
| False confidence | Public or inferred data appears verified | Evidence-derived labels only; unknown and stale are first-class states |
| Alert fatigue | Unified feed increases volume | Ranking, caps, digest, suppression, relevance feedback, usefulness metric |
| Major-journey scope | Repair flow becomes too complex for small jobs | Adaptive steps; project object only above complexity threshold |
| Provider conflict | Monetization influences guidance | Independent decision stage, recorded ranking snapshot, clear disclosure, alternatives |
| AI overreach | Chat produces fluent but unsafe direction | Grounded retrieval, structured contract, tier routing, confirmation, escalation |
| Premature expansion | New-home and other journeys dilute core quality | Exit gates tied to repair completion, trust, and recurring-care conversion |
| Legacy segment behavior | Incorrect eligibility after new taxonomy | Compatibility mapping, policy service, remove direct segment checks incrementally |
| Measurement gaming | Teams optimize clicks or closures | Verified outcomes, reason quality, audit sampling, guardrail metrics |

---

## 13. Ownership and operating model

### Recommended workstream ownership

| Workstream | Accountable owner | Partners |
| --- | --- | --- |
| Home and activation experience | Product experience lead | Design, frontend, research, analytics |
| Home Action and Living Home Record | Platform product/engineering lead | Backend, data, frontend |
| Major Repair journey | Major-moments product lead | Guidance, provider, project, domain advisors |
| Recommendation quality and trust | Trust/recommendation owner | Domain, data, legal/compliance, support |
| Provider and commercial integrity | Marketplace owner | Trust, legal, analytics, operations |
| Notifications and lifecycle | Engagement owner | Platform, analytics, support |
| Measurement | Product analytics owner | All workstream owners |

### Required operating rituals

- Weekly action-quality review using real examples, overrides, missing context, and failures.
- Biweekly journey review focused on blocked time and completion, not screen delivery.
- Monthly trust review by tier, model/rule version, segment/trigger, and provider relationship.
- Route and feature council until the consolidation backlog is complete.
- Post-launch review at 2, 6, and 12 weeks for each material recommendation or journey.

---

## 14. First 90 days

### Days 1–30: Contracts and proof

- Approve canonical action, trigger, safety-tier, disclosure, and metric contracts.
- Instrument baseline north-star components without changing the UI.
- Complete route disposition.
- Build golden homes and recommendation fixtures.
- Prototype and test trigger-first onboarding with existing owners.
- Select two initial triggers: major repair/replacement and contractor quote are the strongest reuse candidates.

### Days 31–60: Existing-owner activation and unified Home alpha

- Ship entry/trigger persistence behind a flag.
- Deliver flexible trigger context capture and low-context fallback.
- Implement Home Action adapters for guidance, maintenance, incidents, recalls, and personalization.
- Launch unified Home alpha to internal/pilot users.
- Update and test all internal navigation, notification, and journey-template routes for the new shell.
- Deliver evidence-bounded Home Health Baseline and first 12-month plan.

### Days 61–90: Action resolution and repair closure beta

- Expand action feedback and deduplication.
- Add major-repair execution, verification, and record write-back stages.
- Implement provider ranking/disclosure beta.
- Launch tier validation for material financial recommendations.
- Start weekly Home Brief and cut over to the unified preference service.
- Measure activation, first action resolution, journey progression, explanation comprehension, and noise.

### Day-90 decision

Proceed to broader acquisition work only if pilot evidence shows:

- trigger-first setup improves or preserves activation;
- users understand and trust the first recommendation;
- at least one important action is resolved at the expected rate;
- the repair journey can reach verified closure;
- record write-back succeeds reliably; and
- navigation simplification does not create material dead ends.

---

## 15. Definition of framework alignment

The existing application should be considered materially aligned with the updated product framework when all of the following are true:

- The default acquisition and onboarding flow starts from homeowner situation and active trigger.
- Existing owners can reach first value without an inspection report.
- Existing-home buyers and brand-new-home buyers have distinct entry logic without fragmenting the core platform.
- The default Home experience starts with what needs attention and uses one canonical action system.
- The three jobs govern ownership and measurement without becoming rigid navigation silos.
- Specialized tools are invoked from context rather than presented as the primary product.
- Every material recommendation implements the shared contract and assigned trust tier.
- Major Repair or System Replacement reaches verified completion and updates the Living Home Record.
- Notifications follow a unified priority, cadence, preference, and feedback policy.
- Ask is grounded in verified property context and produces controlled, durable actions.
- Provider ranking and commercial relationships are understandable before a user acts.
- Property history, household privacy, selective sharing, and transfer boundaries are explicit.
- The north star can be calculated from stable signal-to-outcome lineage.
- Teams launch capabilities based on homeowner outcomes and platform learning, not surface count.

> **Implementation doctrine** — Connect before expanding. Prove one complete value loop, make every material recommendation earn trust, and ensure every completed action leaves the home record more useful than before.
