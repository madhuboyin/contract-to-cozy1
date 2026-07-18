# Property Context JIT — Slice 5 hardening, tranche 2

Date: 2026-07-18

## Scope

This tranche adds registered-operation adoption governance and hardens the shared capture client for latency, changing property/operation identity, post-save refresh failures, keyboard semantics, and narrow touch layouts.

## Registered-operation audit

Every backend-owned feature requirement now declares:

- its product owner;
- whether an invoking inline panel exists or the contract is explicitly reserved with no invoker; and
- whether execution is protected by the shared gate, remains nonblocking under an established domain policy, is capture-only setup, or is not currently invoked.

Registry validation rejects reserved/execution mismatches, missing owners, and required contracts incorrectly classified as nonblocking domain-policy checks. The repository audit verifies that every adopted contract appears in a shared frontend panel, every required shared gate appears outside the registry in backend execution code, and reserved operations are not silently invoked.

The existing `ENERGY / GENERATE_HVAC_RECOMMENDATIONS` and `PROTECTION / ASSESS_ROOF_RISK` contracts are explicitly reserved because current Energy Auditor and risk-report products use different evidence-owned operations. They cannot be mistaken for completed adoption or silently activated without changing their disposition.

## Client resilience

- Evaluation requests carry a monotonic request identity. A late response from an earlier property, operation, or operation input cannot replace the current evaluation.
- Capture responses are ignored after the active identity changes.
- Slow evaluations announce a nonblocking message after 750 ms while preserving feature inputs.
- `onReady` failures become a recoverable resume error instead of an unhandled rejection.
- Canonical capture success is separated from feature refresh failure. The homeowner is told the detail was saved and can retry evaluation without entering it again.
- Identity changes reset transient saving, suppression, and ready-callback state.

## Accessibility and mobile behavior

The active panel is labelled by its visible heading, exposes save progress through `aria-busy`, and uses polite status announcements for initial and slow loading. All shared buttons and inputs have a minimum 44 px height while retaining wrapping layouts. Existing semantic forms, fieldsets, legends, pressed states, and tabs remain intact.

## Exit-gate status

This tranche closes the static registered-operation bypass audit and source-level latency/failure/accessibility gates. Browser acceptance with authenticated scalar, structured, and relational fixtures remains before Slice 5 can be declared complete.

No Prisma schema change or migration is required.
