# Phase 6 — Specialized new-home path and controlled expansion

## Outcome

Phase 6 serves low-history new-construction properties through warranty rights, builder accountability, setup, and early evidence. It does not infer a maintenance history that the property does not have, and it does not reuse the existing-home inspection-led buyer plan.

## Increment 1 — Selective pilot and setup-plan foundation

Status: implemented in code; the updated Prisma schema must be applied by the operator. No database migration script is included.

This increment establishes:

1. Strict eligibility from `NEW_HOME_SETUP` entry context plus `NEW_CONSTRUCTION` property origin.
2. A property-scoped pilot assessment covering demand, document availability, builder follow-up pain, willingness to engage, channel source, and estimated acquisition cost.
3. A selective admission gate that keeps low-signal homes on hold instead of turning the specialized path into a default acquisition promise.
4. A dedicated new-home plan rather than a renamed existing-home checklist.
5. Five phases: walkthrough, first 30 days, days 31–90, first-year protection, and recurring Home handoff.
6. Twelve stable, idempotent starter actions covering punch lists, builder responsibility, handover evidence, warranty terms, model/serial registration, commissioning, seasonal care, and 30-day, 90-day, and one-year reviews.
7. Explicit builder, homeowner, shared, or unknown responsibility on every plan task.
8. Evidence-bearing completion and property-household assignment controls.
9. Editable move-in, ownership, builder-warranty, and one-year-inspection deadlines with due-date recalculation.
10. An evidence-readiness view over existing property documents, verified documents, warranties, inventory identity, and inspection records.
11. Property-authorized REST endpoints under `/api/new-home-setup/properties/:propertyId/*`.
12. A focused responsive dashboard at `/dashboard/properties/:propertyId/new-home-plan` and new-construction-aware Home hero routing.

## Gate behavior

The pilot is eligible only when demand and engagement are each at least moderate and the property has either usable documents or meaningful builder follow-up pain. A hold result and its reason codes remain durable so the team can measure demand instead of silently broadening access.

The assessment is not a claim that the journey has proven channel economics. It captures the required inputs for later cohort analysis. Expansion remains blocked until pilot outcomes and the Phase 3 repair/replacement gate demonstrate acceptable completion, blocker time, comprehension, verified write-back, provider quality, and recurring-care conversion.

## Reuse boundaries

- Documents, warranties, inventory, inspections, household access, canonical priority language, and the Home surface are reused.
- The existing-home `HomeBuyerChecklist` is not reused because its inspection/closing phases and 90-day horizon do not model builder responsibility or first-year warranty rights.
- New-home tasks use stable Home Action keys so later increments can promote deadlines and unresolved work into the canonical feed without introducing another action identity.

## Completion increment

Status: implemented in code.

The completion increment adds:

- durable punch-list items with locations, evidence-document IDs, promised dates, builder response history, dispute state, and homeowner-verified closure;
- a source-cited warranty-rights register with coverage, notice requirements, expiry, extraction confidence, verification, canonical deadline tasks, and governed notifications;
- inventory-linked manufacturer/model/serial registration with confirmed identity written back to the canonical inventory record;
- classified permit, final-inspection, commissioning, manual, certificate, and photo evidence with verification lineage;
- idempotent 30-day, 90-day, and one-year inspection-preparation bundles;
- first-year transition of unresolved work into canonical maintenance actions plus a Living Home Record milestone;
- automatic handoff checks at the standard Home Action feed boundary;
- property acceptance reporting and admin pilot/expansion-gate metrics at `/api/admin/analytics/phase6-pilot`; and
- responsive workflow controls for punch lists, warranty rights, registration, evidence, and inspection preparation.

## Acceptance status

- Walkthrough and punch-list capture: complete.
- Builder responsibility, response history, deadlines, disputes, and verified closure: complete.
- Warranty rights, citations, notice deadlines, canonical alerts, and notifications: complete.
- Model and serial registration with inventory write-back: complete.
- Permit, final-inspection, and commissioning evidence: complete.
- Seasonal/homeowner responsibilities and 30-day, 90-day, and one-year preparation: complete.
- Recurring Home and Living Home Record transition: complete.
- Pilot cohort and expansion-gate reporting: complete in code; a `READY` decision requires real operational evidence and cannot be manufactured by implementation.

Phase 6 is code-complete. Schema application, pilot usage, threshold review, and the eventual expansion decision are operational release activities.

## Operator action

Apply `apps/backend/prisma/schema.prisma` to the target database and regenerate the Prisma client. Do not run a migration script from this repository; none is created for Phase 6.
