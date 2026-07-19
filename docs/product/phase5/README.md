# Phase 5 — Existing-home buyer acquisition journey

## Outcome

Phase 5 converts inspection and transaction context into a durable, property-scoped 90-day ownership plan. It is an entry journey into the same Home product, not a permanent buyer dashboard or user segment.

## Increment 1 — Property-scoped plan foundation

Status: implemented in code; the updated Prisma schema must be applied by the operator. No database migration script is included.

This increment establishes:

- one buyer-acquisition checklist per property instead of per homeowner profile;
- explicit pre-close, first-30-day, day-31-to-90, and recurring-Home phases;
- `NOW`, `SOON`, `PLAN`, and `CONSIDER` priority bands;
- stable action keys and source lineage for system, user, inspection, document, guidance, and Home Action origins;
- assignment, due dates, and journey handoff state;
- twelve property-specific starter actions spanning inspection import, negotiation separation, documents, safety, utilities, household responsibility, systems baselining, maintenance, and recurring-Home handoff;
- property-authorized REST endpoints under `/api/home-buyer-tasks/properties/:propertyId/*`;
- import-readiness aggregation across inspection reports, material findings, and property documents;
- property-scoped dashboard and mobile API callers;
- automatic buyer-mode exit when the ownership context becomes `ESTABLISHED_OWNER`.

## Contract and lifecycle rules

The canonical contract is `apps/backend/src/productFramework/buyerAcquisition.contract.ts`.

- Buyer-plan eligibility comes from the property onboarding context, never `UserSegment`.
- Existing plans remain readable during handoff so their history and lineage are durable.
- Contributors and owners may work the plan; viewers cannot mutate or implicitly create it.
- System plan tasks are retained and may be marked `NOT_NEEDED`; only user-created tasks may be deleted.
- An established-owner context marks an active acquisition checklist `HANDED_OFF` and records the transition time.

## Remaining Phase 5 increments

1. Promote confirmed inspection findings into verified facts, negotiation decisions, dismissed findings, or lineage-bearing plan actions.
2. Add material-finding branching into canonical repair journeys and Home Actions with idempotent write-back.
3. Add a focused document-import/review surface for inspection, disclosure, warranty, and transaction documents.
4. Add target-close and ownership-start editing, and calculate due dates from those anchors.
5. Add household owner assignment UI and responsibility completion evidence.
6. Convert unresolved recurring-handoff tasks into the standard Home feed without duplication.
7. Add Phase 5 integration and acceptance tests covering multi-property isolation, source lineage, day-91 handoff, and inspection promotion.
8. Add Phase 5 launch instrumentation and pilot acceptance evidence.

## Operator action

Apply the updated Prisma schema to the target database and regenerate the Prisma client as part of deployment. Do not run a migration script from this repository; none is created for this phase.
