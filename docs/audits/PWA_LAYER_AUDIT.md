# PWA Layer Audit

**Scope:** Progressive-web-app surface in `apps/frontend` — service worker, offline
persistence, install experience, push, and the manifest.
**Date:** 2026-09-08
**Method:** Static read of source at branch `main`.
**Findings:** 5 high · 4 medium · 5 low.
**Companion artifact:** https://claude.ai/code/artifact/82e63600-49ce-445d-9b40-0060f1e8caa1

---

## Bottom line

The PWA is roughly **40% real, 60% scaffold**. The parts that exist are sound: the
service worker is deliberately conservative, and the web API client already handles
session refresh correctly. But the offline story the app presents to users — cached
tasks, photo capture, automatic sync — is a **facade**: the persistence layer that
would power it has no callers, and the offline page cannot even be reached while
offline.

Every fix below can be made without changing the desktop experience. The recommended
order is to complete the shared foundation (icons, camera policy, aggregation
endpoints) **before** any native iOS work, not in parallel with it.

There are no users and no running environment to protect, so this plan contains **no
migration steps and no launch gates**. The one constraint carried through every item
is that the desktop flow must render and behave exactly as it does today.

---

## Findings at a glance

| ID | Finding | Severity | Touches desktop? |
|----|---------|----------|------------------|
| F1 | Offline persistence layer (`storage/db.ts`) is unreferenced dead code | High | No |
| F2 | Offline page and banners promise capabilities that do not exist | High | No |
| F3 | `/offline` route is unreachable while offline | High | No |
| F4 | `Permissions-Policy: camera=()` disables in-app camera capture | High | Fixes both |
| F5 | App icon set is placeholder art; no maskable icon, screenshots, or splash | High | No |
| F6 | Push notifications wired to one tool only; no general opt-in | Medium | No |
| F7 | No aggregation endpoints — the dashboard composes its data client-side | Medium | No |
| F8 | Service-worker registration can silently no-op on fast loads | Medium | Fixes both |
| F9 | Update prompt uses `window.confirm()`; iOS install hint over-fires | Medium | Shared component |
| F10 | Manifest missing `id`, `screenshots`, `display_override`, attribution | Low | No |
| F11 | No `updateViaCache` control and no cache header for `/sw.js` | Low | No |
| F12 | No automated PWA verification in CI | Low | No |
| F13 | `web-share=()` blocks the Web Share API for report sharing | Low | Fixes both |
| F14 | Housekeeping: unscheduled cache pruning, unused exports, split dismissal keys | Low | No |

---

## What is already sound

Preserve these as-is:

- **Service-worker scope discipline.** `public/sw.js` never caches HTML, RSC payloads,
  API responses, or anything under `/monitoring`. It caches only content-hashed
  `/_next/static/` chunks (cache-first) and icons, fonts and the manifest
  (network-first), with per-cache entry trimming and no opaque-response caching. This
  is the right instinct for an auth-gated app.
- **Session recovery in the web client.** `lib/api/client.ts` intercepts `401`, calls
  `/api/auth/refresh`, retries the original request once, and de-dupes concurrent
  refreshes. The native iOS scaffold is missing exactly this — the web side already
  solved it.
- **IndexedDB security hygiene.** `lib/storage/db.ts` strips the `Authorization` header
  before persisting any queued request, deletes a legacy `documents` store on upgrade,
  and hard-disables offline document storage. The intent is careful even though
  nothing calls it (see F1).
- **Mobile layout primitives.** Safe-area insets, `viewport-fit: cover`, standalone
  detection (`navigator.standalone` + display-mode query), a bottom navigation bar,
  and offline / slow-connection banners are all present and reasonable.
- **CSP architecture.** Per-request nonce from `middleware.ts`, `strict-dynamic`, and
  role-based route redirects are a solid base that the PWA work does not need to
  disturb.

---

## Findings in detail

### High severity

#### F1 — The offline persistence layer is unreferenced dead code

`lib/storage/db.ts` defines a full offline toolkit — an `idb` database (`c2c-offline`,
schema v3) with stores for maintenance tasks, an offline request queue and cached
properties, plus helpers `queueOfflineRequest`, `getOfflineQueue`, `saveTasks`,
`getPendingTasks`, `cacheProperty` and more.

**Evidence**

- `apps/frontend/src/lib/storage/db.ts` — full module, ~260 lines
- grep for importers of every export → 0 matches outside the file itself
- `getDB()` is never called, so the IndexedDB is never even created

None of it is wired to anything. There is no sync worker consuming the queue, no code
writing tasks, no reader of the cached properties. It is a complete, well-typed module
that runs zero times.

**Desktop-safe** — the module has no importers, so deleting it or replacing it cannot
affect any current screen, desktop or mobile.

#### F2 — The offline page and banners promise capabilities that do not exist

`app/offline/page.tsx` tells the user that while offline they can still "complete
maintenance tasks", "take photos and add notes", "browse saved documents", and that
"your changes will sync automatically when you're back online."
`components/mobile/OfflineBanner.tsx` repeats this: "Changes will sync when
reconnected."

**Evidence**

- `apps/frontend/src/app/offline/page.tsx` — "Still available offline" list
- `apps/frontend/src/components/mobile/OfflineBanner.tsx` — offline + "back online, syncing" states

Given F1, none of this is true. There is no offline task completion, no note capture,
no document browsing, and no sync. This is the highest-trust-cost item in the audit:
the app makes a specific promise it cannot keep.

**Desktop-safe** — copy-only change to a route and a banner that desktop users
effectively never see (the banner renders only when `navigator.onLine` is false; the
page is a mobile-install fallback).

#### F3 — `/offline` is unreachable while actually offline

The service worker's `fetch` handler returns early for any request with
`mode === 'navigate'`, deliberately letting navigations hit the network so auth
redirects stay correct. But there is no navigation fallback: when the network is gone,
a navigation fails to the browser's own error page. The `/offline` route has zero
inbound links and is never registered as a fallback, so it only renders when the user
is online — the one situation it is not for.

**Evidence**

- `apps/frontend/public/sw.js` — `if (event.request.mode === 'navigate') return;`
- grep for "/offline" → only the file's own header comment

**Desktop-safe** — a navigation fallback fires only when a navigation fetch *rejects*.
Online navigations (every desktop session) still pass straight through untouched.

#### F4 — `Permissions-Policy: camera=()` disables in-app camera capture

The global `Permissions-Policy` header sets `camera=()` — an empty allowlist, i.e. the
camera is disabled for every origin including the app's own. It is applied to `/(.*)`
via `next.config.js`.

**Evidence**

- `apps/frontend/security-headers.js` — `STATIC_SECURITY_HEADERS` → `camera=()`, `web-share=()`
- `getUserMedia` consumers: `components/inventory/QrScannerModal.tsx`,
  `BarcodeScannerModal.tsx`, `LabelOcrModal.tsx`

The barcode / QR / label-OCR scanners open a live `getUserMedia` stream and will be
blocked by this directive. (File-input pickers with `capture="environment"` are *not*
governed by Permissions-Policy and keep working — several screens use that pattern.)
Live camera capture is one of the main reasons to have a mobile app at all, so this
needs fixing regardless of the native decision. Worth a quick runtime confirmation,
but the directive itself is unambiguous.

**Fixes both** — desktop is subject to the identical restriction today. Changing to
`camera=(self)` only widens the allowlist; it cannot regress any desktop behaviour.

#### F5 — The icon set is placeholder art; no maskable icon, screenshots, or splash

The files in `public/icons/` range from 166 bytes to 1.9 KB. A real 512×512 PNG icon
is tens of kilobytes; these are near-empty placeholders. `manifest.json` also lists
the same `any` icons again under `purpose: "maskable"` with no dedicated safe-zone
artwork, so they will be cropped on Android. There are no `screenshots` (the array is
empty), no `apple-touch-startup-image` splash screens, and only one apple-touch-icon
at 192 (iOS expects 180).

**Evidence**

- `apps/frontend/public/icons/icon-512x512.png` — 1.9 KB
- `apps/frontend/public/manifest.json` — `"screenshots": []`, maskable icons reuse the "any" set

Any install — PWA today or an App Store submission later — will present broken-looking
artwork. This is shared groundwork: the asset set is identical whether the shell is a
wrapped PWA or a native app.

**Desktop-safe** — icons and manifest metadata are consumed only by install surfaces.
The desktop browser tab already uses `favicon.svg` and is unaffected.

### Medium severity

#### F6 — Push is wired to one tool only; there is no general notification opt-in

`sw.js` has working `push` and `notificationclick` handlers, and `lib/pwa.ts` exposes
`requestNotificationPermission` and `showNotification` helpers. But the only code that
actually calls `pushManager.subscribe` with the VAPID key lives in the mortgage
refinance radar tool.

**Evidence**

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi.ts` — `ensureRefinancePushSubscription`
- grep for `pushManager.subscribe` → this file only

There is no single "turn on notifications" setting, so the platform's most valuable
mobile capability is reachable from exactly one screen. Note also that the backend
push pipeline is Web Push / VAPID only — a native iOS app would need new APNs work
here.

**Desktop-safe** — a shared subscription helper and a notifications setting are
additive. Web Push also works in desktop Chrome, so this is upside, not risk.

#### F7 — No aggregation endpoints; the dashboard composes its data in the browser

The homeowner dashboard fires five requests in parallel (`listBookings`,
`listWarranties`, `listInsurancePolicies`, `listIncidents`, `listInventoryItems`) and
then runs `consolidateUrgentActions()` client-side to build the "urgent actions" list.
`getPropertyDashboardBootstrap` exists but returns only property, onboarding, narrative
and record-overview data.

**Evidence**

- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` — `consolidateUrgentActions(...)`
- `apps/backend/src/controllers/property.controller.ts` — `getPropertyDashboardBootstrap`

Any second client — a wrapped PWA view, a native app, a watch complication — must
re-implement that merge logic. A `GET /api/mobile/home` endpoint that returns the
composed view in one call is shared infrastructure for whatever comes next.

**Desktop-safe** — a brand-new route. The existing desktop dashboard keeps its current
calls; migrating it later is a separate, optional task and out of scope here.

#### F8 — Service-worker registration can silently no-op on fast loads

`registerServiceWorker()` attaches its work to
`window.addEventListener('load', onLoad, { once: true })`, and it is called from a
React `useEffect` in `providers.tsx`. If the `load` event has already fired by the
time that effect runs — common on warm loads and back/forward navigation — `onLoad`
never executes and the service worker is never registered for that session.

**Evidence**

- `apps/frontend/src/lib/pwa.ts` — `window.addEventListener('load', onLoad, { once: true })`
- `apps/frontend/src/app/providers.tsx` — `useEffect(() => registerServiceWorker(), [])`

The fix is a `document.readyState === 'complete'` check that runs the registration
immediately when the page has already loaded.

**Fixes both** — desktop registration is subject to the same race. Making it reliable
is a strict improvement everywhere.

#### F9 — Update prompt uses `window.confirm()`; iOS install hint over-fires

When a new service worker installs, `pwa.ts` calls
`window.confirm('A new version is available. Reload to update?')`. Blocking dialogs are
unreliable in standalone display mode and are a poor experience on any platform.
Separately, `InstallPrompt.tsx` shows the iOS "Add to Home Screen" instruction card to
*any* iOS user-agent after 60 seconds — including Chrome on iOS and in-app web views,
where those steps do not apply — and regardless of whether the user is signed in.

**Evidence**

- `apps/frontend/src/lib/pwa.ts` — `window.confirm(...)` in the updatefound handler
- `apps/frontend/src/components/mobile/InstallPrompt.tsx` — `if (isIOS() && !wasDismissed) setTimeout(..., 60000)`

**Shared component** — the update toast replaces a dialog used on desktop too.
Implement it as a non-blocking toast with identical dismiss behaviour and review it
once on desktop. The iOS-hint change is mobile-only. Low risk.

### Low severity

#### F10 — Manifest is missing identity, richer-install and attribution fields

`manifest.json` has no `id` (identity can drift between origins/deploys), no
`display_override`, no `screenshots` (blocks Chrome's richer install UI), and no
`launch_handler`. `start_url` is `/dashboard` with no `?source=pwa` style parameter,
so installed-app launches are invisible to analytics.

**Desktop-safe** — the manifest is ignored by a normal desktop browser tab.

#### F11 — No `updateViaCache` control and no cache header for `/sw.js`

`navigator.serviceWorker.register()` is called without `{ updateViaCache: 'none' }`,
and `next.config.js` sets no explicit `Cache-Control` for `/sw.js`. Browsers largely
handle this well on their own, but pinning both removes a class of "stale worker"
surprises.

**Desktop-safe** — affects only how the worker script itself is revalidated.

#### F12 — No automated PWA verification

`scripts/sprint3/generate-mobile-qa-matrix.mjs` only writes a Markdown checklist — it
runs no assertions. Nothing in `qa:gates` checks installability, manifest validity, or
offline-navigation behaviour, so regressions in this layer are invisible.

**Desktop-safe** — CI-only additions.

#### F13 — `web-share=()` blocks the Web Share API

The same `Permissions-Policy` as F4 disables `web-share` entirely. Sharing a report or
a home-score link via the native share sheet — a natural mobile action — is not
possible. Bundle this change with F4.

**Fixes both** — widening to `web-share=(self)` cannot regress desktop.

#### F14 — Housekeeping

`clearOldCache()` in `db.ts` is never scheduled. `InstallPrompt.tsx` and its unused
`InstallBanner` export use two different `localStorage` dismissal keys
(`install-prompt-dismissed` vs `install-banner-dismissed`), so dismissing one does not
suppress the other. Fold into the F1 cleanup.

**Desktop-safe** — dead or mobile-only code paths.

---

## Remediation plan

Four tracks. Effort is a rough size (**S** hours · **M** a day · **L** multi-day), not
a schedule.

### Track A — Make the offline story honest

Highest trust impact, lowest effort. Do this first.

| ID | Action | Closes | Effort | Desktop impact |
|----|--------|--------|--------|----------------|
| A1 | Rewrite the offline page and `OfflineBanner` copy to describe only what is real — cached reads, retry when back online. Drop all claims of offline task completion, note capture and automatic sync. | F2 | S | None — copy only; not on any desktop path |
| A2 | Decide offline scope. Recommended: delete `lib/storage/db.ts`, its unused helpers and the IndexedDB bootstrap now; revisit a real minimal cache (dashboard read + queued status toggle) as a deliberate feature later. | F1, F14 | S | None — module has no importers |
| A3 | Add a service-worker navigation fallback: on a failed `mode: 'navigate'` fetch, serve a precached `/offline` shell. Precache that shell on `install`. | F3 | S | None — only runs when a navigation fetch rejects |

### Track B — Shared foundation

Reused verbatim by a wrapped PWA or a native shell. Worth doing before either.

| ID | Action | Closes | Effort | Desktop impact |
|----|--------|--------|--------|----------------|
| B1 | Produce a real icon set: 72–512 `any` icons, a dedicated 512 `maskable` with correct safe zone, a 180 apple-touch-icon, apple-touch-startup images, and 2–3 manifest `screenshots`. | F5 | M | None — install surfaces only; tab favicon unchanged |
| B2 | In `security-headers.js`, change `camera=()` → `camera=(self)` and `web-share=()` → `web-share=(self)`. | F4, F13 | S | None — strictly widens an allowlist; fixes desktop too |
| B3 | Add `GET /api/mobile/home` returning the composed dashboard plus a server-side consolidated urgent-actions list. Move `consolidateUrgentActions` logic into a shared server util. | F7 | M | None — new route; desktop keeps its current calls |
| B4 | Native-push prerequisite (only if native iOS is pursued): APNs credentials, a `POST /api/push/devices` token-registration endpoint, and a delivery-pipeline branch for device tokens alongside Web Push. | F6 (part) | L | None — additive backend |

### Track C — PWA correctness

Small fixes that make the existing PWA behave the way it already claims to.

| ID | Action | Closes | Effort | Desktop impact |
|----|--------|--------|--------|----------------|
| C1 | In `registerServiceWorker`, run registration immediately when `document.readyState === 'complete'`, otherwise on `load`. Pass `{ updateViaCache: 'none' }`. | F8, F11 (part) | S | None — makes desktop registration reliable too |
| C2 | Add `Cache-Control: no-cache` for `/sw.js` in `next.config.js` headers. | F11 | S | None — one asset's revalidation policy |
| C3 | Replace the `window.confirm` update flow with a non-blocking "Update ready — reload" toast. Keep dismiss behaviour identical. | F9 (update half) | S | Shared component — additive toast; review once on desktop |
| C4 | Gate the iOS "Add to Home Screen" card to Safari only, suppress it in in-app web views, and show it only after authentication. | F9 (iOS half) | S | None — desktop uses the `beforeinstallprompt` branch, unchanged |
| C5 | Add manifest `id`, `display_override: ["standalone", "minimal-ui"]`, `launch_handler`, and a `start_url` attribution parameter. | F10 | S | None — manifest is inert in a desktop tab |
| C6 | Generalise push: one notifications setting plus a shared subscription helper that every feature calls, replacing the tool-local implementation. | F6 | M | None — new setting; existing flows untouched |

### Track D — Verification

So this layer stops being invisible to the test suite.

| ID | Action | Closes | Effort | Desktop impact |
|----|--------|--------|--------|----------------|
| D1 | Add a Lighthouse installability / best-practices assertion and a Playwright offline-navigation test to `qa:gates`. | F12 | M | None — CI only |
| D2 | Make `generate-mobile-qa-matrix.mjs` drive an actual headless run instead of only emitting a checklist. | F12 | M | None — CI only |

### Suggested order

1. **Truth and quick correctness** — A1, A2, A3, B2, C1, C2. Remove the false promises
   and the dead module, unblock the camera, make registration and worker freshness
   reliable.
2. **Install quality** — B1, C5, C3, C4. Real artwork, complete manifest, a civilised
   update prompt, a scoped install hint.
3. **Shared platform work** — B3, C6, D1, D2. The `/api/mobile/home` endpoint, unified
   push, and CI coverage for the whole layer.
4. **Only if going native** — B4. APNs and device-token registration. Skip entirely if
   a wrapped PWA is the chosen shell.

---

## On proceeding to native iOS

The question was whether to audit and fix the PWA fully *before* starting native iOS.
The answer is yes, with one adjustment: don't treat it as "fix every finding, then
start native." Finish **Track B** (icons, camera policy, the aggregation endpoint) and
the Track A truthfulness work first, because those are not PWA-only — a native shell
reuses the same asset set, the same endpoint, and benefits from the same policy fix.

Then make the native call at a real decision point. If an installed PWA with the fixes
above meets the need — and with iOS 16.4+ Web Push for installed PWAs it plausibly
does — wrap it (Capacitor or equivalent) and keep one codebase. Go fully native only
for a capability the PWA genuinely cannot reach: native widgets, background location,
deep OS integration, or App Store discovery as a primary acquisition channel.

What to avoid is starting native *now*, in parallel with an unfinished PWA. The
existing iOS scaffold (`apps/ios/`) already repeats a problem the web client solved
long ago — no token refresh — and running two immature clients against a backend that
still forces client-side composition doubles the surface area while halving the
attention each part gets.

---

*Prepared from a static read of `apps/frontend` at branch `main`. Finding F4
(`camera=()`) is stated from the header directive and merits a one-line runtime check.
All file references are relative to the repository root.*
