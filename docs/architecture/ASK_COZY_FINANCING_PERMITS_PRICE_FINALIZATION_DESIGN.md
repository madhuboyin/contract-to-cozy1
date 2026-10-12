# Ask Cozy — Financing, Permits and Price Finalization: read pass and design

**Status:** Read pass and recommended slices, for owner decision. The only thing built from this document is the role-floor correction in section 5 (verified, uncommitted).
**Date:** October 12, 2026
**Parent:** `docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md`, advisory order item 2 ("Financing, Permits and Price Finalization"); rows "Financing", "Permits" and "Price Finalization" of the P-tables, all carried forward *not re-verified* until this pass.
**Method:** `docs/architecture/AUDIT_METHODOLOGY.md`. Claims are labelled **executed**, **code-traced** or **inferred**. No database or browser exists in this repository; nothing here ran against either.

---

## 1. What this covers

The register's rule: each slice begins with the tool's FRD, traditional implementation, canonical service and current Ask contract, and does not infer parity from operation names. This is that pass for the three tools, plus one finding that changes the order of work.

## 2. Current state in Ask (code-traced)

| Tool | In Ask today | Desktop capability not in Ask |
| --- | --- | --- |
| **Permits** | Only counts and flags inside the renovation readiness answer (`getPermitSummary`). No permit list, detail or write. | List and detail; add a permit manually; update status; record an official status with evidence; delete; inspection milestones; inspection readiness checks (photo upload); unpermitted flags (scan, add, update, remediation case); disclosure export; open-data fetch |
| **Price Finalization** | A list of saved records (read only). No create, edit or finalize. | Create a draft (from a Negotiation Shield case, a quote workspace, a service price check or manually); update accepted terms; finalize |
| **Financing** | Mortgage detail capture exists inside the refinance flow. No financing read or write op. | Profile (mortgage status, balance, rate, term, payment, second mortgage, PMI); equity position and history; the project-financing calculator; saved scenarios (create, edit, archive) |

## 3. Facts established (code-traced unless stated)

### Price Finalization
| # | Fact | Evidence |
| --- | --- | --- |
| PF1 | Three mutating routes only: create draft (`POST …/price-finalizations`), update (`PUT …/:id`), finalize (`POST …/:id/finalize`). The status enum has `ARCHIVED` but **nothing in the tool's own routes, controller or service writes it** (the three updates in the service are the draft edit, the finalize and the booking attach; a search for other writers found none): archive/delete is not a desktop capability (the register row lists it; it is not parity). | `priceFinalization.routes.ts`; `priceFinalization.service.ts` (`createDraft`, `updateDraft`, `finalize`, `attachBooking`) |
| PF2 | **The "blocked on quote selection" dependency is narrower than the register says.** `createDraft` requires a *selected quote* only when `quoteComparisonWorkspaceId` is given (409 `PRICE_FINALIZATION_QUOTE_SELECTION_REQUIRED`). A draft may also be `MANUAL`, `NEGOTIATION_SHIELD` (`negotiationShieldCaseId`) or `SERVICE_PRICE_RADAR`. Negotiation Shield reviews are now in Ask, so the review → finalization continuation is unblocked. | `createDraft` (workspaceContext branch); `PriceFinalizationCreateInput` |
| PF3 | Hidden steps in the **controller**, not the service: the project-compliance applicability gate (`assertProjectComplianceDecisionsApplicable(... ['priceFinalization','providerBooking'])`), a property-context version stamped into `metadataJson`, analytics, and on finalize a guided-journey `recordToolCompletion`. A service-only caller (Ask) would skip them. This is the Negotiation Shield F7 pattern again. | `priceFinalization.controller.ts` (`createPriceFinalizationDraft`, `finalizePriceFinalization`) |
| PF4 | Finalizing a Quote Comparison-sourced record also rewrites the workspace's quote decisions (selected → ACCEPTED, others → REJECTED) and advances the workspace to `FINALIZATION`: a cross-tool write. | `finalize` after the transaction |
| PF5 | Finalize requires an accepted price greater than zero; terms are replaced wholesale when supplied. | `finalize` |

### Permits
| # | Fact | Evidence |
| --- | --- | --- |
| PM1 | Fourteen user mutations (fetch trigger, create, update, official status, delete, inspection add/update/delete, readiness check, flag scan/create/update, remediation case, disclosure request). | `permitTracker.routes.ts` |
| PM2 | `recordOfficialStatus` takes the caller's role to check an evidence document's visibility; it is the only role use. | `permitTracker.service.ts`, `permitTracker.controller.ts` |
| PM3 | The readiness check takes photo uploads and runs an AI rate limiter (`expensiveAiRateLimiter`): a model call on user images. | `permitTracker.routes.ts` |
| PM4 | A permit write is a household record (permit number, contractor, license, costs) and a disclosure export is a seller-facing document. | `CreateManualPermitSchema`; `requestDisclosureExport` |

### Financing
| # | Fact | Evidence |
| --- | --- | --- |
| FN1 | `POST …/financing/calculate` is **stateless** (route comment and controller: it returns results and persists nothing). | `financing.routes.ts`, `calculateFinancing` |
| FN2 | The profile holds mortgage balance, rate, payment and PMI; the refinance flow in Ask already captures overlapping mortgage fields. Two writers of the same fields need one canonical owner. | `UpsertFinancingProfileSchema`; refinance capture |
| FN3 | Scenarios are created, patched and archived (`DELETE` archives). | `financing.routes.ts`, `archiveFinancingScenario` |

## 4. A finding that changes the order: none of the three had a household-role floor

**Executed (router level, stubbed controllers):** before the correction, a read-only member (`VIEWER`) got past the route layer on every writing route of all three tools: the first failure per tool was `POST …/permits/fetch`, `POST …/price-finalizations` and `PUT …/financing/profile`. Services and controllers do not reject a viewer either (the only role use is PM2). So, over HTTP, a viewer could add and delete permits, finalize a price and edit the financing profile and scenarios. This is the same defect class as Negotiation Shield D9 (FRD v1.295).

## 5. The correction built with this pass (verified, uncommitted)

`requireHouseholdRole('CONTRIBUTOR')` immediately after `propertyAuthMiddleware` on:
- Permit Tracker: 14 routes (the fourteen mutations in PM1);
- Price Finalization: 3 routes;
- Financing: 5 routes (profile, equity refresh, scenario create/patch/archive).

Left open to a viewer: all reads, and `POST …/financing/calculate` (stateless, FN1). `POST …/equity/refresh` is floored because it writes a snapshot.

**Verification (executed):** `tests/unit/propertyRouteRoleFloors.test.js` (9) mounts the three real routers with the real floor and replaces only authentication, the membership lookup, the rate limiters and the controllers: every writing route returns 403 to a viewer and to a caller with no role; a contributor and an owner get past the floor; reads and the calculator stay open. Against the previous routes the viewer cases fail on all three tools. The neighbouring suites' failures are identical before and after.

**Judgement calls to confirm:** the financing profile and the permit disclosure export are floored at CONTRIBUTOR like the rest; either could reasonably be OWNER-only (D-R2).

## 6. The same gap elsewhere: a heuristic scan, not a verified list

A static scan of every non-admin route file looked for property-scoped mutating routes with no `requireHouseholdRole` (directly or through an alias) **and** no role handling in any imported controller or service module. It is heuristic: it cannot see middleware applied by other means, and a mutation that is legitimately viewer-capable (a personal dismissal or preference) would be counted.

| Result | Value |
| --- | --- |
| Non-admin route files with some unfloored property-scoped mutating routes | 62 |
| …of which no imported controller or service mentions any role handling | **45 files, about 267 routes** |
| …of which one does (may enforce itself) | 17 files, about 97 routes |

Largest by count in the first group: `homeBuyerTask` (49), `projectTracker` (30), `refinanceRadar` (16), `incidents` (15), `newHomeSetup` (13), `quoteComparison` (13), `materialSpec` (12), `guidance` (11), `inspectionHub` (10), `homeHabitCoach` (9), `roomPlantAdvisor` (9). The scan output is saved in the working notes; it is not committed because it is an unverified list.

**This is not a verified vulnerability list.** It is a strong reason to treat the HTTP role floor as a systemic gap and decide on a program rather than fix route files one tool at a time (D-R1).

## 7. Recommended slices (after the correction)

### Price Finalization (the chain Negotiation Shield now unblocks)
- **PF-A — Finalize from a review:** from a Negotiation Shield review (analysed or not), "Record the accepted price" opens a form (vendor, accepted price, optional terms: scope, payment, warranty, timeline) → review → `createDraft` with `sourceType NEGOTIATION_SHIELD` and `negotiationShieldCaseId`, after the same applicability gate, idempotent per execution (the create has no key today: needs one, as for Negotiation Shield 2a, or a natural-key check on `(property, negotiationShieldCaseId, DRAFT)`).
- **PF-B — Finalize:** confirmation-gated; extract the controller's gate, journey completion and analytics into one shared function (the Negotiation Shield D6 pattern) so Ask and the page keep identical effects; the Quote Comparison write (PF4) happens only for that source.
- **PF-C — Edit accepted terms** on a draft or, with `allowPostFinalizeEdits`, after.
- Not designed: archive/delete (not a desktop capability; a product decision), booking attach (called by the booking flow, not a price-finalization route).

### Permits
- **PM-A — Read:** list (status, category, dates, flags count) and one permit, plus open flags. No write. Lowest risk and answers "do I have a permit for the roof?".
- **PM-B — Add a permit and update its status:** `createManualPermit` / `updatePermit` forms; official status with evidence uses the household-visible Home Record rule from the Negotiation Shield documents design.
- **PM-C — Inspections, flags and remediation case**, one tool at a time. **Readiness checks (photo upload + AI) and disclosure export are separate decisions** (PM3, PM4).

### Financing
- **FN-A — Read:** profile, equity position and saved scenarios, honest about missing data.
- **FN-B — "What would a $X project cost to finance?"** inline from the stateless calculator (FN1), with an explicit "save as a scenario" confirmation. Valuable and cheap; no new domain behaviour.
- **FN-C — Edit the profile:** needs one canonical owner for the mortgage fields shared with the refinance capture (FN2) first.

## 8. Decisions needed

| # | Decision | Recommendation |
| --- | --- | --- |
| D-R1 | The systemic route-floor gap (section 6) | Commit this three-tool correction now. Then run a *verified* audit (a router-level test per file, as done here) over the 45 files in priority order of data sensitivity, with a per-route classification of what is legitimately viewer-capable, rather than one blanket middleware. A blanket "no non-GET for viewers" rule is attractive but would break legitimate personal actions without live verification. |
| D-R2 | Financing profile and permit disclosure export: CONTRIBUTOR or OWNER | OWNER for both (financial position; a seller-facing export), but built as CONTRIBUTOR for now so this correction is only a floor. |
| D-PF1 | Price Finalization starts: which source first | Negotiation Shield (PF-A), then Quote Comparison once selection exists in Ask. |
| D-PF2 | Archive/delete for Price Finalization | Treat as a product decision, not parity (PF1). |
| D-PM1 | Permits order | PM-A (read) first, then PM-B. |
| D-FN1 | Financing order | FN-A then FN-B; FN-C only after the mortgage-field owner is decided. |
| D-X | Photo upload with AI (readiness checks) and disclosure export in Ask | Defer; both need their own design. |

## 9. What is not verified

- Everything about runtime behaviour: no database, no file store, no external permit data source, no AI call.
- The static scan's counts (section 6) are heuristic.
- The page-level behaviour of these three tools for a viewer is unchanged in the UI; only the HTTP floor was added. A client that relied on a viewer's writes would now see 403.

## 10. Suggested order

Commit the three-tool floor → D-R1 verified audit (separate, larger) in parallel or next → PF-A/B (Price Finalization from a review) → PM-A → FN-A/B → PM-B → PF-C → the rest.
