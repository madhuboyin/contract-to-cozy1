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

For **Job 1** specifically, the concrete architecture is: **signals (maintenance predictions, radar events, recalls, coverage gaps, savings matches, personalization recommendations) → Home Actions ranking (`homeActions.service.ts`, the orchestration layer) → a single ranked attention feed → execution.** That's the real backend shape behind "tell me what needs my attention" — see [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md#orchestration-next-best-action--home-actions) for the ranking and current explanation surfaces.

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

**Note on scope:** this loop is a product principle for reading the wiki, not a claim that every feature below implements every stage end-to-end today. Some clusters (Personalization, the onboarding trigger-first flow) already run the full loop live; others implement only part of it (e.g. Property Tax appeals mostly stop at "explain," HOA compliance is pure record-keeping with no identify/prioritize step). The older orchestration decision-trace route and UI are absent from the current route and render trees — see [Known implementation alignment issues](#known-implementation-alignment-issues). Each feature page calls out current implementation vs. planned direction where that distinction matters.

| Loop stage | What it means | Capability clusters that do this |
|---|---|---|
| **Understand** | Build context on the home with minimal homeowner typing | [Onboarding & Property Setup](features/01-onboarding-and-property-setup.md), [Inventory, Documents & Home Records](features/02-home-health-inventory-and-maintenance.md) |
| **Identify** | Detect signals that could matter | Maintenance predictions & seasonal checklists, [Home Event Radar, recalls, environment reports](features/06-home-events-environment-and-community.md), coverage gaps, savings/benefits matches, refinance opportunities ([Coverage, Risk & Financial Tools](features/04-coverage-risk-and-financial-tools.md)) |
| **Prioritize** | Rank what deserves attention first | Home Actions ranking and source-backed explanations (see [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md)) |
| **Explain / Recommend / Decide** | Say why it matters and what to do, with confidence and evidence made explicit | Guidance Engine journeys, Ask Cozy, Personalization's "why this home" explanations, Property Brief/Home Briefing, coverage/negotiation/quote-comparison decision tools ([Guidance page](features/03-guidance-ai-concierge-and-personalization.md), [Coverage & Financial Tools](features/04-coverage-risk-and-financial-tools.md)) |
| **Execute** | Do nothing yet, monitor, DIY, create a task, contact a third party, or book a provider | Tasks, DIY projects, provider bookings ([Execution, Providers & Services](features/05-marketplace-providers-and-services.md)) — the provider marketplace is **one execution path among several**, not the product's center |
| **Record / Learn** | Keep a durable trail of what happened so future guidance improves | Home Records/Documents, Home Digital Will, Outcome tracking on Savings & Benefits and Personalization, Property Brief/Home Briefing |
| **Life events** | Apply the whole loop inside a major transition | [Sale, Buyer & Life Transitions](features/07-sale-buyer-and-life-transitions.md) — buying, selling, moving, refinancing each run their own version of understand→identify→explain→execute→record |

Platform infrastructure — the [admin console, audit log, capability governance, and background job system](features/08-admin-analytics-and-platform-operations.md) — doesn't sit inside this loop as a homeowner-facing stage; it's what makes the loop trustworthy and operable at scale (evidence retention, kill-switches, governed rollouts).

## Trust: how C2C answers "why am I seeing this?"

The live Home Actions feed supplies reasons and source evidence. `/dashboard/resolution-center` projects that feed into decisions, missing-information cases, and exceptions; its expandable “Why this matters & details” section displays the action explanation, outcome, related actions, and source chips. Personalization has a separate context map for the property and consented profile facts behind its recommendations. The older `OrchestrationDecisionTrace` model remains in Prisma, but the standalone orchestration route and decision-trace drawer described by an earlier wiki revision are absent from current route/render paths.

## Known implementation alignment issues

The points below are based on current source paths and describe implementation boundaries relevant to future work. They do not imply runtime validation.

- **Home Actions is the shared backend source for Home and Resolution Center.** The Home tab reads `GET /api/properties/:propertyId/home`; Resolution Center reads `GET /api/properties/:propertyId/home-actions` and projects the actions into cases. `getHomeActionFeed()` calls `getOrchestrationSummary()` inside the backend, so orchestration is still a live dependency. The older `/api/orchestration/*` route and its decision-trace UI are absent; a future decision-trace feature needs a current route and a reachable UI.
- **The navigation entry is direct.** “Plan & Projects” links to `/dashboard/resolution-center`, whose page renders `ResolutionCenterClient`. The old `/dashboard/actions` and property `/fix` pages are absent. Resolution Center links accepted work and routine upkeep to Home Operations; its own cases focus on decisions, missing information, and exceptions.
- **Route consolidation:** `next.config.js` redirects several older Vault, Save, and Protect URLs to consolidated entry points. Resolve the redirect chain before using an old deep link as a feature entry point; the corresponding feature pages document known destinations.
- **MEDIUM — Three separate property/onboarding entry points** exist for "add or set up a home": the trigger-first wizard (`/onboarding/*`), the per-property Setup Checklist (`/dashboard/properties/[id]/onboarding`), and a longer manual creation form (`/dashboard/properties/new`) reachable from `PropertySetupBanner`. Each is real and reachable, not legacy — see [Onboarding, Auth & Property Setup](features/01-onboarding-and-property-setup.md#property-setup-checklist-5-step-wizard). Having three live paths into "Understand the home" makes it harder for the product to present onboarding as one coherent first-run experience.
- **MEDIUM — Buyer Plan and Claims Assistance are absent from the capability/tool-discovery registry.** Neither `buyer-plan` nor `claims` appears among the 46 capabilities in `productFramework/capabilities/definitions/*.ts`, so neither gets a `primaryJob` tag, capability-suggestion surfacing, or "Explore all tools" search visibility. Buyer Plan is largely compensated for elsewhere — `dashboard/page.tsx` swaps the entire Home tab to a dedicated `BuyerClosingHome` component for buyer-context properties — but Claims Assistance (see [Coverage, Risk & Financial Tools](features/04-coverage-risk-and-financial-tools.md#claims-assistance)) has no comparable treatment: it's a real, live feature with no discoverable entry point outside a direct link.
- **Legacy orchestration artifacts:** Prisma retains `OrchestrationDecisionTrace` and some orchestration components remain in the tree, but no current orchestration route or reachable decision-trace UI was found. Do not equate these artifacts with a live endpoint.


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
- **Guidance, Ask Cozy & personalization** — the decision-support layer: an execution-oriented "Ask Cozy" interface, a guidance engine for issue-specific journeys, Home Actions ranking with action explanations, and an explicit-consent personalization engine. Mostly deterministic rules and ranking; Gemini is used narrowly (chat, room-scan/OCR extraction, a few advisors) and each feature page names exactly where.
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
