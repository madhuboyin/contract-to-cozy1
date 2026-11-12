# Ask Cozy — Data-Point Catalogue: Phase 0b Results

**Date:** 2026-11-11
**Status:** Phase 0b deliverables (catalogue candidates, exclusions, domain boundaries, grouping, feasibility). **Proposals for owner sign-off (D11, D13); nothing here makes a data point visible to Ask** — visibility needs reviewed field metadata and fails closed (FR-DATA-1).
**Governing document:** `docs/product/ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` (FR-DATA-1, 2, 9, 11, 12, 13).
**Reproduce:** `cd apps/backend && node scripts/ask-data-catalogue.js` (offline, reads the Prisma data model only). `--write` regenerates the committed manifest `apps/backend/src/services/ask/dataCatalogue/entityDispositions.json`; `--check` and `tests/ask/dataCatalogueManifest.test.js` fail when a property-scoped entity has no disposition.
**Evidence labels:** **[Executed]** the script and test; **[Inferred]** the feasibility arithmetic, which applies the FRD's *proposed* sampling matrix and was not measured.

## 1. What the schema yields [Executed]

| Measure | Count |
|---|---|
| Models in the data model | 525 |
| **Property-scoped entities** (a `propertyId`, or a required to-one chain to one) | **403** (an earlier figure of 251 counted only a literal `propertyId`) |
| Candidates / default-excluded | **363** / **40** |
| Candidate scalar and enum fields (before review) | **3,950** |
| Collection shapes (to-many relations on candidates) | 599 |
| By value family | text 1,606; enum 726; date 663; json 292; count 203; money 163; measure 141; boolean 156 |
| By sensitivity (name heuristic) | HOME 3,522; FINANCIAL 274; PII 154 |

**Not derivable from the schema (FR-DATA-1):** homeowner meaning and aliases, role and audience policy, freshness and provenance, query-shape declarations, and **derived values** (roof age, warranty status, remaining life, replacement-cost range). Those need the reviewed metadata files and the derived-data registry (FR-DATA-11), which are Phase 1b work per domain. The 3,950 is therefore a ceiling on directly stored data points, not the product's data-point count.

## 2. Default exclusions for sign-off (D11) [Executed]

Rule: exclude operational and security data by default; **analytics is not excluded as a category** (`ProductAnalyticsEvent` stays a candidate). Field-level: any field named like a password, salt, secret, token, API key, credential, signature, webhook, refresh, checksum, storage key, idempotency key, fingerprint, raw payload or embedding is excluded from its entity.

- **Agent or orchestration internals** (7): `AgentInterview`, `AgentRun`, `AgentRunReservation`, `AgentState`, `OrchestrationActionEvent`, `OrchestrationActionSnooze`, `OrchestrationDecisionTrace`
- **Ask bookkeeping (executions, sessions, events, receipts)** (7): `AskCaptureReceipt`, `AskConfirmationReceipt`, `AskExecution`, `AskExecutionEvent`, `AskSavedArtifactPreference`, `AskSession`, `AskSuggestedActionLifecycle`
- **Operational record (run, job, trace, cursor, outbox, lock, receipt)** (18): `DoNothingSimulationRun`, `GazetteGenerationJob`, `GazetteSelectionTrace`, `HomeRiskReplayRun`, `HomeSavingsRun`, `HomeScoreDataSourceRun`, `HomeScoreExportJob`, `HomeScoreIntegrityCheckRun`, `HomeTwinComputationRun`, `IntelligenceRecomputeRun`, `OwnershipCostAdapterRun`, `PermitFetchJob`, `PersonalizationEvaluationRun`, `PropertyChangeSourceCursor`, `PropertyContextCaptureReceipt`, `PropertyHiddenAssetScanRun`, `PropertyNarrativeRun`, `PropertyRecordPurgeJob`
- **Delivery or queue internals** (1): `HomeBriefingDelivery`
- **Operational work-item internals** (7): `OperationalWorkEvent`, `OperationalWorkEvidence`, `OperationalWorkExecution`, `OperationalWorkItem`, `OperationalWorkItemWatcher`, `OperationalWorkReconciliation`, `OperationalWorkSource`
**Owner sign-off needed:** confirm this list, and name any entity here that should be in scope or any candidate that should be excluded (the 363 candidates include household, payment, refund and notification entities that may warrant exclusion or a stricter audience policy).

## 3. Domains and their boundaries (D13) [Executed; boundaries are proposals]

Domains are in the owner's provisional order. **Boundary rules so domains do not overlap:** an item's own attributes belong to *appliances-inventory*; the coverage of an item (warranty, insurance policy, claim, recall, inspection finding) belongs to *warranty-insurance-claims*; the cost to replace or fund an item belongs to *reserve-ownership-costs*; a document or record about any of them belongs to *documents-records* (the document, not the fact it carries).

| Domain | Entities | Data points |
|---|---|---|
| appliances-inventory | 26 | 282 |
| maintenance | 12 | 141 |
| warranty-insurance-claims | 35 | 339 |
| reserve-ownership-costs | 48 | 506 |
| documents-records | 8 | 94 |
| buyer | 34 | 437 |
| seller-prep | 5 | 52 |
| decisions-projects | 64 | 708 |
| intelligence-derived | 42 | 471 |
| neighbourhood-risk-radar | 30 | 270 |
| property-profile | 15 | 222 |
| home-events-timeline | 18 | 165 |
| household-account | 15 | 131 |
| everything-else | 11 | 132 |

The first domains in the owner's order are small enough to stage: **appliances-inventory 26 entities / 282 data points; maintenance 12 / 141; warranty-insurance-claims 35 / 339.**

## 4. Grouping and the feasibility decision (FR-DATA-13) [Inferred]

| Grouping | Groups | Sealed rows at 10 per group (all human-confirmed) |
|---|---|---|
| Per entity × value family × sensitivity | **1,569** | **~15,690**; with query-shape, facet and execute-band strata ~17,750 or more |
| **Per domain × value family × sensitivity (coarse)** | **173** | **~1,730** |
| First three domains, coarse | 39 | **~390** |

The execute-band calibration needs at least 381 independent families **per qualifying stratum**; with the FRD's strata (3 routing paths × 3 effects × 2 materialities × 2 target kinds = 36) the full requirement is ~13,700 families, so strata must be qualified a few at a time.

**Feasibility decision (proposed): feasible only with coarse grouping and domain staging.** Per-entity grouping is not feasible for a small team. Members of a coarse group each still receive a deterministic conformance case and one routing case (FR-DATA-16), which are generated, not human-labelled. Phase 1b therefore proceeds **domain by domain in the owner's order**, and the human-label volume for stage one is ~390 sealed rows.

## 5. Consequences

1. **Phase 1b is staged by domain**; the first slice is the appliances-and-inventory point reads (the owner's example prompts).
2. The committed manifest and its test now enforce FR-DATA-9: **a new table fails CI until it is dispositioned.**
3. Sign-off items for the owner are collected in the end-of-programme decision list.
