# Comprehensive Product/UX + Code Audit Report: Contract to Cozy (C2C)
**Date:** Sunday, April 26, 2026
**Subject:** CTA, Navigation, and Destination Context Alignment

## Audit Goal
To find every case where a CTA, card, or banner visually promises one detail/context, but the click target navigates somewhere that does not explain, support, or focus that promised detail.

---

## Executive Summary
The audit revealed several critical and high-severity mismatches. The most severe issue is a **functional lockout** where the primary management interface (Inventory) is redirected to a read-only public sharing page (Vault). Systemic "routing drift" has also created two divergent "Fix" hubs, causing inconsistent user experiences depending on whether they navigate via the Sidebar or the Dashboard.

---

## Findings by Severity

### 🔴 CRITICAL: The "Vault Lockout" Redirect Loop
- **Severity:** Critical
- **User Impact:** Users are unable to manage their home inventory, documents, or warranties through generic routes.
- **Source:** `apps/frontend/next.config.js` (Lines 44-46)
- **Destination:** `/dashboard/vault` (Renders `VaultView.tsx`)
- **Mismatch Description:** The UI promises "Vault" or "Inventory" management. However, `next.config.js` redirects these paths to `/dashboard/vault`. That page renders `VaultView.tsx`, which is a **read-only, password-protected public sharing page** intended for home buyers/heirs, not the owner's management view.
- **Root Cause:** Incorrect redirection logic in `next.config.js` that aliases management routes to a sharing-view component.
- **Recommended Fix:** 
  1. Move the public vault to `/vault/[propertyId]` (unauthenticated/password-gated).
  2. Point `/dashboard/vault` and `/dashboard/inventory` to the `InventoryClient` which supports private management.
  3. Remove the conflicting redirects in `next.config.js`.

### 🔴 HIGH: Fix/Resolution Center Split (Routing Drift)
- **Severity:** High (Systemic)
- **User Impact:** Confusing, dual-personality experience for the primary "Fix" job.
- **Source 1:** Sidebar (via `layout.tsx`) -> `/dashboard/resolution-center`
- **Source 2:** Dashboard WinCards -> `/dashboard/properties/[id]/fix`
- **Mismatch Description:** The Sidebar opens the "Resolution Center" (with `TriageActionCard`s). The Dashboard opens the "Resolution Hub" (with `WinCard`s). Both use different ranking logic and different UI patterns for the same fundamental user intent.
- **Root Cause:** Divergent development of two "Fix" hubs and separate route builders (`layout.tsx` vs `dashboardPropertyAwareHref.ts`).
- **Recommended Fix:** Consolidate into a single "Resolution Hub" at `/dashboard/properties/[id]/fix`. Ensure both Sidebar and Dashboard use the same route resolver.

### 🟠 MEDIUM: Warranty Renewals Map to Insurance Page
- **Severity:** Medium
- **User Impact:** User clicks "Expired: Warranty" and lands on a page showing only Insurance policies, with no sign of the warranty they need to fix.
- **Source:** `apps/frontend/src/lib/dashboard/urgentActions.ts` (Line 132)
- **Destination:** `/dashboard/insurance` (Redirects to `/dashboard/protect`)
- **Mismatch Description:** The routing logic for `RENEWAL_EXPIRED` always returns `/dashboard/insurance`, even if the source was a `Warranty` record.
- **Root Cause:** Hardcoded routing in `resolveUrgentActionHref`.
- **Recommended Fix:** Update `resolveUrgentActionHref` to check the entity type and route to `/dashboard/warranties` (which should point to `inventory?tab=coverage`).

### 🟠 MEDIUM: Home Savings "Missing Context"
- **Severity:** Medium
- **User Impact:** Dashboard promises "$1,200/yr in savings", but clicking "See savings" opens a generic tool page where that value is not prominently displayed or focused.
- **Source:** `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`
- **Destination:** `/dashboard/properties/[id]/tools/home-savings`
- **Mismatch Description:** The destination page (`HomeSavingsToolClient`) expects `expectedAnnual` and `highlight=opportunities` params to show a focused banner, but the Dashboard CTA doesn't pass them.
- **Root Cause:** Param propagation missing in `buildPropertyAwareDashboardHref`.
- **Recommended Fix:** Pass calculated savings values and `highlight=true` as query parameters in the Dashboard CTA.

### 🟡 LOW: Dead Tab Parameters
- **Severity:** Low
- **User Impact:** Navigation implies a focused view (e.g. `?tab=expenses`), but the user lands on a generic hub that shows the default tab instead.
- **Source:** `next.config.js` and `Sidebar.tsx`
- **Destination:** `/dashboard/protect`, `/dashboard/save`
- **Mismatch Description:** Multiple redirects use `tab=...` parameters that the destination client components (like `RiskProtectionClient`) do not implement.
- **Root Cause:** Structural mismatch between navigation intent and component implementation.
- **Recommended Fix:** Implement tab-switching logic in the Hub pages to honor the `tab` query param.

---

## Systemic Patterns & Guardrails

### 1. Centralized Route Registry
**Problem:** Link construction is scattered across three different files with no shared source of truth.
**Guardrail:** Move all route resolution to `src/lib/routes/registry.ts`. All `Link` and `router.push` calls for dashboard tools must use this registry.

### 2. Focus & Highlight Protocol
**Problem:** We promise specific data on the dashboard but land the user on a generic page.
**Guardrail:** Implement a `useFocusContext()` hook. If `focusItemId` is in the URL, the page must automatically scroll to that item and apply a temporary "highlight" pulse animation.

### 3. Verification Test for Redirections
**Problem:** `next.config.js` changes can accidentally break core management features.
**Guardrail:** Add a Playwright/Cypress E2E test that verifies the Sidebar "Vault" link actually renders a page with an "Add Item" button (ensuring it's not the read-only public view).

---

## Remediation Plan

1. **Phase 1 (Immediate):** Fix the `Vault` vs `Inventory` redirect conflict to restore management access.
2. **Phase 2 (UX Consistency):** Consolidate "Fix" and "Resolution" into a single canonical hub.
3. **Phase 3 (Precision):** Update `urgentActions.ts` and Dashboard CTAs to pass focus parameters (itemId, savings amounts, tab selection).
4. **Phase 4 (Validation):** Implement the `tab` handling in the `Protect` and `Save` hubs.
