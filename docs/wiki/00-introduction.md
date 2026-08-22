[← Back to Wiki Home](README.md)

# Introduction

## What is Contract to Cozy?

> **Contract to Cozy (C2C) is a homeowner decision and action platform that continuously understands the home, identifies what matters, explains what to do, and helps the homeowner execute it.**

That's the product. Every homeowner-facing capability documented in this wiki — inventory tracking, insurance analysis, the provider marketplace, weather radar, refinance monitoring, life-event workspaces — exists to serve that one system, not as a standalone product in its own right. (The admin/platform-operations cluster is the one exception: it's governance infrastructure underneath the loop, not a homeowner-facing capability — see the note at the end of the loop table below.) Read the rest of this page as: three jobs C2C does for a homeowner, one loop it runs to do them, and a map of which capability clusters play which role in that loop.

## Three homeowner jobs

Every homeowner-facing capability in C2C ultimately serves one of three jobs — often more than one at once, since which job a capability is serving depends on the homeowner's intent in the moment, not the capability itself:

| Job | The homeowner's question | Examples |
|---|---|---|
| **1 — Daily** | "Tell me what needs my attention." | Maintenance due, a product recall on something they own, a severe-weather alert, an insurance gap, a savings opportunity, a permit deadline |
| **2 — Whenever needed** | "Help me make the right home decision." | Repair vs. replace, DIY vs. hire, is this quote fair, shop for new insurance, refinance now or wait, sell vs. hold vs. rent |
| **3 — Life events** | "Guide me through something major." | Buying a home, closing, moving, a major repair, a renovation, an insurance claim, preparing to sell, selling |

A homeowner shouldn't have to know which of dozens of tools answers a given question — C2C's job is to route the right context, at the right time, to whichever of these three needs is live. The same capability can show up under more than one job depending on context: Coverage Intelligence surfacing a protection gap is a Job 1 nudge; a homeowner opening that same tool to decide whether to shop for new insurance is Job 2. Home Event Radar flagging a freeze warning is Job 1; a homeowner using it to decide whether to winterize before a trip is Job 2. The capability doesn't change — the homeowner's intent in the moment determines which job it's serving.

For **Job 1** specifically, the concrete architecture is: **signals (maintenance predictions, radar events, recalls, coverage gaps, savings matches, personalization recommendations) → Home Actions ranking (`homeActions.service.ts`, the orchestration layer) → a single ranked attention feed → execution.** That's the real backend shape behind "tell me what needs my attention" — see [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md#orchestration-next-best-action--home-actions) for the ranking/decision-trace detail.

**This three-jobs model isn't just this wiki's interpretation — the frontend independently encodes the same split in code.** The tool-discovery capability registry (`apps/backend/src/productFramework/capabilities/definitions/*.ts`, consumed by `apps/frontend/src/features/tools/capabilityTypes.ts`) tags every one of its 46 registered capabilities with a `primaryJob: 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT'` value, and the primary nav (`apps/frontend/src/lib/navigation/jobsNavigation.ts`) is a 5-item, job-oriented consolidation (Home / Plan & Projects / Home Record / Ask / Profile & Settings) sitting on top of roughly 50 legacy route directories — not a flat catalog. See [Known implementation alignment issues](#known-implementation-alignment-issues) below for where that alignment currently breaks down in practice.

## The decision & action loop

C2C's capabilities are best understood by the role they play in one repeating loop, not as an independent list:

```
UNDERSTAND the home
    → IDENTIFY what matters
    → PRIORITIZE it
    → EXPLAIN why it matters
    → RECOMMEND / DECIDE what to do
    → EXECUTE it
    → RECORD what happened
    → (which improves how well C2C understands the home next time)
```

**Note on scope:** this loop is a product principle for reading the wiki, not a claim that every feature below implements every stage end-to-end today. Some clusters (Personalization, the onboarding trigger-first flow) already run the full loop live; others implement only part of it (e.g. Property Tax appeals mostly stop at "explain," HOA compliance is pure record-keeping with no identify/prioritize step). Orchestration's decision-trace mechanism specifically is built but currently unreachable from the live app — see [Known implementation alignment issues](#known-implementation-alignment-issues). Each feature page calls out current implementation vs. planned direction where that distinction matters.

| Loop stage | What it means | Capability clusters that do this |
|---|---|---|
| **Understand** | Build context on the home with minimal homeowner typing | [Onboarding & Property Setup](features/01-onboarding-and-property-setup.md), [Inventory, Documents & Home Records](features/02-home-health-inventory-and-maintenance.md) |
| **Identify** | Detect signals that could matter | Maintenance predictions & seasonal checklists, [Home Event Radar, recalls, environment reports](features/06-home-events-environment-and-community.md), coverage gaps, savings/benefits matches, refinance opportunities ([Coverage, Risk & Financial Tools](features/04-coverage-risk-and-financial-tools.md)) |
| **Prioritize** | Rank what deserves attention first | Home Actions / Orchestration ranking + decision trace (see [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md)) |
| **Explain / Recommend / Decide** | Say why it matters and what to do, with confidence and evidence made explicit | Guidance Engine journeys, Ask Cozy, Personalization's "why this home" explanations, Property Brief/Home Briefing, coverage/negotiation/quote-comparison decision tools ([Guidance page](features/03-guidance-ai-concierge-and-personalization.md), [Coverage & Financial Tools](features/04-coverage-risk-and-financial-tools.md)) |
| **Execute** | Do nothing yet, monitor, DIY, create a task, contact a third party, or book a provider | Tasks, DIY projects, provider bookings ([Execution, Providers & Services](features/05-marketplace-providers-and-services.md)) — the provider marketplace is **one execution path among several**, not the product's center |
| **Record / Learn** | Keep a durable trail of what happened so future guidance improves | Home Records/Documents, Home Digital Will, Outcome tracking on Savings & Benefits and Personalization, Property Brief/Home Briefing |
| **Life events** | Apply the whole loop inside a major transition | [Sale, Buyer & Life Transitions](features/07-sale-buyer-and-life-transitions.md) — buying, selling, moving, refinancing each run their own version of understand→identify→explain→execute→record |

Platform infrastructure — the [admin console, audit log, capability governance, and background job system](features/08-admin-analytics-and-platform-operations.md) — doesn't sit inside this loop as a homeowner-facing stage; it's what makes the loop trustworthy and operable at scale (evidence retention, kill-switches, governed rollouts).

## Trust: how C2C answers "why am I seeing this?"

Where implemented, C2C's recommendations carry their own evidence trail rather than asking the homeowner to take a suggestion on faith: Personalization's context-map (property signals vs. confirmed profile facts vs. active recommendations, with an explicit "your answers changed the order, not the safety rules"), and a `TrustStrip`/trust-badge pattern (`ConfidenceBadge`, `WhyThisMattersCard`, `SourceChip`) genuinely rendered across real, reachable pages — Guidance Overview, Service Price Radar, Hidden Asset Finder, Negotiation Shield, Status Board, Inventory, Rooms Hub, Protect, and the Fix hub (via `WinCard`). This part is real and live, not aspirational.

**Correction — the decision-trace mechanism specifically is not.** Orchestration's decision trace (`OrchestrationDecisionTrace`, rendered via `DecisionTraceDrawer`) was previously described here as "real, code-verified architecture, not aspirational." A frontend reachability audit found that's true only in the narrowest sense: the backend model, endpoint, and the drawer/panel/modal components genuinely exist and are well-built, but every frontend code path that could render them (`OrchestrationActionCard`, and the API client's `getOrchestrationDecisionTrace()`) has exactly one caller — `ActionsClient.tsx` at `/dashboard/actions` — which is permanently redirected away before it ever mounts (see [Known implementation alignment issues](#known-implementation-alignment-issues)). No homeowner using the live app today can reach a decision trace. This is a **shipped-but-orphaned** feature, not a live one — a meaningfully different claim than what this page said before. Not every tool in the wiki has explainability at this level even where it's reachable; where a tool is a plain calculator or a self-reported record, the relevant feature page says so directly.

## Known implementation alignment issues

These are flagged here because they cut against the one-loop, one-product model this page describes — they're **product/engineering follow-ups, not documentation gaps**. The wiki accurately describes what exists. This section was updated after a direct audit of the frontend navigation and dashboard composition against this product model (not just the backend routes) — see each item's severity; HIGH items are visible to a homeowner, not just an internal ambiguity.

> **Correction history:** this section has been revised twice as deeper verification found earlier drafts wrong. First draft: claimed the "Plan & Projects" nav tab renders `/dashboard/actions`'s own page directly. Second draft: corrected that (the real destination is the Fix hub via a redirect chain) but still claimed the orchestration-summary endpoint was "live as a narrow fallback signal" via `PropertyOrchestrationStrip`/`HomePulse`/`PriorityAlertBanner`/the dashboard wrapper. **That claim was also wrong** — every one of those consumers turned out to be dead code once checked for actual render reachability, not just for whether the file exists and calls the API. This is the corrected version, verified by checking, for each component: (a) does it import the API method, (b) is the component itself ever rendered anywhere in the tree, (c) if it computes a value, is that value ever read by JSX — not stopping at (a).

- **HIGH — The orchestration-summary / decision-trace system is fully built on the backend and has *zero* live frontend consumers today.** `GET /api/orchestration/summary/:propertyId` has exactly 7 call sites in the frontend; all 7 are dead:
  - `ActionsClient.tsx` (`/dashboard/actions`) — the route is permanently redirected away (`next.config.js`) before this page ever mounts.
  - `ResolutionCenterClient.tsx` (`/dashboard/resolution-center`) — that route now renders `JobHubRedirectPage` instead; this file has zero live importers.
  - `RightSidebar.tsx`, `PropertyOrchestrationStrip.tsx`, `PriorityAlertBanner.tsx`, `HomePulse.tsx` (via `MorningHomePulseCard.tsx`) — each has **zero importers anywhere in the frontend**.
  - `dashboard/page.tsx`'s own call (`orchestrationQuery`) feeds a local variable, `primaryActionHero`, that is assigned once and never read again — the JSX it builds (including a `WinCard` populated from the orchestration signal) is computed and then discarded; the network call fires, but nothing it returns ever reaches the screen.

  Downstream of this: `OrchestrationActionCard` and `DecisionTraceDrawer` — the wiki's flagship "decision trace" trust UI — are rendered from exactly one place, `ActionsClient.tsx`, which is itself dead per the above. The API client's `getOrchestrationDecisionTrace()` has zero callers anywhere. **No homeowner using the live app can currently open a decision trace, view an `OrchestrationActionCard`, or see any orchestration-summary-derived content, despite the backend model (`OrchestrationDecisionTrace`), endpoint, and a well-built component library all genuinely existing.** This is a shipped-but-orphaned feature, not a live one. See [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md#orchestration-next-best-action--home-actions) and the corrected [Trust](#trust-how-c2c-answers-why-am-i-seeing-this) section above.
- **Separately confirmed still live:** the Home tab's canonical feed (`GET /api/properties/:propertyId/home` via `homeActions.service.ts`, `UnifiedHomeSurface.tsx`) and the Fix hub's independent `resolution-center` service (`GET /api/properties/:id/resolution-center` via `resolutionCenter.service.ts`, which shares no code with either `homeActions.service.ts` or `orchestration.service.ts`) — reached from the real chain: sidebar "Plan & Projects" link → `/dashboard/actions` → (redirect) → `/dashboard/resolution-center` → (`JobHubRedirectPage`) → `/dashboard/properties/:id/fix`. These two are real, independent, and both genuinely render to homeowners — so the "one connected system" story rests on two implementations doing similar work with no shared logic, not three, and not the dead-and-therefore-moot third.
- **MEDIUM — The "Plan & Projects" nav tab's description overstates what its actual destination shows.** `jobsNavigation.ts` describes it as "Actions, decisions, projects, and major moments." Its real destination (the Fix hub) genuinely covers actions and decisions — confirmed via `resolutionCenter.service.ts`'s `decisionInsights`/`counts.decisionsReady`/`counts.openCases` fields and the Fix hub's "Decisions ready" KPI and "Intelligence & Decisions" section — but that service has zero references to projects, renovations, or life-event context; "Active major moment" and the Project Tracker live only on the Home tab and a separate `/dashboard/properties/:id/projects` route, not here.
- **MEDIUM — Three separate property/onboarding entry points** exist for "add or set up a home": the trigger-first wizard (`/onboarding/*`), the per-property Setup Checklist (`/dashboard/properties/[id]/onboarding`), and a longer manual creation form (`/dashboard/properties/new`) reachable from `PropertySetupBanner`. Each is real and reachable, not legacy — see [Onboarding, Auth & Property Setup](features/01-onboarding-and-property-setup.md#property-setup-checklist-5-step-wizard). Having three live paths into "Understand the home" makes it harder for the product to present onboarding as one coherent first-run experience.
- **MEDIUM — Buyer Plan and Claims Assistance are absent from the capability/tool-discovery registry.** Neither `buyer-plan` nor `claims` appears among the 46 capabilities in `productFramework/capabilities/definitions/*.ts`, so neither gets a `primaryJob` tag, capability-suggestion surfacing, or "Explore all tools" search visibility. Buyer Plan is largely compensated for elsewhere — `dashboard/page.tsx` swaps the entire Home tab to a dedicated `BuyerClosingHome` component for buyer-context properties — but Claims Assistance (see [Coverage, Risk & Financial Tools](features/04-coverage-risk-and-financial-tools.md#claims-assistance)) has no comparable treatment: it's a real, live feature with no discoverable entry point outside a direct link.
- **LOW — Stale/dead references and orphaned files left behind by the same nav-consolidation effort.** Confirmed dead (zero live importers, or computed-but-unrendered): `ActionsClient.tsx`, `ResolutionCenterClient.tsx`, `PropertyOrchestrationStrip.tsx`, `PriorityAlertBanner.tsx`, `MorningHomePulseCard.tsx`/`HomePulse.tsx`, `RightSidebar.tsx`, and the `primaryActionHero` local variable in `dashboard/page.tsx`. Also dead: `(dashboard)/layout.tsx`'s `job.key === 'fix'` conditional blocks (no entry in `PRIMARY_JOBS` has `key: 'fix'` anymore), and `jobsNavigation.ts`'s `'home-gazette'` engine key (Gazette is fully retired). None of this is user-visible — it's a consistent pattern of files and branches left over from before the 5-tab nav consolidation that were never deleted, large enough now (7+ files/branches, one entire subsystem) to be worth a dedicated cleanup pass rather than piecemeal removal.

## Who uses it

There are three system login roles (`UserRole`: `HOMEOWNER` / `PROVIDER` / `ADMIN`). "Buyer" is **not** a fourth role — it's a `HOMEOWNER` account whose property is in a buying/purchase context, unlocking a distinct set of buyer-side tools. It's called out as its own row below because it's a large enough journey to be a first-class concept in the product, even though technically it's a sub-category of `HOMEOWNER`.

| Role | What they do |
|---|---|
| **HOMEOWNER** (owner) | Sets up a property profile, tracks inventory/maintenance, gets guidance and risk/coverage insights, books services, and manages life events (selling, moving). |
| **HOMEOWNER → Buyer** | Same `HOMEOWNER` role, in a buying/closing context: home-buyer task tracking, closing-plan checklist, buyer-side inspection negotiation, and mortgage tools. See [Sale, Buyer & Life Transitions](features/07-sale-buyer-and-life-transitions.md). |
| **PROVIDER** | Registers a service business, manages credentials and service offerings, and fulfills bookings from homeowners. |
| **ADMIN** | Operates the platform internally — user/provider support, content moderation, analytics, background job monitoring, and platform configuration. |

## Capability clusters at a glance

Each cluster below is a *slice of the loop*, not an independent product. The mapping table above is the canonical version of this; this list is just the reading order the feature pages follow:

- **Home health & context** — inventory, appliances, maintenance tasks, seasonal checklists, inspections, and documents. Understands the home so other features don't have to ask the homeowner twice.
- **Guidance, Ask Cozy & personalization** — the decision-support layer: an execution-oriented "Ask Cozy" interface, a guidance engine for issue-specific journeys, orchestration/ranking with a decision trace, and an explicit-consent personalization engine. Mostly deterministic rules and ranking; Gemini is used narrowly (chat, room-scan/OCR extraction, a few advisors) and each feature page names exactly where.
- **Coverage & money** — insurance analysis, risk/premium optimization, savings & benefits discovery, ownership cost intelligence, budgeting, claims, and property tax tools. Mostly deterministic modeling over a shared, versioned assumption envelope, not AI.
- **Execution: providers & DIY** — provider discovery, bookings, service pricing, DIY projects, permits, and renovation advisory. One of several ways a decision gets executed — not the product's identity.
- **Situational awareness** — weather alerts, product recalls, HOA compliance, neighborhood intelligence, and community updates. The "identify what matters" engine.
- **Life transitions** — preparing to sell, buying a new home, moving, refinancing, and long-term digital records. The full loop applied inside a major event.
- **Platform operations** — an internal admin console, notifications, and background job automation (BullMQ workers). Governance/trust infrastructure underneath everything above, not a homeowner-facing job.

## How this wiki is organized

The wiki is meant to be read roughly in order, moving from "how do I run this" to "how does each part of the product work":

1. **[Getting Started](01-getting-started.md)** — run the app locally.
2. **[Architecture & Data Model](02-architecture-and-data-model.md)** — how the codebase and data are structured.
3. **Feature guide** (`features/`) — one page per capability cluster, each covering both the user-facing flow and its implementation, roughly in the order a homeowner encounters them: onboarding → home health/context → guidance & decisions → money & coverage → execution (providers/DIY) → situational awareness → life transitions → admin/platform.

See the **[Wiki Home](README.md)** for the full table of contents.

---
[← Back to Wiki Home](README.md)
