# Negotiation Shield

## Overview

Negotiation Shield is a property-scoped Home Tool that helps a homeowner prepare evidence-backed negotiation guidance and a ready-to-use response draft.

It currently supports five scenarios:

1. Contractor quote review
2. Insurance premium increase
3. Insurance claim settlement
4. Buyer inspection negotiation
5. Contractor urgency pressure

The feature supports three input modes:

1. Manual only
2. Upload only
3. Hybrid (manual + uploaded document)

At a high level, the flow is:

1. Create a property-scoped case
2. Save manual input and/or attach documents
3. Parse attached documents into structured case input
4. Merge manual and parsed input
5. Run scenario-specific analysis
6. Persist the latest analysis and latest draft
7. Render the case in the Negotiation Shield workspace

---

## Database Schema

Source of truth:

- `apps/backend/prisma/schema.prisma`

### Core enums

Negotiation Shield uses these enums:

- `NegotiationShieldScenarioType`
  - `CONTRACTOR_QUOTE_REVIEW`
  - `INSURANCE_PREMIUM_INCREASE`
  - `INSURANCE_CLAIM_SETTLEMENT`
  - `BUYER_INSPECTION_NEGOTIATION`
  - `CONTRACTOR_URGENCY_PRESSURE`
- `NegotiationShieldCaseStatus`
  - `DRAFT`
  - `READY_FOR_REVIEW`
  - `ANALYZED`
  - `ARCHIVED`
- `NegotiationShieldSourceType`
  - `MANUAL`
  - `DOCUMENT_UPLOAD`
  - `HYBRID`
- `NegotiationShieldInputType`
  - `CONTRACTOR_QUOTE`
  - `INSURANCE_PREMIUM`
  - `INSURANCE_CLAIM_SETTLEMENT`
  - `BUYER_INSPECTION`
  - `CONTRACTOR_URGENCY`
- `NegotiationShieldDocumentType`
  - `QUOTE`
  - `PREMIUM_NOTICE`
  - `CLAIM_SETTLEMENT_NOTICE`
  - `CLAIM_ESTIMATE`
  - `INSPECTION_REPORT`
  - `BUYER_REQUEST`
  - `CONTRACTOR_RECOMMENDATION`
  - `CONTRACTOR_ESTIMATE`
  - `SUPPORTING_DOCUMENT`
- `NegotiationShieldDraftType`
  - `EMAIL`
  - `MESSAGE`

### Core models

#### `NegotiationShieldCase`

Parent workflow record for one property-scoped negotiation review.

Key fields:

- `propertyId`
- `createdByUserId`
- `scenarioType`
- `status`
- `sourceType`
- `title`
- `description`
- `analysisVersion`
- `latestAnalysisAt`
- timestamps

Relations:

- belongs to `Property`
- optional creator relation to `User`
- has many `NegotiationShieldInput`
- has many `NegotiationShieldDocument`
- has many `NegotiationShieldAnalysis`
- has many `NegotiationShieldDraft`

#### `NegotiationShieldInput`

Stores case input without over-normalizing scenario fields.

Key fields:

- `caseId`
- `inputType`
- `rawText`
- `structuredData` (`Json`)

This is used for:

- manual input
- parsed document input
- hybrid flow support

#### `NegotiationShieldDocument`

Stores the link between a case and the shared `Document` model.

Key fields:

- `caseId`
- `documentId`
- `documentType`
- `uploadedAt`

Important detail:

- Negotiation Shield does not duplicate file storage metadata into its own table beyond what is needed to associate a case with a shared `Document`.

#### `NegotiationShieldAnalysis`

Stores persisted scenario analysis results.

Key fields:

- `caseId`
- `scenarioType`
- `summary`
- `findings` (`Json`)
- `negotiationLeverage` (`Json`)
- `recommendedActions` (`Json`)
- `pricingAssessment` (`Json`)
- `confidence`
- `generatedAt`
- `modelVersion`

#### `NegotiationShieldDraft`

Stores generated negotiation message output.

Key fields:

- `caseId`
- `draftType`
- `subject`
- `body`
- `tone`
- `isLatest`
- `createdAt`

### Schema design notes

- Cases are property-scoped, not global.
- Inputs are flexible by design and intentionally stored in `Json`.
- Parsed document content is persisted through existing input records instead of new parsing tables.
- Analysis and draft history are separate records.
- Migration files are intentionally not part of the Negotiation Shield implementation history in this repo; schema code was updated and database migration is expected to be handled manually.

---

## Backend Architecture

### Main backend files

- `apps/backend/src/routes/negotiationShield.routes.ts`
  - Express routes for case CRUD, parsing, analysis, and analytics events
- `apps/backend/src/controllers/negotiationShield.controller.ts`
  - Thin request handlers that validate auth context and delegate to the service layer
- `apps/backend/src/validators/negotiationShield.validators.ts`
  - Zod request schemas for params and bodies
- `apps/backend/src/services/negotiationShield.types.ts`
  - Shared constants, DTO types, scenario enums, pricing/assessment status constants
- `apps/backend/src/services/negotiationShield.service.ts`
  - Main orchestration service for create/list/detail/save/attach/parse/analyze/event tracking
- `apps/backend/src/services/negotiationShieldDocumentParsing.service.ts`
  - Document text extraction and scenario-aware parsed field extraction

### Scenario-specific analysis services

- `apps/backend/src/services/negotiationShieldContractorQuote.service.ts`
- `apps/backend/src/services/negotiationShieldInsurancePremium.service.ts`
- `apps/backend/src/services/negotiationShieldInsuranceClaimSettlement.service.ts`
- `apps/backend/src/services/negotiationShieldBuyerInspection.service.ts`
- `apps/backend/src/services/negotiationShieldContractorUrgency.service.ts`

Each scenario service produces the same normalized analysis shape:

- `summary`
- `findings`
- `negotiationLeverage`
- `recommendedActions`
- `pricingAssessment`
- `confidence`
- `modelVersion`
- `draft`

### Backend registration

- `apps/backend/src/index.ts`
  - Registers `negotiationShieldRoutes` under `/api`

### API endpoints

All endpoints are property-scoped and sit under:

- `/api/properties/:propertyId/negotiation-shield/...`

Current routes:

- `GET /cases`
  - List case summaries for a property
- `POST /events`
  - Track analytics events for the feature
- `POST /cases`
  - Create a case
- `GET /cases/:caseId`
  - Load case detail
- `PUT /cases/:caseId/input`
  - Save or update manual input
- `POST /cases/:caseId/documents`
  - Attach uploaded document metadata to a case
- `POST /cases/:caseId/documents/:caseDocumentId/parse`
  - Parse an attached document into case input
- `POST /cases/:caseId/analyze`
  - Run scenario analysis and persist the latest analysis and latest draft

### Backend response shape

Case detail responses use a stable shape:

```json
{
  "case": {},
  "inputs": [],
  "documents": [],
  "latestAnalysis": null,
  "latestDraft": null
}
```

This shape is shared across all scenarios and is the contract used by the frontend workspace.

### Parsing and input merging

Negotiation Shield follows these rules:

1. Manual input is preserved
2. Parsed document input is stored as its own `NegotiationShieldInput`
3. Manual structured fields override parsed structured fields
4. Parsed structured fields fill gaps
5. Raw text is merged deterministically

This allows:

- manual-only analysis
- upload-only analysis
- hybrid analysis

without destroying user-entered input.

### Property and auth safety

Negotiation Shield uses existing backend conventions:

- `authenticate`
- `propertyAuthMiddleware`
- property-scoped lookups in the service layer

The service layer still validates that a case belongs to the requested property and that attached documents are valid for that property/user context.

---

## Frontend Architecture

### Main frontend files

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/page.tsx`
  - Route entry point
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/NegotiationShieldToolClient.tsx`
  - Main client UI for launcher, create flow, desktop workspace, mobile flow, results, documents, and draft copy
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/negotiationShieldApi.ts`
  - Feature-specific typed API layer used by the client UI
- `apps/frontend/src/lib/api/client.ts`
  - Shared API client, including `trackNegotiationShieldEvent`

### Launcher and workspace states

The current route supports three primary UI states:

1. Launcher / existing cases
2. Create case
3. Active case workspace

Important detail:

- The active case workspace flow is route-state driven through property-scoped query params rather than separate standalone pages for every sub-state.

### Frontend data behavior

The client uses React Query for:

- property context
- case list
- case detail

Mutation flows update or invalidate cached data so the user can:

- create a case and land in it immediately
- save input without refreshing
- attach or parse a document and see the case update
- analyze and see the latest analysis and latest draft immediately

### Frontend file inventory by responsibility

#### Route and page

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/page.tsx`

#### Main feature shell and workspace UI

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/NegotiationShieldToolClient.tsx`

This file currently owns:

- launcher screen
- scenario quick-start cards
- create case panel
- desktop support rail for active workspaces
- scenario-specific manual forms
- document attachment UI
- parse and analyze actions
- analysis rendering
- draft rendering
- error, empty, and loading states
- analytics event calls

#### Typed API layer

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/negotiationShieldApi.ts`

This file exports:

- scenario/status/source/input/document/draft types
- DTO types
- API helpers for list/detail/create/save/attach/parse/analyze

---

## Frontend Navigation and Discovery

### Desktop Home Tools entry points

Negotiation Shield is registered in:

- `apps/frontend/src/app/(dashboard)/layout.tsx`
  - property-scoped Home Tools nav registration
- `apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx`
  - Home Tools catalog presence and subtitle copy
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`
  - property-level Home Tools rail
- `apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx`
  - label mapping used for property route display and breadcrumbs/path labeling

### Tool icon mapping

Negotiation Shield icon registration appears in:

- `apps/frontend/src/lib/icons/toolIcons.ts`
- `apps/frontend/src/lib/config/iconMapping.ts`
- `apps/frontend/src/lib/icons/iconMapping.json`

### Property-scoped route

Main route:

- `/dashboard/properties/[id]/tools/negotiation-shield`

This route is the only frontend entry for:

- launcher
- create flow
- active workspace

---

## Mobile Navigation

Mobile entry for Negotiation Shield is wired through:

- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

Mobile property-context tool access is still the same tool route:

- `/dashboard/properties/[id]/tools/negotiation-shield`

Current mobile behavior is not a separate architecture. It reuses the same route and the same main client file:

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/NegotiationShieldToolClient.tsx`

Mobile-specific design principles already applied in the feature:

- launcher cards stack cleanly on small screens
- forms remain single-column
- document actions stay tap-friendly
- analysis output is compact and scannable
- draft copy remains easy to reach
- property context and navigation stay consistent with the desktop route

---

## Scenario Coverage

### 1. Contractor quote review

Primary focus:

- quote review
- pricing clarity
- leverage for scope and urgency questions

Key files:

- backend: `negotiationShieldContractorQuote.service.ts`
- frontend: contractor quote form inside `NegotiationShieldToolClient.tsx`

### 2. Insurance premium increase

Primary focus:

- premium jump review
- explanation gaps
- property-backed leverage from upgrades and maintenance

Key files:

- backend: `negotiationShieldInsurancePremium.service.ts`
- frontend: insurance premium form inside `NegotiationShieldToolClient.tsx`

### 3. Insurance claim settlement

Primary focus:

- settlement vs estimate gap
- insurer explanation quality
- supplemental review leverage

Key files:

- backend: `negotiationShieldInsuranceClaimSettlement.service.ts`
- frontend: claim settlement form inside `NegotiationShieldToolClient.tsx`

### 4. Buyer inspection negotiation

Primary focus:

- concession request review
- inspection issue scope
- seller-side leverage and counter framing

Key files:

- backend: `negotiationShieldBuyerInspection.service.ts`
- frontend: buyer inspection form inside `NegotiationShieldToolClient.tsx`

### 5. Contractor urgency pressure

Primary focus:

- same-day pressure detection
- evidence requests
- repair vs replace skepticism

Key files:

- backend: `negotiationShieldContractorUrgency.service.ts`
- frontend: contractor urgency form inside `NegotiationShieldToolClient.tsx`

---

## Analytics and Guardrails

### Analytics transport

Frontend analytics call:

- `apps/frontend/src/lib/api/client.ts`
  - `trackNegotiationShieldEvent`

Backend analytics endpoint:

- `POST /api/properties/:propertyId/negotiation-shield/events`

### Tracked user actions

The feature already tracks key lifecycle events such as:

- feature opened
- scenario selected
- case created
- manual input saved
- document attached
- parse triggered
- parse succeeded / failed
- analysis triggered
- analysis succeeded / failed
- draft copied

### UX guardrails already implemented

- property-scoped access checks
- duplicate action prevention for create/save/parse/analyze
- clear loading and error states
- stale case protection during property switching
- deterministic query cache updates after mutations
- copy confirmation and failure handling for drafts

---

## Implementation Notes

### Shared patterns used by the feature

Negotiation Shield follows the same layered pattern across all scenarios:

1. Schema support in Prisma enums/models
2. Zod validators
3. Controller handlers
4. Central service orchestration
5. Scenario-specific analysis service
6. Shared typed frontend API helpers
7. Single property-scoped route with responsive UI

### What not to change casually

When extending or refactoring Negotiation Shield, avoid changing these lightly:

- case detail response shape
- input merge precedence
- property-scoped route structure
- shared analysis result schema
- analytics event names
- mobile/desktop shared route architecture

### If you add a new scenario later

You will usually need to touch all of the following:

1. Prisma enums in `schema.prisma`
2. backend constants/types in `negotiationShield.types.ts`
3. validators if new document or input types are needed
4. service dispatch in `negotiationShield.service.ts`
5. a new scenario analysis service
6. parsing extraction logic in `negotiationShieldDocumentParsing.service.ts`
7. frontend scenario options in `NegotiationShieldToolClient.tsx`
8. form defaults and document-type defaults in the same client file

---

## File Summary

### Backend

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/index.ts`
- `apps/backend/src/routes/negotiationShield.routes.ts`
- `apps/backend/src/controllers/negotiationShield.controller.ts`
- `apps/backend/src/validators/negotiationShield.validators.ts`
- `apps/backend/src/services/negotiationShield.types.ts`
- `apps/backend/src/services/negotiationShield.service.ts`
- `apps/backend/src/services/negotiationShieldDocumentParsing.service.ts`
- `apps/backend/src/services/negotiationShieldContractorQuote.service.ts`
- `apps/backend/src/services/negotiationShieldInsurancePremium.service.ts`
- `apps/backend/src/services/negotiationShieldInsuranceClaimSettlement.service.ts`
- `apps/backend/src/services/negotiationShieldBuyerInspection.service.ts`
- `apps/backend/src/services/negotiationShieldContractorUrgency.service.ts`

### Frontend

- `apps/frontend/src/app/(dashboard)/layout.tsx`
- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/NegotiationShieldToolClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/negotiationShieldApi.ts`
- `apps/frontend/src/lib/api/client.ts`
- `apps/frontend/src/lib/icons/toolIcons.ts`
- `apps/frontend/src/lib/config/iconMapping.ts`
- `apps/frontend/src/lib/icons/iconMapping.json`
