# Documentation Library

A searchable map of everything under `docs/` (313 files, snapshot 2026-09-24). Start here instead of scanning raw folders.

> This complements [`../wiki/`](../wiki/README.md), a code-grounded feature snapshot. **Use the wiki to locate the relevant workflow, then verify its route, service, schema, and render path before changing behavior. Use this library to find the governing requirement, plan, ADR, audit, or runbook and its review flags.**

## Find something

| I want to... | Go to |
|---|---|
| Find docs about a feature/area | the area table below |
| Find all runbooks / all ADRs / all FRDs | [BY-TYPE.md](BY-TYPE.md) |
| Decide which requirement governs | [AUTHORITY.md](AUTHORITY.md) |
| Change or retire product behavior | [CHANGE_POLICY.md](CHANGE_POLICY.md) |
| Review FRD authority and unresolved requirement families | [REQUIREMENTS_REVIEW.md](REQUIREMENTS_REVIEW.md) |
| Check individual requirement status and evidence | [requirements.csv](requirements.csv) and [requirement_status.csv](requirement_status.csv) |
| Review Ask Inline Workspace coverage and open evidence gaps | [ASK_INLINE_COVERAGE.md](ASK_INLINE_COVERAGE.md) |
| Review Ask Cross Domain rollout coverage and phase exits | [ASK_CROSS_DOMAIN_COVERAGE.md](ASK_CROSS_DOMAIN_COVERAGE.md) |
| Know whether a doc is stale or conflicts with another | [FLAGS.md](FLAGS.md) |
| Find documents that may be deleted | [FLAGS.md — Deletion candidates](FLAGS.md#deletion-candidates) |
| Grep/filter by anything (status, date, dead-code refs, review basis) | [`catalog.csv`](catalog.csv) |
| Find a code-path starting point | [`../wiki/`](../wiki/README.md), then verify against current code |

Quick searches from the repo root:

```bash
grep -i "smart home" docs/library/catalog.csv                      # locate a doc
python3 -c "import csv;[print(r['path']) for r in csv.DictReader(open('docs/library/catalog.csv')) if r['flag']=='RED']"   # conflicting docs
```

## Areas

| Area | Docs | 🔴 | 🟠 | 🟡 | Covers |
|---|---|---|---|---|---|
| [Ask Cozy, AI Concierge & Agentic Intelligence](01-ask.md) | 32 | 1 | 4 | 2 | Ask Cozy conversational workspace, AI concierge, skills, agentic architecture |
| [Personalization Engine](02-personalization.md) | 24 | 0 | 2 | 3 | Recommendation/personalization engine: discovery pack, FRD, ADRs, phase audits |
| [Property Context & Property Setup](03-context.md) | 38 | 0 | 3 | 2 | Property Context platform, JIT capture slices, property setup/onboarding, RentCast |
| [Guidance, Actions & Home Intelligence](04-guidance.md) | 20 | 1 | 3 | 6 | Guidance Engine, home actions, Home Intelligence, home operations, signals |
| [Property Intelligence, Environment & Event Radar](05-intel.md) | 20 | 0 | 4 | 0 | Environment report, Home Event Radar, hazard exposure, neighborhood, briefs, recalls |
| [Home Records, Maintenance & Digital Twin](06-records.md) | 14 | 2 | 3 | 2 | Maintenance/seasonal, timeline, digital twin, rooms, permits, materials, smart home |
| [Coverage, Risk & Financial Tools](07-financial.md) | 25 | 0 | 5 | 3 | Coverage, claims, risk, ownership cost, tax, savings, mortgage, reserve fund |
| [Providers, Pricing & Renovation Execution](08-providers.md) | 14 | 0 | 1 | 2 | Provider profiles/reviews, service pricing, renovation, DIY, negotiation |
| [Buying, Selling & Life Transitions](09-transitions.md) | 4 | 0 | 2 | 1 | Home buyer, sale readiness, digital will, continuity |
| [Product Framework & Capability Platform](10-platform.md) | 33 | 0 | 1 | 0 | Product Framework phases 0-6, capability discovery, decision platform, launch runbooks |
| [Admin, Workers & Operations](11-admin.md) | 7 | 0 | 0 | 1 | Admin module, worker jobs, backup/DB ops, PWA |
| [Data Architecture (Pass 1-7)](12-data.md) | 8 | 0 | 1 | 7 | Pass 1-7 schema/data-flow analyses |
| [Pre-Launch Audits & Strategy (Mar-Apr 2026)](13-prelaunch.md) | 54 | 2 | 7 | 38 | Mar-Apr 2026 audits, 90-day plans, route audits, production readiness |
| [Acquisition & Business](14-business.md) | 6 | 0 | 0 | 0 | Acquisition one-pagers, pilot/fundraise plan |
| [Code-Grounded Wiki (existing docs/wiki)](15-wiki.md) | 12 | 0 | 0 | 12 | Existing code-grounded wiki (setup, architecture, 8 feature guides) |
| [Meta & Methodology](16-meta.md) | 2 | 0 | 1 | 0 | Docs index and audit methodology |

## Which doc wins? (reading order when several overlap)

| Topic | Read first | Then | Treat as history |
|---|---|---|---|
| Ask Cozy | `product/ASK_COZY_INLINE_WORKSPACE_FRD.md` (check its current version; states it governs the completion target) | Interaction Model FRD, Cross-Domain Rollout FRD, `architecture/ASK_COZY_PHASE*` verification docs | Aug `AI_HOME_CONCIERGE_ASK_*` family unless you need addendum detail (lineage undeclared - see C6) |
| Guidance Engine | `functional/GUIDANCE_ENGINE_FRD.md` (v2.1 living) | `GUIDANCE_ENGINE_FRD_Updated.md` for the resolution-journey feature | gap-analysis / phased plan (Mar 29) |
| Personalization | `personalization/README.md` (states current strategy) | `08` FRD only for long-term intent | ADR-0001/0002 (superseded) |
| Home Event Radar | `functional/HOME_EVENT_RADAR.md` (current state) | FRD + Implementation Plan + ADRs | - |
| Property Context | `property-context/PROPERTY_CONTEXT_FRD.md` + phase completion audits | JIT FRD + slice docs | - |
| Smart Home | `SMART_HOME_IOT_INTEGRATION_FRD.md` (unbuilt) | - | `SMART_HOME_INTEGRATION_HUB.md` |
| AI feature cards | Current feature routes and the relevant feature FRDs | `AI_CARDS_SUMMARY_UPDATED.md` for July 2026 history only (see C18) | `AI_CARDS_SUMMARY.md` (superseded) |
| Pre-launch strategy | none - all Apr 2026 | `product/ContractToCozy_W7_Launch_Cutover_Runbook.md` for launch | all of `audit/`, `audit-gemini/` |

These are recommendations from the flag review, not decisions recorded in the source docs.

## Maintaining this library

Rebuild after docs change: `python3 docs/library/tools/build_library.py`, then `python3 docs/library/tools/build_requirements.py`. `requirement_status.csv`, AUTHORITY.md, REQUIREMENTS_REVIEW.md, ASK_INLINE_COVERAGE.md, and ASK_CROSS_DOMAIN_COVERAGE.md are manually maintained. Run `python3 docs/library/tools/check_library.py` to validate generated pages, inventory, links, requirement entries, and evidence paths without modifying them.
The `review_basis` column distinguishes targeted findings from metadata-only checks. A blank flag means no issue was detected by those checks, not that every requirement was validated.
Flags are manual: edit the `flag(...)` calls in `tools/build_library.py` and the prose in `tools/flags_head.md`, then rebuild. Bump `TODAY` in the script when you re-baseline.
