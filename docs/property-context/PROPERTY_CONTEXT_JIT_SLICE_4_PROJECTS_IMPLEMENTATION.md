# Property Context JIT — Slice 4 project creation adoption

Date: 2026-07-17

## Release boundary

This tranche adopts project creation from the third Slice 4 feature group. It collects only responsibility facts required by the selected project type. It does not create permits, HOA approvals, or inspection findings, because those records have independent lifecycle, jurisdiction, confirmation, and evidence requirements.

## Operation-input contract

`PROJECTS / CREATE_PROJECT` uses `operationInput.projectType` to activate the minimum responsibility path:

- roof responsibility for roof replacement and solar installation;
- HVAC responsibility for HVAC repair/replacement;
- plumbing responsibility for plumbing, water-heater, sewer, kitchen, and bathroom work;
- shared-system responsibility for interior, structural, electrical, and general work;
- building-exterior responsibility for windows, exterior painting, and additions;
- deck/patio responsibility for deck or patio projects; and
- landscaping responsibility for major landscaping.

Projects that require two responsibility domains advance one registered question at a time. Unsupported/custom scope remains governed by the established project compliance policy instead of being guessed by the shared registry.

Operation input now travels through both evaluation and capture. It participates in the opaque requirement ID and the frontend readiness identity, preventing an answer for one project type from being applied to a requirement that became active after the user changed project type.

## Form continuation

The shared panel appears only after the homeowner submits a locally valid project form. If context is already ready, the evaluation completes and the form resumes automatically. If a responsibility answer is needed, capture occurs inline and the form automatically resubmits after the final required answer.

The component retains project name, type, contractor identity/contact fields, contract amount, and schedule throughout the flow. Changing project type cancels the prior readiness/resume state and evaluates the new dependency path. No full-page reload or primary Property Details redirect is used.

## Backend enforcement

Project creation now evaluates the shared `PROJECTS / CREATE_PROJECT` operation immediately before the pre-existing `assertProjectComplianceApplicable` policy and canonical project command. The shared policy governs missing context; the established policy remains authoritative for owner/association/landlord applicability, unresolved custom work scope, and other project-domain decisions.

This layered order preserves current duplicate-project checks, project lifecycle defaults, compliance decisions, analytics, and canonical persistence.

## Deferred lifecycle flows

- Permit mini-flow: must preserve active-status milestone generation and jurisdiction-specific verification.
- HOA mini-flow: association presence must be distinguished from an approval record for a specific work type.
- Inspection mini-flow: reports remain upload/extraction/confirmation owned; findings must retain report provenance and write-back behavior.
- Seller preparation: should select existing confirmed findings/projects rather than synthesizing generic records.

No Prisma schema change or migration is required.
