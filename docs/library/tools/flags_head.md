# Stale & Conflicting Documents

[Library home](README.md) · Snapshot date: 2026-09-24 · Scope: all 313 files under `docs/`

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
4. **Code-path drift is measurable.** 1,657 backtick-quoted `apps/...` / `docs/...` paths were checked for existence **[executed]**: 151 do not exist. Concentrated in Smart Home, Material Registry, Seasonal, Jan-2026 analyses, and Sale Readiness. Some are `apps/workers/prisma/schema.prisma`, which does not exist by design - workers use `apps/backend/prisma/schema.prisma`; those docs should cite the backend path. A missing path is evidence of drift, not proof that the requirement is invalid.
5. **The wiki is also a snapshot.** The August 2026 guidance and introduction pages described an obsolete Fix/Resolution Center redirect chain and standalone orchestration routes. Their Home Actions and Resolution Center sections were corrected against current route, service, and render paths on 2026-09-22. The Emergency entry path was corrected too. The remaining wiki claims were not re-verified end to end. Use the wiki to locate a workflow, then trace current code; use FRDs for intent and rationale. **[executed]**

## Detailed flags

### 🔴 Conflicting / superseded

| ID | Documents | Problem | Evidence | Suggested action |
|---|---|---|---|---|
| C1 | `functional/AI_CARDS_SUMMARY.md` vs `AI_CARDS_SUMMARY_UPDATED.md` | Same title. Old = 4 AI features, updated = 11 plus a Jul 28 note that Tax Appeal folded into Property Tax Center. Old file is now bannered as retired; the updated file also has a stale Climate Risk claim (`C18`). | [executed] `diff` · route check | Delete old after historical retention review; use current routes for the inventory. |
| C2 | `SMART_HOME_INTEGRATION_HUB.md` vs `SMART_HOME_IOT_INTEGRATION_FRD.md` | The FRD says it supersedes the Hub (parallel alert path would fork incident handling); the Hub is now bannered as retired. Neither has a smart-home route or page; 28/33 and 18/27 cited paths are missing. | [read] FRD header · [executed] path check | Delete the Hub after historical retention review; keep the FRD as proposed intent. |
| C3 | `functional/GUIDANCE_ENGINE_FRD_Updated.md` | Filename says “Updated” but it is a distinct v1.0 user-initiated resolution feature. A manual journey route exists, yet TR-01's proposed `initiatedByUser`, `targetAssetId`, and integer `templateVersion` do not match current `GuidanceJourney` fields (`isUserInitiated`, `scopeId`, string `templateVersion`). FR-02 and TR-01 are only partially verified in `requirement_status.csv`. | [read] · [executed] route/schema trace | Rename for scope clarity; reconcile requirements individually instead of marking the whole FRD implemented. |
| C10a | `audit/…strategic-audit-2026-04-18.md` and `…90-day-execution-plan-2026-04-18.md` | Each v2 sibling explicitly says it supersedes v1 of the same date. The v1 files are now bannered as historical. | [read] v2 headers | Deletion candidates after confirming historical comparison is unnecessary; v2 retains the corrected plan. |
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
| C14 | `docs/README.md` | Index still lists `api/`, `deployment/`, `development/` as documentation areas although each holds only `.gitkeep`. It calls flagged `feature-data-flow-pass2.md` "canonical" and says the wiki shows what code does today, despite the wiki's snapshot warning. Its earlier omission of the wiki/library links was already corrected. | [read] · [executed] path check |
| C15 | `HOME_RISK_REPLAY.md`, `MATERIAL_SPEC_REGISTRY.md`, `HIDDEN_ASSET_FINDER.md` | Risk Replay: banner (Jul 30) says feature became "Past Hazard Exposure", old tables dormant - body (1,194 lines) still the old design, 4/4 provider files gone. Material Registry / Hidden Asset Finder: route exists but 14/24 and 3/8 cited files don't. | [read] · [executed] |
| C16 | `product/SALE_READINESS_VALUE_MAXIMIZATION_IMPLEMENTATION_PLAN.md` | "Design fully resolved" (Aug 6); memory says implemented; 6/19 cited `sellerPrep` paths gone. | [executed] · [memory] |
| C17 | `feature-data-flow-pass2.md` | Touched Jul 24 but 9/73 cited files missing. The other Pass docs (1, 3, 4, 5, 7) are Mar 27 snapshots. | [executed] |
| C18 | `functional/AI_CARDS_SUMMARY_UPDATED.md` | The July "updated" summary still presents Climate Risk Predictor as a current AI feature. `climateRisk.routes.ts` returns HTTP 410 `CLIMATE_RISK_RETIRED`. The older four-card summary is superseded, but this successor is not a reliable current inventory either. | [read] · [executed] code check |
| C19 | `personalization/codebase-evidence.md` | Discovery evidence index cites six paths that no longer exist, including `orchestration.routes.ts` and `ActionCenter.tsx`. | [executed] path check |
| C20 | `functional/HOME_RESERVE_FUND_PLANNER_FRD.md` | Reserve-fund route, page, and Prisma model exist, but three cited paths are absent; one is the workers Prisma path that is absent by design. Verify file-level architecture before changing the feature. | [executed] path check |
| C21 | `product/COVERAGE_AND_PREMIUM_OPTIMIZATION_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md` | Says implementation is complete but cites four removed files. This is path drift, not evidence that the outcome requirements are invalid. | [read] · [executed] path check |

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
- The wiki's `W` flag denotes a 2026 code snapshot. The specific 2026-09-22 corrections are documented in the wiki; the flag does not imply every statement in those pages was rechecked.

## Deletion candidates

These files should not govern future work. The four clear candidates are now bannered as retired in place; Git history preserves their old text if removal is chosen. They had no incoming document links except where noted at the time of review. No source file has been deleted by this audit.

| Candidate | Evidence | Replacement / retention decision |
|---|---|---|
| [`functional/AI_CARDS_SUMMARY.md`](../functional/AI_CARDS_SUMMARY.md) | Four-card inventory is contained in the later eleven-card summary; no other document links to the old file. | **Delete candidate**, but do not promote the later summary as current: C18 records its retired Climate Risk Predictor claim. |
| [`functional/SMART_HOME_INTEGRATION_HUB.md`](../functional/SMART_HOME_INTEGRATION_HUB.md) | The IoT FRD explicitly supersedes it and explains why its direct alert-to-Incident path conflicts with the canonical signal pipeline; that FRD is its sole incoming document reference. | **Delete candidate**; keep the IoT FRD as proposed intent, not implemented behavior. |
| [`audit/contracttocozy-90-day-execution-plan-2026-04-18.md`](../audit/contracttocozy-90-day-execution-plan-2026-04-18.md) | The v2 header explicitly says “supersedes v1 of same date”; no other document links to v1. | **Delete candidate**; retain v2 only as an April planning snapshot. |
| [`audit/contracttocozy-strategic-audit-2026-04-18.md`](../audit/contracttocozy-strategic-audit-2026-04-18.md) | The v2 header explicitly says “supersedes v1 of same date”; no other document links to v1. | **Delete candidate**; v2 has two incoming document references and should remain historical evidence. |
| [`functional/SEASONAL_FEATURE_SESSION_PROMPT.md`](../functional/SEASONAL_FEATURE_SESSION_PROMPT.md) | A January session briefing, not a requirement; cites removed checklist code and has no incoming document links. | **Archive/review before deletion**: it includes implementation notes and preferences not proved to exist elsewhere. Do not use it for current maintenance behavior. |

Do not delete an older FRD merely because its status is stale. For example, the Guidance, Property Context, and Ask families still contain requirements or rationale not proven to be preserved by a successor. Resolve their authority and requirement-level differences first.
