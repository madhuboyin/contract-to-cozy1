# Phase 5 — Existing-home buyer acquisition journey

## Outcome

Phase 5 converts inspection and transaction context into a durable, property-scoped 90-day ownership plan. It is an entry journey into the same Home product, not a permanent buyer dashboard or user segment.

## Increment 1 — Property-scoped plan foundation

Status: implemented in code; the updated Prisma schema must be applied by the operator. No database migration script is included.

Human policy attestations do not gate Phase 5 testing. Schema application, evidence lineage, acceptance testing, and pilot measurement remain unchanged in both governance modes; see [governance modes](../governance-modes.md).

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

## Completion increment

Status: implemented in code.

The completion increment adds:

1. Explicit inspection-finding dispositions: verified fact, pre-close negotiation, post-close action, or dismissed.
2. Idempotent creation of property-plan tasks from actionable findings with durable finding, task, inspection-review journey, canonical repair journey, and Home Action lineage.
3. Every actionable safety or major finding keeps its inspection-review lineage and branches into the canonical `asset_lifecycle_resolution` major repair/replacement journey. The property-plan task references that repair journey, which enters the canonical Home Action feed through the existing guidance promotion adapter.
4. A combined inspection and transaction-document review surface, including property document verification.
5. Editable target-close and ownership-start anchors with automatic due-date recalculation.
6. Household task assignment and proof-bearing task completion.
7. An idempotent day-91 or established-owner handoff that converts unresolved post-close work into normal property maintenance tasks.
8. Handoff checks at the standard Home Action feed boundary, eliminating dependency on a buyer-only dashboard or scheduled migration job.
9. Property acceptance-status reporting and admin pilot metrics at `/api/admin/analytics/phase5-pilot`.
10. Phase 5 contract, integration, and acceptance tests covering lineage, promotion, handoff, UI/API coverage, and the no-migration-script constraint.

## Acceptance criteria status

- Inspection findings become verified facts, actions, decisions, or dismissed items with lineage: complete.
- The 90-day plan has priorities, owners, timing, completion state, and completion evidence: complete.
- Material findings branch into the canonical major repair/replacement journey and Home Actions while retaining inspection-review lineage: complete.
- On day 91, unresolved work transitions idempotently into the standard recurring Home loop: complete.

Phase 5 implementation is code-complete. Deployment verification and pilot metric evaluation remain operational release activities, not missing application implementation.

## Operator action

Apply the updated Prisma schema to the target database and regenerate the Prisma client as part of deployment. Do not run a migration script from this repository; none is created for this phase. After deployment, validate the Phase 5 pilot report and at least one real day-91 or established-owner handoff against the target database.
