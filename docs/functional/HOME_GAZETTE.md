# Home Gazette — Comprehensive Feature Documentation

> **Version:** 1.0 | **Date:** 2026-03-17 | **Status:** Production

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Tables & Enums](#3-database-tables--enums)
4. [Generation Pipeline](#4-generation-pipeline)
5. [Backend Files](#5-backend-files)
6. [Frontend Files](#6-frontend-files)
7. [Worker Files](#7-worker-files)
8. [Mobile / Navigation](#8-mobile--navigation)
9. [Scoring & Ranking Logic](#9-scoring--ranking-logic)
10. [Editorial AI Layer](#10-editorial-ai-layer)
11. [Share Link System](#11-share-link-system)
12. [Analytics Instrumentation](#12-analytics-instrumentation)
13. [Key Assumptions](#13-key-assumptions)
14. [End-to-End Testing](#14-end-to-end-testing)
15. [Future Enhancements](#15-future-enhancements)

---

## 1. Feature Overview

**Home Gazette** is a weekly AI-enriched property intelligence digest. Every Monday it automatically generates a personalized "newspaper edition" for each homeowner, surfacing the most important stories about their property — maintenance alerts, risk changes, insurance gaps, neighborhood activity, financial signals, and more.

### Goals

- Give homeowners a single weekly summary so they never miss an important property event
- Surface actionable intelligence across all C2C features in one place
- Increase feature discoverability and engagement through ranked, contextual storytelling
- Provide shareable editions for social or professional sharing

### Key Characteristics

| Property | Value |
|---|---|
| Cadence | Weekly (Mondays 6:00 AM EST) |
| Min stories to publish | 4 |
| Max stories per edition | 8 (configurable) |
| AI enrichment | Gemini (with deterministic fallback) |
| Share links | SHA-256 hashed, 30-day expiry |
| Sources tapped | 8 upstream data domains |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  WORKER (BullMQ cron — Monday 6 AM EST)                         │
│  gazetteGeneration.job.ts                                        │
│    └─► iterates all properties → GazetteGenerationJobRunnerService│
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  GENERATION PIPELINE (6 stages)                                  │
│                                                                  │
│  1. SIGNAL_COLLECTION     GazetteSignalCollector                 │
│     └─ 8 data sources queried in parallel                        │
│                                                                  │
│  2. CANDIDATE_GENERATION  GazetteCandidateFactory               │
│     └─ signals → upserted GazetteStoryCandidate rows            │
│                                                                  │
│  3. RANKING               GazetteRankingEngine                   │
│     └─ composite score → exclusion gates → dedup → trace         │
│                                                                  │
│  4. EDITORIAL_GENERATION  GazetteEditorialService (AI)           │
│     └─ Gemini enrichment per story, with deterministic fallback  │
│                                                                  │
│  5. VALIDATION            GazetteEditionAssembler                │
│     └─ filters invalid copy, enforces length/quality rules       │
│                                                                  │
│  6. PUBLICATION           GazettePublishService                  │
│     └─ qualifiedCount ≥ 4 → PUBLISHED else SKIPPED              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  DATABASE (PostgreSQL via Prisma)                                │
│  gazette_editions / gazette_stories / gazette_story_candidates   │
│  gazette_selection_traces / gazette_generation_jobs              │
│  gazette_share_links                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  BACKEND REST API                                                │
│  GET  /api/gazette/current                                       │
│  GET  /api/gazette/editions                                      │
│  GET  /api/gazette/editions/:id                                  │
│  POST /api/gazette/editions/:id/share                            │
│  POST /api/gazette/share/:token/revoke                           │
│  GET  /api/gazette/share/:token  (public)                        │
│  POST /api/internal/gazette/generate  (admin)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  FRONTEND (Next.js 14)                                           │
│  /dashboard/properties/[id]/tools/home-gazette  (authenticated)  │
│  /gazette/share/[token]  (public, unauthenticated)               │
│  GazetteDashboardCard  (property dashboard preview)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Tables & Enums

### Enums

```sql
-- Edition lifecycle
CREATE TYPE "GazetteEditionStatus" AS ENUM (
  'DRAFT',       -- in progress / being built
  'READY',       -- assembled, not yet published
  'PUBLISHED',   -- live and visible to homeowner
  'SKIPPED',     -- not enough qualified stories (< minQualifiedNeeded)
  'FAILED'       -- generation error (reset to DRAFT on retry)
);

-- Story subject matter
CREATE TYPE "GazetteStoryCategory" AS ENUM (
  'RISK',           -- Property risk assessment signals
  'MAINTENANCE',    -- Maintenance tasks / checklists
  'INCIDENT',       -- Home incidents
  'CLAIMS',         -- Insurance claims
  'INSURANCE',      -- Insurance policy alerts / gaps
  'WARRANTY',       -- Warranty expiry / coverage
  'FINANCIAL',      -- Financial efficiency / utility savings
  'REFINANCE',      -- Mortgage refinance opportunities
  'NEIGHBORHOOD',   -- Neighborhood event/impact signals
  'SEASONAL',       -- Seasonal maintenance reminders
  'SCORE',          -- Home score changes
  'DIGITAL_TWIN',   -- Digital twin updates
  'GENERAL'         -- Fallback category
);

-- Story prominence within an edition
CREATE TYPE "GazetteStoryPriority" AS ENUM (
  'HERO',    -- Rank 1 — lead story
  'HIGH',    -- Ranks 2–4
  'MEDIUM',  -- Ranks 5–7
  'LOW'      -- Rank 8+
);

-- Generation pipeline stages (tracked per job record)
CREATE TYPE "GazetteGenerationStage" AS ENUM (
  'SIGNAL_COLLECTION',
  'CANDIDATE_GENERATION',
  'RANKING',
  'EDITORIAL_GENERATION',
  'VALIDATION',
  'PUBLICATION'
);

-- Candidate pool state
CREATE TYPE "GazetteCandidateStatus" AS ENUM (
  'ACTIVE',    -- eligible for this run
  'SELECTED',  -- promoted to a story in an edition
  'EXCLUDED',  -- rejected during ranking (see exclusionReason)
  'EXPIRED'    -- past expiresAt deadline
);

-- Why a candidate was not included
CREATE TYPE "GazetteExclusionReason" AS ENUM (
  'LOW_SCORE',                  -- composite score < MIN_NEWSWORTHY_SCORE (0.40)
  'LOW_CONFIDENCE',             -- confidenceScore < 0.25
  'DUPLICATE',                  -- near-duplicate headline (Jaccard ≥ 0.65)
  'EXPIRED',                    -- expiresAt < now
  'CATEGORY_CAP',               -- category diversity cap hit
  'NOT_SHARE_SAFE',             -- shareSafe = false (INCIDENT / CLAIMS)
  'MISSING_DEEP_LINK',          -- primaryDeepLink absent or invalid
  'MISSING_SUPPORTING_FACTS',   -- supportingFactsJson empty
  'BELOW_NEWSWORTHY_THRESHOLD'  -- does not meet newsworthiness criteria
);

-- Share link lifecycle
CREATE TYPE "GazetteShareStatus" AS ENUM (
  'ACTIVE',   -- valid, usable
  'REVOKED',  -- manually revoked by owner
  'EXPIRED'   -- past expiresAt (30 days)
);

-- AI enrichment outcome per story
CREATE TYPE "GazetteAiStatus" AS ENUM (
  'NOT_REQUESTED',  -- AI disabled or skipped
  'GENERATED',      -- AI copy accepted
  'FALLBACK_USED',  -- AI failed validation, deterministic fallback used
  'FAILED'          -- AI threw error, fallback used
);
```

---

### Tables

#### `gazette_editions`
One row per property per week. The central record tying everything together.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (CUID) | PK |
| `propertyId` | TEXT | FK → properties.id |
| `weekStart` | TIMESTAMP | Monday 00:00:00 UTC |
| `weekEnd` | TIMESTAMP | Sunday 23:59:59.999 UTC |
| `publishDate` | TIMESTAMP | Nullable — set on publish |
| `status` | GazetteEditionStatus | Default: DRAFT |
| `minQualifiedNeeded` | INT | Publish threshold, default 4 |
| `qualifiedCount` | INT | Stories that passed all gates |
| `selectedCount` | INT | Stories actually in the edition |
| `skippedReason` | TEXT | Nullable — why SKIPPED |
| `heroStoryId` | TEXT | Nullable — FK to gazette_stories |
| `summaryHeadline` | TEXT | AI or fallback edition headline |
| `summaryDeck` | TEXT | AI or fallback edition sub-headline |
| `tickerJson` | JSONB | Array of {label, headline} ticker items |
| `generationVersion` | TEXT | Pipeline version tag |
| `publishedAt` | TIMESTAMP | Nullable |
| `createdAt` / `updatedAt` | TIMESTAMP | Auto-managed |

**Indexes:**
- `(propertyId, weekStart)` — lookup current edition
- `(status)` — filter published editions
- `UNIQUE (propertyId, weekStart, weekEnd)` — idempotency guard

---

#### `gazette_stories`
Individual stories within a published edition.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `editionId` | TEXT | FK → gazette_editions.id (CASCADE) |
| `propertyId` | TEXT | Denormalized for fast queries |
| `sourceFeature` | TEXT | E.g. `MAINTENANCE`, `INCIDENT` |
| `sourceEventId` | TEXT | Nullable — source entity ID |
| `storyCategory` | GazetteStoryCategory | |
| `storyTag` | TEXT | Nullable — freeform sub-tag |
| `entityType` | TEXT | E.g. `MaintenanceTask` |
| `entityId` | TEXT | Source entity primary key |
| `priority` | GazetteStoryPriority | Derived from rank |
| `rank` | INT | 1 = hero |
| `isHero` | BOOLEAN | True for rank 1 |
| `headline` | TEXT | AI or fallback |
| `dek` | TEXT | Nullable sub-headline |
| `summary` | TEXT | AI or fallback body |
| `supportingFactsJson` | JSONB | Facts used to generate copy |
| `rankExplanation` | TEXT | Human-readable scoring explanation |
| `urgencyScore` | FLOAT | 0–1 |
| `financialImpactEstimate` | FLOAT | Dollar amount |
| `confidenceScore` | FLOAT | 0–1 |
| `noveltyScore` | FLOAT | 0–1 |
| `engagementScore` | FLOAT | 0–1 |
| `compositeScore` | FLOAT | Weighted composite |
| `primaryDeepLink` | TEXT | Must start with /dashboard/ |
| `secondaryDeepLink` | TEXT | Nullable |
| `shareSafe` | BOOLEAN | False for INCIDENT/CLAIMS |
| `aiStatus` | GazetteAiStatus | |
| `aiModel` | TEXT | Gemini model version |
| `aiPromptVersion` | TEXT | Prompt template version |
| `aiValidationJson` | JSONB | Validation result details |
| `createdAt` / `updatedAt` | TIMESTAMP | |

**Indexes:** `(editionId, rank)`, `(propertyId, storyCategory)`, `(entityType, entityId)`

---

#### `gazette_story_candidates`
The active story pool. Candidates persist across weeks (upserted on noveltyKey), allowing novelty tracking and cross-week scoring.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `editionId` | TEXT | Nullable FK — set when selected |
| `propertyId` | TEXT | |
| `sourceFeature` | TEXT | |
| `sourceEventId` | TEXT | Nullable |
| `storyCategory` | GazetteStoryCategory | |
| `storyTag` | TEXT | Nullable |
| `entityType` | TEXT | |
| `entityId` | TEXT | |
| `headlineHint` | TEXT | Nullable — hint for AI generation |
| `supportingFactsJson` | JSONB | Structured facts (non-empty required) |
| `urgencyScoreInput` | FLOAT | Input urgency 0–1 |
| `financialImpactEstimate` | FLOAT | |
| `confidenceScore` | FLOAT | |
| `engagementScore` | FLOAT | |
| `noveltyScore` | FLOAT | Computed: decays each week candidate seen |
| `compositeScore` | FLOAT | Final weighted score |
| `noveltyKey` | TEXT | SHA-256 of `sourceFeature:entityType:entityId` |
| `firstDetectedAt` | TIMESTAMP | When first created |
| `lastUpdatedAt` | TIMESTAMP | When last upserted |
| `storyDeadline` | TIMESTAMP | Nullable — hard deadline for story |
| `expiresAt` | TIMESTAMP | urgency ≥ 0.7 → +7d, else +14d |
| `primaryDeepLink` | TEXT | |
| `secondaryDeepLink` | TEXT | Nullable |
| `shareSafe` | BOOLEAN | |
| `status` | GazetteCandidateStatus | Default: ACTIVE |
| `exclusionReason` | GazetteExclusionReason | Nullable |
| `exclusionDetail` | TEXT | Nullable — extra context |
| `selectionRank` | INT | Nullable — rank if selected |
| `rankAdjustmentReason` | TEXT | Nullable |
| `createdAt` / `updatedAt` | TIMESTAMP | |

**Indexes:** `(propertyId, status)`, `(propertyId, noveltyKey)`, `(editionId, selectionRank)`, `(sourceFeature, entityType, entityId)`

---

#### `gazette_selection_traces`
Audit trail for every ranking decision. Used for debugging and future ML training data.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `editionId` | TEXT | FK → gazette_editions.id (CASCADE) |
| `candidateId` | TEXT | Nullable — which candidate |
| `propertyId` | TEXT | Denormalized |
| `preScore` | FLOAT | Score before adjustments |
| `postScore` | FLOAT | Score after adjustments |
| `finalRank` | INT | Nullable — assigned rank if included |
| `included` | BOOLEAN | True if story made it into edition |
| `exclusionReason` | GazetteExclusionReason | Nullable |
| `rankAdjustmentReason` | TEXT | Nullable |
| `rankExplanation` | TEXT | Human-readable |
| `traceJson` | JSONB | Full scoring breakdown |
| `createdAt` | TIMESTAMP | |

**Indexes:** `(editionId, included, finalRank)`, `(propertyId, createdAt)`

---

#### `gazette_generation_jobs`
Per-stage job tracking. One row per stage per generation run.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `editionId` | TEXT | Nullable FK |
| `propertyId` | TEXT | |
| `stage` | GazetteGenerationStage | |
| `status` | GazetteEditionStatus | |
| `startedAt` | TIMESTAMP | Nullable |
| `finishedAt` | TIMESTAMP | Nullable |
| `attemptCount` | INT | Default 0 |
| `errorMessage` | TEXT | Nullable |
| `metricsJson` | JSONB | Nullable — timing, counts |
| `createdAt` / `updatedAt` | TIMESTAMP | |

**Indexes:** `(propertyId, stage)`, `(editionId)`

---

#### `gazette_share_links`
Secure public share links for published editions.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK |
| `editionId` | TEXT | FK → gazette_editions.id (CASCADE) |
| `propertyId` | TEXT | Denormalized |
| `tokenHash` | TEXT | SHA-256 of raw token (UNIQUE) |
| `status` | GazetteShareStatus | Default: ACTIVE |
| `expiresAt` | TIMESTAMP | Default: now + 30 days |
| `revokedAt` | TIMESTAMP | Nullable |
| `lastViewedAt` | TIMESTAMP | Nullable — updated on each view |
| `viewCount` | INT | Default 0 |
| `metadataJson` | JSONB | Nullable — creator metadata |
| `createdAt` / `updatedAt` | TIMESTAMP | |

**Indexes:** `UNIQUE (tokenHash)`, `(editionId, status)`, `(propertyId, status)`

---

## 4. Generation Pipeline

### Stage 1 — Signal Collection

**Service:** `GazetteSignalCollector`

Queries 8 upstream data domains in parallel via `Promise.allSettled` (individual domain failures don't abort the run):

| Source | Prisma Model | Time Window | Key Fields Extracted |
|---|---|---|---|
| MAINTENANCE | MaintenanceTask | Overdue or due within +7 days | title, priority, status, dueDate |
| INCIDENT | Incident | Last 30 days | type, severity, status, financialImpact |
| CLAIMS | InsuranceClaim | Open or recent | type, status, amount, openedAt |
| WARRANTY | WarrantyItem | Expiring within +90 days | item, expiryDate, coverageType |
| INSURANCE | InsurancePolicy | Renewing within +60 days | provider, type, renewalDate, premium |
| SCORE | RiskAssessment | Latest snapshot | overallScore, delta, category breakdowns |
| REFINANCE | MortgageRateAlert | Active alerts | currentRate, marketRate, potentialSaving |
| NEIGHBORHOOD | NeighborhoodEvent | Last 14 days | eventType, impactLevel, radius, description |

Each source returns a normalized `SourceSignal` object:
```typescript
interface SourceSignal {
  sourceFeature: string;
  sourceEventId?: string;
  storyCategory: GazetteStoryCategory;
  entityType: string;
  entityId: string;
  headlineHint?: string;
  supportingFacts: Record<string, unknown>;  // whitelist-controlled
  urgencyScore: number;       // 0–1
  financialImpactEstimate?: number;
  confidenceScore: number;    // 0–1
  engagementScore?: number;   // 0–1
  primaryDeepLink: string;    // must start with /dashboard/
  secondaryDeepLink?: string;
  shareSafe: boolean;
  storyDeadline?: Date;
}
```

---

### Stage 2 — Candidate Generation

**Service:** `GazetteCandidateFactory`

**Novelty Key:** SHA-256 hex of `"sourceFeature:entityType:entityId"` — ensures the same real-world entity maps to one candidate row across all weeks.

**Upsert logic:**
- Existing ACTIVE candidate → update scores, supportingFacts, lastUpdatedAt; decay noveltyScore slightly
- New signal → create candidate with `firstDetectedAt = now`

**Expiry assignment:**
- `urgencyScore ≥ 0.70` → `expiresAt = now + 7 days`
- `urgencyScore < 0.70` → `expiresAt = now + 14 days`
- Hard cap: max 28 days (`DEFAULT_EXPIRY_DAYS × 2`)

**Stale cleanup:** At the start of each run, any ACTIVE candidates with `expiresAt < now` are bulk-updated to EXPIRED before processing begins.

---

### Stage 3 — Ranking

**Service:** `GazetteRankingEngine`

#### Composite Score Formula
```
compositeScore = 0.30 × urgencyScore
              + 0.25 × normalizedFinancialImpact
              + 0.20 × confidenceScore
              + 0.15 × noveltyScore
              + 0.10 × engagementScore
```

Financial impact is normalized: `min(financialImpactEstimate / 10000, 1.0)` (capped at $10,000).

#### Exclusion Gates (in order)
1. **Missing deep link** — `primaryDeepLink` absent or not starting with `/dashboard/` → `MISSING_DEEP_LINK`
2. **Missing supporting facts** — `supportingFactsJson` empty → `MISSING_SUPPORTING_FACTS`
3. **Expired** — `expiresAt < now` → `EXPIRED`
4. **Low confidence** — `confidenceScore < 0.25` → `LOW_CONFIDENCE`
5. **Below newsworthy threshold** — `compositeScore < 0.40` → `BELOW_NEWSWORTHY_THRESHOLD`
6. **Near-duplicate headline** — Jaccard similarity ≥ 0.65 vs. higher-ranked story → `DUPLICATE`

#### Near-Duplicate Detection
Uses Jaccard word-overlap on headline hints:
```
similarity = |words(a) ∩ words(b)| / |words(a) ∪ words(b)|
```
Only words with 3+ characters are counted. Threshold: `0.65`. Lower-ranked candidate is marked DUPLICATE.

#### Category Diversity Cap
Maximum 2 stories per `GazetteStoryCategory` in a single edition.

#### Priority Assignment (from rank)
| Rank | Priority |
|---|---|
| 1 | HERO |
| 2–4 | HIGH |
| 5–7 | MEDIUM |
| 8+ | LOW |

All ranking decisions are recorded in `gazette_selection_traces` for full auditability.

---

### Stage 4 — Editorial Generation (AI)

See [Section 10 — Editorial AI Layer](#10-editorial-ai-layer).

---

### Stage 5 — Validation

After editorial enrichment, each story is validated:
- Headline non-empty, ≤ 90 chars
- Dek ≤ 160 chars
- Summary non-empty, ≤ 500 chars
- Headline ≠ Dek (no duplication)
- No generic filler phrases (e.g. "something happened", "your home")
- No unsupported urgency words (e.g. "urgent", "critical") unless `urgencyScore ≥ 0.70`
- No numbers in copy that don't appear in `supportingFacts`

Stories failing validation are removed from the edition. The `stories` array is reassigned: `stories = validStories`. If this drops below `minQualifiedNeeded`, the edition is SKIPPED.

---

### Stage 6 — Publication

**Service:** `GazettePublishService`

```
if qualifiedCount >= minQualifiedNeeded (4):
    → status = PUBLISHED, publishedAt = now
    → analytics event: GAZETTE_EDITION_PUBLISHED
    → notification: homeowner notified
else:
    → status = SKIPPED, skippedReason = "Insufficient qualified stories"
```

Story creation (all `gazette_stories` rows + edition status update) is wrapped in a single `prisma.$transaction()` to prevent partial writes.

**Idempotency:** If the edition for `(propertyId, weekStart)` is already PUBLISHED, the runner returns `{ status: 'ALREADY_PUBLISHED' }` immediately without re-running.

**Failed edition recovery:** If a previous run left the edition in FAILED state, it is reset to DRAFT before retrying.

---

## 5. Backend Files

```
apps/backend/src/modules/gazette/
├── gazette.routes.ts                          — Homeowner REST routes
├── gazetteInternal.routes.ts                  — Admin-only REST routes
│
├── controllers/
│   ├── gazette.controller.ts                  — Homeowner endpoints
│   └── gazetteInternal.controller.ts          — Admin endpoints
│
├── services/
│   ├── gazetteGenerationJobRunner.service.ts  — Pipeline orchestrator
│   ├── gazetteSignalCollector.service.ts      — Data source queries
│   ├── gazetteCandidateFactory.service.ts     — Signal → candidate upserts
│   ├── gazetteRankingEngine.service.ts        — Scoring, gates, dedup
│   ├── gazetteEditionAssembler.service.ts     — Story creation (transactional)
│   ├── gazettePublish.service.ts              — Publish/skip + week window
│   └── gazetteShare.service.ts               — Share link CRUD
│
├── editorial/
│   ├── GazetteEditorialService.ts             — AI orchestrator
│   ├── GazetteHeadlineGenerator.ts            — Story-level Gemini call
│   ├── GazetteSummaryGenerator.ts             — Edition-level Gemini call
│   ├── GazetteEditorialPromptBuilder.ts       — Prompt templates
│   ├── GazetteEditorialValidator.ts           — Copy safety validation
│   ├── GazetteEditorialFallbackBuilder.ts     — Deterministic fallback copy
│   ├── GazetteEditorialTypes.ts               — Editorial TypeScript types
│   ├── GazetteTickerGenerator.ts             — Ticker strip assembly
│   └── gazetteFallbackEditorial.ts            — Per-category fallback templates
│
├── mappers/
│   └── gazette.mapper.ts                      — DB → DTO conversions
│
├── validators/
│   └── gazette.validators.ts                  — Zod v4 request schemas
│
├── types/
│   └── gazette.types.ts                       — Internal TypeScript types
│
└── dto/
    └── gazette.dto.ts                         — API response shapes
```

### REST API Endpoints

#### Homeowner-Facing (authenticated)

| Method | Path | Description |
|---|---|---|
| GET | `/api/gazette/current?propertyId=` | Latest PUBLISHED edition for a property |
| GET | `/api/gazette/editions?propertyId=&page=&pageSize=` | Paginated edition history |
| GET | `/api/gazette/editions/:editionId` | Full edition with all stories |
| POST | `/api/gazette/editions/:editionId/share` | Create a share link |
| POST | `/api/gazette/share/:token/revoke` | Revoke a share link |
| GET | `/api/gazette/share/:token` | Public share view (rate-limited) |

#### Admin-Only (`ADMIN` role required)

| Method | Path | Description |
|---|---|---|
| POST | `/api/internal/gazette/generate` | Trigger generation for one property |
| GET | `/api/internal/gazette/editions/:id/trace` | Selection trace audit |
| GET | `/api/internal/gazette/editions/:id/candidates` | Candidate pool for edition |
| POST | `/api/internal/gazette/editions/:id/regenerate` | Reset + re-run edition |
| GET | `/api/internal/gazette/jobs?propertyId=&stage=&limit=` | Job history |

### Request/Response Schemas (Zod)

```typescript
generateEditionSchema = z.object({
  propertyId: z.string().uuid(),
  weekStart: z.string().optional(),
  weekEnd: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

shareTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);  // 64-char hex
editionIdParamSchema = z.string().min(1).max(128);

editionListQuerySchema = z.object({
  propertyId: z.string().min(1),
  page: z.string().optional().transform(Number).pipe(z.number().min(1)),
  pageSize: z.string().optional().transform(Number).pipe(z.number().min(1).max(50)),
});
```

---

## 6. Frontend Files

```
apps/frontend/src/app/
│
├── (dashboard)/dashboard/properties/[id]/
│   ├── tools/home-gazette/
│   │   ├── page.tsx                      — Server component wrapper
│   │   ├── HomeGazetteClient.tsx          — Main tool page (Current + History tabs)
│   │   └── homeGazetteApi.ts             — Typed API client for gazette endpoints
│   │
│   └── components/
│       └── GazetteDashboardCard.tsx       — Property dashboard preview card
│
└── gazette/share/[token]/
    ├── page.tsx                           — Server component wrapper
    └── GazetteShareViewClient.tsx         — Public share page (unauthenticated)
```

### HomeGazetteClient.tsx

**Route:** `/dashboard/properties/[id]/tools/home-gazette`

**UI States:**
1. **Loading** — skeleton placeholder while fetching
2. **Bootstrap** — "Your Home Gazette is being set up" (no edition yet)
3. **Skipped** — "Quiet week" — not enough signals, check back next week
4. **Published** — Full edition view:
   - Hero story card with `TOP STORY` label, category badge, urgency/financial metrics, CTA deep link button
   - Ranked story list (HIGH, MEDIUM, LOW priority stories)
   - Ticker strip ("Updates" section — bullet-separated headlines)
   - Share button → modal showing share URL + copy-to-clipboard

**History Tab:** Paginated list of past editions (12 per page). Each card shows week range, story count, status badge, and hero headline.

**Category Color Mapping:**
```
RISK          → red
MAINTENANCE   → amber
INCIDENT      → orange
CLAIMS        → red
INSURANCE     → purple
WARRANTY      → indigo
FINANCIAL     → emerald
REFINANCE     → teal
NEIGHBORHOOD  → cyan
SEASONAL      → lime
SCORE         → blue
DIGITAL_TWIN  → violet
GENERAL       → slate
```

### GazetteShareViewClient.tsx

**Route:** `/gazette/share/[token]` (public, no authentication)

- Validates token format client-side (64-char hex regex) before API call
- Filters `shareSafe !== false` stories (removes INCIDENT/CLAIMS)
- Shows view count and expiry info from `shareInfo`
- Graceful error states for revoked/expired/not-found tokens
- Home Gazette branding header visible to non-users (marketing surface)

### homeGazetteApi.ts

All API calls use `fetch` with `Authorization: Bearer` header from session.

```typescript
getCurrentEdition(propertyId: string): Promise<GazetteEditionDto | null>
getEditions(propertyId: string, page?: number, pageSize?: number): Promise<GazetteEditionsResult>
getEdition(editionId: string): Promise<GazetteEditionDto>
createShareLink(editionId: string): Promise<GazetteShareResult>
revokeShareLink(token: string): Promise<GazetteShareLinkDto>
```

### GazetteDashboardCard.tsx

Property-level dashboard preview card. Gated by `FEATURE_FLAGS.HOME_GAZETTE`.

- Uses React Query (`staleTime: 10 minutes`)
- States: loading skeleton, bootstrap ("being set up"), skipped ("quiet week"), published (week range + story count + hero headline)
- Clicking opens the full Home Gazette tool page

---

## 7. Worker Files

```
apps/workers/src/
└── jobs/
    └── gazetteGeneration.job.ts     — Weekly batch job (all properties)
```

**Registry key:** `home-gazette-generation`

**Cron schedule:** `HOME_GAZETTE_GENERATION_CRON` env var (default: Mondays 6:00 AM EST, after weekly risk score snapshots at 4 AM)

**Logic:**
```typescript
async function runGazetteGenerationJob(): Promise<void> {
  const properties = await prisma.property.findMany({ select: { id: true } });

  for (const property of properties) {
    try {
      const result = await GazetteGenerationJobRunnerService.generate({
        propertyId: property.id,
      });
      // log: PUBLISHED / SKIPPED / ALREADY_PUBLISHED
    } catch (error) {
      failed++;
      // log error — continues to next property
    }
  }
  // Final summary log: published, skipped, alreadyPublished, failed, total
}
```

**Error isolation:** A failure on one property does not abort the batch. All properties are always attempted.

**Stubs (Docker build):** The worker Docker image cannot use all backend dependencies directly. Two stubs are used:
- `apps/workers/stubs/error-middleware.ts` — Exports `APIError` class without Express dependency
- `apps/workers/stubs/notification-service.ts` — No-op `NotificationService.create()` (logs intent)

---

## 8. Mobile / Navigation

### Navigation Entry Point

Home Gazette is accessible via the **More** menu in the top navigation (same as other home tools):

```
More → Home Tools → Home Gazette
Path: /dashboard/properties/[id]/tools/home-gazette
```

### Property Dashboard Card

`GazetteDashboardCard` appears on the property detail page alongside other tool cards (Home Event Radar, Risk Replay, Status Board). Acts as the primary discovery surface — clicking opens the full gazette page.

### Related Tools (shown in gazette header)
- Home Event Radar
- Home Risk Replay
- Status Board

### Mobile Considerations
- Glass morphism UI uses `backdrop-blur` and translucent cards consistent with the rest of the C2C PWA design system
- Ticker strip scrolls horizontally on small screens
- Share modal is a centered dialog, mobile-friendly
- Public share page (`/gazette/share/[token]`) is fully responsive and works without app install

---

## 9. Scoring & Ranking Logic

### Composite Score Weights

| Factor | Weight | Source |
|---|---|---|
| Urgency Score | 30% | Signal collector per domain |
| Financial Impact | 25% | Normalized: `min(amount / 10000, 1.0)` |
| Confidence Score | 20% | Signal reliability from source |
| Novelty Score | 15% | Decays each week candidate is seen |
| Engagement Score | 10% | Historical click/interaction data |

### Thresholds

| Threshold | Value | Purpose |
|---|---|---|
| `MIN_NEWSWORTHY_SCORE` | 0.40 | Soft gate — below this = excluded |
| `MIN_CONFIDENCE` | 0.25 | Hard gate — prevents low-quality signals |
| `NEAR_DUPLICATE_THRESHOLD` | 0.65 | Jaccard similarity for headline dedup |
| `MIN_WORD_LENGTH` | 3 | Ignore short words in Jaccard comparison |
| `MIN_QUALIFIED_NEEDED` | 4 | Edition publish threshold |
| `MAX_STORIES_PER_EDITION` | 8 | Diversity cap |
| `MAX_PER_CATEGORY` | 2 | Category diversity cap |

### Novelty Decay

Novelty score decreases each week a candidate persists without being selected, preventing stale stories from occupying slots indefinitely.

---

## 10. Editorial AI Layer

### Model
- **Provider:** Google Gemini (`@google/genai`)
- **Temperature:** 0.3 (low — factual, consistent output)
- **Max tokens:** 600 per story
- **Timeout:** 10 seconds per call
- **Gate:** Requires `GEMINI_API_KEY` env var; gracefully disabled if absent

### Story-Level Generation (`GazetteHeadlineGenerator`)
Generates per story:
- `headline` — Max 90 chars, factual, no inferred data
- `dek` — Max 160 chars, supporting sub-headline
- `summary` — Max 500 chars, 2–3 sentence prose
- `whyItMatters` — Hero stories only (rank 1)

### Edition-Level Generation (`GazetteSummaryGenerator`)
Generates for the edition as a whole:
- `summaryHeadline` — Edition headline across all stories
- `summaryDeck` — Edition sub-headline
- `tickerItems` — Top 5 stories formatted as ticker bullets

### Prompt Safety Rules (enforced by `GazetteEditorialPromptBuilder`)
- **Facts only:** AI may only use fields from `supportingFacts` (whitelisted)
- **No inferred data:** Cannot reference dates, amounts, entities not in the input
- **Urgency language:** Words like "urgent", "critical", "immediately" only allowed if `urgencyScore ≥ 0.70`
- **Whitelisted fact fields:** title, description, status, priority, severity, category, type, dates, amounts, scores, asset/item names, provider, policy type, claim type, event type, risk type

### Validation (`GazetteEditorialValidator`)
Before accepting AI output:
1. Length bounds enforced (headline ≤ 90, dek ≤ 160, summary ≤ 500)
2. No generic filler phrases
3. Headline ≠ Dek
4. No numbers in copy not present in input facts
5. No unsupported urgency words

**On validation failure:** Falls back to deterministic copy (`gazetteFallbackEditorial.ts`) — `aiStatus = FALLBACK_USED`.

### Deterministic Fallbacks
Every category has templated fallback copy that runs when AI is unavailable or fails validation. This guarantees the gazette always publishes with readable content.

Example (MAINTENANCE):
```
headline: "Maintenance task needs attention"
dek:      "Review your scheduled home maintenance"
summary:  "Your home has a [priority] maintenance task: [title]. ..."
```

---

## 11. Share Link System

### Token Generation
```
rawToken = crypto.randomBytes(32).toString('hex')  // 64-char hex
tokenHash = SHA-256(rawToken)                       // stored in DB
```
The raw token is returned **once** at creation time and never stored. Only the hash is persisted.

### Security Measures
- **Format validation** before DB lookup: `shareTokenSchema` (64-char hex regex) gates all token endpoints, preventing timing attacks on arbitrary strings
- **Token hash:** Even if the DB is compromised, raw tokens cannot be derived
- **Rate limiting:** `GET /api/gazette/share/:token` is protected by `apiRateLimiter`
- **Share-safe filtering:** INCIDENT and CLAIMS stories (`shareSafe = false`) are stripped from public share views
- **Expiry:** Default 30-day expiry; can be revoked by owner at any time

### Share Flow
```
1. Owner: POST /gazette/editions/:id/share
   → rawToken returned (one-time), shareUrl = /gazette/share/{rawToken}

2. Recipient: GET /gazette/share/{rawToken}  (no auth required)
   → token validated (format + hash lookup + status check)
   → viewCount incremented
   → share-safe stories returned

3. Owner: POST /gazette/share/:token/revoke
   → status = REVOKED, revokedAt = now
   → subsequent views get 404
```

---

## 12. Analytics Instrumentation

| Event | Trigger | Properties |
|---|---|---|
| `FEATURE_OPENED` | Edition viewed (getCurrent) | userId, propertyId, GAZETTE module, GAZETTE_EDITION feature |
| `TOOL_USED` | Share link created | userId, propertyId, GAZETTE module, GAZETTE_SHARE feature, editionId |

Analytics uses the `analyticsEmitter.track()` pattern consistent with all other C2C features.

---

## 13. Key Assumptions

| Assumption | Rationale |
|---|---|
| Weekly cadence is sufficient | Homeowners don't need daily digests; weekly rhythm matches how home events unfold |
| 4 stories minimum to publish | Below 4, the edition feels thin and low-value; SKIPPED avoids publishing poor editions |
| 8 stories maximum | More than 8 creates cognitive overload; forces curation and ranking discipline |
| INCIDENT and CLAIMS are not share-safe | These contain sensitive financial/legal information not appropriate for public sharing |
| urgencyScore ≥ 0.70 = high urgency | 0.70 threshold calibrated so roughly top quartile of signals get 7-day expiry |
| Novelty key is source-scoped | `sourceFeature:entityType:entityId` — same entity different features counts as different stories |
| financialImpact normalized to $10,000 | Most home financial events fall below this; prevents single large-dollar event dominating |
| Jaccard threshold 0.65 | Below 0.65 allows legitimately similar but distinct stories; above removes clear duplicates |
| Min word length 3 for Jaccard | Filters noise words (a, an, the, of, my, is) that inflate similarity |
| AI disabled gracefully | Many deployments may not have Gemini key; feature must work fully on deterministic fallbacks |
| Token not re-shown after creation | Security: one-time display forces secure handling by share creator |
| Idempotent generation | Re-running for the same property+week is safe — already-published editions are skipped |
| Per-property error isolation | Worker batch must not stop on one failure — other homeowners always get their edition |
| Week window = ISO Monday–Sunday UTC | Consistent, timezone-neutral week definition across all properties |

---

## 14. End-to-End Testing

### Trigger Manual Generation (Admin)

```bash
# 1. Get admin JWT token (login as admin user)

# 2. Trigger generation for one property
curl -X POST https://api.contracttocozy.com/api/internal/gazette/generate \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "<PROPERTY_UUID>",
    "dryRun": false
  }'

# Expected: { success: true, data: { status: "PUBLISHED"|"SKIPPED", editionId, selectedCount, durationMs } }
```

### Dry Run (Preview Without Publishing)

```bash
curl -X POST https://api.contracttocozy.com/api/internal/gazette/generate \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "propertyId": "<UUID>", "dryRun": true }'
```

### Inspect Ranking Decisions

```bash
# Candidates that were evaluated
curl https://api.contracttocozy.com/api/internal/gazette/editions/<editionId>/candidates \
  -H "Authorization: Bearer <ADMIN_JWT>"

# Full selection trace (why each was included/excluded)
curl https://api.contracttocozy.com/api/internal/gazette/editions/<editionId>/trace \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

### Test Share Flow

```bash
# Create share link (as homeowner)
curl -X POST https://api.contracttocozy.com/api/gazette/editions/<editionId>/share \
  -H "Authorization: Bearer <USER_JWT>"

# Access public share (no auth — open in incognito)
curl https://api.contracttocozy.com/api/gazette/share/<rawToken>
```

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `status: "SKIPPED"` | < 4 qualified stories | Check `/candidates` — look at exclusionReasons |
| 500 on `/gazette/current` | Gazette DB tables missing | Run migration: `npx prisma migrate deploy` |
| Worker `MODULE_NOT_FOUND @google/genai` | Dep in devDependencies only | Move to `dependencies` |
| All stories have `aiStatus: FALLBACK_USED` | `GEMINI_API_KEY` not set | Set env var or expected behaviour |
| Edition stuck in FAILED | Previous run errored mid-pipeline | Runner auto-resets to DRAFT on next run |

---

## 15. Future Enhancements

### Short-Term
- **Push notifications** when a new gazette edition is published (currently only in-app)
- **Email delivery** — weekly email digest with gazette summary + deep links
- **Story read tracking** — mark individual stories as read; persist across sessions
- **Homeowner feedback** — thumbs up/down per story to improve future ranking (implicit engagement score input)

### Medium-Term
- **Personalisation signals** — weight categories by user's historical engagement (e.g. homeowner always clicks FINANCIAL → boost FINANCIAL stories)
- **Category preference settings** — let homeowners mute categories they don't care about (e.g. "don't show REFINANCE")
- **Multi-property digest** — single combined gazette for homeowners with multiple properties
- **Provider cross-sell stories** — include relevant service booking CTAs tied to MAINTENANCE stories (e.g. "Need a roofer? Find one now")
- **Gazette PDF export** — one-click export of the full edition as a branded PDF

### Long-Term
- **ML ranking model** — replace hand-tuned composite score weights with a trained model using selection trace data as training signal
- **Real-time edition preview** (admin) — live preview of what would be generated before the cron fires
- **Homeowner-curated edition** — allow homeowners to promote/demote stories before publication
- **Third-party signal integration** — ingest signals from connected smart home devices (Nest, Ring, etc.)
- **Year-in-review edition** — annual special edition summarising the biggest home events of the year
- **Gazette embeds** — shareable story cards for social media (Open Graph image generation per story)
- **A/B testing framework** — test different prompt versions, ranking weights, and UI layouts with measurable CTR outcomes
