# Provider Reviews — Functional Requirements Document

> A comprehensive Provider-domain audit found that `Review` had a full moderation pipeline
> (`adminReviewModeration.*` — approve/reject/flag/restore) and a fully-working public read path
> (`provider.service.ts::getProviderReviews`, rendered on the homeowner-facing provider detail
> page), but `.review.create()` appeared zero times anywhere in the codebase — there was no path
> for a homeowner to actually write one. The "Verified outcome reviews" section on every provider
> detail page was permanently empty by construction. This FRD documents the fix.

## 1. What was missing

- No route/controller/service created a `Review` row. Only the admin moderation surface
  (approve/reject/flag/restore *existing* reviews) existed.
- No homeowner-facing UI to write a review anywhere — not on the bookings list, not on a booking
  detail page, nowhere.
- A second, independent gap found while wiring this up: `ProviderProfile.averageRating` /
  `totalReviews` are a denormalized aggregate that search results, provider cards, and
  `getProviderById` all read directly — but nothing ever wrote to them after signup (where
  they're hardcoded to `0`). `getProviderReviews`' own summary block computes a *live* average
  from `APPROVED` reviews correctly, but that's a separate, narrower computation used only on the
  reviews-list endpoint itself. Without fixing this too, a provider could accumulate real approved
  5-star reviews and still show "0 reviews" everywhere except their own reviews tab — which would
  have made the new creation flow feel broken even when working correctly.

## 2. The fix

### 2.1 Review creation
New endpoints on the existing `Booking` resource (`Review.bookingId` is `@unique` — one review
per booking, and a review only makes sense in the context of a specific completed booking):

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/bookings/:id/review` | Homeowner only, must be this booking's homeowner, booking must be `COMPLETED`, one per booking (checked up front + DB unique constraint as a backstop against races) |
| `GET` | `/api/bookings/:id/review` | Same access rules as `GET /api/bookings/:id` — returns the review or `null` |

`BookingService.createReview`/`getReviewForBooking` (`apps/backend/src/services/booking.service.ts`)
reuse the same ownership-check pattern as `getBookingById`/`cancelBooking` in the same file.
`createReviewSchema` (`apps/backend/src/types/booking.types.ts`) requires `rating` (1-5) and
`content` (≥10 chars); `title` and the four sub-ratings (quality/communication/value/
professionalism) are optional. New reviews are created with the default `status: PENDING` —
they enter the existing moderation queue exactly like any other review; nothing about moderation
changed.

Frontend: `(dashboard)/dashboard/bookings/[id]/page.tsx` — for a `COMPLETED` booking, shows either
the review form (reusing the existing `StarRating` component from
`components/orchestration/StarRating.tsx`) or, once submitted, the review itself with a
"Published" / "Pending review" status chip depending on moderation state.

### 2.2 Rating stats sync
`adminReviewModeration.service.ts::moderateReview` now calls a new
`recomputeProviderRatingStats(providerId)` helper after every status transition — aggregates
`APPROVED` reviews for that provider and writes the result to
`ProviderProfile.averageRating`/`totalReviews`. Runs on every transition (not just APPROVE) so
FLAG/REJECT/RESTORE also keep the aggregate correct when a review leaves or re-enters `APPROVED`.

## 3. Explicitly not built
- **Provider responses to reviews** — `Review.response`/`respondedAt` columns exist and are
  unused; no UI or endpoint lets a provider respond. Real feature, separate scope.
- **Provider-side "my reviews" view** — providers can already see their own reviews via the same
  public read path homeowners use (`getProviderReviews`), but there's no dedicated provider
  dashboard page for it. Not built here.
- **Review editing/deletion by the author** — a homeowner can submit once; there's no update or
  delete path. Matches the one-review-per-booking model; revisit if needed.

## 4. Verification
`tsc --noEmit` and `eslint` clean on every touched file, both apps; backend `npm run build`
clean. No schema changes — `Review` already existed in full with every field this FRD uses.

## 5. File Index

### Backend
- `apps/backend/src/types/booking.types.ts` — `createReviewSchema`/`CreateReviewInput`
- `apps/backend/src/services/booking.service.ts` — `createReview`/`getReviewForBooking`
- `apps/backend/src/controllers/booking.controller.ts` — `createReview`/`getReviewForBooking`
- `apps/backend/src/routes/booking.routes.ts` — `POST`/`GET /:id/review`
- `apps/backend/src/services/adminReviewModeration.service.ts` — `recomputeProviderRatingStats()`, called from `moderateReview`

### Frontend
- `apps/frontend/src/types/index.ts` — `Review`, `ReviewStatus`, `CreateReviewInput`
- `apps/frontend/src/lib/api/client.ts` — `createBookingReview`/`getBookingReview`
- `apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx` — review form + display for `COMPLETED` bookings
