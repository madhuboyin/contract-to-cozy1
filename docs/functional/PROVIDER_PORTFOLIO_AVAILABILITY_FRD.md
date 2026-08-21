# Provider Portfolio & Availability — Functional Requirements Document

> `ProviderPortfolio` and `ProviderAvailability` are real tables in `schema.prisma` with real
> frontend UI already built and nav-wired (`/providers/portfolio`, `/providers/calendar`). A
> database audit in this repo initially flagged both tables as stale-and-droppable; this FRD is
> the correction and the scope for finishing the work.
>
> **Status: Phase 1 (backend CRUD) implemented.** See [Section 3](#3-backend-scope-implemented)
> for what shipped and [Section 6](#6-open-decisions) for what's still an open call. Phase 2
> (frontend wiring, Section 5) has not started — both provider-facing pages are still mock data,
> and the homeowner-facing provider page still doesn't render `portfolioImages`.

## Table of Contents

1. [Current State](#1-current-state)
2. [Gap Analysis](#2-gap-analysis)
3. [Backend Scope (Implemented)](#3-backend-scope-implemented)
4. [API Reference](#4-api-reference)
5. [Frontend Follow-up (not in this scope, tracked for completeness)](#5-frontend-follow-up-not-in-this-scope-tracked-for-completeness)
6. [Open Decisions](#6-open-decisions)
7. [Rollout Phases](#7-rollout-phases)
8. [File Index](#8-file-index)

---

## 1. Current State

### 1.1 `ProviderPortfolio`

```prisma
model ProviderPortfolio {
  id                String @id @default(uuid())
  providerProfileId String
  title       String
  description String?
  imageUrl    String
  category    ServiceCategory
  providerProfile ProviderProfile @relation(fields: [providerProfileId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt // added in Phase 1
}
```

- **Read:** `provider.service.ts::getProviderById` includes `portfolioImages` (capped at
  12) and returns it as part of the public `GET /api/providers/:id` response
  (`provider.service.ts:368-401`). Typed in `provider.types.ts`. **As of Phase 1, also
  presigned** — see [Section 3.1](#31-providerportfolio-1).
- **Write:** **implemented in Phase 1** — see [Section 3.1](#31-providerportfolio-1). Previously
  none: no route, controller, or service method created, updated, or deleted a `ProviderPortfolio`
  row anywhere.
- **Frontend (provider-facing):** `/providers/portfolio` is nav-wired (camera FAB in
  `(dashboard)/layout.tsx`, "Portfolio" nav item) but the page (`(dashboard)/portfolio/page.tsx`)
  is 100% local mock state — `useState<PortfolioItem[]>([...hardcoded placeholder items...])`,
  placeholder image URLs, no `onClick` handlers, no API calls.
- **Frontend (homeowner-facing):** the public provider detail page
  (`(dashboard)/dashboard/providers/[id]/page.tsx`) calls `api.getProvider(id)` but never reads
  `.portfolioImages` off the response — the data the backend already returns is silently dropped.

### 1.2 `ProviderAvailability`

```prisma
model ProviderAvailability {
  id                String    @id @default(uuid())
  providerProfileId String
  startDate   DateTime
  endDate     DateTime
  isAvailable Boolean  @default(true)
  reason      String? // vacation, booked, etc.
  providerProfile ProviderProfile @relation(fields: [providerProfileId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- **Read / Write:** **implemented in Phase 1** — see [Section 3.2](#32-provideravailability-1).
  Previously none.
- The `availableOnly` query param documented on `GET /api/providers/search` (swagger block in
  `provider.routes.ts`) is **now implemented** in `provider.service.ts::searchProviders`
  (Phase 1). It was previously accepted by the schema and silently ignored — worse, it wasn't
  even in the actual `providerSearchSchema` Zod schema in `provider.types.ts`, only in the
  swagger doc comment.
- **Frontend:** `/providers/calendar` is nav-wired ("Calendar" nav item) and has a real UI
  (per-weekday working-hours toggle, a blocked-dates grid) but it's entirely local component
  state — `blockedDays = [20, 21]` is hardcoded, `workingHours` never leaves the component, no
  `fetch`/API client call exists in the file.

### 1.3 A third, competing representation

`ProviderProfile.availabilitySchedule Json?` ("Weekly schedule") is a *second*, unrelated
representation of provider availability that is also completely unused (zero reads, zero writes).
Nothing in this codebase currently decides between "recurring weekly hours as a JSON blob" and
"explicit date-range rows" — both exist in the schema, neither is implemented. See
[Open Decisions](#6-open-decisions).

---

## 2. Gap Analysis

| Layer | Portfolio | Availability |
|---|---|---|
| Schema | ✅ exists (+ `updatedAt` added for Phase 1) | ✅ exists (+ competing `availabilitySchedule` JSON field, still unresolved) |
| Backend read | ✅ `getProviderById` + new `GET /portfolio` | ✅ new `GET /availability` |
| Backend write (create/update/delete) | ✅ implemented (Phase 1) | ✅ implemented (Phase 1) |
| Backend search integration | n/a | ✅ `availableOnly` now filters live |
| Provider-facing frontend | ⚠️ built, nav-wired, still 100% mock data (Phase 2, not started) | ⚠️ built, nav-wired, still 100% mock data (Phase 2, not started) |
| Homeowner-facing frontend | ⚠️ receives real `portfolioImages`, still doesn't render it (Phase 2) | n/a |

---

## 3. Backend Scope (Implemented)

Follows the existing owner-scoped CRUD convention already used for `Service` in this exact router
(`provider.routes.ts` → `ProviderController.{getMyServices,createService,updateService,deleteService}`
→ `ProviderManagementService`, `provider-management.service.ts`): resolve
`ProviderProfile` from `req.user.userId`, scope all reads/writes to that `providerProfileId`,
verify ownership with a `findFirst({ where: { id, providerProfileId } })` before update/delete.

### 3.1 `ProviderPortfolio`

- **Service methods** added directly to `ProviderManagementService` (kept in the existing file —
  it was only 137 lines, didn't warrant a split like `ProviderCredentialService` did):
  `listPortfolio(userId)`, `createPortfolioItem(userId, data, file)`,
  `updatePortfolioItem(itemId, userId, data)`, `deletePortfolioItem(itemId, userId)`.
- **Image upload:** `multer({ storage: memoryStorage(), limits: { fileSize: 10MB } })` scoped to
  `image/jpeg|jpg|png|webp` only (tighter than `providerCredential.routes.ts`'s
  `validateDocumentUpload`, which also allows PDF — doesn't make sense for a photo gallery) →
  `validateImageUpload` (magic-byte + content-threat check, `documentValidator.util.ts`) →
  `uploadDocumentBuffer` from `services/storage/reportStorage.ts`.
- **Image serving decision (was Open Decision #1, now resolved):** `imageUrl` stores the raw S3
  object key, not a URL — same convention `ProviderCredential.fileUrl` already uses. A new
  `presignPortfolioImageUrl()` helper (exported from `provider-management.service.ts`) presigns it
  to a 1-hour URL on every read, mirroring `materialSpec.service.ts`'s
  `buildPresignedPhotoUrl` pattern. Applied in `listPortfolio` and, importantly, in
  `provider.service.ts::getProviderById` — so the public read that already existed now returns
  usable URLs instead of raw stored data. No new infra (public bucket/CDN) introduced.
- **Validators** in `providerPortfolio.validators.ts`: `CreatePortfolioItemSchema`,
  `UpdatePortfolioItemSchema` (title required 1-200 chars, description optional ≤1000 chars,
  category = `ServiceCategory` enum).
- **Schema change:** added `updatedAt DateTime @updatedAt` to `ProviderPortfolio` (it only had
  `createdAt` before — needed once `PATCH` exists). No migration file created — apply via
  `npx prisma db push` per this repo's convention.

### 3.2 `ProviderAvailability`

- **Service methods**, same file, same ownership pattern: `listAvailability(userId)`,
  `createAvailabilityWindow(userId, data)`, `updateAvailabilityWindow(windowId, userId, data)`,
  `deleteAvailabilityWindow(windowId, userId)`.
- **Validation:** `endDate > startDate` enforced via Zod `.refine()` in
  `providerAvailability.validators.ts` on both create and update. Overlap detection **not**
  implemented — still an application-layer gap, tracked in [Open Decisions](#6-open-decisions).
- **Search integration:** `availableOnly` implemented in
  `provider.service.ts::searchProviders` — excludes providers with an `isAvailable: false` window
  whose `[startDate, endDate]` covers `new Date()` at request time. Also added `availableOnly` to
  the actual `providerSearchSchema` in `provider.types.ts` (it was missing entirely — the swagger
  doc had been describing a parameter the schema never accepted).
- **No schema change needed:** `ProviderAvailability` already had `@@index([providerProfileId])`
  and `@@index([startDate, endDate])` from when the table was first scaffolded.

### 3.3 Routes

Added to `provider.routes.ts`, in the authenticated block, above the public `/:id` route (per the
file's existing `MUST COME BEFORE /:id ROUTES!` comment):

```
GET    /api/providers/portfolio
POST   /api/providers/portfolio        (uploadRateLimiter → multer → validateImageUpload → validateBody)
PATCH  /api/providers/portfolio/:id    (validateBody)
DELETE /api/providers/portfolio/:id

GET    /api/providers/availability
POST   /api/providers/availability     (validateBody)
PATCH  /api/providers/availability/:id (validateBody)
DELETE /api/providers/availability/:id
```

All eight require `authenticate` + `requireRole(PROVIDER, ADMIN)`, matching the existing
`/services` routes in the same file.

---

## 4. API Reference

Provider-facing (requires provider auth):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers/portfolio` | List own portfolio items |
| `POST` | `/api/providers/portfolio` | Create a portfolio item (multipart: `file` + `title`/`description`/`category`) |
| `PATCH` | `/api/providers/portfolio/:id` | Update title/description/category |
| `DELETE` | `/api/providers/portfolio/:id` | Delete a portfolio item |
| `GET` | `/api/providers/availability` | List own availability windows |
| `POST` | `/api/providers/availability` | Create a window (vacation/booked block, or explicit available window) |
| `PATCH` | `/api/providers/availability/:id` | Update a window |
| `DELETE` | `/api/providers/availability/:id` | Delete a window |

Homeowner-facing:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers/:id` | Returns `portfolioImages` (≤12), now presigned to usable URLs |
| `GET` | `/api/providers/search?availableOnly=true` | Now actually filters (Phase 1) |

---

## 5. Frontend follow-up (not in this scope, tracked for completeness)

Backend work alone doesn't finish this feature — flagging so it isn't lost:

1. `(dashboard)/portfolio/page.tsx` — replace mock `useState` with real list/create/delete calls
   + file upload UI.
2. `(dashboard)/calendar/page.tsx` — replace mock `blockedDays`/`workingHours` state with real
   fetch/save calls against the new availability endpoints.
3. `(dashboard)/dashboard/providers/[id]/page.tsx` (homeowner-facing) — render
   `provider.portfolioImages`, which the backend already returns today and always has.
4. Provider search UI — surface the `availableOnly` filter once it's real.

## 6. Open Decisions

1. ~~**Public image serving.**~~ **Resolved in Phase 1:** presign on every read (Section 3.1),
   no new infra. Tradeoff accepted: URLs are only valid for 1 hour, so nothing should cache
   `imageUrl` values client-side beyond a page load — each `GET` gets a freshly-signed URL. If
   portfolio images end up needing CDN-level caching for performance later, this decision should
   be revisited.
2. **`availabilitySchedule` vs. `ProviderAvailability`.** Pick one representation for "provider
   availability" — a recurring weekly-hours JSON blob on `ProviderProfile`, or explicit
   date-range rows in `ProviderAvailability` (this FRD's scope). Recommend keeping
   `ProviderAvailability` for exception blocks (vacation, already-booked) and either implementing
   `availabilitySchedule` separately for recurring weekly hours or dropping it if the calendar UI
   only ever needs exception blocking — the current frontend mock (`workingHours` toggle +
   `blockedDays` grid) actually implies **both** are wanted, which reopens this decision rather
   than resolving it.
3. **Overlap handling.** No DB constraint, and Phase 1 did **not** add application-layer overlap
   validation either — `createAvailabilityWindow` will happily create two overlapping windows for
   the same provider today. Still open; low risk while there are no real users, but should be
   closed (via an app-layer check, mirroring the same tradeoff already documented on
   `HouseholdProperty` in `schema.prisma`) before this goes live with real providers.

## 7. Rollout Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Backend CRUD for both models (Section 3), decision on image serving made and implemented | ✅ Done |
| 2 | Frontend wiring (Section 5) — both provider-facing pages, homeowner-facing portfolio render | Not started |
| 3 | `availableOnly` search filtering live end-to-end; provider search UI surfaces it | Backend done; UI surfacing pending Phase 2 |
| 4 (optional) | Recurring weekly-hours (`availabilitySchedule`) implemented or formally dropped | Not started |

## 8. File Index

### Backend (Phase 1 — done)
- `apps/backend/prisma/schema.prisma` — added `ProviderPortfolio.updatedAt`
- `apps/backend/src/routes/provider.routes.ts` — 8 new routes (Section 3.3)
- `apps/backend/src/controllers/provider.controller.ts` — 8 new controller methods
- `apps/backend/src/services/provider-management.service.ts` — Portfolio + Availability CRUD, `presignPortfolioImageUrl()` (Section 3.1, 3.2)
- `apps/backend/src/services/provider.service.ts` — `getProviderById` now presigns `portfolioImages`; `searchProviders` implements `availableOnly`
- `apps/backend/src/types/provider.types.ts` — added `availableOnly` to `providerSearchSchema`
- `apps/backend/src/validators/providerPortfolio.validators.ts` — new
- `apps/backend/src/validators/providerAvailability.validators.ts` — new

### Frontend (Section 5, separate follow-up)
- `apps/frontend/src/app/providers/(dashboard)/portfolio/page.tsx`
- `apps/frontend/src/app/providers/(dashboard)/calendar/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/page.tsx`
- `apps/frontend/src/lib/api/client.ts` — add portfolio/availability methods
