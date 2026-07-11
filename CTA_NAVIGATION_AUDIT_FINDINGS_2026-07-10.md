# CTA Navigation Audit — Fresh Pass
**Date:** 2026-07-10
**Scope:** Full application CTA/navigation promise vs. destination alignment (dashboard cards, sidebar dynamic actions, tool cards, nav shell)
**Supersedes:** `CTA_NAVIGATION_AUDIT_FINDINGS.md` (2026-04-26) — that audit's 8 CRITICAL + 10 HIGH findings were "fixed" the same week (`4d98b71`, `24b32b7`, `d241784`, `b1fe261`, `b73a7c6`). This pass verifies those fixes against current destination-page code, not just the CTA-side diff.

**Headline:** The April fixes were consistently one-sided — they added query params (`filter=`, `action=`, `highlight=`, `expectedCost=`, etc.) to link builders, but rarely wired the destination page to read them. Of ~40 distinct CTA→param pairs checked below, roughly two-thirds are dead on arrival. Two CTAs now 404 outright — a regression, not present in the original audit.

---

## 🔴 CRITICAL — Broken routes (404)

### C1. "Start repair guidance" sidebar action → 404
`apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:426-433` (`start-repair-guidance`)
```
href: `${propPath}/guidance?action=start&type=repair`
```
No `page.tsx`/`layout.tsx` exists at `properties/[id]/guidance/`. The only real page is one level deeper, `properties/[id]/guidance/step/page.tsx`, and there's no redirect from `/guidance` → `/guidance/step` in `middleware.ts` or `next.config.js`. **Every click 404s.** Even if it resolved, `GuidanceStepPageClient.tsx` only reads `guidanceJourneyId`/`stepKey`, not `action`/`type`, so those params would be dead too.
**Fix:** point the href at `.../guidance/step?action=start&type=repair` (or add a redirect), then decide whether `action`/`type` are worth wiring up at all.

### C2. "Add contractor quote" sidebar action → 404
`dynamicSidebarActions.ts:438-445` (`add-contractor-quote`)
```
href: `${propPath}/bookings?action=add-quote&type=contractor`
```
No `properties/[id]/bookings/` route exists anywhere in the app (confirmed via directory search and a full-text grep for `add-quote` — zero other references). **404 on click.**
**Fix:** either build the property-scoped bookings route, or point at the existing top-level `/dashboard/bookings` (which itself doesn't read `action`/`type` either — see H-series below).

---

## 🟠 HIGH — Query params completely ignored by destination (page renders identically with or without them)

### H1. Coverage Intelligence tool — 8 dead params across 4 separate CTAs
`.../tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx` only reads `guidanceStepKey`, `guidanceJourneyId`, `tab`, `itemId`/`inventoryItemId`, `from`, `homeAssetId`, `issueType`. None of the following, sent by four different callers, are read anywhere in the client or its child `CoverageIntelligencePanel.tsx`:
- sidebar `review-coverage-gaps`: `filter=gaps&highlight=true&expectedCount={n}`
- sidebar `review-uncovered-assets`: `filter=uncovered&source=inventory`
- `CoverageIntelligenceToolCard.tsx` (dashboard): `source=dashboard-card&action=run&verdict={v}` / `source=dashboard-card&hasAnalysis={b}&status={s}`
This is the same shape as the original audit's Finding #7 (which pointed at a route that didn't even exist) — the route now exists, but the promise ("Review N gaps", "N item(s) without coverage") still isn't fulfilled: the page shows the same generic coverage view regardless of `filter`/`highlight`/`expectedCount`.
**Fix:** either add a count-mismatch banner + gap-highlighting like the `/fix` page already has (see below — that pattern works, copy it), or drop the specific-count language from the CTA copy.

### H2. Inventory page — 10 CTA variants, zero params consumed
`.../properties/[id]/inventory/InventoryClient.tsx` reads only `openItemId`, `scrollToItemId`, `highlightRecallMatchId`, `roomId`, `from`, `tab`, `smart`. It never reads `filter`, `highlight`, `action`, `category`, `source`, `context`, or `mode` — confirmed by full-file grep, not just `useSearchParams` inspection. This kills every one of:
- `filter=missing-age&highlight=age-fields&action=add-ages` (sidebar "Complete age assessment")
- `action=add-item&category=appliance` / `&source=my-home` / `&source=inventory` / `&context=room&source=rooms` / `&source=fallback` (5 variants of "Add appliance")
- `action=scan-room&mode=camera[&source=rooms]` ("Scan room" ×2)
- `filter=missing-date&action=add-dates` ("Add purchase date")
- `action=add-warranty&highlight=warranty-fields` / `filter=missing-warranty&action=add-warranty` ("Add warranty details" ×2)
No modal opens, no field highlights, no filtering — every one of these CTAs promises a guided/scoped action and instead lands on the plain inventory list.
**Fix:** this is the single highest-leverage fix available — 10 CTAs share one destination file. Add `action`/`filter` handling once (open add-item modal pre-scoped to category; filter rows to missing-age/missing-date/missing-warranty; auto-scroll+highlight).

### H3. Vault redirects into Inventory's dead zone
`.../properties/[id]/vault/page.tsx` is a server-side `redirect()` (not a rewrite) straight to `.../inventory?...`, forwarding every param verbatim except `tab`. So `?action=upload&category=property-docs`, `?action=upload&category=insurance&type=policy`, `?action=upload&source=vault`, `?action=upload&category=receipts&type=expense`, `?view=missing&action=review`, `?action=organize&view=all`, `?action=upload&source=fallback` — 7 more CTA variants, all promising an upload/organize flow — all die for the same reason as H2 once they land on inventory.
**Fix:** same as H2, or restore a real vault landing page that actually reads these.

### H4. Warranties "add" CTA sends the wrong trigger value
`.../dashboard/warranties/page.tsx:943` auto-opens the add-warranty modal only when `action === 'new'`. The sidebar CTA (`check-warranty-coverage`, `dynamicSidebarActions.ts:293-300`) sends `action=add-warranty`, which never matches. **The modal never auto-opens** despite the CTA's whole purpose being "check/add warranty coverage." `propertyId` *is* read correctly and prefills the form once a user manually opens it.
**Fix:** one-line change — either send `action=new` from the sidebar, or accept `'add-warranty'` as a synonym on the warranties page.

### H5. Rooms "add room" CTA — dead params
`RoomsHubClient.tsx` reads only `backTo`. `?action=add-room&source=rooms` (sidebar, `dynamicSidebarActions.ts:661-668`) never opens a create-room form — room creation isn't gated on `action` at all in this file.

### H6. `/fix` page: `priority` and `sort` params dead (params, not the whole page — `filter` and `expectedCount` DO work here, see "What actually works" below)
Confirmed via full-file grep of `properties/[id]/fix/page.tsx`: no `searchParams.get('priority')` or `searchParams.get('sort')` exists anywhere. Callers sending these and getting nothing:
- PropertyHealthScoreCard, MaintenanceNudgeCard: `&priority=high`
- sidebar `review-urgent-alerts`: `&sort=priority`
This is the same "sort=priority is dead" defect flagged in the April audit (then on `resolution-center`) — it simply moved to the new `/fix` destination when routes were consolidated; never actually fixed.

### H7. Risk assessment: `amount` dead
`properties/[id]/risk-assessment/page.tsx` reads `focus` (works — scrolls to exposure summary) and `view`, but never `amount`. Sidebar `review-risk-exposure` promises "$12,450 at risk" and passes `amount=12450`; the destination never echoes or validates that figure.

### H8. Financial efficiency: `expectedCost` dead
Same pattern as H7 — `focus=breakdown` works (auto-opens the `<details>` breakdown), `expectedCost` is never read.

### H9. Bare property page: two sidebar CTAs promise actions that don't exist
`properties/[id]/page.tsx` reads only `view` and `tab`. Neither `action` nor `source` is read anywhere on this page or its components:
- `complete-home-profile` → `${propPath}?action=edit-profile&source=fallback` — promises opening an edit flow; nothing happens.
- `add-finance-snapshot` → `${propPath}?action=add-mortgage&source=financial-tool` — promises a mortgage-details form; nothing happens.

### H10. Cost-explainer and home-savings secondary params dead
- `cost-explainer` reads only `focus`; `start-repair-guidance`'s sibling CTA `validate-repair-cost` sends `action=validate&type=repair` — dead.
- `home-savings` reads `expectedMonthly`/`expectedAnnual`/`highlight` (these work — see below), but the separate `check-savings` CTA's `action=analyze` param is dead; nothing auto-triggers analysis.

---

## 🟡 MEDIUM — Data-integrity / consistency issues (not dead params, but promise ≠ reality)

### M1. Hardcoded savings figure not derived from real data
`MorningHomePulseCard.tsx` shows a **hardcoded** "$220–$760" potential-savings range (not computed from the financial-efficiency score) and links it to `.../financial-efficiency?focus=breakdown`. This is worse than the original audit's Finding #4 pattern — there the number was real but possibly inconsistent; here the number shown to the user isn't derived from their data at all.

### M2. MaintenanceNudgeCard's `expectedCount` is built from the wrong count
The badge shown to the user is `consolidatedActionCount`, but the `expectedCount` param sent to `/fix` (which drives the count-mismatch banner, H6-adjacent but this one *does* work) is built from `maintenanceCount`, a different tally. The two can diverge, so the mismatch banner can fire (or fail to fire) against a number the user never actually saw.

### M3. RiskPremiumOptimizerToolCard reads stale state
`.../tools/risk-premium-optimizer` dashboard card computes `savingsRange` for the "Run optimizer" href before the just-updated `analysis`/`hasAnalysis` state has flowed through that render, so the first-run navigation can carry a stale placeholder (`—`) instead of the real range.

### M4. UpcomingRenewalsCard per-item links drop property context
Individual renewal rows link to flat `/dashboard/warranties` or `/dashboard/insurance` with no `propertyId`, unlike the footer "View All" button (which now correctly branches by type/property — this part of the April fix holds up).

### M5. SeasonalChecklistCard critical-task copy has no matching filter
CTA text dynamically becomes "Review 3 critical tasks" but always links to the same unfiltered `/dashboard/seasonal?propertyId={id}` — unchanged since the original audit (this specific finding was never in the April fix batch).

### M6. HomeBuyerChecklistCard / UpcomingBookingsCard: no per-item deep link
Both the per-item "Action" button and the page-level "View / Complete Full Checklist" button go to the identical flat `/dashboard/checklist`. Similarly, `UpcomingBookingsCard`'s "View All {n}" goes to flat `/dashboard/bookings` with no filter despite showing a specific count.

### M7. RightSidebar snapshot counts are non-interactive
`components/layout/RightSidebar.tsx` shows `urgentCount`, `atRisk` ($), `gapCount` as plain static text (not links) in its "Intelligence brief" block. The block's only link, "View full report →", goes to `/dashboard/health-score` — unrelated to any of the counts displayed above it. Not a broken promise per se (nothing is clickable), but a missed opportunity directly adjacent to `DynamicActionsBlock`, which *does* render working per-metric CTAs just below it.

---

## ✅ What actually works now (confirmed, don't re-break)

- **`/fix` page**: `filter` (urgent/maintenance/preventive) and `expectedCount` (count-mismatch banner) are both genuinely read and used. This is the one destination in the app with a real "promise validation" banner — use it as the template for H1/H2/H3.
- **`home-savings` page**: `expectedMonthly`, `expectedAnnual`, `highlight=opportunities` are read and drive a real banner.
- **`financial-efficiency` and `risk-assessment` pages**: `focus=breakdown`/`focus=exposure` genuinely auto-expand/scroll to the right section.
- **UpcomingRenewalsCard footer button**: dynamic routing by insurance/warranty/mixed type mix works as designed.
- **Notifications bell → `/dashboard/notifications`**: `unreadCount` badge matches the page's own "Unread" KPI tile — verified consistent, no action needed.
- **`getSaveActions` savings-opportunity gating**: correctly split into "Review savings opportunities" (only shown when `savingsCount > 0`) vs. "Check for savings" (generic fallback copy) — this was the original audit's Finding #11 recommendation, implemented correctly.
- **Coverage-analysis → coverage-intelligence 404**: the *route* is fixed (commit `d241784`); the page just doesn't consume the params yet (see H1).

---

## Systemic pattern (unchanged from April, still the root cause)

Every fix commit since April edited the **CTA/link-builder side only**. Not one of the ~15 dead-param cases above required touching a link builder to discover — they all required opening the destination page and finding a `useSearchParams()` call that simply doesn't mention the param. The two exceptions that actually work end-to-end (`/fix`, `home-savings`) are exactly the two destinations where a corresponding destination-side change shipped in the same commit.

**Recommendation:** any future CTA fix should be reviewed as a diff pair — link builder change + destination page change in the same commit — or it should be assumed dead until the destination is grepped.

---

## Suggested priority order

1. Fix the two 404s (C1, C2) — trivial route corrections, currently the worst possible outcome (broken link).
2. Wire Inventory (H2) — highest leverage, 10 CTAs share this one file, and Vault (H3) inherits the fix for free.
3. Fix Warranties' `action` value mismatch (H4) — one-line fix.
4. Decide: either implement `priority`/`sort`/`amount`/`expectedCost` on their respective pages, or strip those params from the CTA hrefs so the code doesn't imply behavior that doesn't exist.
5. Coverage Intelligence (H1) — port the `/fix` page's count-mismatch banner pattern.
