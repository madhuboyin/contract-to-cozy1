# Requirements authority review

[Library home](README.md) · [Detailed flags and deletion candidates](FLAGS.md)

This is a document-level authority screen for the 33 files classified as FRD/PRD in `catalog.csv`. All 313 source documents received inventory, metadata, date, and cited-path checks; the 33 documents below were also checked for their stated status, supersession, and overlap with nearby requirement families. Targeted code paths were traced where a conflict was found. **This does not certify every requirement sentence or runtime behavior.** `catalog.csv` records each file's `review_basis` so a future change does not mistake an unflagged row for a full semantic review.

| FRD / PRD | Use for future work | Finding or boundary |
|---|---|---|
| [Admin Module](../functional/ADMIN_MODULE_FRD.md) | Target requirements | Header says partially implemented; verify each phase against admin routes before treating a section as shipped. |
| [Claims Assistance](../functional/CLAIMS_ASSISTANCE_PRD.md) | Historical product intent | March snapshot (`H`); trace the current claims routes and schema. |
| [Environment Report](../functional/ENVIRONMENT_REPORT_FRD.md) | Current stated contract | Header says implemented; no conflict found in this audit. Runtime behavior was not exercised. |
| [Guidance Engine](../functional/GUIDANCE_ENGINE_FRD.md) | Broad guidance intent | Calls itself living v2.1, but overlaps the separate resolution-journey FRD and architecture document (`C3`). |
| [Guidance Engine FRD Updated](../functional/GUIDANCE_ENGINE_FRD_Updated.md) | Resolution-journey intent | Distinct v1.0 feature despite its “Updated” filename; “Ready for Implementation” status conflicts with existing journey code (`C3`). |
| [Guidance Homeowner CTA Audit FRD](../functional/GUIDANCE_ENGINE_HOMEOWNER_CTA_AUDIT_FRD.md) | Audit requirements and findings | Its status explicitly says audit-only and no implementation changes; use it as evidence of the March CTA review, not as current delivery proof. |
| [Home Event Radar](../functional/HOME_EVENT_RADAR_FRD.md) | Target requirements | “Proposed” header conflicts with implementation-plan and current-state records (`C4`). |
| [Home Reserve Fund Planner](../functional/HOME_RESERVE_FUND_PLANNER_FRD.md) | Product requirements | Route, page, and Prisma model exist; several file-level references drifted (`C20`). |
| [Property Tax Center](../functional/PROPERTY_TAX_CENTER_FRD.md) | Governing stated contract | Explicitly calls itself the implemented product and engineering contract. Check jurisdiction-specific reviewed rules in code. |
| [Provider Portfolio Availability](../functional/PROVIDER_PORTFOLIO_AVAILABILITY_FRD.md) | Phased requirements | Header distinguishes implemented backend/frontend items from open decisions; preserve that split. |
| [Provider Profile Management](../functional/PROVIDER_PROFILE_MANAGEMENT_FRD.md) | Feature requirements | No overall implementation status; verify route and edit restrictions before changing provider data. |
| [Provider Reviews](../functional/PROVIDER_REVIEWS_FRD.md) | Implemented review-flow requirements | The document describes a corrective implementation but lacks a top-level delivery status; verify creation, moderation and aggregate updates before treating the whole flow as runtime certified. |
| [Provider Trust & Compliance](../functional/PROVIDER_TRUST_COMPLIANCE_FRD.md) | Feature requirements | Replaces an unused Certification model; current rollout status is not stated globally. |
| [Smart Home / IoT](../functional/SMART_HOME_IOT_INTEGRATION_FRD.md) | Proposed intent only | Explicitly supersedes the Hub; no matching smart-home route/page and many cited paths are absent (`C2`). |
| [Personalization](../personalization/08-personalization-frd.md) | Long-term target | Its “Proposed; implementation not authorized” status does not describe the live internal-validation module; read the personalization README first (`C5`). |
| [Ask Audience Context Addendum](../product/AI_HOME_CONCIERGE_ASK_AUDIENCE_CONTEXT_ADDENDUM_FRD.md) | Specific Ask audience constraints | Says implemented and governs where more specific; retain alongside the current Ask family. |
| [Ask Intelligence Incremental](../product/AI_HOME_CONCIERGE_ASK_INTELLIGENCE_INCREMENTAL_FRD.md) | Long-term intelligence target | Proposed requirements remain targets unless separate evidence exists. It complements the newer interaction documents; see the scoped lineage in `AUTHORITY.md`. |
| [Ask Redo](../product/AI_HOME_CONCIERGE_ASK_REDO_FRD.md) | Early platform baseline | Retains adopted routing, operation, confirmation, and governance constraints where later scoped requirements do not revise them. Its existing `ASK-FR-*` traceability matrix is now extracted into the ledger. |
| [Ask Trust Architecture Addendum](../product/AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md) | Specific trust constraints | Says TA0–TA7 delivered, with multilingual runtime deferred; it states where its more specific terms govern. |
| [Ask Cozy Cross-Domain Rollout](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) | Shared and domain rollout requirements | Proposed header remains honest: static phase records include explicit partials. Inline Workspace supersedes only its normal-handoff completion assumption. |
| [Ask Cozy Inline Workspace](../product/ASK_COZY_INLINE_WORKSPACE_FRD.md) | Governing completion target | Explicitly overrides routine handoff and richer-workspace exclusions. Requirement-level evidence and open boundaries are recorded in `ASK_INLINE_COVERAGE.md` and `requirement_status.csv`; `IW-CAP-004` remains a target. |
| [Ask Cozy Interaction Model](../product/ASK_COZY_INTERACTION_MODEL_UI_FRD.md) | Interaction requirements | Maintenance corrections are marked implemented; later domains remain separate and runtime validation is not claimed. |
| [Ask Cozy Message First](../product/ASK_COZY_MESSAGE_FIRST_FRD.md) | Message-first architecture target | Complements the later interaction documents and now has stable `MF-*` requirement IDs, but it has no top-level delivery status; do not treat it as delivered from architecture prose. |
| [Capability Discovery Platform](../product/CAPABILITY_DISCOVERY_AND_RECOMMENDATION_PLATFORM_FRD.md) | Target requirements | “Proposed” conflicts with an in-progress plan; several cited frontend paths are gone (`C8`). |
| [Skill Platform](../product/CONTRACTTOCOZY_SKILL_PLATFORM_FRD.md) | Beta-baseline requirements | Header says implemented beta baseline; later additions require code-path verification. |
| [Home Action Health-Factor Copy](../product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md) | Slice-specific copy requirements | Header separates shipped phases and unscheduled Phase 3; retain that boundary. |
| [Home Buyer Experience](../product/HOME_BUYER_FRD_AND_IMPLEMENTATION_PLAN.md) | Buyer requirements plus delivery plan | Header says implementation in progress. Requirement intent and plan status share one file; verify each buyer slice independently. |
| [Home Intelligence Functional Completeness](../product/HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) | Approved target plus delivery plan | Approved for implementation planning; do not infer completion from its combined FRD/plan format. |
| [Property Setup Simplification](../product/PROPERTY_SETUP_SIMPLIFICATION_MINIMAL_CHANGE_FRD.md) | Phase A requirements | “In implementation”; do not infer full completion from the RentCast Phase B status. |
| [RentCast Property Setup](../product/RENTCAST_PROPERTY_SETUP_INTEGRATION_FRD.md) | Phase B stated contract | Header says implemented; its implementation plan records RC-0 through RC-10 complete. |
| [Property Context Catalog Governance](../property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md) | Target governance requirements | “Proposed” despite phase records showing implementation; resolve feature-by-feature (`C7`). |
| [Property Context](../property-context/PROPERTY_CONTEXT_FRD.md) | Broad context requirements | “Proposed greenfield” despite phase completion records; do not assume every scope is complete (`C7`). |
| [Property Context JIT Capture](../property-context/PROPERTY_CONTEXT_JUST_IN_TIME_CAPTURE_FRD.md) | Broader target contract | Its own note distinguishes an implemented coverage slice from unadopted cross-feature requirements. |

## Decisions for the other 280 files

- The 10 ADRs remain decision records. “Accepted,” “superseded,” and a missing status have different meanings; see their individual catalog rows. Do not delete a superseded ADR if later decisions refer to its rationale.
- The 14 files classified as plans describe sequencing, not necessarily current behavior. The April v1 plans explicitly superseded by v2 are deletion candidates; other plans contain open or partially implemented work and need family-level reconciliation.
- The other 256 files are audits, feature references, status records, runbooks, and assets. Their dates, references, and detected conflicts are in `catalog.csv`. Historical `H` and wiki `W` flags are snapshot warnings, not invalidations of every contained statement.

The unresolved families with material requirement ambiguity are Guidance (`C3`), Property Context (`C7`), and the overlapping April plans (`C10`). Ask reading precedence and stable IDs are now recorded; its remaining work is requirement-level delivery verification (`C6`). The [flag review](FLAGS.md) records the exact disagreement and [deletion candidates](FLAGS.md#deletion-candidates). Resolve a behavioral difference from the specific FRD, directly affected contract/schema/code, and any later explicit supersession; do not pick a winner from filename or modification date alone.
