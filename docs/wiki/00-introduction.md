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

**Note on scope:** this loop is a product principle for reading the wiki, not a claim that every feature below implements every stage end-to-end today. Some clusters (Personalization, Orchestration/decision-trace, the onboarding trigger-first flow) already run the full loop live; others implement only part of it (e.g. Property Tax appeals mostly stop at "explain," HOA compliance is pure record-keeping with no identify/prioritize step). Each feature page calls out current implementation vs. planned direction where that distinction matters.

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

Where implemented, C2C's recommendations carry their own evidence trail rather than asking the homeowner to take a suggestion on faith: Orchestration's decision trace (`OrchestrationDecisionTrace`, rendered via `DecisionTraceDrawer`), Personalization's context-map (property signals vs. confirmed profile facts vs. active recommendations, with an explicit "your answers changed the order, not the safety rules"), and the `components/trust/` badge library (confidence, source, risk-of-delay, estimated savings) reused across Orchestration, Guidance, and the Resolution Center. This is real, code-verified architecture, not aspirational — see [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md#orchestration-next-best-action--home-actions) for the specifics. Not every tool in the wiki has this level of explainability yet; where a tool is a plain calculator or a self-reported record, the relevant feature page says so directly.

## Known implementation alignment issues

These are flagged here because they cut against the one-loop, one-product model this page describes — they're **product/engineering follow-ups, not documentation gaps**. The wiki accurately describes what exists; the code itself has two areas where more than one implementation of the same job is live at once:

- **Three separate property/onboarding entry points** exist for "add or set up a home": the trigger-first wizard (`/onboarding/*`), the per-property Setup Checklist (`/dashboard/properties/[id]/onboarding`), and a longer manual creation form (`/dashboard/properties/new`) reachable from `PropertySetupBanner`. Each is real and reachable, not legacy — see [Onboarding, Auth & Property Setup](features/01-onboarding-and-property-setup.md#property-setup-checklist-5-step-wizard). Having three live paths into "Understand the home" makes it harder for the product to present onboarding as one coherent first-run experience.
- **Two parallel Home Actions APIs** back the Job 1 ranked-attention feed: `GET /api/orchestration/summary/:propertyId` and the newer canonical `GET /api/properties/:propertyId/home-actions` / `/home` — both live, both wired to controllers, and it wasn't confirmed from code which one is the dashboard's actual primary data source. See [Guidance, Ask Cozy & Personalization](features/03-guidance-ai-concierge-and-personalization.md#orchestration-next-best-action--home-actions). This directly affects whether the Job 1 architecture statement above resolves to one ranked feed in practice or two that could drift apart.

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
