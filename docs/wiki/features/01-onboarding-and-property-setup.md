[← Back to Wiki Home](../README.md)

# Onboarding, Auth & Property Setup

Every homeowner, household member, and provider who ever uses C2C passes through this cluster first: create an account, verify it, add or claim a home, and (optionally) invite other people to that home. It's the highest-leverage part of the product to keep frictionless — every other feature page in this wiki assumes a verified user with at least one `Property` and a `HouseholdMember` row already exists.

### Registration & Login

- **What it does:** Homeowners and providers create an account with email/password, verify their email, and sign in. Providers use a parallel signup path (see the Provider subsection below) but share the same underlying auth endpoints.
- **User flow:**
  1. User visits `/signup`, fills first/last name, email, password, confirm password, and must check a Terms/Privacy checkbox.
  2. On submit, the account is created in `PENDING_VERIFICATION` status and a verification email is queued; the UI shows "check your email" rather than logging the user in immediately.
  3. User clicks the emailed link to `/verify-email?token=...`, which calls the verify endpoint and flips the account to `ACTIVE`.
  4. User signs in at `/login` with email/password.
  5. If MFA is enabled on the account, login instead returns a short-lived `mfaToken` and the login form switches to a 6-digit TOTP (or recovery code) prompt before issuing real tokens.
  6. On success, the frontend routes by role: `HOMEOWNER` → `/dashboard`, `PROVIDER` → `/providers/dashboard`, `ADMIN` → `/dashboard/admin`.
- **Frontend:** `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/verify-email/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`; shared chrome in `components/auth/AuthTemplate.tsx`; session logic in `lib/auth/AuthContext.tsx`.
- **Backend:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/verify-email`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `PUT /api/auth/change-password`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/resend-verification` — all in `routes/auth.routes.ts` → `controllers/auth.controller.ts` → `services/auth.service.ts`.
- **Data:** `User` (role, status, `emailVerified`, `tokenVersion`, `tosAcceptedAt`/`tosVersion`), `HomeownerProfile` or `ProviderProfile` (created atomically with the `User` row in a single Prisma transaction, so a failed profile write can't leave an orphaned account).
- **Notes:**
  - Registration and profile creation happen inside one `prisma.$transaction` specifically to avoid the previously-real bug of a `User` row existing without its role profile (which 500s every profile-scoped route). Worth knowing if you ever see a legacy account without a profile.
  - Email verification can be globally bypassed via `isEmailVerificationDisabled()` (an app-config check) — in that mode, both registration and first login auto-mark the account verified/active. Useful for local dev, but means "email verification required" behavior is not universal — check this flag before assuming it's enforced.
  - Password changes bump `tokenVersion`, which invalidates all previously issued JWTs — a real "sign out everywhere" mechanism, not just cookie clearing.
  - Rate limiting: `authRateLimiter` on register/login/refresh, tighter `strictRateLimiter` on forgot/reset-password and resend-verification.
  - There are two auth-adjacent route trees under `src/app/login` — only `app/(auth)/login` and `app/(auth)/signup` contain real pages; the plain `app/login` directory has no page files, so it doesn't shadow the route-group version.

### Multi-Factor Authentication (MFA)

- **What it does:** Optional TOTP-based second factor. A user can turn it on from account settings, after which every login requires an authenticator code (or a one-time recovery code as a fallback).
- **User flow:** Enable via `POST /setup` (returns an otpauth URI + base32 secret to render as a QR code) → confirm with the first 6-digit code via `/setup/verify` → MFA is now enabled and recovery codes are issued. On future logins, entering correct email/password returns an `mfaToken` instead of session tokens; the user submits that token + a code to `/challenge` (or `/challenge/recovery`) to finish signing in.
- **Frontend:** MFA challenge UI is inlined directly into `app/(auth)/login/page.tsx` (toggles between password form and code form based on whether `mfaToken` state is set); no dedicated MFA settings page was found in `app/onboarding` or `app/(dashboard)` during this review — MFA setup itself is assumed to live in a profile/settings page not covered by this cluster.
- **Backend:** `routes/mfa.routes.ts` → `controllers/mfa.controller.ts`: `POST /api/auth/mfa/setup`, `POST /api/auth/mfa/setup/verify`, `GET /api/auth/mfa/status`, `POST /api/auth/mfa/recovery-codes/regenerate`, `POST /api/auth/mfa/disable`, plus public `POST /api/auth/mfa/challenge` and `POST /api/auth/mfa/challenge/recovery`.
- **Data:** `User.mfaEnabled`, `User.mfaSecret` (AES-256-GCM encrypted TOTP secret), recovery codes (per `mfa.controller`/service — not traced further here).
- **Notes:** All MFA endpoints share the tight `authRateLimiter`. The schema comment marks MFA as "admin accounts only for v1.0," but the code paths (setup/challenge) are role-agnostic in the routes/controllers actually reviewed — treat the "admin-only" framing as a stale comment unless you find an explicit role gate elsewhere.

### Password Reset

- **What it does:** Standard forgot/reset password flow, deliberately non-revealing about account existence.
- **User flow:** `/forgot-password` → enter email → success message always reads "if an account exists, we sent a link" (doesn't leak whether the email is registered) → user clicks emailed link to `/reset-password?token=...` → sets new password → redirected to `/login` after a 3-second success message.
- **Frontend:** `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx` (wraps the token-reading form in a `Suspense` boundary — a prior fix for a Next.js SSR error with `useSearchParams`).
- **Backend:** `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (both behind `strictRateLimiter`).
- **Notes:** No code path in this cluster wires a "returnUrl" or post-reset deep link back to an in-progress onboarding/invite — reset always lands the user at the front door of `/login`.

### Property Onboarding Wizard (trigger-first activation)

- **What it does:** This is the actual first-run experience a new homeowner hits after signing in: pick why you're here, add your home's address, confirm/enrich a few basic facts, and get one evidence-bounded "first action" instead of a generic empty dashboard. It intentionally does not ask for a full property profile up front.
- **User flow:**
  1. `/onboarding/address` — user picks their situation (own it / buying / new build / exploring), then either a purchase-stage sub-form (if buying) or a "what brought you here" trigger list (repair, replacement, contractor quote, maintenance backlog, insurance/warranty question, project planning, anticipated cost, or "just exploring"). Below that, they enter/autocomplete a street address, city, state, ZIP, and a few optional home-basics (dwelling type, year built, bedrooms, bathrooms, basement, pool/spa).
  2. On submit, the frontend calls `GET /api/properties/lookup` to try to enrich the address from public records (reconciling the result against the submitted state/ZIP; a mismatch is discarded rather than trusted), then stashes everything in a short-lived Next.js route handler session (`/api/onboarding-lookup-session`) and routes to `/onboarding/confirm`.
  3. `/onboarding/confirm` — shows the resolved address (editable) and the same home-basics fields for final review, then on "Add home and see first action" calls `POST /api/properties` to actually create the `Property`, then `PUT /properties/:propertyId/onboarding/entry-context` (via `captureEntryContext`) to persist the trigger/buyer context captured in step 1.
  4. Redirects to `/onboarding/first-value?propertyId=...`, which calls `GET /properties/:propertyId/onboarding/first-value` to render one recommended action tied to the stated trigger. The user can attach evidence (free text, a document/photo/quote upload via `uploadDocument`, etc.) and resolve the action as completed / deferred (auto-snoozes 7 days) / not relevant, via `POST .../first-action-resolution`.
  5. Lands on `/dashboard?propertyId=...`.
  6. The old `/onboarding/reveal` route is now dead code — it unconditionally `redirect()`s to `/onboarding/confirm`. Its comment explains it used to show speculative risk/savings numbers before there was enough evidence, and was intentionally retired.
- **Frontend:** `app/onboarding/address/page.tsx`, `app/onboarding/confirm/page.tsx`, `app/onboarding/first-value/page.tsx`, `app/onboarding/reveal/page.tsx` (redirect shim); helpers in `lib/onboarding/addressIntegrity.ts`, `lib/property/propertyContextForm.ts`.
- **Backend:** `GET /api/properties/lookup`, `GET /api/properties/address-suggestions`, `GET /api/properties/address-details`, `POST /api/properties` (`controllers/property.controller.ts`); entry-context/first-value endpoints all in `routes/propertyOnboarding.routes.ts` → `services/entryContext.service.ts` (`GET/PUT .../onboarding/entry-context`, `GET .../onboarding/first-value`, `POST .../onboarding/first-value-feedback`, `POST .../onboarding/first-action-resolution`, `POST .../onboarding/trigger-evidence`).
- **Data:** `Property` (address/geocode fields, dwelling type, bedrooms/bathrooms, basement config, pool/spa), plus whatever entry-context/first-value model backs `entryContext.service.ts` (not fully traced — treat the exact table name as unverified; the API contract above is confirmed live).
- **Notes:**
  - This flow requires the user to already be authenticated (`lookupProperty`/`createProperty` both sit behind `authenticate` middleware) — signup/login always happens first, even though the address page itself has no visible auth gate in its own component.
  - A separate `ownershipState`/journey concept (`SHOPPING`, `UNDER_CONTRACT`, `RECENT_OWNER`, `ESTABLISHED_OWNER`, `PREPARING_TRANSFER`) is captured/updatable later via `GET/PATCH /properties/:propertyId/onboarding/journey-context` — this is distinct from the one-time entry trigger and can be changed anytime from the property's own onboarding-checklist page (see below).
  - Buyer-journey entries (`entryPath: EXISTING_HOME_PURCHASE`) feed into a much larger "Buyer Plan" workspace (`app/(dashboard)/dashboard/properties/[id]/buyer-plan/*`) and new-construction entries (`entryPath: NEW_HOME_SETUP`) feed a separate new-construction workspace (`routes/newHomeSetup.routes.ts`, `app/(dashboard)/dashboard/properties/[id]/new-home-plan`) — both are large enough to be their own features and are only referenced here as onboarding branch points, not documented in full.
  - Analytics events fired along the way: `landing_page_viewed`, `active_trigger_selected`, `address_lookup_started`, `address_entered_manually`, `property_claimed`, `property_onboarded` (duration computed from a `sessionStorage` timestamp set on mount), `first_value_viewed`, `first_action_resolved`.

### Property Setup Checklist (5-step wizard)

- **What it does:** A second, separate onboarding surface scoped to one property, reachable at `/dashboard/properties/:id/onboarding`. This is the "fill out the rest of your home" checklist — property details, rooms, inventory, protection, and insights — distinct from the trigger-first activation flow above. It's what a user returns to (or is nudged toward) to unlock full insights after the initial claim.
- **User flow:**
  1. Land on the checklist; a progress bar shows `setupScore` and steps completed out of 5.
  2. Step 1 "Add Property Details" — links out to the property edit form.
  3. Step 2 "Create Rooms" — create at least one room.
  4. Step 3 "Add Inventory" — add at least one inventory item (AI scan supported elsewhere).
  5. Step 4 "Activate Protection" — enable alerts or create at least one maintenance task.
  6. Step 5 "Generate Insights" — open insights/generate a report snapshot.
  7. Each step has a "Mark complete" button (disabled until the step's own completion condition is met server-side) and steps can be jumped between freely; a "Skip for now" and "Finish setup" action are always available. A "How are you using this home right now?" card on the same page lets a CONTRIBUTOR/OWNER update the journey-ownership state at any time (VIEWERs see it read-only).
- **Frontend:** `app/(dashboard)/dashboard/properties/[id]/onboarding/page.tsx` + `OnboardingClient.tsx`, step components in `.../onboarding/steps/Step1PropertyDetails.tsx` … `Step5Insights.tsx`, timeline in `.../onboarding/components/DesktopOnboardingTimeline.tsx`; API wrapper `lib/api/onboardingApi.ts`.
- **Backend:** `GET .../onboarding/status`, `POST .../onboarding/set-step`, `POST .../onboarding/complete-step`, `POST .../onboarding/skip`, `POST .../onboarding/finish` (`routes/property.routes.ts` mount point `routes/propertyOnboarding.routes.ts` → `services/propertyOnboarding.service.ts`, functions `computeSetupStatus`/`setCurrentStep`/`completeStep`/`skipOnboarding`/`finishOnboarding`).
- **Data:** Step completion is computed live from existing tables (property fields, rooms, inventory items, maintenance tasks/alerts, reports) rather than stored as a separate checklist — `computeSetupStatus` derives status from `Property`/`Room`/`InventoryItem`/maintenance data each time it's called.
- **Notes:** This is a genuinely different flow from `/onboarding/*` (the trigger-first wizard) despite similar naming — don't conflate the two when reading code or filing bugs. `PropertySetupBanner.tsx` (shown on the dashboard when a user has no property at all) links to yet a **third** entry point, `/dashboard/properties/new`, a longer manual property-creation form (ownership/occupancy, appliance ages, HVAC/roof/water-heater install years, safety devices) for users who skip the trigger-first wizard entirely.

### Household & Multi-User Property Access

- **What it does:** Lets a property OWNER invite other people (a spouse, co-owner, or a household helper) to see and act on the same property, with three role tiers: OWNER, CONTRIBUTOR, VIEWER.
- **User flow:**
  1. From `/dashboard/properties/:id/household`, an OWNER opens "Invite" (`InviteMemberSheet`), enters an email, and picks CONTRIBUTOR or VIEWER (invites cannot grant OWNER — that's managed separately, not through this form).
  2. Backend generates a random 32-byte token and a 1-invite-TTL expiry, emails the link `/invite/:token`.
  3. Recipient opens `/invite/:token`, sees a preview (property address snippet, inviter's name, assigned role + role description, expiry countdown) via the public `GET /household/invites/:token` endpoint (no auth required for preview).
  4. Clicking "Accept Invite" calls the authenticated accept endpoint; if the recipient isn't logged in, a 401 sends them to `/login?returnUrl=/invite/:token` — **but the login page does not read or act on `returnUrl`** (confirmed by reading `app/(auth)/login/page.tsx` in full — it always routes by role to `/dashboard`/`/providers/dashboard`/`/dashboard/admin`), so the user has to manually re-navigate to the invite link after signing in. This looks like a real UX gap, not an intentional simplification.
  5. Once accepted, a `HouseholdMember` row is created and the household activity feed logs `MEMBER_JOINED`.
  6. OWNERs can later change a member's role or remove them (`PATCH`/`DELETE .../household/members/:memberId`), and CONTRIBUTORs+ can assign tasks to household members (`PATCH .../tasks/:taskId/assign`).
- **Frontend:** `app/(dashboard)/dashboard/properties/[id]/household/page.tsx`, `.../household/activity/page.tsx`, `app/invite/[token]/page.tsx`; components `components/features/household/MemberList.tsx`, `InviteMemberSheet.tsx`, `HouseholdUtils.tsx` (role labels/descriptions).
- **Backend:** `routes/household.routes.ts` → `controllers/household.controller.ts` → `services/household.service.ts`: `GET/POST/PATCH/DELETE .../household/members[/...]`, `GET/POST/DELETE .../household/invites[/...]`, public `GET /household/invites/:token` + `POST /household/invites/:token/accept`, `GET .../household/activity`, `PATCH .../tasks/:taskId/assign`.
- **Data:** `HouseholdMember` (propertyId, userId, role, `isPrimaryOwner`, displayName — unique on `[propertyId, userId]`), `HouseholdInvite` (token, inviteeEmail, role, status: PENDING/ACCEPTED/EXPIRED/REVOKED, expiresAt, optional `sourceAskExecutionId` for invites issued via the "Ask Cozy" AI assistant), `HouseholdActivityType` enum (MEMBER_INVITED, MEMBER_JOINED, MEMBER_REMOVED, MEMBER_ROLE_CHANGED, TASK_ASSIGNED, etc. — the activity feed is a general property timeline, not household-only).
- **Notes:**
  - Role enforcement is rank-based (`ROLE_RANK` in `services/propertyAccess.service.ts`, applied via `requireRole('OWNER')`/`requireRole('CONTRIBUTOR')` middleware) — OWNER > CONTRIBUTOR > VIEWER, so `requireRole('CONTRIBUTOR')` also passes for OWNER.
  - All property-scoped household routes sit behind `propertyAuthMiddleware` (verifies the requester actually has a `HouseholdMember` row on that property) in addition to the role check.
  - Every property-scoped endpoint in this router is also rate-limited via `apiRateLimiter`.

### Provider Registration & Login (brief)

Providers (inspectors, handymen, etc.) are a different role with their own signup/login surface; their actual working dashboard is out of scope for this page (see the marketplace/provider-ops page).

- **What it does:** A two-step signup collecting account credentials, then business profile info (business name, phone, service categories), producing a `PENDING_APPROVAL` provider profile.
- **User flow:** `/providers/join` step 1 (name/email/password) → step 2 (business name, phone, service category checkboxes drawn from real `InspectionType`/`HandymanType` enum values, grouped into INSPECTION/HANDYMAN families, Terms checkbox) → submit calls the same `register()` used by homeowner signup with `role: 'PROVIDER'` → "check your email to verify" message → `/providers/login` for sign-in (role-based redirect sends providers to `/providers/dashboard` after login/MFA).
- **Frontend:** `app/providers/join/page.tsx`, `app/providers/login/page.tsx`, `components/providers/ProviderAuthTemplate.tsx`.
- **Backend:** Same `POST /api/auth/register` / `POST /api/auth/login` as homeowners — the `role` field is what branches server-side logic. Registration creates a `ProviderProfile` (businessName, serviceCategories, serviceRadius default 25, `status: PENDING_APPROVAL`, insurance/license unverified, rating/review counters zeroed, `stripeOnboarded: false`) inside the same transaction that creates the `User`.
- **Data:** `ProviderProfile`.
- **Notes:** Provider approval/verification workflow (who flips `PENDING_APPROVAL` → active, insurance/license verification) lives in admin provider-ops surfaces, not reviewed here.

## Related pages
- [Architecture & Data Model](../02-architecture-and-data-model.md)
- [Home Health, Inventory & Maintenance](02-home-health-inventory-and-maintenance.md)
- [← Back to Wiki Home](../README.md)
