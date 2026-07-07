# Provider Trust & Compliance Verification — Functional Requirements Document

> Supersedes the unused `Certification` model. That model already exists on `ProviderProfile`
> (`name`, `issuingAuthority`, `certificateNumber`, `issueDate`, `expiryDate`, `documentUrl`,
> `verified`) but has **zero references anywhere in the codebase** — no route, no controller, no
> service, no expiry check. It's scaffolding that was never wired up. Likewise,
> `ProviderProfile.insuranceVerified` / `licenseVerified` are booleans that default to `false` at
> signup and are never programmatically set `true` anywhere — there is no verification workflow
> behind them today. And `ProviderStatus.PENDING_APPROVAL` — the default status for every new
> provider — never transitions to `ACTIVE` anywhere in the code either; the enum exists, the gate
> does not. This FRD replaces the dangling `Certification` model with a real one and, in doing so,
> is also the natural place to finally operationalize the `PENDING_APPROVAL → ACTIVE` gate.

## Table of Contents

1. [Overview](#1-overview)
2. [Relationship to Existing Systems](#2-relationship-to-existing-systems)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Credential → Provider Status](#5-credential--provider-status)
6. [Expiry Detection & Two Jeopardy States](#6-expiry-detection--two-jeopardy-states)
7. [Booking-Time Eligibility Gating](#7-booking-time-eligibility-gating)
8. [Admin Review Workflow](#8-admin-review-workflow)
9. [API Reference](#9-api-reference)
10. [Frontend](#10-frontend)
11. [Workers / Background Jobs](#11-workers--background-jobs)
12. [Security & Data Handling](#12-security--data-handling)
13. [Rollout Phases](#13-rollout-phases)
14. [Open Questions / Risks](#14-open-questions--risks)
15. [File Index](#15-file-index)

---

## 1. Overview

Contract to Cozy's core value proposition is connecting homeowners with service providers, but
today a homeowner has no way to know — and the platform has no way to enforce — whether a booked
provider's license is current or whether they're actually insured before letting them into a
home. `ProviderProfile.licenseVerified` and `insuranceVerified` exist as fields but are inert
booleans nobody ever flips. There's no license number, no expiry date, no document evidence, no
per-service-category requirement (a plumbing license doesn't cover electrical work), and no
consequence when a credential lapses after a provider was approved.

This FRD introduces:

1. `ProviderCredential` — a real, typed, per-category, expiry-tracked, document-backed
   credential record, replacing the unused `Certification` model.
2. A concrete gate on the previously-decorative `PENDING_APPROVAL → ACTIVE` provider status
   transition: a provider cannot go `ACTIVE` for a service category until the credentials that
   category requires are submitted and admin-verified.
3. Ongoing lapse monitoring, mirroring the existing `coverageLapseIncidentsJob` pattern used for
   homeowner insurance policies — but applied to providers, with a genuinely new distinction (see
   [Section 6](#6-expiry-detection--two-jeopardy-states)) between a provider's credentials
   generally drifting out of compliance (a platform/admin concern) and a credential lapsing on a
   provider who has an **already-scheduled booking** on a specific property (a homeowner-facing
   risk, appropriately routed through the existing property-scoped Incident pipeline).
4. Booking-time eligibility checks and a "Verified Pro" badge/filter in the booking and
   quote-comparison flows.

### 1.1 Design Principles

- **Replace, don't duplicate.** `Certification` is deleted in favor of `ProviderCredential`, not
  kept alongside it — there is no reason to carry two half-built credential models.
- **Per-category, not per-provider.** A provider licensed for plumbing but not electrical should
  be bookable for `PLUMBING` jobs and blocked (or flagged) for `ELECTRICAL` ones. Verification is
  not a single yes/no flag on the provider.
- **Evidence required, not self-attestation.** Every credential requires an uploaded document
  before it can move out of `PENDING_REVIEW`. The old `insuranceVerified: Boolean` pattern —
  provider checks a box, platform believes them — is exactly what this replaces.
- **Reuse the existing lapse-detection pattern**, don't invent a new one, for the property-scoped
  jeopardy case ([Section 6](#6-expiry-detection--two-jeopardy-states)).
- **Fail open for existing categories the platform hasn't required credentials for.** Not every
  `ServiceCategory` needs a hard license requirement (e.g. `CLEANING`, `LANDSCAPING` in most
  jurisdictions) — see the requirement matrix in Section 4 being data-driven, not hardcoded, so
  this doesn't become a blunt instrument that blocks legitimate low-risk categories.

### 1.2 Scope

**In scope (Phase 1):** credential submission + document upload, admin verification queue,
per-category requirement matrix, expiry lapse detection (both jeopardy states), booking-time
eligibility check, Verified Pro badge/filter, formalizing `PENDING_APPROVAL → ACTIVE`.

**Out of scope (Phase 1):** third-party license-registry API verification (e.g. auto-checking a
state contractor board database) — Phase 1 is admin-reviewed document evidence, not automated
government-database lookups; background-check integration (the `backgroundCheckDate` field exists
on `ProviderProfile` already but wiring an actual background-check vendor is a separate,
larger-scoped project); real-time insurance-carrier COI (Certificate of Insurance) verification
APIs.

---

## 2. Relationship to Existing Systems

| Existing thing | Current state | What this FRD does with it |
|---|---|---|
| `Certification` model | Fully modeled, **zero code references anywhere** | Deleted, replaced by `ProviderCredential` |
| `ProviderProfile.insuranceVerified` / `licenseVerified` | Booleans, default `false`, never set `true` programmatically | Deprecated in favor of derived, per-category status computed from `ProviderCredential` rows (kept temporarily for backward read compatibility — see [Section 13](#13-rollout-phases)) |
| `ProviderStatus.PENDING_APPROVAL` | Default status, **never transitions to `ACTIVE` anywhere in the code** | Gains its first real gate — see [Section 5](#5-credential--provider-status) |
| `HoaApprovalRecord` (`hoa_approval_records`) | Working pattern: `status` enum + `submittedDate`/`decisionDate`/`expirationDate` + `documentIds[]` + `notes`, scoped to a Property+Association | `ProviderCredential`'s lifecycle fields mirror this shape directly — proven pattern, not a new one |
| `coverageLapseIncidentsJob` (workers) | Working pattern: lookahead window over `expiryDate`, calls `IncidentService.upsertIncident()` with a deterministic `fingerprint` and `dedupeWindowMins` | Directly reused for the property-scoped jeopardy case in Section 6 — same job shape, different source table |
| `Document` model | Supports optional links (`warrantyId`, `policyId`) alongside its core file/hash/metadata fields, but no provider-credential link | Gains an optional `providerCredentialId` FK, following the exact same optional-link pattern already used for warranties and policies |
| `ProviderProfile.backgroundCheckDate` | Exists, unused elsewhere | Left as-is; background-check vendor integration is explicitly out of scope (Section 1.2) but this FRD's credential UI surfaces it if/when populated |

---

## 3. Architecture

```
Provider submits a credential (license, COI, certification) + uploads a document
        │
        ▼
ProviderCredentialService.submit()
  ├─ Create ProviderCredential (status: PENDING_REVIEW)
  ├─ Create Document row, link via providerCredentialId
  └─ Notify admin review queue
        │
        ▼
Admin reviews (Section 8) → APPROVED or REJECTED
        │
        ▼ (on APPROVED)
ProviderCredentialService.onApproved()
  └─ ProviderComplianceService.recomputeProviderStatus(providerProfileId)
        ├─ Recompute derived per-category eligibility (Section 5)
        └─ If provider was PENDING_APPROVAL and now meets the requirement matrix
           for at least one ServiceCategory it lists → transition to ACTIVE

Background worker (daily cron)
        │
        ▼
providerCredentialLapse.job.ts
  ├─ Query ProviderCredential where expiryDate within lookahead window
  ├─ For each: determine jeopardy state (Section 6)
  │    ├─ General drift (no affected upcoming booking)
  │    │     → ProviderComplianceAlert (admin/provider-facing only)
  │    └─ Affects a CONFIRMED/PENDING Booking on a specific property
  │          → IncidentService.upsertIncident() on that booking's property
  │            (same call shape as coverageLapseIncidentsJob)
  └─ On expiryDate passing with no renewal → credential status EXPIRED
       → ProviderComplianceService.recomputeProviderStatus() may drop provider
         out of eligibility for the affected category (not necessarily SUSPENDED
         entirely — see Section 5)

Booking creation flow (existing booking.routes.ts / booking.service.ts)
        │
        ▼
BookingEligibilityService.checkProviderEligibility(providerId, category)
  → Called before a booking can move DRAFT/PENDING → CONFIRMED (Section 7)
```

### 3.1 Service Responsibilities

| Service | Responsibility |
|---|---|
| `providerCredential.service.ts` **(new)** | Credential CRUD, submission, document linking |
| `providerCompliance.service.ts` **(new)** | Derives per-category eligibility from credential rows; owns the `PENDING_APPROVAL → ACTIVE` transition |
| `bookingEligibility.service.ts` **(new)** | Called from the booking flow to check/enforce eligibility at booking-creation and confirmation time |
| `incidents/integrations/providerCredentialLapse.adapter.ts` **(new)** | Only writer of provider-credential-lapse `IncidentSignal`s, mirroring `maintenanceTask.adapter.ts` |
| `IncidentService` (existing, unmodified) | Scores/dedupes the property-scoped jeopardy case |

---

## 4. Database Schema

### 4.1 Enums

```prisma
enum ProviderCredentialType {
  TRADE_LICENSE          // state/local contractor or trade license
  LIABILITY_INSURANCE     // general liability COI
  WORKERS_COMP_INSURANCE
  BONDING
  CERTIFICATION            // manufacturer/trade-association certification (EPA, NATE, etc.)
  BACKGROUND_CHECK
}

enum ProviderCredentialStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED
  EXPIRED
  REVOKED          // admin-initiated, e.g. fraud/complaint, distinct from natural expiry
}

enum ProviderComplianceAlertType {
  EXPIRING_SOON     // within lookahead window, no affected booking
  EXPIRED_NO_BOOKING_IMPACT
  REJECTED
  MISSING_REQUIRED_CREDENTIAL   // provider added a ServiceCategory but never submitted its required credential
}

enum ProviderComplianceAlertSeverity {
  INFO
  WARNING
  CRITICAL
}

enum ProviderComplianceAlertStatus {
  NEW
  ACKNOWLEDGED
  RESOLVED
}
```

### 4.2 Models

#### `ProviderCredential` — replaces `Certification`

| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid) | PK |
| `providerProfileId` | String | FK → ProviderProfile |
| `type` | `ProviderCredentialType` | |
| `serviceCategories` | `ServiceCategory[]` | Which categories this credential covers (a single trade license may cover multiple, e.g. `PLUMBING` + `WATER_HEATER`) |
| `status` | `ProviderCredentialStatus` | |
| `issuingAuthority` | String | e.g. "California Contractors State License Board" |
| `credentialNumber` | String? | License/policy/certificate number |
| `issueDate` | DateTime? | |
| `expiryDate` | DateTime? | Nullable — some credential types (e.g. a one-time background check) don't expire |
| `documentId` | String? | FK → Document (the uploaded evidence) |
| `reviewedByUserId` | String? | Admin who approved/rejected |
| `reviewedAt` | DateTime? | |
| `rejectionReason` | String? | |
| `renewalOfCredentialId` | String? | Self-FK — a renewed credential points back to the one it replaces, preserving history |
| `createdAt` / `updatedAt` | DateTime | |

**Indexes:** `providerProfileId`, `providerProfileId + status`, `expiryDate`, `status`.

#### `ProviderCredentialRequirement` — data-driven requirement matrix

Deliberately a table, not a hardcoded map in application code — a `TRADE_LICENSE` requirement can
be added for a new category, or a requirement can be turned off in a jurisdiction where it doesn't
apply, without a deploy.

| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid) | PK |
| `serviceCategory` | `ServiceCategory` | |
| `credentialType` | `ProviderCredentialType` | |
| `isRequired` | Boolean | If false, the pairing is recommended/optional (surfaced in UI, not enforced at booking gate) |
| `stateCode` | String? | Nullable — null means "applies everywhere"; set for state-specific licensing requirements |
| `notes` | String? | |
| `isActive` | Boolean | |
| `createdAt` / `updatedAt` | DateTime | |

**Unique:** `serviceCategory + credentialType + stateCode`. **Indexes:** `serviceCategory`.

> Seed data (Phase 1, editable by admins, not user-facing): `LIABILITY_INSURANCE` required for
> every category; `TRADE_LICENSE` required for `PLUMBING`, `ELECTRICAL`, `HVAC`, `ROOFING`,
> `FOUNDATION`, `WATER_HEATER`, `SOLAR`; `WORKERS_COMP_INSURANCE` required where `teamSize > 1` on
> the provider's profile (checked at eligibility-compute time, not stored per-row). Categories
> like `CLEANING`, `LANDSCAPING`, `HANDYMAN`, `LOCKSMITH` default to liability insurance only.

#### `ProviderCategoryEligibility` — computed, cached derived state

Recomputed by `ProviderComplianceService`, not hand-edited. Exists as a table (rather than
computed on every read) so booking-time eligibility checks are a single indexed lookup, not an
N-credential join on every booking attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid) | PK |
| `providerProfileId` | String | FK → ProviderProfile |
| `serviceCategory` | `ServiceCategory` | |
| `isEligible` | Boolean | All `isRequired` requirements for this category are met by an `APPROVED`, non-expired credential |
| `missingCredentialTypes` | `ProviderCredentialType[]` | For UI display — what's blocking eligibility |
| `computedAt` | DateTime | |

**Unique:** `providerProfileId + serviceCategory`. **Indexes:** `providerProfileId`,
`serviceCategory + isEligible`.

#### `ProviderComplianceAlert` — admin/provider-facing, non-property-scoped

The "general drift" jeopardy state from Section 6 — deliberately parallel to
`SmartHomeDeviceAlert` from the IoT FRD: housekeeping-level, not a homeowner-facing Incident.

| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid) | PK |
| `providerProfileId` | String | FK → ProviderProfile |
| `credentialId` | String? | FK → ProviderCredential |
| `alertType` | `ProviderComplianceAlertType` | |
| `severity` | `ProviderComplianceAlertSeverity` | |
| `status` | `ProviderComplianceAlertStatus` | |
| `title` / `summary` | String | |
| `dedupeKey` | String (unique) | `providerProfileId:alertType:credentialId:window` |
| `resolvedAt` | DateTime? | |
| `createdAt` / `updatedAt` | DateTime | |

**Indexes:** `providerProfileId + status`, `credentialId`.

### 4.3 `Document` model addition

```prisma
model Document {
  // ...existing fields...
  providerCredentialId String?  // NEW, mirrors existing optional warrantyId/policyId pattern
  providerCredential    ProviderCredential? @relation(fields: [providerCredentialId], references: [id])
}
```

### 4.4 `ProviderProfile` changes

```prisma
model ProviderProfile {
  // ...existing fields unchanged...
  credentials  ProviderCredential[]
  categoryEligibility ProviderCategoryEligibility[]
  complianceAlerts ProviderComplianceAlert[]

  // insuranceVerified / licenseVerified retained for now (see Section 13) but
  // no longer the source of truth — ProviderCategoryEligibility is.
}
```

`Certification` model and its relation on `ProviderProfile` are removed.

---

## 5. Credential → Provider Status

`ProviderComplianceService.recomputeProviderStatus(providerProfileId)` runs whenever a credential
is approved, rejected, expires, or is revoked:

1. For each `ServiceCategory` in the provider's `serviceCategories[]`, evaluate the
   `ProviderCredentialRequirement` rows (filtered by the provider's registered state, falling back
   to `stateCode: null` rows).
2. A category is eligible if every `isRequired` requirement has a matching `ProviderCredential`
   with `status: APPROVED` and (`expiryDate` is null or in the future).
3. Upsert `ProviderCategoryEligibility` per category.
4. **Status transition logic:**
   - If the provider is `PENDING_APPROVAL` and becomes eligible for **at least one** listed
     category → transition to `ACTIVE`. (Not "eligible for all" — a provider who does plumbing and
     cleaning shouldn't be blocked from ever going live just because their cleaning-only liability
     policy hasn't been reviewed yet if their plumbing license already has.)
   - If an `ACTIVE` provider loses eligibility for **every** listed category (all credentials
     expired/revoked) → transition to `SUSPENDED`, not silently left `ACTIVE` with zero eligible
     categories. This is the first real behavior behind `ProviderStatus.SUSPENDED`, which today —
     like `PENDING_APPROVAL` — is set nowhere in the code as an automatic consequence of anything.
   - Losing eligibility for *some but not all* categories does not change `ProviderStatus` — it's
     reflected purely in `ProviderCategoryEligibility`, which is what booking-time gating actually
     reads (Section 7). `ProviderStatus` stays a coarse account-level flag; category eligibility is
     the fine-grained one.

---

## 6. Expiry Detection & Two Jeopardy States

`providerCredentialLapse.job.ts` runs daily over `ProviderCredential` rows with `expiryDate`
inside a 30-day lookahead window (configurable) and `status: APPROVED`. For each, it distinguishes
two cases that deserve genuinely different treatment:

**Case A — general drift, no affected booking.** The provider has no `CONFIRMED` or `PENDING`
booking scheduled before the credential's `expiryDate`. This is purely a provider/platform
housekeeping matter: create or update a `ProviderComplianceAlert` (`EXPIRING_SOON`, severity scaled
by days-remaining exactly like `coverageLapseIncidentsJob` does: `days <= 3 → WARNING`, else
`INFO`). Notify the provider. **No homeowner ever sees this.**

**Case B — an already-scheduled booking is at risk.** The provider has a `CONFIRMED` or `PENDING`
`Booking` whose `scheduledDate` (or `requestedDate` if not yet scheduled) falls after the
credential's `expiryDate`, for a `ServiceCategory` that credential covers. This is now a specific
homeowner's specific property's specific upcoming job put at risk by something outside their
visibility — exactly the kind of condition the existing Incident pipeline exists for. This calls
`IncidentService.upsertIncident()` on that booking's `propertyId`, in the same shape
`coverageLapseIncidentsJob` already uses:

```typescript
await IncidentService.upsertIncident({
  propertyId: booking.propertyId,
  userId: booking.homeownerId,
  sourceType: 'SYSTEM',
  typeKey: 'PROVIDER_CREDENTIAL_LAPSE',
  category: 'PROVIDER',
  title: 'Your provider\'s insurance is expiring before your scheduled job',
  summary: `${provider.businessName}'s ${credential.type} expires ${days} days before your ${booking.category} appointment.`,
  details: {
    bookingId: booking.id,
    providerProfileId: provider.id,
    credentialId: credential.id,
    expiryDate: credential.expiryDate.toISOString(),
  },
  status: 'DETECTED',
  fingerprint: `property:${booking.propertyId}|PROVIDER_CREDENTIAL_LAPSE|booking:${booking.id}|cred:${credential.id}`,
  dedupeWindowMins: 24 * 60,
  severityScore: days <= 3 ? 75 : days <= 7 ? 60 : 40,
});
```

This is deliberately the **only** place provider-credential data touches a homeowner-visible
Incident — a provider's general compliance housekeeping never leaks into a homeowner's Incident
feed unless it concretely threatens a job they've actually booked.

---

## 7. Booking-Time Eligibility Gating

`BookingEligibilityService.checkProviderEligibility(providerId, serviceCategory)` is called at two
points in the existing booking flow:

1. **Booking creation** (`booking.service.ts`, wherever a `DRAFT`/`PENDING` `Booking` is created)
   — if the provider is not `ProviderCategoryEligibility.isEligible` for the requested category,
   the booking is still allowed to be created as `DRAFT` (so a homeowner browsing isn't blocked
   from window-shopping) but surfaces a clear "This provider's [credential type] is not currently
   verified for this service" warning rather than silently proceeding.
2. **Confirmation** (`PENDING → CONFIRMED` transition) — this is the hard gate. A booking cannot
   be confirmed for a category the provider is not currently eligible for. This prevents the
   otherwise-realistic failure mode of a provider being eligible when a homeowner starts booking
   and losing eligibility (credential expires) before the homeowner confirms.

Eligibility is a single indexed read against `ProviderCategoryEligibility` — no live credential
joins at booking time, keeping this check cheap enough to run on every confirmation without a
performance concern.

---

## 8. Admin Review Workflow

Given `PENDING_APPROVAL` has never had a real review flow, this FRD adds the first one:

- `GET /api/admin/provider-credentials/queue` — pending credentials sorted oldest-first, filterable
  by `type` and `serviceCategory`.
- `POST /api/admin/provider-credentials/:id/approve` — sets `status: APPROVED`,
  `reviewedByUserId`, `reviewedAt`, triggers `recomputeProviderStatus()`.
- `POST /api/admin/provider-credentials/:id/reject` — requires `rejectionReason`, notifies the
  provider with next steps.
- `POST /api/admin/provider-credentials/:id/revoke` — for post-approval issues (fraud, complaint);
  distinct from natural expiry so the audit trail shows *why* a credential stopped being valid.

Gated the same way `releaseGate.routes.ts` already gates admin-only actions in this codebase
(`requireRole(ADMIN)` + MFA) — not a new authorization pattern.

---

## 9. API Reference

Provider-facing (requires provider auth):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers/me/credentials` | List own credentials with status |
| `POST` | `/api/providers/me/credentials` | Submit a new credential (metadata + document upload) |
| `POST` | `/api/providers/me/credentials/:id/renew` | Submit a renewal (creates a new row linked via `renewalOfCredentialId`) |
| `GET` | `/api/providers/me/category-eligibility` | Per-category eligibility + what's missing |
| `GET` | `/api/providers/me/compliance-alerts` | Own compliance alerts |

Homeowner-facing:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers/:id/verification-summary` | Public-safe summary: which categories are verified, credential types present (no document/number detail) — powers the "Verified Pro" badge |
| `GET` | `/api/providers/search?verifiedOnly=true` | Existing search endpoint, new filter param |

Admin-facing: see [Section 8](#8-admin-review-workflow).

---

## 10. Frontend

| File | Purpose |
|---|---|
| `app/(dashboard)/providers/(dashboard)/credentials/page.tsx` | Provider's own credential management — list, submit, renew |
| `app/(dashboard)/dashboard/admin/provider-compliance/page.tsx` | Admin review queue |
| `components/features/providerTrust/CredentialSubmitForm.tsx` | Type, category, number, dates, document upload |
| `components/features/providerTrust/VerifiedProBadge.tsx` | Rendered on provider cards in search/marketplace/booking flows |
| `components/features/providerTrust/CategoryEligibilityList.tsx` | Provider-facing: per-category status + what's missing |
| `components/features/booking/BookingEligibilityWarning.tsx` | Shown at booking creation when a category isn't verified (Section 7) |

The property-scoped Incident from Case B in Section 6 renders through the **existing** Incident UI
— no new component, same as the Smart Home and Reserve Fund FRDs' approach to not forking
homeowner-facing surfaces.

---

## 11. Workers / Background Jobs

| File | Purpose | Schedule |
|---|---|---|
| `workers/src/jobs/providerCredentialLapse.job.ts` | Section 6 — both jeopardy states | Daily |
| `workers/src/jobs/providerCredentialExpire.job.ts` | Transitions `APPROVED` credentials past `expiryDate` to `EXPIRED`, triggers `recomputeProviderStatus()` | Daily |
| `workers/src/jobs/providerMissingCredentialSweep.job.ts` | Flags providers who added a `ServiceCategory` to their profile but never submitted its required credential type (`MISSING_REQUIRED_CREDENTIAL` alert) | Weekly |

---

## 12. Security & Data Handling

- Credential documents (licenses, COIs) often contain PII (policy numbers, sometimes SSN on older
  background-check paperwork) — stored via the existing `Document` model's file pipeline, no new
  storage mechanism, but access to `GET` a credential's underlying document is admin + owning-
  provider only, never exposed via the public `verification-summary` endpoint.
- `verification-summary` (public/homeowner-facing) returns only booleans and category lists —
  never `credentialNumber`, `documentId`, or `issuingAuthority` detail.
- Admin endpoints follow the existing `requireRole(ADMIN)` + MFA pattern already used by
  `releaseGate.routes.ts`.
- Rejection/revocation reasons are visible to the affected provider (due process) but never to
  homeowners (avoids exposing potentially defamatory unverified claims).

---

## 13. Rollout Phases

| Phase | Scope |
|---|---|
| **1 (this FRD)** | Everything above: `ProviderCredential`, requirement matrix, admin review, both jeopardy states, booking-time gating, Verified Pro badge. `insuranceVerified`/`licenseVerified` booleans kept as read-only, derived-and-synced fields (set from `ProviderCategoryEligibility` for backward compatibility with any existing frontend code reading them directly) rather than removed outright. |
| **2** | Remove the deprecated booleans once all call sites are confirmed migrated to `ProviderCategoryEligibility`. Third-party license-registry API verification for high-risk categories (state contractor board lookups). |
| **3** | Background-check vendor integration (activating the currently-unused `backgroundCheckDate` field with a real workflow). Real-time COI verification APIs with insurance carriers. |

---

## 14. Open Questions / Risks

1. **Requirement matrix ownership.** Licensing requirements vary by state and change over time
   (Section 4.2's `stateCode` column handles the *data* shape, but someone needs to own keeping the
   seed data current — this is a content/compliance-ops responsibility, not an engineering one, and
   should be assigned before launch).
2. **"At least one eligible category" activation rule** (Section 5) could theoretically let a
   provider go `ACTIVE` and bookable for, say, `CLEANING` while still fully unverified for the
   `ELECTRICAL` work they also listed — which is the intended behavior (fine-grained, not
   all-or-nothing) but should be very clearly communicated in the provider-facing UI so it isn't
   mistaken for a bug by providers wondering why they're "active but blocked."
3. **Existing bookings at FRD launch time.** Providers currently `ACTIVE` under the old
   do-nothing verification model will, on first `recomputeProviderStatus()` run, likely show as
   ineligible for most categories (no real credentials exist yet). This needs an explicit
   grandfathering/grace-period plan (e.g. a 60-day submission window before enforcement begins at
   the booking-confirmation gate) rather than an overnight mass-suspension — this is a rollout
   sequencing decision, not a technical one, and should be made explicitly before Phase 1 ships.
4. **Document verification depth.** Phase 1 is "admin looks at an uploaded PDF/photo and clicks
   approve" — it does not verify the document is authentic or unaltered. This is a real known
   limitation being accepted for Phase 1, not an oversight; flagged so it isn't mistaken for a
   completeness guarantee to homeowners ("Verified Pro" should be worded carefully — verified
   *documentation was reviewed*, not verified *the provider is definitely trustworthy*).

---

## 15. File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/providerCredential.routes.ts` | Provider + admin routes |
| `apps/backend/src/controllers/providerCredential.controller.ts` | Request handlers |
| `apps/backend/src/services/providerCredential.service.ts` | Submission, document linking |
| `apps/backend/src/services/providerCompliance.service.ts` | Eligibility computation, status transitions (Section 5) |
| `apps/backend/src/services/bookingEligibility.service.ts` | Booking-time gate (Section 7) |
| `apps/backend/src/services/incidents/integrations/providerCredentialLapse.adapter.ts` | Case B incident emission (Section 6) |
| `apps/backend/src/validators/providerCredential.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models/enums; `Certification` model removed; `Document.providerCredentialId` added |
| `apps/backend/src/services/booking.service.ts` | Calls `bookingEligibility.service.ts` at creation + confirmation |
| `apps/backend/src/routes/provider.routes.ts` | `verification-summary` endpoint, `verifiedOnly` search filter |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/providers/(dashboard)/credentials/page.tsx` | Provider credential management |
| `apps/frontend/src/app/(dashboard)/dashboard/admin/provider-compliance/page.tsx` | Admin review queue |
| `apps/frontend/src/components/features/providerTrust/*` | Components (Section 10) |
| `apps/frontend/src/components/features/booking/BookingEligibilityWarning.tsx` | Booking-flow warning |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/providerCredentialLapse.job.ts` | Daily, both jeopardy states |
| `apps/workers/src/jobs/providerCredentialExpire.job.ts` | Daily, status transition on expiry |
| `apps/workers/src/jobs/providerMissingCredentialSweep.job.ts` | Weekly |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend schema |
