# Stale & Conflicting Documents

[Library home](README.md) · Snapshot date: 2026-09-19 · Scope: all 313 files under `docs/`

**How to read this.** Each flag says *how it was established*:

- **[executed]** - a command was run and its output read (diff, grep, file-existence check).
- **[read]** - I read the cited lines of the document(s).
- **[memory]** - taken from project notes of earlier sessions; *not* re-verified against code here.

Nothing here has been checked in a running app. "Implemented" means *code exists at the cited path*, not that it works. A flag says the **documents disagree with each other or with the repo** - it does not say which side is right. Where I could not tell, it says so.

Flag key: 🔴 conflicting / superseded · 🟠 status lags reality, or cites code that no longer exists · 🟡 historical snapshot

## Headline findings

1. **Status fields are the main rot.** Requirement docs are written as "Proposed" and never advanced when the work shipped (C4-C9, C16). The status line is not a reliable signal in this folder - the *sibling* status/completion docs are.
2. **Families with no declared winner.** Guidance Engine (3 specs), Ask (Aug "AI Home Concierge" vs Sep "Ask Cozy"), and ~7 overlapping April pre-launch plans each have several docs and none says which governs (C3, C6, C10).
3. **Banner-only reconciliation.** Some docs got a dated banner pointing at the new behaviour while the multi-hundred-line body still describes the old design (C15). The banner is right; do not trust the body.
4. **Code-path drift is measurable.** 1,657 backtick-quoted `apps/...` / `docs/...` paths were checked for existence **[executed]**: 153 do not exist. Concentrated in Smart Home, Material Registry, Seasonal, Jan-2026 analyses, and Sale Readiness. (Caveat: ~10 of the 153 are `apps/workers/prisma/schema.prisma`, which does not exist by design - workers use `apps/backend/prisma/schema.prisma`; those docs should cite the backend path.)
5. **The wiki *itself* warns about this.** `wiki/02-architecture-and-data-model.md` states functional/ and product/ docs "are historical planning docs and drift from what's actually implemented", and the Intelligence Readiness Audit calls docs "frequently stale vs. shipped code" **[read]**. Prefer `docs/wiki/` for *what the code does today*; use FRDs for *intent and rationale*.

## Detailed flags

### 🔴 Conflicting / superseded

| ID | Documents | Problem | Evidence | Suggested action |
|---|---|---|---|---|
| C1 | `functional/AI_CARDS_SUMMARY.md` vs `AI_CARDS_SUMMARY_UPDATED.md` | Same title. Old = 4 AI features, updated = 11 plus a Jul 28 note that Tax Appeal folded into Property Tax Center. Old file has no banner. | [executed] `diff` | Delete old or add "superseded" banner. |
| C2 | `SMART_HOME_INTEGRATION_HUB.md` vs `SMART_HOME_IOT_INTEGRATION_FRD.md` | The FRD says it supersedes the Hub (parallel alert path would fork incident handling); the Hub says nothing. Neither has code: no smart-home route or page exists, 28/33 and 18/27 cited paths missing. | [read] FRD header · [executed] path check + `ls routes` | Banner the Hub; give the FRD a status line ("Proposed - not built"). |
| C3 | `functional/GUIDANCE_ENGINE_FRD_Updated.md` | Filename says "Updated" but it is v1.0 (Mar 31), older-numbered than the v2.1 living FRD, and specifies a *different* feature (user-initiated resolution concierge). Status "Ready for Implementation" - but `initiatedByUser` exists in `guidanceJourney.service.ts`, so it was built. | [read] · [executed] grep | Rename (e.g. `GUIDANCE_RESOLUTION_JOURNEYS_FRD`), set status to Implemented. |
| C10a | `audit/…strategic-audit-2026-04-18.md` and `…90-day-execution-plan-2026-04-18.md` | v1 files sit beside v2; neither states it is replaced. | [read] titles/dates | Banner v1 as superseded by v2. |
| C11a | `functional/SEASONAL_FEATURE_SESSION_PROMPT.md` | An AI-session prompt, not a spec. Untouched since Jan 3; cites deleted files. | [executed] path check | Archive. |

### 🟠 Status lags reality / cites missing code

| ID | Documents | Problem | Evidence |
|---|---|---|---|
| C3b | `GUIDANCE_ENGINE_FRD.md` (v2.1, Mar 26), `architecture/GUIDANCE_ENGINE.md` (Mar 24), plus `guidance-engine-gap-analysis.md` / `-implementation-plan.md` (Mar 29) | Four+ overlapping Guidance Engine docs, no declared canonical one. | [read] |
| C4 | `HOME_EVENT_RADAR_FRD.md` | Status "Proposed", v1.0, Jul 26. Its Implementation Plan says "In progress - launch acceptance and observability baseline implemented"; 2 of 3 ADRs are "Accepted"; `HOME_EVENT_RADAR.md` (touched Aug 6, *after* the FRD) is the current-state reference. | [read] |
| C5 | `personalization/08-personalization-frd.md` | "Proposed; implementation not authorized by this document." Code exists under `apps/backend/src/modules/personalization/` (e.g. `materializeRecommendationsForProperty`), and README says internal validation is live. README also says the larger target sections are "long-term reference, not current commitments" - but `04-target-architecture.md` is titled "Current Target Architecture". ADR-0001/0002 are self-declared Superseded (fine, but easy to misread). | [read] · [executed] grep |
| C6 | Ask family (`product/ASK_COZY_*`, `AI_HOME_CONCIERGE_ASK_*`, `architecture/ASK_COZY_*`) | (a) Cross-Domain Rollout FRD says "implementation is not claimed" but seven Sep 16-18 verification docs say Complete. (b) Two naming generations - Aug "AI Home Concierge Ask" and Sep "Ask Cozy" - with no doc declaring lineage. (c) Incremental FRD frontmatter says v1.3 / Aug 11 though touched Aug 29. (d) Verification-doc file names use "Phase 3/7", "Phase 7", "Phase 8" for domains - I did **not** check whether that numbering matches the FRD's own phases. | [read] headers |
| C7 | `property-context/PROPERTY_CONTEXT_FRD.md`, `…CATALOG_GOVERNANCE_FRD.md` | Both "Proposed", but ~27 sibling docs record phases 0-8 and JIT slices 0-5 as implemented. `PROPERTY_INTELLIGENCE_PHASE1_RECOMMENDATION.md` ("not yet approved", Jul 26) appears to have been followed by the Jul 30-31 `functional/PROPERTY_INTELLIGENCE_*`, `NYC_ZAP…`, `PROPERTY_BRIEF` docs - *inference from dates and titles only*. | [read] |
| C8 | `product/CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md` | "Proposed" vs plan "Implementation in progress"; 4 of 6 cited `frontend/src/features/tools/*` files are gone. | [read] · [executed] |
| C9 | Six `*_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md`: Home Continuity, Home Operations, Property Intelligence, Renovation Compliance, Capital Decision, Hidden Savings | Header still "Recommended implementation plan". Peers with the same template (Tax, Coverage, Ownership Cost, Mortgage, Service Price, Digital Twin) were updated to "Implemented". Memory says Home Continuity is fully shipped and Hidden Savings only through Slice 0 - so the six are *not* uniformly stale. | [read] headers · [memory] |
| C10 | `audit/` (10 files) + `audit-gemini/` (25 files) | ~7 overlapping Apr 18-20 pre-launch plans (`90-day` ×3, `pre-launch` ×3, `implementation`, `strategic-transformation`). Nothing says which is canonical. Pre-launch framing is outdated: a real-user cutover runbook exists (Jul 22-30). | [read] |
| C11 | `SEASONAL_MAINTENANCE_HANDOFF.md` (1,874 lines) | Body predates the ChecklistItem → PropertyMaintenanceTask consolidation; 3 cited files deleted. Header does note "Canonical Home integration implemented; historic…". The Intelligence Readiness Audit confirms `ChecklistItem` is deprecated. | [executed] · [read] |
| C13 | `functional/Testing_Property_Onboarding.md` | `PROPERTY_SETUP_CURRENT_STATE_AUDIT.md` says some of its statements are stale (expects redirect behaviour that no longer occurs). | [read] |
| C14 | `docs/README.md` | Index lists `api/`, `deployment/`, `development/` - each holds only `.gitkeep` - and omits `audit/`, `audit-gemini/`, `audits/`, `acquisition/`, `personalization/`, `wiki/` and the eight root-level Pass/dashboard/icon docs. | [executed] `find` |
| C15 | `HOME_RISK_REPLAY.md`, `MATERIAL_SPEC_REGISTRY.md`, `HIDDEN_ASSET_FINDER.md` | Risk Replay: banner (Jul 30) says feature became "Past Hazard Exposure", old tables dormant - body (1,194 lines) still the old design, 4/4 provider files gone. Material Registry / Hidden Asset Finder: route exists but 14/24 and 3/8 cited files don't. | [read] · [executed] |
| C16 | `product/SALE_READINESS_VALUE_MAXIMIZATION_IMPLEMENTATION_PLAN.md` | "Design fully resolved" (Aug 6); memory says implemented; 6/19 cited `sellerPrep` paths gone. | [executed] · [memory] |
| C17 | `feature-data-flow-pass2.md` | Touched Jul 24 but 9/73 cited files missing. The other Pass docs (1, 3, 4, 5, 7) are Mar 27 snapshots. | [executed] |

### 🟡 Historical snapshots (keep, but do not treat as current)

| ID | Documents | Note |
|---|---|---|
| C12 | Jan 3 2026 analyses: `EXHAUSTIVE_SYSTEM_AUDIT`, `FINAL_IMPLEMENTATION_PLAN` ("Option B / clean-slate"), `PROPERTY_ENHANCEMENT_ANALYSIS`, `CORRECTED_USER_HOMEOWNER_ANALYSIS`, `SERVICE_CATEGORY_CONFIG_ANALYSIS`, `RISK_ASSESSMENT_COMPREHENSIVE_DOCS` | Never updated. Cite pages that no longer exist. "CORRECTED_" implies an earlier wrong version that isn't in the repo. |
| H | Everything last changed on/before 2026-04-30 (auto-flagged, list below) | Predates the July product-framework/launch-readiness work. |

## Known limits of this review

- **Not every document was read in full.** I read headers/status blocks for all, and bodies only for the docs named above. The *absence* of a flag is not a clean bill of health.
- "Last changed" is git history date. A recent touch (e.g. a banner) does not mean the body is current - see C15.
- Domain/type classification is rule-based on paths and titles (see `catalog.csv`); a few docs may sit in a slightly odd area. Correct by editing `catalog.csv` or the page.
- No cross-doc contradictions in *numbers or requirements* were hunted document-by-document (e.g. two FRDs specifying different thresholds). That would need a separate pass per family.


## Auto-flagged: historical (🟡 H) - last changed on/before 2026-04-30

Grouped by folder. Full list with dates in `catalog.csv` (filter `flag_id = H`).

- **(docs root)/** - 6 files, 2026-03-09 to 2026-03-27
- **architecture/** - 1 files, 2026-03-10 to 2026-03-10
- **audit/** - 3 files, 2026-04-18 to 2026-04-19
- **audit-gemini/** - 22 files, 2026-04-19 to 2026-04-20
- **audits/** - 2 files, 2026-03-18 to 2026-03-18
- **audits/ui-audit/** - 4 files, 2026-04-12 to 2026-04-12
- **audits/ui-audit/scorecards/** - 1 files, 2026-04-13 to 2026-04-13
- **audits/ui-audit/tracker/** - 1 files, 2026-04-13 to 2026-04-13
- **functional/** - 18 files, 2026-01-04 to 2026-04-10
