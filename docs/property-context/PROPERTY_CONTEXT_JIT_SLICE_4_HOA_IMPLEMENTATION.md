# Property Context JIT — Slice 4 HOA approval adoption

Date: 2026-07-17

## Release boundary

This tranche adopts HOA approval creation from the third Slice 4 feature group. It captures only responsibility facts relevant to the selected HOA work type. It does not create or update the HOA association through shared capture, replace approval status transitions, manage governing documents, or alter the violation-to-incident workflow.

## Operation contract

`HOA_COMPLIANCE / CREATE_APPROVAL_RECORD` receives the selected `workType` as explicit operation input. The backend registry maps exterior, roof, shared-system, deck/patio, landscaping, driveway, and pool work to their canonical responsibility facts. Room additions can require both shared-system and building-exterior responsibility. `OTHER` remains unscoped and does not invent a dependency.

## Lifecycle precedence

The existing HOA association decision remains first. Callers without a canonical association still receive the established HOA applicability response instead of an unrelated responsibility prompt. Once association applicability is established, shared readiness runs before the existing owner-execution policy and canonical approval creation.

Selecting `ASSOCIATION` or `LANDLORD` is a valid canonical fact capture, but the existing owner-execution policy can still reject homeowner execution with `WORK_RESPONSIBILITY_CONFLICT`. Shared capture determines whether the fact is known; the domain policy retains authority over what that answer means.

## In-place continuation

The approval editor remains mounted while the shared panel is active. A locally valid Add action opens the operation-specific panel inside the editor. After capture reaches readiness, the preserved work type and description submit automatically without a page reload. Changing the work type resets readiness so the next Add action evaluates the new operation identity.

## Persistence

`hoaComplianceService.createApprovalRecord` remains the only approval writer and continues to connect the record to the property's active `HoaAssociation`. No Prisma schema change or migration is required.

## Deferred flows

Association select/create, approval documents, HOA violation reporting, inspection evidence, and project-to-approval association remain separate lifecycle-preserving tranches.
