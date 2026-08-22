# Contract to Cozy — Wiki

> **Contract to Cozy (C2C) is a homeowner decision and action platform that continuously understands the home, identifies what matters, explains what to do, and helps the homeowner execute it.**

It exists for homeowners who don't want to check a dozen separate systems to know what their house needs, what to do about it, or how to get through the big moments of owning it — from a Tuesday maintenance nudge to a home purchase closing. C2C does that for them: it builds context on the home, watches for what matters (maintenance, recalls, weather, coverage gaps, savings, deadlines), explains why something matters and what to do about it, and helps them act — whether that's doing nothing yet, doing it themselves, or booking a provider. It does this for three recurring jobs: **daily attention** ("what needs me right now"), **decisions** ("help me choose," whenever one comes up), and **life events** (buying, selling, moving, renovating, refinancing) — and a single capability can serve more than one job depending on what the homeowner is trying to do in the moment (a coverage gap might be a Job 1 nudge today and the center of a Job 2 decision next week). One repeating loop threads all of it together:

```
UNDERSTAND the home → IDENTIFY what matters → PRIORITIZE it → EXPLAIN why
    → RECOMMEND/DECIDE what to do → EXECUTE it → RECORD what happened → understand better next time
```

The feature clusters below (inventory, insurance, the provider marketplace, weather radar, life-event workspaces, and the rest) are each a slice of that one loop, not standalone products — see **[Introduction](00-introduction.md)** for the full three-jobs/loop breakdown and a map of which cluster plays which role. Provider bookings, in particular, are **one execution path among several** (do nothing / monitor / DIY / contact a third party / book a provider) — not the product's center.

This is also a ground-truth technical reference: every feature page was written by reading the current backend routes/controllers/services and frontend pages/components directly — not by trusting the large pile of historical planning docs in `docs/functional/` and `docs/product/`, which are often stale, superseded, or aspirational relative to what's actually shipped. Where a page notes something as "planned" or "not confirmed live," that means the code path couldn't be found wired into a real route, job, or UI.

Read it roughly in order: orientation first, then the feature clusters in the sequence a homeowner actually encounters them.

## Orientation

1. **[Introduction](00-introduction.md)** — the canonical product definition, the three homeowner jobs, the decision & action loop, who uses C2C (Homeowner / Provider / Admin), and how the capability clusters map onto the loop.
2. **[Getting Started](01-getting-started.md)** — environment setup, running the app locally (Docker or standalone), database/Prisma workflow, seeded test users, tests, lint, and deployment commands.
3. **[Architecture & Data Model](02-architecture-and-data-model.md)** — monorepo layout, backend (Express) and frontend (Next.js) architecture, the BullMQ workers system, the Prisma data model grouped into ~18 domains, authentication/authorization, and deployment topology (Raspberry Pi k3s).

## Feature Guide

Each page below documents its cluster for both audiences at once — what the feature does for the user, and how it's implemented — grounded in the live code.

4. **[Onboarding, Auth & Property Setup](features/01-onboarding-and-property-setup.md)** — *Understand · Jobs 1–3* — registration, login, MFA, the property onboarding wizard(s), household roles & invites, and provider registration. The funnel every user passes through first.
5. **[Home Health, Inventory & Maintenance](features/02-home-health-inventory-and-maintenance.md)** — *Understand, some Identify · mainly Job 1* — inventory/appliances, maintenance tasks & seasonal checklists, AI room scan/visual inspection, inspections, the document vault, and daily home-status surfaces.
6. **[Guidance, AI Concierge & Personalization](features/03-guidance-ai-concierge-and-personalization.md)** — *Prioritize, Explain, Recommend/Decide · mainly Job 2* — the "Ask" concierge, the Guidance Engine, orchestration/next-best-action with decision-trace explainability, personalization, tool discovery, the knowledge hub, and the Home Score → Property Brief lineage.
7. **[Coverage, Risk & Financial Tools](features/04-coverage-risk-and-financial-tools.md)** — *Identify, Explain, Decide · Jobs 1 & 2* — insurance policy tracking & coverage analysis, risk/premium optimization, Hidden Savings & Benefits, ownership cost/budget/financing modeling, property tax & appeals, negotiation coaching, quote comparison, and claims tracking.
8. **[Execution, Providers & Services](features/05-marketplace-providers-and-services.md)** — *Execute · Jobs 1–3* — provider registration/credentials, the full booking lifecycle, service pricing, DIY projects, permits, renovation advisory, and the separate provider-side app.
9. **[Home Events, Environment & Community](features/06-home-events-environment-and-community.md)** — *Identify · mainly Job 1* — Home Event Radar & product recalls, severe weather alerts, environment reports, HOA compliance, neighborhood intelligence, local updates/community events, and emergency help.
10. **[Sale, Buyer & Life Transitions](features/07-sale-buyer-and-life-transitions.md)** — *whole loop · Job 3* — sell/hold/rent decisions, sale readiness & seller prep, home buyer task tracking, mortgage refinance radar, moving concierge, and the home digital will.
11. **[Admin, Analytics & Platform Operations](features/08-admin-analytics-and-platform-operations.md)** — *governance infrastructure, not a homeowner job* — the internal admin console (~20 route files behind role + capability gating), background jobs/work queues, platform notifications, and the (mostly retired) Home Gazette module.

## Notable things worth knowing

These surfaced while grounding every page in live code, and are worth being aware of independent of the wiki content itself:

- **`apps/CLAUDE.md` understates the codebase size**: it's ~126 backend route files (not "52" — this count drifts by one file from time to time; re-count if precision matters) and the Prisma schema has 505 models (not "30+"). Flagged on the [Architecture](02-architecture-and-data-model.md) page, which also corrects a stale services count and Next.js version.
- **Two systems are effectively retired but still present in code**: Home Gazette (nearly every route returns `410`, replaced by Home Briefing) and the legacy Composite Home Score / `propertyScoreSnapshot` routes (also `410`, replaced by Property Brief / Status Board).
- **Some features exist only behind acceptance-test flags**: e.g. `app/acceptance/home-buyer-lifecycle` and `.../mortgage-refinance-radar/home-actions` require an env var fixture to render — the real production surfaces live elsewhere (`/dashboard/properties/[id]/buyer-plan`, `.../tools/mortgage-refinance-radar`).
- **Naming collisions to watch for**: "Home Event Radar" (hazard feed) vs. `homeEvents.routes.ts` (a property history timeline) are unrelated; `/dashboard/risk-radar` silently redirects into Home Event Radar; two separate quote-comparison surfaces (service quotes vs. insurance quotes) share similar names but different backends.
- **A dual maintenance-task system exists on purpose**: the legacy `ChecklistItem` model is explicitly deprecated in code in favor of `PropertyMaintenanceTask` — see the [Home Health](features/02-home-health-inventory-and-maintenance.md) page.
- **A frontend nav/UX audit found the orchestration-summary / decision-trace system — real, backend-complete, and previously described in this wiki as "live" — has zero live frontend consumers**: every one of its 7 frontend call sites is dead code or a discarded computation, so no homeowner can currently open a decision trace. The Home tab (canonical feed) and the Fix hub (a separate `resolution-center` service) remain the two genuinely live implementations of "what does this property need." See [Known implementation alignment issues](00-introduction.md#known-implementation-alignment-issues) on the Introduction page for this and related findings (three onboarding entry points, Buyer Plan/Claims missing from the tool-discovery registry).

---
Generated from the codebase as of 2026-08-22. Re-run a page's research if the underlying feature changes significantly, since these are snapshots, not live documentation.
