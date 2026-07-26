# Property Intelligence — Phase 1 Recommendation (Free Public Sources)

**Version:** 2.0 (revises the original "Property Intelligence" additive-layer recommendation)

**Date:** 2026-07-25

**Status:** Recommendation — not yet approved for implementation

**Constraint set by product:** Phase 1 uses **free public sources only**. No paid
aggregators (ATTOM, CoreLogic, Rentcast, Estated, Regrid) in this phase.

---

## 1. Core principle

> **Never ask the homeowner for information we can discover with confidence
> from free public sources.**

Two corollaries follow, and both must be treated as first-class requirements —
not edge cases:

1. **"With confidence" is a per-field decision rule, not a slogan.** Every
   discovered value carries a combined confidence (parcel-match confidence ×
   source-field confidence). Above the prefill threshold we present the value
   for confirmation; below it we ask the user exactly as today. A confidently
   wrong prefill (wrong parcel, stale roll) is worse than an empty field.
2. **Free-only means coverage is partial by design.** There is no free national
   API for structure data (year built, size, bedrooms, bathrooms). Free
   discovery of those fields is per-jurisdiction government open data. The
   product must degrade gracefully to the existing ask-flow wherever a county
   has no connector, and **coverage percentage is a tracked product metric**,
   not an implementation detail.

## 2. Relationship to the existing Property Context Platform

This initiative **builds on, and inside, the shipped Property Context
Platform** (`apps/backend/src/modules/propertyContext/`). It is not a sibling
system. Concretely:

- Discovery is a new **source** feeding the existing fact machinery — it enters
  through the same validated write path (`capturePropertyFact`) that user
  capture uses, with `sourceType: PUBLIC_RECORD` (the enum value already
  exists).
- Provenance lives in the existing `PropertyFactEvidence` model (confidence,
  observedAt, verifiedAt, supersededAt already present). See §6 for the one
  schema decision this requires.
- User confirmation/correction reuses the JIT capture flow and
  `PropertyContextCaptureReceipt` idempotency — confirmation marks the
  evidence `verifiedAt`; correction supersedes the public-record evidence and
  records a `USER_REPORTED` fact, preserving the discovery history.
- The `Property` table remains the operational source of truth. Resolved
  values are written into the existing canonical columns
  (`yearBuilt`, `propertySize`, `bedrooms`, `bathrooms`, `dwellingType`,
  `roofReplacementYear`). No new canonical model, no new IDs, no consumer
  changes.

The systemic expression of the core principle: each fact in
`factCatalog.ts` gains a **discoverability annotation**
(`NATIONAL | JURISDICTIONAL | USER_ONLY`), and the capture flow consults
discovery before rendering a question. Capture requirements become the
fallback for discovery failures, not the default.

**Policy reconciliation:** `PROPERTY_CONTEXT_FRD.md` §2 (greenfield, no
dual-read/shadow/strangler infrastructure) remains in force. The original
recommendation's Phases 3–5 (shadow canonical model, strangler migration) are
**dropped**, not deferred — they solve a production-migration problem this
pre-launch product does not have. If a canonical-property extraction is ever
justified, it will be re-proposed on its own merits.

## 3. What free sources can and cannot discover

### 3.1 Field-by-field reality

| Field | Free discoverability | Source class | Notes |
|---|---|---|---|
| lat/lon, county FIPS, census tract | **National** | US Census Geocoder (keyless; forward + reverse) | Reverse geocoder already integrated (`fipsResolver.service.ts`). Forward one-line-address geocoding is a small addition and returns match quality (`Exact` / `Non_Exact`) — the backbone of parcel matching. Also upgrades the current zip-only geocode used by weather jobs. |
| `yearBuilt` | **Jurisdictional** | County/city assessor open data (ArcGIS FeatureServer parcel layers, Socrata datasets, statewide rolls) | The most commonly published assessor attribute. |
| `propertySize` (living area) | **Jurisdictional** | Same | Commonly published; beware footprint-vs-living-area semantics per source. |
| `bedrooms` / `bathrooms` | **Jurisdictional, weakest** | Same | Many assessor datasets omit these entirely. Expect the lowest fill rate of the six. Assessor bathrooms often come as full/half counts → normalize to the schema's `Float`. |
| `dwellingType` | **Jurisdictional (mapped)** | Assessor land-use / building-class codes | Requires a per-source code→`DwellingType` mapping table. Populate `dwellingType` only; do **not** infer `ownershipForm`, `propertyUse`, or `occupancyStatus` from assessor use codes — those are owner-knowledge facts and stay in the ask-flow. |
| `roofReplacementYear` | **Not discoverable in Phase 1** | (Building-permit open data, sometimes) | Assessor rolls do not carry it. Stays `USER_ONLY`; permit-based inference is a Phase 2 candidate. |

Census ACS tract-level medians (e.g., median year built) are **priors, not
facts** — they fail the "with confidence" test for prefill and must not
populate property fields. At most they may sanity-check user input later.
Deferred.

### 3.2 Licensing

Government open data (Census, county/city portals, statewide rolls) is public
record with open licenses — storing raw payloads for debugging and
reprocessing is permissible. The licensing barrier that made
`PropertySourceRecord` risky under paid aggregators does not apply. Do **not**
scrape assessor websites' HTML; use only published APIs/datasets
(ArcGIS REST, Socrata SODA, official bulk downloads).

## 4. Revised Phase 1 scope

### Phase 1a — national spine + connector framework + one flagship connector

1. **Address intake upgrade:** on address entry, forward-geocode via the
   Census Geocoder (following the existing house pattern: `ssrfGuard`,
   `TtlCache`, never-throw). Persist lat/lon (full-address precision, not
   zip-centroid), county FIPS, and the geocoder match quality.
2. **Coverage registry:** static registry keyed by county FIPS →
   available connector(s). Resolvable nationally on day one, so onboarding
   always knows whether to attempt discovery or fall straight to the ask-flow.
3. **Connector framework + one flagship jurisdiction.** Connector contract:
   `(point, normalizedAddress) → candidate fields + per-field raw values +
   per-field confidence + parcel identifier`. Choose the flagship by where
   real early users are, tempered by open-data quality (strong candidates:
   NYC PLUTO, LA County, Cook County, King County, Miami-Dade / FL statewide
   roll, major TX appraisal districts).
4. **Onboarding prefill UX:**
   - Attempt discovery synchronously with a hard time budget (~3–5s) and a
     "Looking up your property records…" state; on timeout, continue async
     and prefill on the user's next visit to the form.
   - **Wrong-parcel guardrail:** before applying values, show the matched
     parcel/address back to the user ("We found records for 123 Main St —
     is that your home?"). One tap kills the worst failure mode.
   - Prefilled fields are visibly labeled as found in public records, each
     individually editable. Existing form + existing save API; save is
     enhanced to record confirmation evidence.
5. **Trust rule for unconfirmed values:** discovered values above threshold
   are written to `Property` columns with `PUBLIC_RECORD` evidence and
   `verifiedAt: null`. They prefill forms and inform display, but
   **safety-sensitive consumers and JIT-capture suppression require
   `verifiedAt`** — an unconfirmed public record must not permanently silence
   a capture requirement for a safety-relevant rule.

### Phase 1b — breadth + calibration

- Add 3–5 more jurisdiction connectors, prioritized by user geography.
- Instrument and review: per-field fill rate, per-field **user correction
  rate** (the empirical confidence calibration), onboarding completion time,
  coverage % of new properties.

### Explicitly deferred (unchanged from original, plus additions)

Separate database/schema/service, CanonicalProperty, new property IDs, event
architecture, knowledge graph, **strangler phases (dropped, see §2)**,
nationwide bulk-roll ingestion, permit-based roof inference, ACS priors,
LLM-assisted extraction from public websites, and any paid-source
re-evaluation — the correction-rate and coverage data from Phase 1b is what
justifies or kills future paid spend.

## 5. Architecture and placement

```
apps/backend/src/modules/propertyContext/
├── enrichment/                    ← new
│   ├── enrichProperty.ts          (orchestrator: geocode → coverage → connector → resolve → capture)
│   ├── coverageRegistry.ts        (county FIPS → connector)
│   ├── connectors/
│   │   ├── connector.types.ts
│   │   ├── censusGeocoder.connector.ts
│   │   └── <jurisdiction>.connector.ts
│   └── normalizers/               (per-source code→enum maps, unit normalization)
├── application/  catalog/  domain/  infrastructure/  ...   (existing)
```

- CamelCase naming per repo convention; layering follows the module's
  existing application/domain/infrastructure style (not the original doc's
  service/resolver/repository layout).
- Free-API calls follow the established pattern in
  `services/environment/`: `assertSafeUrl`, `TtlCache`, structured logging,
  null-on-failure.
- **No `PropertyEnrichmentJob` table.** Async enrichment runs on the existing
  BullMQ workers; job state lives in the queue, outcome state on the property
  (§6). If enrichment code runs in workers, remember the curated Dockerfile
  copy-list for backend imports, and that prod is ARM (Raspberry Pi).
- Analytics: enrichment runs are system events (`userId: null`, excluded from
  activation metrics per policy); the **user confirmation** event carries the
  real userId and is the activation signal.

## 6. Schema changes (additive; edit `schema.prisma` + `prisma db push` — no migration scripts)

1. **`Property` additions (3 columns):**
   - `intelligenceStatus` (enum: `NOT_ATTEMPTED | NO_COVERAGE | PENDING | ENRICHED | FAILED`)
   - `intelligenceLastUpdatedAt DateTime?`
   - `basicsConfirmedAt DateTime?` — coarse UI convenience only; per-field
     truth remains `PropertyFactEvidence.verifiedAt`.
2. **Discovered-value storage — the one real decision.**
   `PropertyFactEvidence` deliberately stores no values; the correction story
   ("county said 4, user said 5, both preserved") requires the discovered
   value to survive being overwritten in the canonical column.
   **Recommendation: add nullable `valueJson Json?` and `sourceName String?`
   to `PropertyFactEvidence`** rather than creating a parallel observation
   table — one provenance system, populated only for externally sourced
   evidence. (Fallback if the platform owner wants the evidence table pure: a
   narrow `PropertyDiscoveredValue` table keyed to evidence rows.)
3. **`PropertySourceRecord` (new, kept from original):** raw connector
   payloads (`provider`, `externalReference` = parcel ID, `payloadJson`,
   `retrievedAt`, `expiresAt`) for debugging and reprocessing. Licensing-safe
   under free government sources.

Total: 3 columns + 1 table + 1–2 columns on an existing table. Within the
original "two to three new tables" budget, under it.

## 7. Field mapping corrections (vs original recommendation)

| Original doc said | Actual schema |
|---|---|
| `squareFootage` / `livingArea` | `propertySize` (Int) — fact key `core.propertySizeSqFt` |
| `propertyType` (single field) | Four orthogonal enums; enrichment populates **`dwellingType` only** |
| `roofInstallYear` / `roofAge` | `roofReplacementYear` — `USER_ONLY` in Phase 1 |
| `bedrooms`, `bathrooms`, `yearBuilt` | Exist as named; `bathrooms` is `Float` (normalize full/half counts) |

## 8. Success metrics

- % of new onboardings with ≥1 field discovered (overall and per covered county)
- Per-field fill rate and per-field user-correction rate (confidence calibration)
- Wrong-parcel rejection rate at the guardrail step
- Onboarding completion time and drop-off vs pre-launch baseline
- Coverage: % of new-property counties with a connector

## 9. FRD requirements to add

1. **Core principle (top of FRD):** "Never ask the homeowner for information
   we can discover with confidence from free public sources," with the two
   corollaries from §1 (confidence thresholds; partial coverage with graceful
   ask-flow fallback).
2. **Additive constraint (kept from original, reworded):** Phase 1 is an
   additive enhancement inside the existing Property Context Platform. The
   existing `Property` record remains the operational source of truth;
   provenance is stored in the platform's evidence model; no primary-key
   changes; no mandatory changes outside onboarding/property-profile paths;
   existing consumers continue functioning unmodified.
3. **Source constraint:** free public/government sources only; official APIs
   and published datasets only (no HTML scraping); raw payload retention
   permitted for open-licensed government data.
4. **Trust constraint:** unconfirmed `PUBLIC_RECORD` values may prefill UI but
   may not suppress safety-relevant capture requirements until user-verified.
5. **Removed:** the original "legacy architecture preservation / strangler
   evolution" section — superseded by the Property Context FRD's greenfield
   policy (§2 above).

## 10. Open questions for product

1. Which jurisdiction is the flagship connector? (Should follow where real
   early users are.)
2. Is the 3–5s synchronous lookup budget acceptable in onboarding, or should
   discovery be fully async with prefill-on-return?
3. When discovery finds a value for a field the user already filled manually
   (re-enrichment of existing properties), do we surface a "public records
   differ" nudge, or stay silent? Recommendation: silent in Phase 1a,
   nudge as a Phase 1b experiment.
4. Should existing properties be backfill-enriched at launch, or only new
   onboardings? Recommendation: new onboardings first; backfill behind the
   same guardrail UX once correction rates look healthy.
