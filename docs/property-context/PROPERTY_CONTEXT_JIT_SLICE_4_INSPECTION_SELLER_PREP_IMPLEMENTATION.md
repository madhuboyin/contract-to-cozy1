# Property Context JIT — Slice 4 inspection audit and Seller Prep adoption

Date: 2026-07-17

## Inspection adoption gate

The inspection surfaces were audited before adding a shared requirement contract. No missing-context prompt is warranted for the current operations:

- report upload already carries explicit `propertyId`, report type, inspection date, PDF evidence, and optional inspector identity;
- report and finding actions already carry property-scoped report and finding IDs;
- confirmation is intentionally controlled by write-back preview, evidence provenance, and the confirmed-report lifecycle; and
- permit inspection readiness already carries explicit permit and milestone identity plus required photos.

The shared registry does not add a generic inspection questionnaire or a thin finding writer. Relational selection is deferred until an invoking feature genuinely lacks a report or finding identity and can use the lifecycle-preserving adapter described in Slice 3.

## Seller Prep contract

`SELLER_PREP / OPEN_PLAN` requires the two canonical facts used by the existing primary planning decision:

- `core.propertyUse` is `REQUIRED_APPLICABILITY`;
- `location.state` is `REQUIRED_CALCULATION`.

State is not routinely re-requested. It appears only when onboarding left the selected property without the state required for state-aware planning. Both facts use the backend-owned scalar registry and canonical `Property` writer.

## Entry and continuation

Seller Prep now evaluates the shared contract before fetching or creating its plan. The shared panel replaces the legacy `PropertyContextNotice` on this feature. Once ready, the existing overview, comparables, readiness report, and intake preferences load in place without a page reload.

The backend applies the same readiness gate to overview access, readiness-report generation, and the preferences path that can create a plan. Bypassing the frontend returns `409 PROPERTY_CONTEXT_INCOMPLETE` with the evaluation envelope.

## Persistence boundary

The existing `SellerPrepPlan` and preference writers remain canonical. The shared capture path writes only the missing Property facts. Checklist generation, personalization, status updates, comparables, and report semantics are unchanged.

No Prisma schema change or migration is required.
