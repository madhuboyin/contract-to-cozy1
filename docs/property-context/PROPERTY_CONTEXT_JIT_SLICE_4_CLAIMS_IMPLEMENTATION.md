# Property Context JIT — Slice 4 claims and warranties adoption

Date: 2026-07-17

## Release boundary

This tranche adopts the claim-coverage decision point from the second Slice 4 value/risk group. It does not replace the claim lifecycle, active-date policy, duplicate-open-claim guard, or coverage mismatch checks.

## Contracts

- `CLAIMS / FILE_INSURANCE_CLAIM` requires at least one currently active `InsurancePolicy` and dispatches `INSURANCE_POLICY_SELECT_OR_CREATE`.
- `CLAIMS / FILE_WARRANTY_CLAIM` requires at least one currently active `Warranty` and dispatches `WARRANTY_SELECT_OR_CREATE`.
- Collection requirements use `ACTIVE_DATE_RANGE`, so expired or future records do not satisfy current claim readiness.
- Relational options exclude expired and future policies/warranties.

The new warranty schema collects only provider, category, optional contract number, start date, and expiry date. The full warranty editor remains the secondary workflow for item links, terms, cost, and documents.

## Inline claim flow

When a homeowner selects an insurance or warranty claim path and no active record exists, the shared panel opens inside the existing claim modal. A successful relational capture:

1. writes the canonical policy or warranty for the explicit property;
2. records the shared capture receipt and evidence;
3. returns the selected entity ID;
4. refreshes the modal's active coverage lists;
5. selects the created record; and
6. preserves the entered claim title, type, provider, claim number, and description.

The modal remains on the invoking screen and uses an internal scroll boundary for mobile-height safety. It does not redirect to Insurance, Warranties, or Property Details.

## Canonical and execution safeguards

- Warranty selection verifies `id + propertyId`.
- Creation connects the warranty to the property's homeowner profile and property.
- Duplicate detection uses normalized provider/category identity, preferring policy number when available and the exact date range otherwise.
- Expiry must be later than start date.
- Claim creation evaluates the shared claim operation immediately before the existing canonical coverage validation.
- Missing shared context returns `422 CLAIM_CONTEXT_REQUIRED`; selected-record mismatch, inactivity on the incident date, and duplicate open claims remain governed by the existing claim service.

No Prisma schema change or migration is required.

## Next adoption tranche

Continue through incident-to-claim handoff and policy/warranty management surfaces, then add operation contracts for risk actions whose output changes based on current protection. Coverage records created inline should also be connected to the existing coverage-analysis reconciliation service during the hardening tranche.
