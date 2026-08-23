# ContractToCozy Intelligence Readiness Audit

**Date:** 2026-08-22
**Scope:** Codebase-wide, read-only audit. No code was modified in the production of this report.
**Method:** Ground-truth code reading (routes → controllers → services → Prisma), cross-referenced against `docs/wiki/` (a wiki generated from live-code reading on 2026-08-22, the same day as this audit — treated as a primary source, not a planning doc) and five targeted deep-dive research passes into Home Context/data model, AI architecture, Skill Platform, the attention-ranking engine, and testing/instrumentation. Historical planning docs under `docs/functional/` and `docs/product/*_FRD.md` were consulted for design intent but never treated as evidence of what's live without independent code verification.
**Legend:** 🟢 OBSERVED (read directly in code/schema) · 🟡 INFERRED (reasonable conclusion, not fully traced) · Every major claim below is OBSERVED unless flagged otherwise.

**Corrections (2026-08-23):** Three findings from the original pass understated real, working capability, each corrected in place (marked "Correction" at each site) after direct verification: (1) compound radar-event correlation is reconciled and persisted in production by `radarCompoundInsight.service.ts:118`, not an unused schema model — the real gap is promotion into the canonical Home feed, not the correlation logic itself (§8, §17 Wow Moment #2, §24 Task 3). (2) The live `HomeAction` contract (`homeAction.contract.ts:167-209`) already carries evidence, assumptions, confidence, governance, and decision options/trade-offs, and `UnifiedHomeSurface.tsx` already renders most of it — the real gap is narrower, limited to the options/trade-offs comparison specifically (§2, §8, §18 Blocker #1, §24 Task 3). (3) Home-action usefulness feedback genuinely drives a real 14-day suppression consumed by both Ask and proactive delivery, not a write sink — the real gap is that none of the three feedback paths aggregate into a measured quality signal (§15, §18 Blocker #4). Component scores for Attention Engine (42→47) and Evaluation & Observability (34→36) were revised accordingly.

---

## 1. Executive Summary

### Intelligence Readiness Score: **48 / 100**
*(revised from an initial 46/100 after the 2026-08-23 corrections above — the underlying conclusion is unchanged: reconnection and consolidation, not invention, is the shortest path forward.)*

This number needs immediate context, because it's easy to misread as "the product is half-built." It isn't. C2C has an enormous amount of **capability** (505 Prisma models, ~126 route files, 575 service files, ~65 worker jobs, dozens of deep, real feature verticals) and, unusually for a pre-launch product, it already has *working prototypes of nearly every piece the target architecture asks for*: a property-context aggregator, a financial-assumption envelope, a deterministic attention-ranking feed, an explicit-consent personalization engine with "why this home" explanations, a real Skill Registry wired into the AI concierge, and a capability-discovery registry. The score is low not because the pieces don't exist, but because **the pieces that make C2C feel like one intelligent system rather than fifty tools are disconnected, duplicated, or dead on the frontend** — most severely, the one component purpose-built to explain "why is this the most important thing right now" (`OrchestrationDecisionTrace`) is fully built on the backend and has **zero live frontend consumers**. The gap here is reconnection and consolidation, not invention.

| Capability | Score /100 | Why |
|---|---|---|
| Home Memory | 55 | Real provenance/confidence/versioning infrastructure exists (`PropertyFactEvidence`, `PropertyContextCaptureReceipt`) and is used in places, but adoption is partial — several high-traffic services (sale case, home-score, coverage analysis, home actions) still hand-roll their own property/asset queries instead of reusing it. Two duplicate systems remain unconsolidated (maintenance tasks, household membership). |
| Property Intelligence | 60 | Strong, genuinely diverse external-data integrations (NWS, FEMA, USGS, Open-Meteo, EPA, NOAA, FHFA, CPSC) with real degrade-gracefully patterns and provenance labeling in several places (Break-Even's FHFA-vs-heuristic flag is a standout). Weakened by an active legacy/current split (Neighborhood Change Radar → "Around Your Home") mid-migration, and by at least one integration (Property Appreciation's "live web search") that silently no-ops. |
| Attention Engine | 47 | A real, deterministic, two-layer scoring engine (`scoreHomeAction` in `homeActions.service.ts`, fed by `orchestration.service.ts`'s upstream aggregation) with genuine two-pass entity-level dedup (fuzzy text key, then durable work-item key) and a safety-aware lifecycle (hard-blocks deferring `SAFETY_EMERGENCY` items) — a real asset, not a toy. The delivered `HomeAction` object is also genuinely explainable: `homeAction.contract.ts` carries evidence, assumptions, confidence, governance, and decision options/trade-offs, and `UnifiedHomeSurface.tsx` renders most of it (why-it-matters, evidence, expected outcome, missing-context) on the live surface — this is more mature than a bare ranked list. Capped by: (a) it's one of **three parallel systems** answering "what does this property need," (b) the weight table (40/32/28/12, 30/22/12/4, 12/10/8...) is hand-tuned with no documented model behind it, (c) richer continuous urgency computed upstream is discretized into 4 buckets before the ranker sees it, and (d) the contract's `options`/`tradeoffs` fields — required by schema validation for material-financial and regulated-coverage actions — are computed and validated but never rendered anywhere in the live UI. |
| Decision Intelligence | 58 | Genuinely mature in the financial/coverage cluster — a shared, versioned assumption envelope (`AssumptionSet`) most financial tools resolve against is a real, working "decision infrastructure" pattern, not isolated calculators. Weaker outside that cluster: most "decision support" elsewhere is a single-purpose calculator without shared infrastructure, and only one tool (Break-Even) rigorously labels source vs. heuristic confidence. |
| Action Layer | 50 | Real completion/task-linkage exists (bookings, maintenance tasks, guidance-journey tool completions), but the live Home tab's "complete" action is a one-click command with no photo/evidence capture — the richer completion flow (`CompletionModal`, evidence photos) exists in code but is only reachable from dead pages. |
| Cozy (Ask) | 52 | Not a chatbot — it's a real execution/orchestration system with explicit confirmation gates, kill-switches, and (newly discovered) a genuine Skill Registry/Router already wired into its request path. Held back by being one of at least two competing AI-chat entry points (`/api/ask/*` live, `/api/gemini/chat` apparently dead), by no evaluation of LLM output quality anywhere, and by inconsistent model/structured-output discipline across the ~30 files that call Gemini. |
| Skill Platform Readiness | 62 | The highest score in this table, and a genuine surprise: a formal Skill abstraction (metadata, eligibility, required/optional context, adapters, risk policy, output contract) is **already implemented in beta** — 14 skill packages, a Skill Registry, and a Skill Router live in `apps/backend/src/services/skills/`, consumed by the Ask orchestrator. It is deliberately kept separate from the capability-discovery registry and the guidance-journey registry rather than unifying them, and has no production-launch gate yet. |
| Document Intelligence | 57 | A genuinely well-designed "upload once → extract → promote into Warranty/Expense/InsurancePolicy" path exists in Home Records — this is the clearest working instance of "document intelligence updates Home Memory" anywhere in the codebase. Undermined by at least one confirmed silo (the legacy Inspection Report Analyzer's output doesn't feed the current Inspection Hub's `InspectionFinding` model) and by inconsistent structured-output discipline in extraction prompts. |
| Frontend Intelligence UX | 30 | The lowest score. An internal UI audit already documents this candidly (5.7/10 maturity, "powerful but patchwork"). Independently confirmed here: a nav-consolidation effort left over a dozen redirect chains (some 3 hops deep) behind old URLs, three separate "add a home" entry points, and at least seven components that fetch data and then render nothing. |
| Evaluation & Observability | 36 | Instrumentation is more mature than typical pre-launch: a real activation score (`computeSetupStatus`), real timestamped time-to-first-value fields, event-driven cohort retention computed from genuine activity rows, a centralized 37-event analytics taxonomy with a curated 9-stage north-star lineage, and — genuinely good news — a **real, general-purpose, cohort-based feature-flag/rollout system** already exists. Feedback is more functional than a first pass suggested: home-action usefulness feedback genuinely drives a 14-day cross-surface suppression consumed by both Ask and proactive delivery — not a write sink. What still pulls the score down: (1) none of the three feedback paths (Ask up/down, home-action usefulness, personalization) **aggregate** into a measured "are our recommendations good" signal or feed back into calibrating the underlying logic — suppression is real but purely local/ephemeral; (2) 539 backend test files include two genuine golden-fixture suites (10 property archetypes, 17 savings-benefits scenarios) but **zero** evaluate LLM-generated content quality — the one AI-generation test checks JSON well-formedness, never correctness. |

### How this score was built
Each score reflects: (a) does real, working infrastructure exist for this capability, (b) is it consistently the *single* implementation rather than one of several competing ones, (c) is it actually reachable by a homeowner today, and (d) is there any way to know if it's working well. A capability can score in the 50s despite genuinely good code because reachability or duplication caps it — this is deliberate, since the audit's central question is about the *experienced* system, not the best individual file.

---

## 2. Most Important Conclusion

**How far is ContractToCozy from behaving like one intelligent homeowner system instead of a collection of features?**

Closer than a green-field build would suggest, further than the backend alone would suggest. Be candid: **C2C already contains a working version of almost every piece this audit was asked to look for** — a property-context aggregator with provenance and confidence (`getPropertyContext`), a deterministic multi-source attention-ranking feed (`homeActions.service.ts`), an explicit-consent personalization engine with real "why this home" explanations, a shared financial-assumption envelope that multiple decision tools resolve against, and — genuinely surprising given the audit's premise assumed this didn't exist yet — a fully-specified, partially-implemented **Skill Registry** already wired into the AI concierge's request path. This is not a company that needs to invent Home Memory, Attention, Decision, or Skill concepts from scratch. It's a company whose engineering has been building the right primitives, largely without designing them as one coherent system, and largely without keeping the frontend in sync with what the backend now does.

The clearest evidence for "not yet one system": `OrchestrationDecisionTrace` and its supporting `orchestration.service.ts` — a structured, per-source decision-trace mechanism — is backend-complete, well-built, and **has zero live frontend consumers**; every one of its 7 frontend call sites is dead code or a discarded computation (see [§18, Blocker #1](#18-top-10-intelligence-blockers)). **Correction to an earlier draft of this section:** this does not mean the live Home tab has no explainability at all. The live `HomeAction` contract itself (`homeAction.contract.ts`) already carries evidence, assumptions, confidence, governance, and decision options/trade-offs, and `UnifiedHomeSurface.tsx` genuinely renders most of it — why-it-matters, evidence, expected outcome, missing-context — on the surface every homeowner actually uses. What's missing from the live surface specifically is the alternatives/trade-off comparison the contract already computes and schema-validates (required for material-financial and regulated-coverage actions), plus whatever additional per-source narrative the dead orchestration trace would add on top. Meanwhile, two *other* independent implementations of "what does this property need" — the canonical Home tab feed and the separate Fix-hub resolution center — are both live, both real, and share no code with each other. A homeowner using C2C today gets ranked answers from two different, non-communicating backends depending which tab they're on.

The second-clearest signal is navigational: a recent "Vault / Save / Protect" consolidation retired roughly a dozen top-level URLs into redirect chains, several three hops deep, landing homeowners on pages whose relationship to the URL they clicked is no longer obvious. This is not a documentation problem — every `page.tsx` still exists on disk, unreachable at its own address, which means the *codebase* itself has drifted further from "one coherent system" than its authors likely realize.

**Bottom line:** the shortest path to a genuinely intelligent, coherent Home Intelligence platform is not building new intelligence — it's (1) picking one ranking/explainability authority and deleting or merging the other, (2) reconnecting the dead-but-well-built trust UI to the live surface, (3) finishing the two known duplicate-system consolidations (maintenance tasks, household membership), and (4) closing the loop from "AI generates text" to "someone checks whether the text was any good," which does not exist anywhere yet. All four are evolution, not rewrite — see §21–23.

---

## 3. Current Architecture

*(Verified against `docs/wiki/02-architecture-and-data-model.md`, itself independently re-derived from the live repo on 2026-08-22 — counts below are ground-truth, not from `apps/CLAUDE.md`, which understates the codebase by roughly 4x on several dimensions.)*

```
contract-to-cozy/
├── apps/
│   ├── backend/        Express REST API, port 8080
│   │   ├── src/routes/          ~126 files — Routes → Controllers → Services → Prisma
│   │   ├── src/controllers/     105 files
│   │   ├── src/services/        256 top-level files, 575 counting subdirectories
│   │   ├── src/modules/gazette/ self-contained module pattern (the reference example for new complex features)
│   │   ├── src/services/skills/ 81 files — the Skill Registry/Router (§12)
│   │   ├── src/modules/propertyContext/  the Home-Context aggregator (§6)
│   │   ├── src/productFramework/capabilities/  the tool-discovery capability registry (§4, §12)
│   │   └── prisma/schema.prisma  505 models, ~23,000 lines — one schema shared with workers
│   ├── frontend/       Next.js ^16.2.6 App Router, port 3000
│   ├── workers/        BullMQ job processors + node-cron + long-running pollers, ~65 job files
│   └── ios/            native iOS client (not audited)
├── infrastructure/     Docker, Kubernetes (k3s, Raspberry Pi ARM64 overlay), Terraform, Ansible
└── docs/               ~250 files: functional/product FRDs (historical, frequently stale vs. shipped code),
                         property-context/ (the Home Context design docs, §6),
                         wiki/ (ground-truth reference, re-derived 2026-08-22)
```

**Backend pattern:** Routes → Controllers → Services → Prisma ORM, one Express app (`src/index.ts`) mounting ~150 routers, most at the bare `/api` prefix defining their own sub-paths rather than one-prefix-per-feature. On boot, the app validates several in-code registries (Ask operation/audience/domain-command registries, Skill definitions/adapters/handoffs/lineage/dependencies, Decision Platform contracts) and **fails fast** if any are inconsistent — a real internal-correctness gate, not just a health check.

**Two structural conventions worth naming**, because they're the shape any new Home Intelligence work should follow rather than inventing a third:
- **Colocated feature directories** (`src/community/`, `src/sellerPrep/`, `src/propertyIntelligence/`, `src/homeBriefing/`, `src/productFramework/`, `src/refinanceRadar/`, etc.) — controller+service+routes+types under one directory instead of split across the flat `routes/`/`controllers/`/`services/` trees.
- **The module pattern** (`src/modules/gazette/`, `src/modules/propertyContext/`, `src/modules/personalization/`) — a fuller version with `controllers/`, `services/`, `routes/`, `validators/`, `mappers/`, `dto/` layers. This is the pattern the Skill Platform and the Home Context aggregator both use — it is the de facto "how we build a new subsystem" convention already, even though it was never declared as one.

**Frontend:** Next.js App Router, one large typed `APIClient` class (`src/lib/api/client.ts`, ~120+ methods), cookie-based auth, a 5-tab job-oriented primary nav (`jobsNavigation.ts`: Home / Plan & Projects / Home Record / Ask / Profile & Settings) sitting atop roughly 50 legacy route directories — many of which are now redirect shims rather than real destinations (see §14, §18).

**Workers:** `apps/workers/src/worker.ts` registers ~60 BullMQ processors + node-cron schedules. Backend → worker handoff goes through a `QueuePort` abstraction, gated by a `JOB_REGISTRY` + `evaluateWorkerExecution()` rollout/kill-switch policy check before enqueue — every job carries a `customerJob` tag (`STAY_AHEAD`/`DECIDE`/`MAJOR_MOMENT`), the same three-jobs vocabulary used by the capability registry and the Skill Registry (a genuinely consistent taxonomy across three independently-built registries — see §12).

**Deployment:** Raspberry Pi ARM64 k3s cluster (confirmed via a dedicated Kustomize overlay and a backend Dockerfile that pins a Debian/glibc base specifically because Alpine's musl libc previously truncated the Prisma client on ARM64).

---

## 4. Capability Inventory

The product has, conservatively, **70+ distinct user-facing capabilities**. This table groups them by the wiki's cluster structure; status classifications reflect this audit's own read of reachability (Production-ready / Mostly implemented / Partially implemented / Prototype / Stub / Dead-unused / Unknown), not the wiki's narrative status alone.

| Cluster | Capability | Status | Frontend entry | Backend entry | Contributes to Home Context? | Job |
|---|---|---|---|---|---|---|
| **Onboarding** | Registration/Login/MFA | Production-ready | `app/(auth)/*` | `auth.routes.ts` | No | — |
| | Trigger-first onboarding wizard | Production-ready | `app/onboarding/*` | `propertyOnboarding.routes.ts` | Yes (writes entry-context) | 1,3 |
| | Property Setup Checklist (2nd wizard) | Production-ready but 1-of-3 entry points | `properties/[id]/onboarding` | `propertyOnboarding.service.ts` | Yes | 1 |
| | Manual property-creation form (3rd entry point) | Production-ready but redundant | `dashboard/properties/new` | `property.controller.ts` | Yes | 1 |
| | Household invites/roles | Production-ready (with a broken `returnUrl` UX gap) | `properties/[id]/household` | `household.routes.ts` | No | — |
| **Home Health** | Inventory/rooms/AI room scan | Production-ready | `properties/[id]/inventory` | `inventory.routes.ts` | **Yes — core** | 1 |
| | Maintenance tasks (live system) | Production-ready | `properties/[id]/maintenance` | `propertyMaintenanceTask.routes.ts` | Yes | 1 |
| | Maintenance tasks (legacy, deprecated) | Dead-but-present, sends deprecation headers | none (empty route dir) | `checklist.routes.ts` | No | — |
| | Seasonal checklists | Production-ready | redirect → maintenance | `seasonalChecklist.routes.ts` | Yes | 1 |
| | Appliance Oracle / Visual Inspector | Mostly implemented (Oracle's `/summary` is a stub) | `dashboard/oracle`, `/visual-inspector` | `applianceOracle.routes.ts` | Yes | 2 |
| | Room Insights (deterministic) | Production-ready | `properties/[id]/rooms` | `roomInsights.routes.ts` | Yes | 1 |
| | Inspection Hub (current) | Production-ready | `properties/[id]/inspection-hub` | `inspectionHub.routes.ts` | Yes | 2,3 |
| | Legacy Inspection Report Analyzer | **Partially implemented / siloed** — not reconciled with Inspection Hub's data | `dashboard/inspection-report` | `inspectionReport.routes.ts` | Partial (writes elsewhere) | 2 |
| | Status Board / Daily Pulse / Habit Coach | Production-ready | `properties/[id]/status-board`, `dashboard/daily-snapshot` | `homeStatusBoard.routes.ts` etc. | Reads, doesn't originate | 1 |
| | Home Health Nudge (asset/insurance/equity) | Production-ready, only reachable via widget | `HomeHealthNudge` widget | `inventoryVerification.routes.ts` | Yes | 1 |
| | Documents (Magic Scan) | Production-ready but URL is unreachable | (URL redirects elsewhere) | `document.routes.ts` | Yes | 1 |
| | Home Records | Production-ready — the clearest "extraction → Home Memory" path | `properties/[id]/tools/home-records` | `homeRecords.routes.ts` | **Yes — canonical** | 1 |
| | Seller's Vault | Production-ready, owner-side entry point currently unclear | `vault/:propertyId` (buyer-facing) | `vault.routes.ts` | No | 3 |
| | Energy Auditor | Production-ready (gated on completeness) | `dashboard/energy` | `energyAuditor.routes.ts` | Reads context | 2 |
| | Material Specs | Production-ready | `properties/[id]/materials` | `materialSpec.routes.ts` | Yes | 1,2 |
| | Plant Advisor | Production-ready, intentionally non-AI | `properties/[id]/tools/plant-advisor` | `roomPlantAdvisor.routes.ts` | Minor | — |
| **Guidance/Ask/Personalization** | Ask AI Concierge | Production-ready | `dashboard/ask` | `ask.routes.ts` | Consumes | 2 |
| | `/api/gemini/chat` (parallel chat endpoint) | **Dead code (unconfirmed live)** — no frontend caller found | none found | `gemini.routes.ts` | — | — |
| | Guidance Engine (28 issue templates) | Production-ready | `properties/[id]/tools/guidance-overview` | `guidance.routes.ts` | Reads/writes signals | 2 |
| | Orchestration summary + Decision Trace | **Backend-complete, frontend-dead** — flagship blocker | none live | `orchestration.routes.ts` | Yes (unused) | 1 |
| | Home Actions (canonical ranked feed) | Production-ready | `UnifiedHomeSurface` (Home tab) | `homeActions.service.ts` | **Yes — the live ranking authority** | 1 |
| | Resolution Center / Fix hub | Production-ready, independent of Home Actions | `properties/[id]/fix` | `resolutionCenter.service.ts` | Yes (separately) | 1,2 |
| | Personalization Engine | Mostly implemented, one of the most mature pieces | `dashboard/personalization` | `personalization.routes.ts` | **Yes — genuine explainability** | 1,2 |
| | Tool Discovery / Capability Suggestions | Production-ready | `dashboard/home-tools` | `toolDiscovery.routes.ts` | No | — |
| | Skill Registry / Router | **Beta, wired into Ask** | (not directly user-facing) | `services/skills/*` | Consumes | 2 |
| | Knowledge Hub | Production-ready, editorial workflow incomplete (author/review/publish not separated) | `/knowledge` | `knowledgeHub.routes.ts` | No | — |
| | Property Brief / Home Briefing | Production-ready, clean deprecation of Home Score | `properties/[id]/property-brief` | `propertyBrief.routes.ts` | Reads | 3 |
| | Do-Nothing Simulator / Capital Timeline | Production-ready | `properties/[id]/tools/do-nothing` | `doNothingSimulator.routes.ts` | Reads | 2 |
| | Narrative Reveal | **Prototype / not fully traced** | property page overlay | `narrative.routes.ts` | Unknown | — |
| **Coverage & Money** | Insurance Policies (manual) | Production-ready, URL unreachable at old path | (redirect chain) | `home-management.routes.ts` | Yes | 1,2 |
| | Coverage Intelligence + Insurance Handoff | Production-ready, URL unreachable at old path | `tools/coverage-intelligence` (indirect) | `coverageAnalysis.routes.ts` | Yes | 2 |
| | Risk Premium Optimizer | Production-ready, deterministic despite "AI" naming | embedded | `riskPremiumOptimizer.routes.ts` | Reads | 2 |
| | Home Risk Assessment | Production-ready | `properties/[id]/risk-assessment` | `risk.routes.ts` | Yes | 1 |
| | Hidden Savings & Benefits | Production-ready, real rule engine | `tools/savings-benefits` | `hiddenAssets.routes.ts` | Yes | 1,2 |
| | Ownership Cost Intelligence | Production-ready, versioned/reproducible | `tools/ownership-costs` | `ownershipCosts.routes.ts` | Yes | 2 |
| | Break-Even Calculator | Production-ready, best source-labeling in the cluster | `tools/break-even` | `breakEven.routes.ts` | Reads | 2 |
| | Budget Forecaster | Production-ready, URL unreachable at old path | (redirect chain) | `budgetForecaster.routes.ts` | Reads | 1 |
| | Financing & Home Equity | Production-ready | `dashboard/financing` | `financing.routes.ts` | Yes | 2,3 |
| | Home Reserve Fund | Production-ready (Phase 1 — no persisted dismiss state) | `tools/reserve-fund` | `homeReserveFund.routes.ts` | Yes | 2 |
| | Property Appreciation Tracker | Production-ready, one silently-broken sub-feature (see §17) | (redirect chain) | `propertyAppreciation.routes.ts` | Reads | 2 |
| | Property Tax Center & Appeal | Production-ready, fail-closed for unreviewed jurisdictions | `tools/property-tax` | `propertyTax.routes.ts` | Yes | 1,2 |
| | `taxAppeal.routes.ts` (legacy parallel router) | **Orphaned / dead** | none | `taxAppeal.routes.ts` | — | — |
| | Negotiation Shield | Production-ready, deterministic | `tools/negotiation-shield` | `negotiationShield.routes.ts` | Reads | 2 |
| | Service Quote Comparison | Production-ready | `tools/quote-comparison` | `quoteComparison.routes.ts` | Reads | 2 |
| | Claims Assistance | Production-ready **but absent from capability registry** | `properties/[id]/claims` | `claims.routes.ts` | Reads | 2,3 |
| **Execution** | Provider registration/credentials | Production-ready | `providers/*` | `provider.routes.ts` | No | — |
| | Booking Lifecycle | Production-ready | `dashboard/providers`, `bookings` | `booking.routes.ts` | Writes | 2 |
| | Service Price Radar / Quote Comparison (lightweight) | Production-ready, overlaps with the heavier tool above | `dashboard/quote-comparison` | `servicePriceRadar.routes.ts` | Reads | 2 |
| | DIY Project Tracker | Production-ready | `dashboard/diy` | `diy.routes.ts` | Writes | 2 |
| | Permit Tracker | Production-ready | `dashboard/permits` | `permitTracker.routes.ts` | Yes | 1,3 |
| | Renovation Case pipeline | Production-ready | `properties/[id]/renovations` | `renovationCase.routes.ts` | Yes | 2,3 |
| | Home Renovation Risk Advisor (legacy) | **Dead code** — frontend page unreferenced | none | `homeRenovationAdvisor/*` | — | — |
| | Project Execution Tracker | Production-ready, not fully traced | (not enumerated) | `projectTracker.routes.ts` | Writes | 3 |
| **Situational Awareness** | Home Event Radar (hazard feed) | Production-ready, real multi-source ingestion | `dashboard/home-event-radar` | `homeEventRadar.routes.ts` | Yes | 1 |
| | Product Recalls | Production-ready, real CPSC integration | inline on inventory | `recalls.routes.ts` | Yes | 1 |
| | Severe Weather Alerts | Production-ready, real live NWS integration | (within Radar) | `severeWeatherAlert.service.ts` | Yes | 1 |
| | Environment Report | Production-ready, best-in-class multi-source labeling | `properties/[id]/environment-report` | `environmentReport.routes.ts` | Yes | 1,2 |
| | HOA Compliance | Production-ready, pure record-keeping (no identify/prioritize step) | `dashboard/hoa` | `hoaCompliance.routes.ts` | Yes | 3 |
| | Neighborhood Trust (in-platform social proof) | Production-ready | `dashboard/neighbourhood-trust` | `neighbourhoodTrust.routes.ts` | No | — |
| | Neighborhood Intelligence (legacy) | **Being retired** — write paths return 410 | unclear/fixture-gated | `neighborhoodIntelligence.routes.ts` | Partial | 1 |
| | "Around Your Home" (current successor) | Mostly implemented | not confirmed as standalone page | `propertyIntelligence.routes.ts` | Yes | 1 |
| | Local Updates carousel | **Prototype — no ingestion path found** | dashboard widget | `localUpdates.routes.ts` | No | 1 |
| | Community Events/Trash/Alerts | Production-ready, city-coverage-limited | `dashboard/community-events` | `community.routes.ts` | No | 1 |
| | Emergency Troubleshooting | Production-ready, URL redirects to Fix hub | (redirect chain) | `emergency.routes.ts` | Reads context | 1 |
| **Life Transitions** | Sale Readiness / Sale Case | Production-ready, genuinely computed from real records | `tools/sale-case` | `propertySaleCase.routes.ts` | Yes | 3 |
| | Seller Prep (comps/agents/leads) | Production-ready, weak nav discoverability | `properties/[id]/seller-prep` | `sellerPrep.routes.ts` | Reads | 3 |
| | Sell-Hold-Rent | Production-ready | `tools/sell-hold-rent` | `sellHoldRent.routes.ts` | Reads | 2,3 |
| | Home Buyer Task Tracking / Closing Plan | Production-ready, large surface, absent from capability registry | `properties/[id]/buyer-plan` | `homeBuyerTask.routes.ts` | Yes | 3 |
| | Mortgage Refinance Radar | Production-ready | `tools/mortgage-refinance-radar` | `refinanceRadar.routes.ts` | Yes | 1,2 |
| | Moving Concierge | Production-ready | `dashboard/moving-concierge` | `movingConcierge.routes.ts` | Writes | 3 |
| | Home Digital Will | Production-ready, no real external sharing (as documented) | `tools/home-digital-will` | `homeDigitalWill.routes.ts` | Yes | 3 |
| **Platform** | Admin console (~20 route files) | Production-ready | `dashboard/admin/*` | 20+ `admin*.routes.ts` | No | — |
| | Worker Jobs console | Production-ready | `dashboard/worker-jobs` | `adminWorkerJobs.routes.ts` | No | — |
| | Home Gazette | **Fully retired** (410s everywhere) | redirect to Home Briefing | `modules/gazette/*` | — | — |
| | Home Score / Composite Score | **Fully retired** (410s everywhere) | redirect to Property Brief | `homeScoreReport.routes.ts` | — | — |

*(This table intentionally omits the ~20 admin-only operational surfaces cataloged in the wiki's [Admin, Analytics & Platform Operations](../wiki/features/08-admin-analytics-and-platform-operations.md) page — they're governance infrastructure, not homeowner capabilities, and are covered in §19.)*

---

## 5. Three-Jobs Mapping

The product already encodes this in code, independently of this audit: `apps/backend/src/productFramework/capabilities/definitions/*.ts` tags 45 registered capabilities with `primaryJob: 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT'` (mapping 1:1 to Job 1/2/3), and the same three-value taxonomy independently recurs in the Skill Registry's `homeownerJobs` field and the worker `JOB_REGISTRY`'s `customerJob` field — three separately-built registries converging on one vocabulary, which is a genuinely good sign for a future unification pass.

**Capabilities that do NOT clearly map to any core job (flagged, per audit instructions):**
- **Claims Assistance** — real, fully-built, homeowner-side claim tracker. Absent from the capability registry entirely: no `primaryJob` tag, no capability-suggestion surfacing, no "Explore all tools" visibility. This is Job 2/3 work with zero discoverability.
- **Home Buyer Task Tracking / Closing Plan** — also absent from the registry. Partially compensated for by `dashboard/page.tsx` swapping the Home tab to `BuyerClosingHome` for buyer-context properties, so it isn't literally orphaned, but won't surface via search/suggestions on a non-buyer-context property.
- **Neighborhood Trust**, **Community Events/Trash/Alerts**, **Local Updates** — these are ambient/informational, arguably Job 1-adjacent ("what's happening around me") but don't detect anything requiring action; they're closer to a fourth, uncounted category ("stay informed") than a clean Job 1 fit.
- **Admin/Platform Operations cluster** — by design not a homeowner job; governance infrastructure underneath the loop.

---

## 6. Home Memory Assessment

**What C2C currently remembers, and where:**

A real Home Context aggregator exists — `apps/backend/src/modules/propertyContext/application/getPropertyContext.ts` — built around 22 typed context scopes (CORE, LOCATION, STRUCTURE, SYSTEMS, SAFETY, INVENTORY, MAINTENANCE, COVERAGE, RISK, FINANCIAL, COMPLIANCE, ENVIRONMENT, and more), each backed by an independent Prisma-querying assembler in `infrastructure/prismaAssemblers.ts` (1,088 lines, 20 assemblers). Every fact returned carries a real contract — `key, value, state (KNOWN/UNKNOWN/CONFLICTED/STALE), source, verified, confidence, observedAt, validUntil, correctionPath` — and the service computes a deterministic `contextVersion` hash and emits per-scope Prometheus metrics. This is production-grade, not scaffolding, and it deliberately avoided the trap the FRD itself names ("a speculative universal rules engine or giant all-tables query").

**It is not a single flat aggregator — it's a base engine wrapped by five domain-specific facades**, all genuinely layered rather than duplicative: `financialContext` (17 features), `protection/context` (9 features), `planningContext`, `projectCompliance/context`, and `aggregationContext` (10 cross-cutting surfaces including Personalization, the dashboard, and worker batch jobs). Personalization's own context builder was removed in favor of this shared layer (a real, executed migration documented in `docs/property-context/PHASE8_IMPLEMENTATION_STATUS.md` and confirmed in code).

**Where it breaks down — adoption is partial, not universal.** At least four high-traffic services independently reconstruct their own property/asset view rather than calling `getPropertyContext` or its facades:
- `homeActions.service.ts` — the canonical attention feed itself — queries `prisma.inventoryItem`/`prisma.property` directly.
- `propertySaleCase.service.ts` — independently queries inventory/warranty/property across at least 4 call sites.
- `homeScoreReport.service.ts` — independently counts inventory/warranty/insurance/maintenance for scoring (notably, this is the *retired* Home Score's report engine — worth confirming this file isn't still executing on a schedule with nothing reading its output; see workers survey, §19).
- `coverageAnalysis.service.ts` — independently queries property/inventory/maintenance/insurance/warranty across 5 call sites.

**Provenance:** genuinely present and well-designed where it exists. `PropertyFactEvidence` is a real evidence ledger (`factKey, sourceType, observationState, confidence, observedAt, validUntil, verifiedAt, supersededAt`) with proper supersession semantics. `PropertyContextCaptureReceipt` is a clean idempotency/audit record for just-in-time capture that stores no raw answers, only receipts. 57 models across the schema carry provenance-shaped fields (`sourceType`/`derivedFromType`/`sourceEntityType`).

**Confidence:** 73 models carry a `confidence` field — but the single most consumed decision-bearing model, `RiskAssessmentReport` (the property risk score shown on the main dashboard), has **no confidence field at all**. Neither does `PropertyClimateSetting`, despite distinguishing auto-detected vs. presumably-corrected values.

**Temporal history:** 20 models follow a real Revision/Version/Snapshot pattern. Counter-example: `PropertyClimateSetting` is a strict 1:1 record overwritten in place with no revision trail, and `Property.inFloodZone`/`inWildfireZone` (self-reported hazard flags) are similarly overwritten with no history — meaning C2C cannot answer "what did we believe about this property's flood risk six months ago" for its own self-reported facts, even though it *can* for many derived/computed domains.

**Relationship model:** the audit's illustrative Property→System→Inspection→Finding→Repair→Warranty→Insurance chain is **real for the first half and broken for the second**. `InspectionFinding` has genuine FKs to `InventoryItem`, `PermitUnpermittedFlag`, `RecallMatch`, and `ProjectRecord` (the repair). But `InspectionFinding.warrantyExpiresAt` is a flat `DateTime?`, not a relation — Finding does not FK to `Warranty` or `InsurancePolicy` directly. "Was this finding covered by warranty or insurance" cannot be answered by a schema join; it requires separate queries reconciled manually, which is exactly why `getPropertyContext`'s COVERAGE assembler has to do independent reconciliation work rather than following a join.

**Verdict:** the *infrastructure* for Home Memory (provenance, confidence, scoped aggregation, JIT capture) is more mature than a typical pre-launch product — this was clearly a deliberate, well-executed design effort (see `docs/property-context/`). The gap is adoption discipline: the aggregator needs to become the only way services build a property view, not one of several.

---

## 7. Property Intelligence Assessment

C2C's externally-discovered property data is a genuine strength, and more diverse than most audits like this one expect to find pre-launch:

**Real, live, mostly-keyless integrations, each independently sourced/cached/degraded** (per the Environment Report's design, where one dead upstream only degrades its own section): NWS (severe weather alerts, point-radius by lat/lon), Open-Meteo (forecast + air quality), US Drought Monitor, FEMA National Flood Hazard Layer + USGS Elevation Point Query Service, EPA radon-zone ArcGIS service, EPA ECHO (facility hazards — Superfund/CERCLIS proximity explicitly *not* integrated, a documented scope gap), NOAA NCEI Climate Normals (frost-date normals explicitly left null rather than guessed), USDA hardiness zone, USGS earthquakes, OpenFEMA disaster declarations, CPSC recalls, Ticketmaster events, city RSS feeds for trash/alerts, and FHFA repeat-sale House Price Index for appreciation comps.

**Provenance discipline is inconsistent across these integrations** — the Break-Even Calculator's appreciation source labeling (explicitly flags `FHFA` vs `HEURISTIC` with a confidence level and fallback chain) is the gold standard in this codebase and should be the template, but it's not applied elsewhere. The Property Appreciation Tracker's "live web search" grounding step (`declare const google: {...}`) is dead code that silently no-ops at runtime — the AI estimate is running on Gemini's general knowledge plus a static state-rate table while the UI likely implies it's grounded in current local data. This is a real correctness/trust gap: a feature presents itself as more grounded than it is.

**Refresh logic exists but is inconsistent** — Radar/weather ingestion runs on cron schedules with real lifecycle convergence (new→updated→resolved/expired/retracted); the Neighborhood Intelligence legacy system explicitly disabled manual recompute in favor of "only when a reviewed source publishes a new or materially revised record" — a deliberate, documented trust decision, not neglect.

**Discovered facts populate Home Memory** in the well-adopted parts of the system (via `getPropertyContext`'s scoped assemblers) but not universally — see §6.

---

## 8. Attention Engine Assessment

C2C has a real, deterministic, two-layer Attention Engine, not a hardcoded alert list — and the exact mechanics matter enough to a target Attention Engine that they're worth stating precisely rather than summarizing.

**Two-layer aggregation, confirmed by reading `homeActions.service.ts` in full (1,424 lines):** `orchestration.service.ts` aggregates raw domain signals (risk, maintenance, coverage gaps, recalls, guidance journeys, capital timeline, etc.) into pre-scored `HomeAction`s first; `getHomeActionFeed()` in `homeActions.service.ts` then merges that stream with three more — personalization recommendations and environment insights (`getPromotedHomeActions`), a first-value activation nudge for new users (`getActivationFirstValue`), and accepted `OperationalWorkItem` rows queried directly — before running its own scoring/dedup/rank pass. **Correction:** a genuinely reconciled, persisted signal source is notably absent from that list — `radarCompoundInsight.service.ts::reconcileRadarCompoundInsightsForProperty` (line 118) already correlates multi-event radar patterns (e.g. an unresolved HVAC-filter task plus an incoming freeze warning) against real maintenance-task and property data, upserts the result into `propertyRadarCompoundInsight`, and is triggered from the radar matcher flow — this is real, live infrastructure, not an unused schema model. It's read back by `radarQuery.service.ts` inside Home Event Radar's own API, but neither `homeActions.service.ts` nor `orchestration.service.ts` reads it — so a compound insight that's already computed and stored never reaches the canonical feed. See Wow Moment #2 (§17), where this materially lowers the estimated effort.

**The scoring formula (`scoreHomeAction`, lines 481–507) is a flat, hand-tuned point sum**, fully deterministic:

```ts
consequence   = CONSEQUENCE_SCORE[safetyTier]   // SAFETY_EMERGENCY 40, REGULATED_COVERAGE 32, MATERIAL_FINANCIAL 28, LOW_CONSEQUENCE 12
urgency       = URGENCY_SCORE[priority]         // NOW 30, SOON 22, PLAN 12, CONSIDER 4
confidence    = round(action.confidence.score * 10)          // 0–10, real signal
householdRel. = JOB_SCORE[job]                  // MAJOR_MOMENT 12, DECIDE 10, STAY_AHEAD 8
actionability = hasUsableCTA ? 8 : 0             // binary, not readiness-weighted
missingCtxPenalty = min(15, missingContext.length * 3)        // real penalty for gaps
score = consequence + urgency + confidence + householdRelevance + actionability - missingCtxPenalty
```

Critically, **the score is only a tiebreaker** — the primary sort key is the categorical `priority` bucket (NOW < SOON < PLAN < CONSIDER); a high-scoring PLAN item can never outrank a low-scoring NOW item. And the richer, continuous 0–100 urgency that `orchestration.service.ts` computes upstream (with an overdue-boost term) is thrown away into that 4-bucket enum before it reaches the scorer — a real resolution loss at the boundary between the two aggregation layers.

**Dedup is genuinely entity-level, done twice, not independent per-source scoring with no collision detection:** Pass 1 groups candidates by a canonical key (coverage/insurance items key on entity id; everything else on normalized signal text or lineage id), keeps the highest scorer, and emits `HOME_ACTION_SUPERSEDED` audit events for the merged losers. Pass 2 re-collapses using a *durable* `OperationalWorkItem` key where one resolves, specifically to catch cases the fuzzy text heuristic missed — a deliberately layered, audited merge, not a shortcut.

**Lifecycle is safety-aware and correctly delegated, not centralized:** `SAFETY_EMERGENCY` actions have a hard block on `DEFER`/`DISMISS`/`NOT_RELEVANT` — cannot be suppressed at all. Commands are routed out to whichever subsystem owns the underlying record (work-item transitions, ownership-cost decisions, personalization lifecycle, generic orchestration snooze) rather than faking one shared state machine — a sensible design given the underlying data really does live in different places.

**Notification delivery is a pure consumer, not a second ranking authority** — `evaluateHomeActionProactiveDeliveryForProperty` calls `getHomeActionFeed()`, takes only the top-ranked eligible item, and applies gating (consent, send budget, escalation detection) on top — it never re-scores. This is the one place in the system where "single ranking authority" is already true.

**The core problem is not this ranking logic — it's that it's one of three non-communicating systems answering the same question:**
1. `homeActions.service.ts` → the canonical, **live** Home tab feed (the mechanics above).
2. `orchestration.service.ts` → the upstream aggregator *and* a separate system that additionally builds a structured, per-source `DecisionTraceStep[]` narrative trace and persists it (`orchestrationDecisionTrace.upsert`), **currently unreachable** by any homeowner.
3. `resolutionCenter.service.ts` → the Fix hub's independent implementation, **shares no code with either of the above**.

**Correction to an earlier draft of this section:** this does not mean the live Home tab has no explainability, and the dead trace's marginal value is smaller than a first pass of this audit suggested. `scoreHomeAction`'s own internal `explanation` field is a short string used for scoring/logging — but the actual `HomeAction` object the frontend receives (`homeAction.contract.ts:167-209`) carries far more: `evidence[]`, `assumptions[]`, `options[]`, `tradeoffs[]`, `confidence{score, label, missing}`, `governance{}`, `whyItMatters`, `expectedOutcome`, and `timing.rationale` — and the schema's own `superRefine` validation *requires* at least one assumption, two options, and a trade-off for any material-financial or regulated-coverage action, so this isn't decorative, it's enforced. `UnifiedHomeSurface.tsx` (lines 975-1010) genuinely renders most of it on the live surface: a "Why you're seeing this" block from `whyItMatters`, an expected-outcome block, the evidence list with source/freshness/observed-date, and an amber "Missing information" callout from `confidence.missing`. What the live UI does **not** render anywhere (confirmed by grep — zero references to `options` or `tradeoffs` in the component) is the decision-alternatives comparison the contract already computes and validates. That's the real, narrower gap — not an absence of explainability, a missing final rendering step for data that's already there. The dead orchestration trace may still add value beyond this (a fuller per-source narrative chain), but it is no longer the *only* source of "why" in the live product.

**Suppression/snooze/dedup is real but fragmented across at least three independent subsystems**, confirmed directly: orchestration's own `snoozeUntil`/generic `dismissedAt` fields, personalization's separate explicit/implicit feedback-and-suppression repository (which, notably, writes into *orchestration's* tables rather than its own — a real, if minor, layering leak), and 14+ other Prisma models with their own independent `dismissedAt` columns (radar matches, notifications, etc.). There is no shared dismissal/snooze abstraction a homeowner would recognize as "one thing that works everywhere," even though each individual instance works correctly.

**Cross-reference to the historical taxonomy doc:** `docs/audits/signal-action-taxonomy.md` describes a *different* layer entirely — Guidance Engine signal classification and tool-routing readiness (`executionReadiness`, `canonicalFirstStep`) — with zero code overlap with `scoreHomeAction` or `orchestration.service.ts` (confirmed via grep: none of its core vocabulary appears in either file). It isn't wrong, it's scoped to a question the numeric ranker doesn't answer at all — worth knowing so a future reader doesn't expect the taxonomy doc to explain the scoring weights.

---

## 9. Decision Intelligence Assessment

The strongest example of genuine shared decision infrastructure in the codebase is the **financial-assumption envelope** (`services/financialContext/context.ts`, `financialAssumption.service.ts`, `AssumptionSet`): Break-Even, Sell-Hold-Rent, Ownership Cost Intelligence, and the Do-Nothing Simulator all resolve against the same versioned, overridable assumption set rather than each computing its own numbers independently. Ownership Cost snapshots/forecasts carry `definitionVersion`/`methodVersion`/`calculationFingerprint` specifically so other tools can cite them as a reproducible source — this is real "decision infrastructure," not isolated calculators, and is the closest thing in the codebase to the audit's illustrative Decision Engine output contract (recommendation / why / alternatives / trade-offs / what changes it / what happens if you wait).

**Outside the financial cluster, decision support is mostly isolated calculators**, each well-built individually but not sharing a framework: Repair-vs-Replace lives inside Guidance journeys; Renovation/Home Modification Advisor is its own AI-generated-options engine; Negotiation Shield is five separate scenario-specific heuristic services; Coverage Intelligence has its own decision-recording model (`CoverageDecision`) distinct from Ownership Cost's `OwnershipCostDecision` and Refinance's `RefinanceDecision` — three parallel "decision record" concepts with similar shape but no shared schema or service.

**Confidence/alternatives/consequence-of-delay:** present unevenly. Break-Even is the standout for source-confidence labeling. The Do-Nothing Simulator is the closest match to "consequence of delay" as a first-class concept (explicitly projects cost/risk of deferring over 6/12/24/36 months). Most other decision tools present a single recommended path without a structured alternatives/trade-off comparison.

**AI usage in decision tools:** narrow and mostly for generation/explanation, not the decision logic itself — Renovation options generation, Budget/Appreciation recommendations, and Ask's result synthesis are genuinely AI; Risk Premium Optimizer and Negotiation Shield are confirmed deterministic despite "AI"-adjacent framing.

---

## 10. Action Layer Assessment

Real completion/task-linkage exists across multiple domains: booking a provider, creating/completing a `PropertyMaintenanceTask`, DIY project step tracking, guidance-journey tool completions, and inspection findings routing into either a task or a draft Project depending on a $1,500 cost threshold (`resolveFindingWorkPolicy`) — a genuinely sensible piece of deterministic policy logic.

**Results feed back into Home Memory in the well-connected parts of the system** (a completed maintenance task updates the record other features read; a promoted document extraction becomes a real Warranty/Expense/InsurancePolicy row) but not everywhere — the live Home tab's completion command (`executeHomeActionCommand`) is a one-click state change with **no photo/evidence capture UI**, while a richer completion flow with photo evidence (`CompletionModal`, `PostSavePanel`, syncing back to `PropertyMaintenanceTask` status) exists in code and would close that loop — it's just only reachable from the two dead pages (`ActionsClient.tsx`, `ResolutionCenterClient.tsx`) described in §8/§18.

---

## 11. Cozy Assessment

**Is Cozy currently a chatbot, a home-aware assistant, or an orchestration layer? → An orchestration layer, genuinely — not marketing language.**

`apps/backend/src/services/ask/askOrchestrator.service.ts` requires explicit, versioned confirmation before any consequential action executes, supports inline clarification/data-capture requests with fallbacks, and — the most significant finding of this entire audit's Skill Platform research thread — **already routes through a real Skill Registry and Skill Router** (`apps/backend/src/services/skills/`, 81 files, 14 skill packages: Maintenance, Coverage, Refinance, Repair-or-Replace, Renovation, Sell-Hold-Rent, Savings, Property Tax, Ownership Cost, Household, Property Record, Capital Planning, Quote Comparison, Seller Preparation) with per-skill required/optional context providers, risk policy, and an output-block contract. This is precisely the abstraction this audit was asked to determine whether C2C should introduce — it already exists, in beta, and is live in the request path (see §12).

**What holds Cozy back from being a fully coherent orchestration layer today:**
- It is one of at least two parallel AI-chat surfaces — `/api/gemini/chat` (`groundedAsk.service.ts`) appears to have zero live frontend callers and should be confirmed dead and removed or explicitly re-platformed onto the Skill Router, not left as an undocumented parallel path.
- `GEMINI_CHAT_ENABLED`, documented in `apps/CLAUDE.md` as the runtime authority for AI chat, does not exist anywhere in the backend — the real gating is a much more granular kill-switch system (`askOperationalControls.ts`) that the top-level docs don't describe. Low risk operationally (the real system works), but a real onboarding hazard for future engineers.
- Model/prompt discipline across the ~30 files that call Gemini directly (outside the Ask/Skill path) is inconsistent — most hardcode `gemini-2.0-flash` inline rather than referencing the central `ai-constants.ts` config, one file (`inspectionExtraction.service.ts`) uses an older `gemini-1.5-flash` found nowhere else, and only 2 of ~20 non-chat Gemini call sites enforce structured JSON output — everything else parses freeform text with manual markdown-fence stripping.
- No output-quality evaluation exists for any Gemini-generated content (see §14, §26).

---

## 12. Skill Platform Assessment

**Should ContractToCozy introduce the Skill abstraction now? → Yes, incrementally — but this needs a significant reframe, because a formal Skill abstraction already exists and is partially implemented.**

This is the single most surprising finding in the audit relative to its own starting premise. `docs/product/CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md` (v1.1, self-reported "Implemented beta baseline," dated 2026-08-14 — eight days before this audit) describes, and the codebase contains, a real `SkillDefinition` type with exactly the illustrative shape this audit's prompt asked whether C2C should adopt: metadata (id/version/domain/homeownerJobs), eligibility (riskPolicy/authorizationFloor), required/optional context providers per operation, allowed adapters/tools, consumer policy, an output-block contract, and lifecycle/operational status. `apps/backend/src/services/skills/maintenance/skill.manifest.ts` is a concrete, complete example. `askOrchestrator.service.ts` imports and calls into `skillRegistry.ts`/`skillRouter.ts` directly — this is live, not aspirational.

**It is deliberately kept separate from two other registries that also organize "capabilities":**
- The **capability-discovery registry** (`productFramework/capabilities/definitions/*.ts`, 45 capabilities) — navigation/discoverability-facing, richer than a thin id/name/route mapping (it carries eligibility, trigger logic, governance/safety-tier rules, and output-entity declarations for Home Record reads/writes), but oriented at *presentation*, not *execution*.
- The **Guidance Journey Template registry** (`guidanceEngine/guidanceTemplateRegistry.ts`, 28 templates across 9 issue domains) — genuinely skill-shaped for issue-driven journeys (eligibility via `signalIntentFamilies`, a step sequence with tool routing, decision-stage state machine) but missing the Skill Registry's explicit context-provider/risk-policy/consumer-policy layer.

The Skill Platform FRD explicitly forbids the Skill Registry from duplicating the Capability Registry's destinations (§10.2, "the Skill Registry shall not duplicate Capability Registry destinations or canonical domain truth") — this is an intentional architectural boundary, not oversight, but it means a caller expecting one unified "Skill = capability + journey + execution" object won't find it; the three registries are unified only loosely, by a shared `primaryJob`/`homeownerJobs` vocabulary and ad-hoc cross-references (a guidance step's `toolKey`, a skill's `allowedAdapters`), not by a single canonical type.

**Recommendation: Yes, incrementally.** Given real infrastructure already exists and is beta-live, the actionable question is not "introduce a Skill object" but: (1) harden and expand the existing Skill Registry rather than build a competing one, (2) build the explicit bridging layer between the Skill Registry and the Capability-Discovery registry that the FRD itself anticipates but defers, and (3) treat the Guidance Journey Template registry as a candidate to either be absorbed into the Skill Registry's context-provider model or explicitly kept as a distinct "issue-driven journey" layer that Skills can invoke — not left as a third parallel taxonomy. The FRD's own Definition-of-Done explicitly excludes production-launch readiness for real users — that gap (not the abstraction itself) is what remains before this becomes load-bearing infrastructure for the target architecture.

---

## 13. Document Intelligence Assessment

**Supported document types:** inspection reports (PDF, up to 200MB), insurance declarations pages, contractor/service quotes, tax bills/assessments, loan estimates, material spec photos, general home records (any file type with typed record classification), warranty/appliance nameplates (OCR).

**Two distinct extraction technologies, used deliberately by task:** Gemini (`documentIntelligence.service.ts`, `gemini-2.0-flash`) for genuinely open-ended document understanding — Magic Scan Documents, Home Records extraction, Material Spec photo extraction, inspection report analysis/extraction, tax-bill OCR, loan-estimate extraction — versus **local Tesseract.js** for narrower, more deterministic text-recognition tasks: inventory label OCR and insurance-declarations-page OCR (a previous version of this audit's own source material mischaracterized this file as doing "no text recognition" because the Tesseract call is a dynamic `await import()` invisible to a static grep — worth remembering as a lesson for anyone auditing this codebase again: static import scans under-report AI/OCR usage here).

**The clearest working "upload once → understand → update Home Memory → generate recommendations" path in the entire codebase is Home Records**: AI extraction on an uploaded document version produces reviewable candidate fields, which a homeowner confirms/corrects/rejects, and confirmed data can be **promoted directly into a real `Warranty`, `Expense`, or `InsurancePolicy` row** — not just displayed back. This is the template pattern the target architecture should generalize, not reinvent.

**Where extraction stays isolated instead of updating Home Memory:** the legacy Inspection Report Analyzer's Gemini-generated findings do **not** feed the current Inspection Hub's `InspectionFinding` model — a homeowner could plausibly have inspection data siloed depending which of the two live surfaces they used, a genuine duplication (§18).

**Validation/confidence:** inconsistent across extraction pipelines — Home Records' review-and-confirm step is a real human-in-the-loop validation gate; Material Spec photo extraction fails silently (no review row created) rather than surfacing an error; most extraction prompts rely on freeform-text parsing rather than enforced JSON schemas (see §11, AI architecture findings), which is a structural risk to extraction reliability specifically, since malformed extraction output degrades silently into missing fields rather than a visible error.

---

## 14. Frontend Intelligence Assessment

An internal UI audit (`docs/audits/ui-audit/whole-app_ui-audit.md`) already scores overall maturity at 5.7/10 and independently reaches a compatible conclusion: "strong feature depth but weak product-system coherence... powerful but patchwork." This audit's own findings corroborate and sharpen several of its top issues with concrete reachability evidence:

**Card overload / competing CTAs (UI audit finding, independently confirmed):** the dashboard's own `dashboard/page.tsx` computes an orchestration-derived hero card (`primaryActionHero`) that is built, then never rendered — a literal instance of "too much competing for the same space" resolved by simply not displaying half of what was computed.

**Classification of representative pages** (Guidance-first / Feature-first / Data-entry-first / Administrative):

| Page/flow | Classification | Note |
|---|---|---|
| Onboarding first-value flow (`/onboarding/first-value`) | **Guidance-first** | The one genuinely well-executed instance of the loop in miniature — one evidence-bounded recommended action, not a form. |
| Personalization (`/dashboard/personalization`) | **Guidance-first** | Real "why this home" explanation, progressive profiling, context-map transparency. |
| Guidance Overview / journey steps | **Guidance-first** | Issue-scoped, step-sequenced, trust-badge-equipped. |
| Home tab (`UnifiedHomeSurface`) | **Guidance-first, degraded** | Ranked cards exist but the explainability layer behind them (decision trace) is unreachable. |
| Break-Even, Ownership Costs, Sell-Hold-Rent | **Feature-first, well-instrumented** | Real calculators with source labeling, but the homeowner must know to open them — not proactively surfaced as guidance. |
| Property Setup Checklist, Insurance Policies (manual entry), HOA Compliance | **Data-entry-first** | Genuine forms, no discovery/inference to reduce typing. |
| Fix hub / Resolution Center | **Feature-first masquerading as guidance-first** | Presents itself as "what needs attention" but is a second, disconnected ranking authority from the Home tab. |
| Admin console (all `/dashboard/admin/*`) | **Administrative** | Correctly scoped, not homeowner-facing. |

**Structural issues independently confirmed here, beyond the UI audit's visual-design focus:**
- **Redirect-chain depth**: the "Vault/Save/Protect" consolidation created chains up to 3 hops deep (`/dashboard/insurance` → `/dashboard/protect?tab=coverage` → `JobHubRedirectPage` → `/dashboard/properties/:id/protect?tab=coverage` → hardcoded ignore-the-tab → `/dashboard/properties/:id?tab=risk-protection`), with the original `page.tsx` still on disk and unreachable at its own URL in every case found. This is worse for maintainability than dead code that's actually deleted — it looks live in a file listing.
- **Three simultaneous "add a home" entry points** (trigger-first wizard, Property Setup Checklist, manual creation form) undermine "understand the home" as one coherent first-run experience.
- **Seven-plus components confirmed dead** (fetch-and-never-render, or zero importers): `ActionsClient.tsx`, `ResolutionCenterClient.tsx`, `PropertyOrchestrationStrip.tsx`, `PriorityAlertBanner.tsx`, `MorningHomePulseCard.tsx`/`HomePulse.tsx`, `RightSidebar.tsx`, `CommunityEventsCard.tsx` — a consistent leftover pattern from the nav-consolidation effort, large enough now to warrant a dedicated cleanup pass.

**Disconnected AI experiences:** Ask Cozy, the legacy `/api/gemini/chat`, the Emergency Troubleshooter chat (now behind a redirect into a non-chat page, reachability unconfirmed), and Cozy's underlying Skill Router are not presented to the homeowner as one coherent "ask the house anything" surface — they're separately-branded, separately-routed experiences with overlapping but non-identical capability.

---

## 15. Recommendation Landscape

Every significant recommendation/insight/score/alert-producing system found in this audit:

| System | Model | Scoring approach | Confidence carried? | Feeds unified feed? |
|---|---|---|---|---|
| `homeActions.service.ts` (canonical) | `OrchestrationActionEvent` + dedicated action records | Deterministic multi-factor scoring | Partial | **Is the feed** |
| `orchestration.service.ts` (dead) | `OrchestrationDecisionTrace` | Deterministic, more sophisticated | Yes | No (unreachable) |
| `resolutionCenter.service.ts` | own models | Deterministic | Unknown | No (separate feed) |
| Personalization Engine | `PersonalizedRecommendation` + `RecommendationExplanation` | Rule-driven, catalog-governed, ranking-only profile influence | Yes | Feeds Home Actions inputs, not itself unified |
| Home Event Radar | `PropertyRadarMatch` | Source-specific severity/impact scoring | Partial | Feeds Home Actions inputs |
| Hidden Savings & Benefits | `PropertyHiddenAssetMatch` | Rule-engine confidence/category match | Yes | Feeds Home Actions inputs |
| Guidance Signals | `GuidanceSignal` | Issue-detection, journey-triggering | Partial | Feeds Home Actions inputs |
| Risk Assessment | `RiskAssessmentReport` | Deterministic formula | **No confidence field** | Surfaced separately (dashboard card), not in ranked feed |
| Coverage gap warnings | via nudge widget | Deterministic | Unknown | Only reachable via nudge widget, not the ranked feed |
| Do-Nothing Simulator | `DoNothingSimulationRun` | Assumption-based projection | Sensitivity range | No (standalone tool) |
| Break-Even | computed live | Source-labeled (FHFA/heuristic) | **Yes — best in class** | No (standalone tool) |
| Renovation option suggestions | `RenovationUpgradeOption` | AI-generated, "why this fits" rationale | Confidence/evidence-source label | No (standalone) |

**Duplication identified:** the three-way split at the top of this table (§8/§18) is the headline finding. A secondary duplication: `CoverageDecision`, `OwnershipCostDecision`, and `RefinanceDecision` are three independently-schemed "user recorded a decision" models with overlapping intent (KEEP/CHANGE/SHOP-style enums) and no shared base — a real opportunity for a shared `DecisionRecord` contract (see §20), though lower priority than the ranking-authority duplication.

**A shared recommendation contract is not currently enforced**, but the *data* to build one already mostly exists distributed across these models — a migration would be additive (a view/adapter layer over existing tables), not a schema rewrite. See §22 Phase 2.

**A related, confirmed gap — corrected from an earlier draft, which overstated it: "was this recommendation good" feedback is fragmented into three paths with no shared aggregate, but it is not purely write-only.** Ask execution feedback (helpful/not-helpful) increments a Prometheus counter (`askFeedbackTotal`) — an ops metric, not a product signal. Personalization's explicit/implicit feedback writes to its own suppression repository, genuinely affecting what that engine surfaces next. **Home-action usefulness feedback is real, consumed infrastructure, not a write sink** — `recordHomeActionUsefulnessFeedback`/`getSuppressedHomeActionIds` (`homeActionUsefulnessFeedback.service.ts:28`) implement a 14-day suppression cooldown that is genuinely read by **two** live consumers: `askOrchestrator.service.ts` (multiple call sites, gating Ask's `PRIORITY_LIST` surfacing) and `homeActionProactiveDelivery.service.ts` (gating what gets proactively pushed). A "not useful" rating on a home action measurably changes what a homeowner sees next, across two surfaces, for two weeks. What's still missing: none of the three paths **aggregate** across users/properties into a measured "are our recommendations good" signal, and none feed back into calibrating the underlying scoring or rule logic — the suppression is real but purely local and ephemeral, not a learning loop. That narrower gap is the actual blocker (§18 Blocker #4), distinct from the separate LLM-content-evaluation gap in the same blocker.

---

## 16. Data Architecture Findings

*(Full evidence trail in the addendum.)* The schema itself is not the problem — 505 models organized into ~18 coherent domains is large but not chaotic, and the accretive workspace/revision/event pattern repeats consistently enough to be a real (if implicit) convention. The systemic problems are:

1. **Two confirmed unconsolidated duplicate systems** remain in-schema: `ChecklistItem` (deprecated, headers say so) vs. `PropertyMaintenanceTask`; `Household`/`HouseholdProperty` vs. `HouseholdMember`/`HouseholdInvite` — the latter explicitly flagged in `PHASE8_IMPLEMENTATION_STATUS.md` as "retained pending a relationship-model review," i.e. known and deferred, not undiscovered.
2. **Risk scoring is fragmented across three unlinked models** with no FK cross-reference: `RiskAssessmentReport` (overall, no confidence field), `RiskPremiumOptimizationAnalysis` (insurance-specific, has confidence), `HomeRiskEvent`/`HomeRiskReplayRun` (event-replay). A homeowner could see three different "risk" numbers from three different features with no way to reconcile them structurally.
3. **Provenance and confidence are real but unevenly distributed** — strong in the newer Property Context / guidance / extraction domains, absent from some of the oldest and most-consumed models (`RiskAssessmentReport`, `PropertyClimateSetting`).
4. **Temporal history exists but isn't universal** — self-reported hazard-zone facts and climate settings are overwritten in place with no revision trail, while adjacent domains (radar events, insurance terms, coverage comparisons) are properly historized. This is inconsistency, not absence of the *pattern* — the codebase clearly knows how to do this well when it chooses to.
5. **The core structural spine (Property→Asset→Inspection→Finding→Repair) is genuinely connected via real FKs; the coverage/insurance half of the chain is not** — `InspectionFinding` has no direct FK to `Warranty` or `InsurancePolicy`, only a shared `propertyId`. This is the single most concrete, fixable data-model gap identified in this audit, and it's additive (add two nullable FK columns; see §23).
6. **A formal graph database is not justified.** Every relationship traced in this audit — including the illustrative Property→Roof→Inspection→Finding→Repair→Warranty→Insurance→Seller-impact chain — is expressible as relational joins once the one missing FK pair above is added. The complexity here is inconsistent adoption of existing relational patterns, not a shape the relational model can't represent.

---

## 17. Five Best "Wow Moments"

Chosen strictly for existing-infrastructure leverage, not conceptual appeal — ranked by (lowest effort × highest existing-asset reuse).

### #1 — "Your inspection findings, ranked by what actually matters — and what it means if you wait"
**Why compelling:** combines two already-strong systems (Inspection Hub's structured findings + Do-Nothing Simulator's consequence-of-delay modeling) that have never been connected to each other.
**Existing assets:** `InspectionFinding` with severity/cost, `resolveFindingWorkPolicy`'s existing $1,500 task-vs-project routing, `DoNothingSimulator`'s scenario engine (already accepts `guidanceJourneyId`/`guidanceStepKey` hooks).
**Missing pieces:** a direct call from a Finding's detail view into a pre-populated Do-Nothing scenario.
**Effort:** Low (both systems exist; this is a linking feature, not new logic).
**Confidence:** High.

### #2 — "We caught this because a freeze warning is coming and your HVAC hasn't been serviced in 14 months"
**Why compelling:** genuine cross-source correlation (Home Event Radar + Maintenance Prediction) that `homeActions.service.ts`'s confirmed scoring mechanics (§8) treat as two independently-scored, independently-deduped items — dedup only collapses candidates representing the *same* underlying issue, not two different issues that compound each other. **Correction — this is a smaller lift than an earlier draft estimated: the correlation already exists and already runs in production, it's just not connected to the feed a homeowner actually sees.**
**Existing assets:** `radarCompoundInsight.service.ts::reconcileRadarCompoundInsightsForProperty` (line 118) already reconciles exactly this pattern class — it cross-references active radar matches against real maintenance-task state (e.g. `compoundMaintenanceFacts` deriving an HVAC-filter `due`/`current`/`unknown` status) and property facts, persists the result to `propertyRadarCompoundInsight` with source evidence and recommended actions, and is triggered from the live radar matcher flow — not a dormant schema model. It's already read back inside Home Event Radar's own API (`radarQuery.service.ts`).
**Missing pieces:** confirmed — the one missing link is promotion. Neither `homeActions.service.ts` nor `orchestration.service.ts` reads `propertyRadarCompoundInsight`, so a compound insight that's already computed, evidenced, and stored today never reaches the canonical Home feed. This is now the single lowest-effort item in this list: the hard part (correlation logic against real data) is done.
**Effort:** Low.
**Confidence:** High.

### #3 — "This home qualifies for $X in programs you didn't know about"
**Why compelling:** Hidden Savings & Benefits is a real, curated rule-engine already computing exactly this — the "wow" is entirely a discoverability problem, not a build problem, since the wiki confirms this tool sits behind a tools submenu rather than the primary attention feed.
**Existing assets:** the full rule engine, outcome-tracking trail (SUBMITTED→APPROVED/DENIED/RECEIVED), and confidence/category matching already work end to end.
**Missing pieces:** proactive surfacing in the Home tab / onboarding first-value flow rather than requiring the homeowner to open a specific tool.
**Effort:** Low.
**Confidence:** High.

### #4 — "Your insurance premium could drop if you did these three things — here's the math"
**Why compelling:** Risk Premium Optimizer already models specific hardening actions against premium exposure with a tracked mitigation plan; pairing it with Coverage Intelligence's existing "keep/change/shop" decision record turns a calculator into a decision moment.
**Existing assets:** `RiskPremiumOptimizerService`, `CoverageDecision`, the shared `AssumptionSet` envelope.
**Missing pieces:** a direct handoff from optimizer output into a pre-filled coverage decision, plus surfacing the opportunity in the attention feed rather than requiring discovery.
**Effort:** Medium.
**Confidence:** Medium.

### #5 — "Your sale readiness score, computed from your actual records — not a checklist you filled out"
**Why compelling:** Sale Case (`propertySaleCase.service.ts`) already projects readiness from real inspection findings, permits, projects, warranties, and Home Actions — this is a materially different (and better) trust story than a self-reported percentage, and the code comments explicitly call out this design choice.
**Existing assets:** the full computation already exists and is live.
**Missing pieces:** none for the core moment — the opportunity is packaging this as a shareable "wow" (e.g., a before/after view once issues are resolved) rather than a tool a seller-intent homeowner has to find.
**Effort:** Low.
**Confidence:** High.

---

## 18. Top 10 Intelligence Blockers

Ranked by Impact × Urgency (blocking the target architecture, not general code quality).

**1. Two competing "what does this property need" ranking authorities, with the fuller decision-trace layer unreachable from either.**
*Evidence:* `orchestration.service.ts`/`OrchestrationDecisionTrace` fully built, 7/7 frontend call sites dead (`docs/wiki/00-introduction.md` reachability audit, independently structurally consistent with this audit's own reading). `homeActions.service.ts` and `resolutionCenter.service.ts` share no code. **Correction:** this is not "the live feed has no explanation" — `homeAction.contract.ts` and `UnifiedHomeSurface.tsx` already deliver real evidence/why/expected-outcome to the live surface (§8); the unreached piece is specifically the decision-trace's fuller per-source narrative plus the already-contracted `options`/`tradeoffs` fields that the live UI computes but never renders.
*Consequence:* the product cannot deliver "one thing that matters most" consistently — its own two live implementations disagree — and it under-delivers on explainability it has already built and validated but doesn't display.
*Fix:* pick one ranking authority (recommend `homeActions.service.ts` — it's live, deterministic, and reasonably extensible per the ranking deep-dive). As a quick, high-value first step independent of that larger merge, render the contract's existing `options`/`tradeoffs` in `UnifiedHomeSurface.tsx` — the data is already there. Separately, port whatever `orchestration.service.ts`'s decision-trace adds beyond that onto `homeActions.service.ts`'s output. Decide whether the Fix hub becomes a filtered view of the same feed or is retired.
*Effort:* Medium-High for the full merge; Low for the options/tradeoffs rendering quick win. *Risk:* Medium for the merge (touches the most-used surface) — mitigate with a feature flag and a shadow-mode comparison period; Low for the rendering fix.

**2. A "Vault/Save/Protect" nav consolidation left redirect chains up to 3 hops deep and 12+ dead-but-present pages.**
*Evidence:* `next.config.js` redirect groups; multiple `page.tsx` files confirmed unreachable at their own URL across the Coverage, Home Health, and Environment clusters.
*Consequence:* every future feature that deep-links into one of these old URLs (bookmarks, emails, other tools' cross-links) silently degrades; makes future audits/onboarding harder, and each hop is latency + a `JobHubRedirectPage` flash for the homeowner.
*Fix:* collapse each chain to a single redirect; delete or archive the dead `page.tsx` files.
*Effort:* Low. *Risk:* Low (this is cleanup, testable via the existing `navigation/route-redirects` telemetry).

**3. Two duplicate systems not yet consolidated: maintenance tasks and household membership.**
*Evidence:* `ChecklistItem` vs. `PropertyMaintenanceTask` (deprecated headers already point the way); `Household`/`HouseholdProperty` vs. `HouseholdMember`/`HouseholdInvite` (flagged in-repo as "pending a relationship-model review").
*Consequence:* every new feature that touches tasks or household membership has to pick the right one, or risks writing to the dead system.
*Fix:* `ChecklistItem` — finish the deprecation, migrate remaining callers, drop the model. Household — this needs a design decision (which model is canonical) before code changes; flag for product/eng review rather than unilaterally picking one.
*Effort:* Medium (Checklist) / High (Household, needs a decision first). *Risk:* Low-Medium.

**4. No evaluation exists anywhere for LLM-generated content quality — and none of the real feedback C2C already collects aggregates into a quality signal.**
*Evidence:* zero of 539 backend test files assert on generated-content correctness (the one AI-generation test, `diyAiGuideGeneration.test.js`, checks JSON well-formedness only); the only evaluation infrastructure found (Ask Trust, calibration releases) evaluates deterministic routing/scoring, not generated text. **Correction:** the feedback picture is better than an earlier draft stated — home-action usefulness feedback is genuinely consumed (`getSuppressedHomeActionIds` drives a real 14-day suppression read by both `askOrchestrator.service.ts` and `homeActionProactiveDelivery.service.ts`) and personalization feedback genuinely affects its own suppression. Only Ask's up/down rating is a pure ops counter with no product consumer. The real gap is narrower: none of the three feed a cross-user, cross-property **aggregate**, and none feed back into calibrating the underlying scoring/rule logic.
*Consequence:* every Gemini-backed feature ships and evolves with no regression signal, **and** C2C still has no way to know, in aggregate, whether its recommendations are actually good — even though the per-user suppression signal proves the plumbing to collect that judgment already exists.
*Fix:* see §25, Synthetic Evaluation Suite (build on the two golden-fixture suites that already exist rather than starting from zero). Separately, aggregate the existing suppression/feedback events (they already exist as real writes) into `adminAnalytics` — this is wiring an existing signal upward, not building new collection.
*Effort:* Medium. *Risk:* Low (purely additive).

**5. Inconsistent Gemini model/structured-output discipline across ~20 non-chat call sites.**
*Evidence:* most hardcode `gemini-2.0-flash` inline rather than the central config; one file uses an orphaned `gemini-1.5-flash`; only 2 of ~20 enforce JSON schema output, the rest parse freeform text.
*Consequence:* harder to do a coordinated model upgrade later; freeform-text parsing is a real reliability risk for extraction-heavy features (silent field-drop on malformed output).
*Fix:* route all Gemini calls through `ai-constants.ts`'s model config; migrate freeform-parsed call sites to `responseSchema` incrementally, starting with extraction (highest correctness stakes).
*Effort:* Low-Medium (mechanical, file-by-file). *Risk:* Low.

**6. Several Gemini-backed routes have zero rate limiting.**
*Evidence:* `movingConcierge.routes.ts`, `propertyAppreciation.routes.ts`, `taxAppeal.routes.ts`, `inspectionReport.routes.ts`, `homeModification.routes.ts` — confirmed only `authenticate` (+multer where relevant), no `apiRateLimiter` or AI-specific limiter.
*Consequence:* real cost/abuse exposure — an authenticated user could drive unbounded Gemini spend through any of these.
*Fix:* add the existing `expensiveAiRateLimiter`/`aiOracleRateLimiter` to these five routes — the limiter infrastructure already exists, this is a one-line-per-route fix.
*Effort:* Low. *Risk:* Low.

**7. Two orphaned/dead backend surfaces still present and partially exposed via the frontend API client.**
*Evidence:* `taxAppeal.routes.ts` (legacy tax-appeal analysis, no live caller found) and `apps/backend/src/homeRenovationAdvisor/*` (Home Renovation Risk Advisor, own dedicated 558-line frontend page confirmed unreferenced) — both superseded by newer systems but never removed; `/api/gemini/chat` similarly has no confirmed live caller.
*Consequence:* dead code that still runs, still costs (Gemini calls in `taxAppeal.service.ts`), and confuses future engineers about which system is canonical.
*Fix:* confirm zero callers (a repo-wide search, already mostly done in this audit), then delete or formally deprecate with response headers matching the pattern already used elsewhere (`ChecklistItem`, `homeScoreReport.routes.ts`).
*Effort:* Low. *Risk:* Low (dead code removal, verify via search first).

**8. `RiskAssessmentReport` — the property risk score most visibly shown to homeowners — has no confidence field, and no direct schema link to Warranty/InsurancePolicy from InspectionFinding.**
*Evidence:* §6, §16.
*Consequence:* the most-visible single number in the app cannot express uncertainty, and "was this finding covered" requires manual reconciliation rather than a join — directly blocks the target architecture's confidence-aware, explainable recommendation goal.
*Fix:* additive schema change — add `confidence`/`confidenceBasis` to `RiskAssessmentReport`; add nullable `warrantyId`/`insurancePolicyId` FKs to `InspectionFinding` (see §23).
*Effort:* Low (schema) + Medium (backfill/wiring logic to populate the new fields). *Risk:* Low (additive, no breaking change).

**9. Claims Assistance and Home Buyer Task Tracking are absent from the capability-discovery registry.**
*Evidence:* §5; confirmed via the wiki's reachability audit and cross-referenced in this audit's Skill Platform research.
*Consequence:* two real, fully-built features have no capability-suggestion surfacing and no "Explore all tools" visibility — a homeowner mid-claim or mid-purchase may never discover the tool built for exactly their situation.
*Fix:* add both to `productFramework/capabilities/definitions/*.ts` with appropriate `primaryJob` tags — this is additive registration, not new feature work.
*Effort:* Low. *Risk:* Low.

**10. `LocalUpdate` has no code path anywhere that creates or upserts rows.**
*Evidence:* wiki's explicit finding — no admin route, no seed script, no ingestion job found in backend or workers.
*Consequence:* a live, ranked, homeowner-facing widget depends entirely on an undocumented external process (manual DB writes or an out-of-repo CMS) — a genuine operational risk (what happens when whoever knows how to populate this leaves) and a red flag for "does this system understand its own data sources," which matters directly for the audit's Home Memory provenance goal.
*Fix:* not a code fix — a product/ops question: either build the missing ingestion path or formally document the external process. Flag to the user directly rather than guessing.
*Effort:* Unknown until the process is identified. *Risk:* Low technically, but an operational blind spot worth surfacing immediately.

---

## 19. What NOT to Build

- **No vector database / embeddings store.** Nothing in this audit found a genuine semantic-search or RAG use case that the existing structured Prisma queries + Gemini's own context window can't serve. Ask's context-selection (`selectRelevantAskFacts`) is a bounded, deterministic fact-selection mechanism, not retrieval-augmented generation — and it doesn't need to become one at this scale.
- **No graph database.** §16 — every relationship traced, including the audit's own illustrative worst-case chain, is expressible relationally once two missing FK columns are added.
- **No new microservices or distributed-systems infrastructure.** The colocated-feature-directory and module patterns already in use are the right granularity for a product at this user scale; splitting any of this out into separate deployable services would trade a real, working monolith for operational complexity with no corresponding benefit at 5–50 users.
- **No new Skill/capability framework built from scratch.** One already exists in beta (§12) — building a second would be the single most wasteful thing this audit could recommend.
- **No LLM-based routing or "skill selection."** The existing Skill Router is explicitly, deliberately deterministic (`docs/product/CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md` §11.4/§20 rule this out) — this is the right call for a system whose eligibility/safety rules must be auditable, and should not be revisited toward "let the model decide" for cost-cutting or novelty reasons.
- **No wholesale Prisma schema redesign.** 505 models organized into ~18 domains is large but coherent; the fixes this audit recommends are additive (new nullable FKs, new confidence fields) or targeted consolidations (two known duplicate pairs) — not a rewrite.
- **No rewrite of `homeActions.service.ts`.** It's a reasonable, extensible, deterministic foundation (§8) — the fix is reconciling it with its two siblings, not replacing it.
- **No premature machine-learning scoring model** for attention prioritization. The existing deterministic rules-based approach is appropriate at this stage and scale, exactly as the audit's own guidance anticipated — revisit only once there's enough real usage/outcome data to validate an ML approach would beat the deterministic one, which there currently is not (no real users yet).
- **No new feature-flag framework — a real general-purpose one already exists and is confirmed live.** `apps/backend/src/config/featureFlags.ts` + `middleware/rollout.middleware.ts` is a genuine cohort-based rollout system (DISABLED/INTERNAL/BETA/FULL, deterministic per-user hashing, env-var percentage overrides) sitting alongside the domain-specific kill-switches (Ask, Personalization, release-gates, worker-job governance). Any new capability rollout should use this, not a bespoke env var.
- **No agentic/autonomous-action AI.** Ask's explicit-confirmation-before-execution design is correct for this domain (money, contractors, legal/insurance decisions) and should not be loosened toward autonomous execution.

---

## 20. Reuse Opportunities

These existing components should become shared infrastructure rather than being rebuilt, in priority order:

1. **`homeActions.service.ts`** → the core of the target Attention Engine. Extend it to absorb whatever's genuinely valuable in `orchestration.service.ts` (the decision-trace generation), don't replace it.
2. **`getPropertyContext` + its five domain facades** → the core of Home Context. The fix is adoption enforcement (a lint rule or code-review checklist item: "new services must not query Property/InventoryItem/InsurancePolicy directly — use the context layer"), not new construction.
3. **The Skill Registry (`services/skills/`)** → the core of both the Decision Engine and the Skill Platform the audit was asked to evaluate. Extend its 14 packages rather than building parallel decision logic per feature.
4. **The `AssumptionSet` / financial-context envelope pattern** → generalize beyond the financial cluster as the template for "versioned, reproducible, cite-able" outputs anywhere a Decision Engine needs to explain "what changed" or "what this is based on."
5. **`TrustStrip`/`ConfidenceBadge`/`WhyThisMattersCard`/`SourceChip`** (`components/trust/`) → already a real, shared, multi-page trust-UI library. This should become the *mandatory* contract for any new recommendation surface, exactly as the internal UI audit already recommends — don't invent a second trust-UI pattern.
5. **Personalization's context-map** → the best existing template for "what does C2C know about this home" UI — a strong starting point for any future consolidated Home Context view, rather than designing one from scratch.
6. **The capability-discovery registry's governance/trigger logic** (`capabilityDefinitionFactory.ts`) → already handles eligibility, safety-tier, and Home-Record read/write declarations more richly than a "thin catalog" — reuse this shape for any new capability rather than a simpler ad-hoc registration.
7. **`hiddenAssets/ruleEngine.ts`** → the most genuinely generalized attribute-eligibility rule engine in the codebase; worth considering as the template for any future rule-driven matching feature (e.g. warranty-eligibility matching, permit-requirement matching) rather than writing bespoke rule logic again.
8. **The Home Records extraction→promote pattern** → the reference implementation for "document intelligence updates Home Memory." Any new document-adjacent feature should follow this shape rather than the legacy Inspection Report Analyzer's isolated pattern.
9. **`JOB_REGISTRY`'s governance shape** (category, schedule, impact, `customerJob`, `humanApprovalClass`) → already a clean, uniform registry pattern; worth reusing for any future registry.
10. **The existing 10-archetype synthetic-property suite** (`docs/property-context/phase8-archetypes.example.json` + its automated counterpart `apps/backend/tests/unit/phase8ArchetypeExitGate.test.js`) and the `savingsBenefitsGoldenFixtures` pattern → this is a genuine, already-built golden-fixture testing approach for deterministic rule-engine correctness. It is the direct foundation for §25's evaluation suite — extend it to cover attention-ranking and AI-content assertions rather than inventing a second synthetic-household framework.
11. **`config/featureFlags.ts` + `rollout.middleware.ts`** → a real, general-purpose, cohort-based rollout system already exists; use it for any new capability's staged rollout instead of a bespoke env var or a new flag mechanism.

---

## 21. Target Architecture

```
                    CONTRACTTOCOZY (existing product surface — unchanged)
                              │
                              ▼
                       HOME INTELLIGENCE  (largely EXISTING, needs reconnection)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   HOME MEMORY          ATTENTION ENGINE       DECISION ENGINE
   = getPropertyContext  = homeActions.service   = AssumptionSet envelope
   (EXISTING, extend      (EXISTING, extend to     + Skill Registry decision
   adoption)              absorb orchestration's   logic (EXISTING, extend)
                          decision-trace, EXTEND)
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                             COZY
                    = askOrchestrator.service.ts
                    (EXISTING, already an orchestration
                    layer, EXTEND reach/consistency)
                              │
                              ▼
                        SKILL PLATFORM
                = services/skills/ registry+router
                (EXISTING BETA — 14 packages, EXTEND
                coverage + bridge to capability registry)
                              │
     ┌──────────┬──────────┬──────────┬──────────┬──────────┐
     │          │          │          │          │          │
 MAINTENANCE  COVERAGE  REFINANCE   BUYER      SELLER    + 9 more
 (skill,      (skill,   (skill,     (via       (via      existing
 EXISTING)    EXISTING) EXISTING)   capability  capability skills)
                                     registry,   registry,
                                     NEW skill   NEW skill
                                     mapping)    mapping)
                              │
                              ▼
                         ACTION LAYER
              = booking/task/DIY/completion infra (EXISTING)
              + EXTEND: photo-evidence completion reachable
                from the live Home tab, not just dead pages
```

**Existing / Extend / New / Eventually:**

| Component | Status | What to do |
|---|---|---|
| Home Memory (`getPropertyContext`) | **Existing** | Extend adoption; don't rebuild |
| Property Intelligence integrations | **Existing** | Extend provenance labeling to match Break-Even's standard |
| Attention Engine (`homeActions.service.ts`) | **Existing** | Extend to absorb decision-trace; reconcile with Fix hub |
| Decision Engine primitives (`AssumptionSet`, Skill Registry) | **Existing** | Extend beyond financial cluster |
| Cozy orchestration | **Existing** | Extend consistency (single chat entry point, model discipline) |
| Skill Platform | **Existing (beta)** | Extend coverage; bridge to capability registry |
| Recommendation contract | **New** (thin) | A read-model/adapter view over existing tables — additive, not a schema rewrite. `homeAction.contract.ts`'s own shape (evidence/assumptions/options/tradeoffs/confidence/governance) is already the right target shape to project the other four systems into, not something to design from scratch |
| Unified dismissal/snooze lifecycle | **New** (thin) | A shared service wrapping the existing per-system fields, not new storage |
| AI-evaluation harness | **New** | Test fixtures + judge/review harness — see §25 |
| Warranty/InsurancePolicy FKs on InspectionFinding | **New** (additive schema) | Two nullable columns + backfill |
| Household model consolidation | **Eventually** | Needs a product decision before any code change |
| Formal cross-registry Skill↔Capability bridge | **Eventually** | The FRD itself defers this; revisit once Skill Platform coverage is broader |

---

## 22. Incremental Implementation Roadmap

**Phase 0 — Cleanup required before intelligence work** *(only where truly necessary)*
- Objective: remove the confusion that would otherwise contaminate every later phase's testing.
- Code affected: delete/deprecate `taxAppeal.routes.ts`, `homeRenovationAdvisor/*`'s dead frontend page, confirm and remove `/api/gemini/chat` if truly uncalled; collapse the worst redirect chains (§18 #2).
- DB impact: none.
- New components: none.
- Reused: none.
- Dependencies: none — can start immediately.
- Risk: Low. Effort: Low. Expected user impact: none directly (invisible cleanup), but removes false signal for every phase after.

**Phase 1 — Home Context adoption enforcement**
- Objective: make `getPropertyContext` (+ facades) the only way services build a property view.
- Code affected: `homeActions.service.ts`, `propertySaleCase.service.ts`, `coverageAnalysis.service.ts`, `homeScoreReport.service.ts` (or delete it, since Home Score is retired — confirm nothing still reads its output).
- DB impact: none.
- New components: none — reuse existing aggregator.
- Reused: `getPropertyContext`, existing facades.
- Dependencies: Phase 0.
- Risk: Medium (touches high-traffic services — needs careful regression testing). Effort: Medium. Expected impact: invisible to homeowners short-term, foundational for everything else.

**Phase 2 — Unified Recommendation read-model**
- Objective: build a thin adapter layer that projects `PersonalizedRecommendation`, `PropertyRadarMatch`, `PropertyHiddenAssetMatch`, `GuidanceSignal`, and Home Actions' own candidates into one consistent shape for ranking/display, without changing any source table.
- DB impact: **additive only** — no schema change required for the read-model itself.
- New components: the adapter/projection layer.
- Reused: all five existing recommendation-producing systems.
- Dependencies: Phase 1.
- Risk: Low. Effort: Medium.

**Phase 3 — Attention Engine consolidation**
- Objective: resolve the three-way ranking-authority split (§18 #1).
- Code affected: `homeActions.service.ts` (extend), `orchestration.service.ts` (port decision-trace logic in, then retire the parallel aggregation), `resolutionCenter.service.ts` (decide: filtered view of the same feed, or retired).
- DB impact: none new (reuses `OrchestrationDecisionTrace`).
- New components: none.
- Dependencies: Phase 2.
- Risk: Medium-High (highest-traffic surface). Effort: High. Expected impact: **highest of any phase** — this is the one homeowners will actually feel.

**Phase 4 — Decision Framework extension**
- Objective: generalize the `AssumptionSet` pattern and the Skill Registry's decision-logic shape beyond the financial cluster to Renovation, Negotiation Shield, and Repair-or-Replace.
- DB impact: additive (a shared `DecisionRecord` base linked from existing `CoverageDecision`/`OwnershipCostDecision`/`RefinanceDecision`, or leave them distinct and just share the *service* pattern — recommend the latter, lower risk).
- Reused: Skill Registry, `AssumptionSet`.
- Dependencies: Phase 1.
- Risk: Low-Medium. Effort: Medium.

**Phase 5 — Cozy Integration**
- Objective: single chat entry point, Skill Router coverage expansion, model/structured-output discipline pass across the ~20 non-chat Gemini call sites (§18 #5).
- Dependencies: Phase 0 (dead-code removal), Phase 3 (Cozy should be able to explain a Home Actions recommendation once one ranking authority exists).
- Risk: Low-Medium. Effort: Medium.

**Phase 6 — Skills coverage expansion**
- Objective: register Buyer and Seller flows (and any other high-value uncovered domain) as formal Skills; build the capability↔skill bridge the FRD defers.
- Dependencies: Phase 5.
- Risk: Low. Effort: Medium-High (14 → ~18-20 skills is real work, but templated).

**Phase 7 — Five Wow Moments**
- Objective: ship the five moments in §17, in the order listed (already effort-ranked lowest-first).
- Dependencies: Phase 2 (compound insights need the unified read-model), Phase 3 (surfacing needs one ranking authority to insert into).
- Risk: Low. Effort: Low-Medium per moment.

**Phase 8 — Initial User Validation**
- Objective: everything in §26.
- Dependencies: all prior phases at least partially complete, AI-evaluation harness (§25) in place before real users see AI-generated content.
- Risk: Low (this is measurement, not construction). Effort: Medium (building the measurement, not the product).

---

## 23. Database Change Plan

| Change | Classification | Notes |
|---|---|---|
| `InspectionFinding.warrantyId` / `insurancePolicyId` (nullable FKs) | **Additive** | Closes the biggest concrete data-model gap found (§16, §18 #8) |
| `RiskAssessmentReport.confidence` / `confidenceBasis` | **Additive** | Closes the most-visible confidence gap |
| Unified Recommendation read-model (Phase 2) | **No DB change** | Pure projection over existing tables |
| Recommendation-lifecycle unification (dismiss/snooze) | **No DB change initially** | Wrap existing per-system fields in a shared service; only add a shared table if the wrapper proves insufficient |
| `ChecklistItem` retirement | **Significant refactor, staged** | Finish migrating remaining callers, then drop — do not do this in one step |
| Household model consolidation | **Avoid for now** | Needs a product decision on canonical model before any schema work — flagged, not scheduled |
| `DecisionRecord` shared base for Coverage/Ownership/Refinance decisions | **Avoid for now** | Lower priority; the *service*-level pattern reuse (Phase 4) delivers most of the value without a schema merge |
| New confidence fields elsewhere (`PropertyClimateSetting`, etc.) | **Additive, low priority** | Nice-to-have, not blocking |
| Any Skill Registry schema changes | **No DB change** | Skill definitions are code-owned (TypeScript), not DB rows — keep it that way per the FRD's own design |

Every change on this list except the two explicitly-avoided items is additive. Nothing in this audit justifies a significant/avoid-tier schema change to unblock the target architecture.

---

## 24. Recommended First 10 Engineering Tasks

1. **Confirm and remove dead AI surfaces, and fix Property Appreciation's silently-broken grounding.** Grep-confirm zero live callers of `/api/gemini/chat` (`groundedAsk.service.ts`), `taxAppeal.routes.ts`, and the Home Renovation Risk Advisor frontend page; remove or formally 410-deprecate. In the same cleanup pass, either implement a real search call for Property Appreciation's dead `declare const google` grounding block or remove it and correct the UI copy so it stops implying live-web grounding that doesn't happen. *Files:* `apps/backend/src/routes/gemini.routes.ts`, `taxAppeal.routes.ts`, `apps/backend/src/homeRenovationAdvisor/*`, `apps/frontend/src/app/(dashboard)/dashboard/home-renovation-risk-advisor/`, `apps/backend/src/services/propertyAppreciation.service.ts`. *Completion criteria:* routes return 410 or are removed, no active Gemini spend from dead paths, and the appreciation grounding claim matches what the code actually does.

2. **Add rate limiting to the 5 unprotected AI-backed routes.** Apply `expensiveAiRateLimiter`/`aiOracleRateLimiter` to `movingConcierge.routes.ts`, `propertyAppreciation.routes.ts`, `taxAppeal.routes.ts` (if not removed by task 1), `inspectionReport.routes.ts`, `homeModification.routes.ts`. *Completion criteria:* each route imports and applies a rate limiter; verified via a test hitting the limit.

3. **Close two "already computed, never shown" gaps found in this audit's evidence review.** (a) Render `homeAction.contract.ts`'s existing `options`/`tradeoffs` fields in `UnifiedHomeSurface.tsx` — the data is already required by schema validation for material-financial/regulated-coverage actions and simply isn't rendered. (b) Feed `propertyRadarCompoundInsight` (already reconciled and persisted by `radarCompoundInsight.service.ts`) into `homeActions.service.ts`'s candidate sources, so an already-computed compound insight (e.g. incoming freeze + overdue HVAC filter) reaches the canonical Home feed instead of only Home Event Radar's own view. *Files:* `apps/frontend/src/components/home/UnifiedHomeSurface.tsx`, `apps/backend/src/services/homeActions.service.ts`, `apps/backend/src/modules/homeEventRadar/services/radarCompoundInsight.service.ts`. *Completion criteria:* a material-financial home action's card shows its alternatives/trade-offs; a homeowner with an active compound insight sees it as a ranked Home Action, not only inside Radar.

4. **Add `confidence`/`confidenceBasis` to `RiskAssessmentReport`.** *Files:* `prisma/schema.prisma`, `services/RiskAssessment.service.ts`, `utils/riskCalculator.util.ts`, `PropertyRiskScoreCard.tsx`. *Completion criteria:* schema field added, calculator populates it, card renders a confidence indicator.

5. **Add nullable `warrantyId`/`insurancePolicyId` FKs to `InspectionFinding`.** *Files:* `prisma/schema.prisma`, `inspectionHub.service.ts` (wire population where determinable). *Completion criteria:* schema pushed, at least the "accept as work" flow attempts to link an existing warranty/policy when unambiguous.

6. **Register Claims Assistance and Home Buyer Task Tracking in the capability-discovery registry.** *Files:* `apps/backend/src/productFramework/capabilities/definitions/*.ts` (add two new definitions with `primaryJob` tags). *Completion criteria:* both appear in `/dashboard/home-tools` and capability-suggestion surfaces.

7. **Introduce `HomeActionsService.buildContextFromPropertyContext()` and migrate its property/asset queries off raw Prisma.** *Files:* `services/homeActions.service.ts` (lines identified in the Home Context research pass), `modules/propertyContext/application/getPropertyContext.ts`. *Completion criteria:* the identified direct `prisma.property`/`prisma.inventoryItem` calls in `homeActions.service.ts` are replaced with context-layer calls; existing tests still pass.

8. **Collapse the worst 3-hop redirect chains to single redirects.** *Files:* `next.config.js`, delete the now-fully-dead `page.tsx` files identified in this audit and the wiki (`ActionsClient.tsx`, `ResolutionCenterClient.tsx`, `PropertyOrchestrationStrip.tsx`, `PriorityAlertBanner.tsx`, `MorningHomePulseCard.tsx`, `HomePulse.tsx`, `RightSidebar.tsx`, `CommunityEventsCard.tsx`). *Completion criteria:* each old URL redirects in one hop; dead component files removed; build passes.

9. **Build the Unified Recommendation read-model adapter (Phase 2).** *Files:* new `services/recommendationReadModel.service.ts` projecting `PersonalizedRecommendation`, `PropertyRadarMatch`, `PropertyHiddenAssetMatch`, `GuidanceSignal` into one shape; no schema change. *Completion criteria:* a single function returns a normalized list from all four sources with source/confidence/priority preserved.

10. **Stand up the first AI-content-quality evaluation, extending the existing golden-fixture pattern.** Pick the single Gemini-backed feature with the most self-contained, checkable output (DIY AI Guide already has a Zod schema and token tracking, and an existing structural test — `apps/backend/tests/unit/diyAiGuideGeneration.test.js` — to extend, not replace). *Files:* extend `diyAiGuideGeneration.test.js` (or add a sibling `diyAiGuideContentQuality.test.js` following the same style as `savingsBenefitsGoldenFixtures.test.js`), `services/diyAiGuide.service.ts`. *Completion criteria:* a test exists that generates a guide for a fixed input and asserts on *content* properties (step count, required fields present, no hallucinated tool/material outside a plausible set) — not just JSON well-formedness, which the existing test already covers. This is the seed of §25's larger suite. As a related quick win in the same pass, aggregate the existing home-action suppression events (`homeActionUsefulnessFeedback.service.ts`) — already real, already consumed by Ask and proactive delivery — plus Ask's and personalization's feedback into a single `adminAnalytics` read, so a signal that already exists per-user becomes visible in aggregate.

---

## 25. Suggested Synthetic Evaluation Suite

**Important correction to the audit's own starting assumption: a synthetic-household suite already exists and should be extended, not replaced.** `docs/property-context/phase8-archetypes.example.json` defines 10 real archetypes (`detached-owner-aging`, `condo-association-exterior`, `condo-balcony-unit-hvac`, `townhouse-owner-yard`, `townhouse-association-managed`, `landlord-managed-rental`, `vacant-renovation`, `newer-no-overdue`, `older-findings-warranty`, `storm-drainage-exposed`), each with `expectedFacts`/`expectedDecisionStatuses`, and an automated counterpart (`apps/backend/tests/unit/phase8ArchetypeExitGate.test.js`) already asserts applicability decisions against them across Protection/Financial/Planning/Aggregation context evaluators. This existing suite tests a **structural/responsibility axis** — does feature X even apply to a home shaped like Y (condo vs. detached, owner vs. landlord-managed, association vs. self-managed). It's real, automated, and a genuinely good foundation — do not build a second, parallel synthetic-household framework.

What's missing, and what the ten scenarios below actually add, is a **temporal/signal-state axis** the existing suite doesn't cover: given a structurally-eligible home, does the *history and current signal mix* on that property produce the right prioritization and recommendation content. The cleanest path is to layer these ten signal-state scenarios onto the existing archetypes (e.g., run "aging roof, no recent inspection" against both `detached-owner-aging` and `older-findings-warranty`) rather than inventing ten unrelated new fixtures.

Each scenario below states "what should C2C identify / prioritize / recommend / explicitly ignore," meant to run against `homeActions.service.ts`'s ranked output (not just applicability status) and, where AI-generated content is involved, the actual generated text — closing the gap Blocker #4 identifies.

1. **New construction, <1 year old, complete inventory.** *Should identify:* almost nothing urgent — new-home warranty tracking, punch-list items if any. *Should ignore:* maintenance-age-based predictions (nothing is old enough to trigger them). *Tests:* the system doesn't manufacture urgency where none exists.
2. **30-year-old home, original systems, minimal inventory data.** *Should identify:* aging-system risk flagged as *inferred* (low confidence, no direct evidence) rather than stated as fact. *Should prioritize:* data-completeness nudges alongside any genuine risk signal. *Tests:* confidence/provenance distinction actually shows up in output, not just schema.
3. **Aging roof (>20 years, no recent inspection).** *Should identify:* roof-age risk. *Should recommend:* inspection, not replacement — the system shouldn't over-recommend action before evidence justifies it. *Tests:* Guidance's repair-vs-replace gate correctly requires verification evidence first.
4. **Old HVAC + upcoming freeze warning (compound scenario, tests Wow Moment #2).** *Should identify:* the compound risk, not two independent low-priority items. *Tests:* whether cross-source correlation actually happens or is currently missed (this is the open question flagged in §17 #2).
5. **High insurance premium relative to comparable coverage.** *Should identify:* a Risk Premium Optimizer opportunity. *Should recommend:* specific mitigation actions with modeled savings, not a generic "shop for insurance" nudge. *Tests:* Coverage/Risk Premium Optimizer integration quality.
6. **New buyer, mid-closing (Job 3 scenario).** *Should identify:* stage-appropriate closing-plan tasks only — not steady-state maintenance nudges for a home not yet owned. *Tests:* Buyer Plan's context-awareness of purchase stage; that Home Actions doesn't leak ownership-phase signals into a pre-close property.
7. **Preparing to sell, several open inspection findings and one unpermitted-work flag.** *Should identify:* Sale Case correctly blocks "material blockers" ahead of cosmetic items. *Should recommend:* resolve safety/permit issues before cosmetic staging spend. *Tests:* Sale Readiness's requirement-class ordering is actually followed, not just computed.
8. **High-maintenance property (many open tasks, several overdue).** *Should identify:* triage — the single most urgent item surfaced first, not all 15 overdue tasks presented with equal weight. *Tests:* the core "one thing that matters most" promise under a stress scenario (this is the most important test in the suite for this audit's central question).
9. **Minimal-data property (freshly onboarded, nothing confirmed beyond address).** *Should identify:* data-completeness as the primary "next step," not fabricated recommendations from absent data. *Should explicitly avoid:* any recommendation that requires a fact the system doesn't have (should show `UNKNOWN` state, not a guess presented as fact). *Tests:* the `KNOWN`/`UNKNOWN`/`CONFLICTED`/`STALE` fact-state contract is actually honored end-to-end, not just modeled in the schema.
10. **Conflicting records (e.g. self-reported roof-install year contradicts a permit record's roof-replacement date).** *Should identify:* the conflict itself as something worth surfacing (`CONFLICTED` state), not silently pick one value. *Tests:* whether `getPropertyContext`'s conflict-detection actually surfaces to any downstream consumer today, or dead-ends at the context layer — this audit did not verify that end-to-end and it's a meaningful open question.

---

## 26. Initial User Readiness Criteria

What must be true before the first 5 homeowners, without requiring perfection:

**Must-have:**
- Phase 3 (Attention Engine consolidation) does not need to be *complete*, but the homeowner-visible inconsistency between Home tab and Fix hub should be resolved or at minimum clearly explained in-product — two disagreeing "what matters most" answers is the single most damaging thing to show a first user.
- The AI-evaluation harness (§25, at minimum tasks 1-2 seeded) should exist before any AI-generated content (DIY guides, emergency triage, document extraction) is shown to a real user who isn't also an engineer who can catch a bad output.
- The 5 unprotected AI-backed routes (§18 #6) must be rate-limited before any external user has API access, full stop — this is a cost/abuse exposure, not a polish item.
- At least the top 3 redirect-chain issues should be collapsed — a first user hitting a 3-hop redirect on their first session is a bad first impression disproportionate to the fix effort.
- `LocalUpdate`'s population process must be identified and documented (or the widget removed) — showing a first user unexplained, unattributable content is a trust risk.

**Should-have, not blocking:**
- Household model consolidation (this is invisible to a single-user household, which the first 5 users likely are).
- Full Skill Platform coverage expansion (14 skills already cover the highest-value domains).
- The full 10-home synthetic suite (seed the highest-value 3-4 first: #8 triage-under-stress, #9 minimal-data, #4 compound-signal, #7 sale-readiness-ordering).

**Explicitly not required:**
- Perfection in visual/design consistency (real, documented, but orthogonal to intelligence readiness — the UI audit's own 90-day plan is a separate track).
- Graph database, vector store, or any other infrastructure this audit recommended against in §19.

---

## 27. Stop / Continue / Start

**STOP**
- Building new parallel "what does this property need" ranking logic. There are three; that's already two too many.
- Building new AI-chat entry points without first confirming whether an existing one (Ask, `/api/gemini/chat`) already covers the use case.
- Shipping AI-generated content changes without any evaluation harness watching for regressions — this has been true with zero safety net for a while and is worth stopping immediately, not on a future roadmap.
- Leaving dead frontend surfaces (`ActionsClient.tsx` and siblings) in the tree "for later" — each one left in place is a future engineer's wasted investigation.
- Introducing new registries/catalogs for organizing capabilities. There are already three (capability discovery, guidance templates, Skill Registry) converging on one job-taxonomy; a fourth would make the convergence harder, not easier.

**CONTINUE**
- The Property Context / Home Memory architecture effort (`docs/property-context/`) — this is genuinely well-designed work, executed with real discipline (the PHASE0-8 consolidation history shows follow-through, not just planning). Keep pushing adoption.
- The Skill Platform build-out — 14 packages in beta with real orchestrator integration is a strong foundation; the FRD's own phased approach (SP0-SP5, with production-readiness explicitly deferred) is the right sequencing.
- The financial-assumption-envelope pattern (`AssumptionSet`) — this is the best "decision infrastructure" example in the codebase; keep extending its reach.
- The trust-UI component library (`components/trust/`) and Personalization's context-map — genuinely differentiated, genuinely live, keep investing here rather than starting a second trust pattern.
- Provenance/confidence-labeling discipline where it already exists (Break-Even's FHFA-vs-heuristic labeling, `PropertyFactEvidence`) — hold this up as the internal standard for every other integration.

**START**
- Reconciling the three ranking authorities into one (§18 #1, §22 Phase 3) — the single highest-leverage piece of work identified in this entire audit.
- An AI-output evaluation harness, seeded with the single most-instrumented feature (DIY AI Guide) and expanding from there (§18 #4, §24 task 10, §25).
- Enforcing `getPropertyContext` adoption as a code-review norm for any new or touched service that needs "what does this property look like" (§18 #7).
- A lightweight, additive fix for the two most concrete data-model gaps found: `RiskAssessmentReport` confidence, and `InspectionFinding`↔Warranty/InsurancePolicy FKs (§24 tasks 4-5).
- A product decision (not a code decision) on the Household model duplication and on `LocalUpdate`'s data-population process — both are decisions for the user/product owner, flagged here rather than resolved unilaterally.

---

*End of report. All six research threads (Home Context/data model, AI/LLM architecture, Skill Platform, the attention-ranking mechanism, and testing/instrumentation readiness) completed and are incorporated above. Every finding is marked OBSERVED unless explicitly flagged INFERRED or NOT VERIFIED — where a deep-dive agent ran out of time on a specific sub-question, that gap is stated plainly in the relevant section (e.g., whether `PropertyRadarCompoundInsight` is populated by any job, §17 #2; the exact snooze-cap enforcement location, §8) rather than papered over.*
