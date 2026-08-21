# Provider Portfolio & Availability — Functional Requirements Document

> `ProviderPortfolio` and `ProviderAvailability` are real tables in `schema.prisma` with real
> frontend UI already built and nav-wired (`/providers/portfolio`, `/providers/calendar`). A
> database audit in this repo initially flagged both tables as stale-and-droppable; this FRD is
> the correction and the scope for finishing the work.
>
> **Status: Phase 1 (backend CRUD) and Phase 2 (frontend wiring, items 1-3) implemented.** See
> [Section 3](#3-backend-scope-implemented) and [Section 5](#5-frontend-implemented) for what
> shipped, and [Section 6](#6-open-decisions) for what's still an open call. Item 4 of Phase 2
> (surfacing `availableOnly` as a checkbox on the homeowner provider-search page) was deliberately
> skipped — see Section 5.4.

## Table of Contents

1. [Current State](#1-current-state)
2. [Gap Analysis](#2-gap-analysis)
3. [Backend Scope (Implemented)](#3-backend-scope-implemented)
4. [API Reference](#4-api-reference)
5. [Frontend (Implemented)](#5-frontend-implemented)
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
- **Frontend (provider-facing):** **implemented in Phase 2** — `(dashboard)/portfolio/page.tsx`
  now lists/creates/edits/deletes real items via the Phase 1 API. Previously 100% local mock
  state (`useState<PortfolioItem[]>([...hardcoded placeholder items...])`, no API calls).
- **Frontend (homeowner-facing):** **implemented in Phase 2** — the public provider detail page
  (`(dashboard)/dashboard/providers/[id]/page.tsx`) now renders a portfolio gallery from
  `provider.portfolioImages`. Previously called `api.getProvider(id)` but never read
  `.portfolioImages` off the response.

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
- **Frontend:** **partially implemented in Phase 2** — `(dashboard)/calendar/page.tsx`'s
  blocked-dates grid now reads/writes real `ProviderAvailability` windows (block/unblock the
  selected date, calendar dots reflect real saved windows). The working-hours toggle panel
  remains local-only, now with an explicit on-page note that it isn't saved — see
  [Open Decision #2](#6-open-decisions), unchanged from Phase 1's scope call. Previously the
  entire page (including blocked dates) was hardcoded mock state.

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
| Provider-facing frontend | ✅ wired to real API (Phase 2) | ✅ blocked dates wired to real API (Phase 2); working hours still local-only, see Open Decision #2 |
| Homeowner-facing frontend | ✅ renders real `portfolioImages` (Phase 2) | ⚠️ `availableOnly` not surfaced as a UI filter — deliberately skipped, Section 5.4 |

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

## 5. Frontend (Implemented)

1. **`(dashboard)/portfolio/page.tsx`** — real `list`/`create`/`update`/`delete` wiring against
   the Phase 1 API, following the same add/edit-modal + delete-confirm pattern already
   established in `(dashboard)/services/page.tsx`. Upload is a native `<input type="file">` →
   `api.createPortfolioItem(file, data)` (multipart). Image replace on edit isn't supported (the
   backend `PATCH` only updates title/description/category) — the edit modal says so rather than
   silently no-opping. Fabricated "Views" and "Featured" KPI numbers from the old mock were
   removed rather than carried forward — there's no view-tracking behind them, and shipping fake
   analytics next to real data seemed worse than not showing them.
2. **`(dashboard)/calendar/page.tsx`** — the blocked-dates grid and "Block/Unblock selected
   date" action now read/write real `ProviderAvailability` windows (one window per blocked day:
   `startOfDay`→`endOfDay`, `isAvailable: false`). The old hardcoded "booked dates" (fake
   `bookedDays = [12, 15, 18]`) and the "Upcoming Bookings" section (hardcoded fake appointments,
   unrelated to this FRD's scope — real bookings come from the separate `Booking` model) were
   removed for the same reason as the Portfolio KPI numbers: fabricated data presented as real is
   worse than omitting it. The working-hours panel is unchanged in function (local-only, per
   [Open Decision #2](#6-open-decisions)) but now says so on-page instead of implying it's saved.
3. **`(dashboard)/dashboard/providers/[id]/page.tsx`** (homeowner-facing) — added a "Portfolio"
   gallery section (reusing the existing `ScenarioInputCard` pattern this page already uses for
   Services/Reviews) rendering `provider.portfolioImages`, between the Services and Reviews
   sections. Only rendered when the provider has at least one photo.
4. **Provider search UI — `availableOnly` — deliberately skipped.** The homeowner-facing search
   page (`(dashboard)/dashboard/providers/page.tsx`) is a large (~1,100 line), already-working,
   memoized filter component with its own state/URL-sync/reset logic. Wiring in `availableOnly`
   properly means touching `ServiceFilterProps`, three separate `onFilterChange` call sites, the
   parent `ProviderSearchFilters` type, and the reset/summary logic — real surface area on a page
   with no existing regression coverage, for a lower-priority item (this page doesn't even
   surface the sibling `verifiedOnly` filter from the Provider Trust & Compliance FRD — Phase 1
   there shipped the backend and left UI surfacing for later too). Judgment call: not worth the
   risk to a working page in this pass. `api.searchProviders()` already accepts `availableOnly`
   (added in Phase 2) for whenever this is picked up.
5. **Image rendering:** portfolio photos use a plain `<img>` tag, not `next/image`. `imageUrl` is
   a presigned URL from whatever S3-compatible endpoint `S3_ENDPOINT`/`S3_BUCKET` point to
   (varies per deployment — see `s3Client.ts`), which `next/image`'s static
   `remotePatterns` hostname allowlist (`security-headers.js`) can't accommodate without
   hardcoding a guess at infra this repo doesn't have visibility into. Also means presigned
   query-string churn wouldn't play well with Next's image optimizer/cache anyway.

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
| 2 | Frontend wiring (Section 5) — both provider-facing pages, homeowner-facing portfolio render | ✅ Done (items 1-3); item 4 (search UI checkbox) deliberately skipped, see 5.4 |
| 3 | `availableOnly` search filtering live end-to-end; provider search UI surfaces it | Backend done, API client done; search-page checkbox still not built (5.4) |
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

### Frontend (Phase 2 — done, except 5.4)
- `apps/frontend/src/app/providers/(dashboard)/portfolio/page.tsx` — real CRUD + upload
- `apps/frontend/src/app/providers/(dashboard)/calendar/page.tsx` — real blocked-dates CRUD; fake booked/upcoming-bookings data removed
- `apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/page.tsx` — portfolio gallery section added
- `apps/frontend/src/lib/api/client.ts` — 8 new portfolio/availability methods, `availableOnly` added to `searchProviders` params
- `apps/frontend/src/types/index.ts` — `ProviderPortfolioItem`, `ProviderAvailabilityWindow`, `Provider.portfolioImages`
- `apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx` — **not touched**, see 5.4
