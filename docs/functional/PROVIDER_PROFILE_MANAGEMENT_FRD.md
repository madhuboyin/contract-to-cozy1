# Provider Profile Management — Functional Requirements Document

> A comprehensive Provider-domain audit in this repo (see chat history / commit log around this
> FRD's introduction) found that a provider could never get real business info into the product,
> at signup or afterward: the join form collected and validated `businessName` and service
> categories, then discarded them before calling `register()`; and the provider dashboard's
> Profile page's save button was `await sleep(1000); alert('Profile updated successfully!')` with
> no backend call behind it at all. This FRD documents the fix.

## 1. What was broken

### 1.1 Registration silently dropped business info
`apps/frontend/src/app/providers/join/page.tsx`'s step 2 required and validated `businessName`,
`phone`, and a service-type checklist — then `handleSubmit` called `register({ email, password,
firstName, lastName, role, acceptedTerms })`, omitting all three. `RegisterInput` (both the
frontend type and the backend `registerSchema`) had no fields to carry them even if the frontend
had tried. Every new provider got `businessName: "{firstName} {lastName}'s Services"` (a
generated placeholder from `auth.service.ts`) and `serviceCategories: []` — meaning they wouldn't
even appear in category-filtered homeowner search.

The step-2 checklist itself was also broken independently of the drop bug: its option values
(`SEPTIC_INSPECTION`, `WELL_INSPECTION`, `PAINTING`, `APPLIANCE_INSTALLATION`) didn't match the
real `InspectionType`/`HandymanType` Prisma enums (`WELL_SEPTIC_INSPECTION`, no
`WELL_INSPECTION`, `PAINTING_TOUCHUP`, no `APPLIANCE_INSTALLATION` at all) — so even a
straightforward "just send what's checked" fix would have sent garbage values.

### 1.2 Profile editing was fully fake
`apps/frontend/src/app/providers/(dashboard)/profile/page.tsx` — `handleSave` never called any
API. Business info, contact info, and "license/insurance numbers" were `useState` initialized
with hardcoded demo data (`'ABC Home Inspections'`, `'(609) 555-0123'`, etc.) that never loaded
real data and never persisted edits. Several fields had no real backing at all:
- `serviceAreas` (a free-text city/ZIP chip list) — no matching column anywhere;
  `ProviderProfile` only has a single `serviceRadius: Int`, not a named-area list.
- `licenseNumber` / `insuranceNumber` / certifications — this data model already exists for real
  as `ProviderCredential` (see `PROVIDER_TRUST_COMPLIANCE_FRD.md`), with its own fully-working
  dashboard page at `/providers/credentials`. This page was duplicating it with fake fields.

## 2. The fix

### 2.1 Registration
- `registerSchema` (`apps/backend/src/utils/validators.ts`) gained optional `businessName` and
  `serviceCategories: ServiceCategory[]`, required via `.refine()` when `role === 'PROVIDER'`.
- `AuthService.register` (`apps/backend/src/services/auth.service.ts`) now uses
  `data.businessName`/`data.serviceCategories` when creating the `ProviderProfile`, falling back
  to the old generated name only if omitted (defensive — the schema refine means a provider
  registration always has it now).
- The join page's checklist values were corrected to real `InspectionType`/`HandymanType` enum
  members. Rather than try to persist the granular selections (there's no field for
  per-type preference at the profile level — that's what creating individual `Service` rows via
  the dashboard Services page is for), each option now carries a `family: 'INSPECTION' |
  'HANDYMAN'`; `deriveServiceCategories()` maps whatever's checked to the top-level
  `ServiceCategory` values the profile actually stores and search actually filters on. `phone`
  (also collected, also validated, also previously dropped) is now sent too.

### 2.2 Profile editing
New self-service endpoints, following the existing owner-scoped pattern from Portfolio/
Availability (`provider.routes.ts` → `ProviderController` → `ProviderManagementService`):

| Method | Path | Fields |
|---|---|---|
| `GET` | `/api/providers/profile` | businessName, businessType, description, website, yearsInBusiness, teamSize, serviceRadius, serviceCategories + read-only status/rating/verification fields |
| `PATCH` | `/api/providers/profile` | Same, minus the read-only fields |

Deliberately excluded from the editable set: `status`, `insuranceVerified`, `licenseVerified`,
`stripeAccountId`, `stripeOnboarded`, `averageRating`, `totalReviews`, `totalCompletedJobs` —
these are only ever set by credential review, Stripe Connect, or booking completion, never by the
provider directly.

Nullable optional fields (`businessType`, `description`, `website`, `yearsInBusiness`,
`teamSize`) accept `null` from the client to explicitly clear them — sending `undefined` would
make Prisma treat the field as "not provided" and silently leave the old value in place, which
would have reintroduced a smaller version of the same "edit looks saved but wasn't" bug for the
clear-a-field case specifically.

Frontend `profile/page.tsx` was rewritten:
- **Business tab**: real fetch/save via the new endpoint. Added a `serviceCategories` multi-select
  (reusing `ALL_SERVICE_CATEGORIES`/`getCategoryDisplayLabel` from
  `lib/config/serviceCategoryMapping.ts` — the same list the homeowner search page filters
  against, so "what you edit here" and "what homeowners can filter by" are the same list). Added
  `businessType` and `teamSize` fields (real columns, previously not exposed in this UI). Removed
  the fake `serviceAreas` chip list.
- **Contact tab**: phone/address/city/state/zip now go through the *existing, already-real*
  `GET/PUT /api/users/profile` (`api.getUserProfile`/`updateUserProfile`) — this endpoint already
  updated `User`/`Address` for any role; the provider profile page just never called it. `website`
  moved out of this tab into Business (it's a `ProviderProfile` column, not `User`/`Address`).
  Email is read-only (changing account email isn't built anywhere in this app).
- **Documents tab**: replaced the fake license/insurance/certification fields with a card
  pointing to the real `/providers/credentials` page, rather than inventing new schema to
  duplicate a system that already exists and already works.
- **Settings tab (notifications, change password)**: left alone — genuinely out of scope for
  this pass (this bug was about the primary Save button lying about persistence; the Settings
  tab's controls are separately unwired and weren't part of that flow). The "Update password"
  button now at least says it's unavailable instead of silently doing nothing, matching the
  existing (already-honest) photo-upload placeholder — but no real password-change or
  notification-preference persistence was built here.

## 3. Verification
`tsc --noEmit` and `eslint` clean on every touched file, both apps; `npm run build` clean on
backend. No schema changes were required — every field this FRD wires up already existed on
`ProviderProfile`/`User`/`Address`.

## 4. Still open
- Settings tab (notification preferences, change password) — genuinely unwired, not addressed
  here.
- No dedicated backend flow exists for changing account email.
- Profile photo upload — already honestly marked "not available in this build yet"; no change.

## 5. File Index

### Backend
- `apps/backend/src/utils/validators.ts` — `registerSchema` gains `businessName`/`serviceCategories`, refined for PROVIDER role
- `apps/backend/src/services/auth.service.ts` — uses the new registration fields
- `apps/backend/src/validators/providerProfileSelf.validators.ts` — new
- `apps/backend/src/services/provider-management.service.ts` — `getMyProfile`/`updateMyProfile`
- `apps/backend/src/controllers/provider.controller.ts` — `getMyProfile`/`updateMyProfile`
- `apps/backend/src/routes/provider.routes.ts` — `GET`/`PATCH /profile`

### Frontend
- `apps/frontend/src/types/index.ts` — `RegisterInput` gains `phone`/`businessName`/`serviceCategories`; new `ProviderProfileSelf`
- `apps/frontend/src/lib/api/client.ts` — `getMyProviderProfile`/`updateMyProviderProfile`
- `apps/frontend/src/app/providers/join/page.tsx` — fixed checklist enum values, fixed data-drop bug
- `apps/frontend/src/app/providers/(dashboard)/profile/page.tsx` — rewritten, real data throughout Business/Contact tabs
