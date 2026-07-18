# Property Context JIT — Slice 4 permit creation adoption

Date: 2026-07-17

## Release boundary

This tranche adopts manual permit creation from the third Slice 4 feature group. It captures only responsibility facts that are relevant to the permit work types selected by the homeowner. It does not create permits through the shared capture registry or replace permit status, inspection milestone, open-data synchronization, disclosure, or evidence behavior.

## Operation-input contract

`PERMITS / CREATE_MANUAL_PERMIT` receives the selected `workTypes` as explicit operation input. The backend registry maps those values to the minimum responsibility facts needed for roof, HVAC, plumbing, shared systems, building exterior, deck/patio, common safety, and landscaping work.

Multi-select work types use the backend-owned `CONTAINS_ANY` declarative condition. A responsibility prompt appears when at least one selected work type intersects its registered values. `OTHER` remains unscoped and does not invent a responsibility dependency.

## Form continuation

The existing Add Permit form remains mounted while capture is active. The shared panel appears only after a locally valid submit, uses the explicit query-string `propertyId`, and receives the current work-type selection. After all required facts are captured, the page automatically submits the preserved form without a reload. Changing the work types resets readiness and evaluates the new operation identity on the next submit.

## Backend enforcement

The create controller evaluates shared readiness immediately before the existing project-compliance permit policy and the canonical `permitTrackerService.createManualPermit` command. A caller that bypasses the frontend receives `409 PROPERTY_CONTEXT_INCOMPLETE` with the evaluation envelope.

The existing permit service remains the only writer. Active permit statuses continue to generate their established inspection milestones. No Prisma schema change or migration is required.

## Deferred lifecycle flows

Permit selection for downstream actions, inspection finding write-back, HOA approvals, and inspection evidence remain separate lifecycle-preserving adoption tranches. The shared contract does not infer jurisdiction, create projects, or guess permit associations.
