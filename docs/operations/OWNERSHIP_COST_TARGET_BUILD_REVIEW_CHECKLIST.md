# Ownership Cost Intelligence Target-Build Review

This checklist records the human and target-environment evidence required by
`ownership-cost-launch-gate-v1`. Repository tests provide evidence; they never
self-approve a human review.

## Automated target-build evidence

Run from `apps/frontend` against the exact release commit:

```sh
npm run test:ownership-cost:e2e
```

The suite must pass:

- axe-core analysis for Current cost, What changed, What may change, and Plan
  for variability;
- keyboard focus checks for every view;
- Pixel 7 and iPhone 13 viewport checks for every view;
- absence of document-level horizontal overflow; and
- production frontend compilation with the acceptance fixture gated off by
  default.

Record:

- commit SHA:
- build/deployment ID:
- `ownership-cost-accessibility-v1` report location:
- `ownership-cost-responsive-v1` report location:
- reviewer:
- reviewed at:
- keyboard-only result:
- screen-reader/browser combinations:
- mobile/desktop screenshots or trace location:

Only after the reports and manual review pass may operations set:

```text
OWNERSHIP_COST_ACCESSIBILITY_EVIDENCE_VERSION=ownership-cost-accessibility-v1
OWNERSHIP_COST_RESPONSIVE_EVIDENCE_VERSION=ownership-cost-responsive-v1
OWNERSHIP_COST_ACCESSIBILITY_APPROVED=true
OWNERSHIP_COST_RESPONSIVE_APPROVED=true
```

## Content, safety, and commercial integrity

Use the version-bound capability governance workflow in Admin → Release Gates.
PRODUCT, DOMAIN, TRUST, and the Ownership Cost-specific
COMMERCIAL_INTEGRITY role must approve the active capability policy. The
commercial-integrity role remains required even while the capability performs
no commercial action, because that absence is itself part of the reviewed
launch claim.

Review the target release for:

- missing never presented as zero;
- observed, confirmed, estimated, and forecast values visibly distinct;
- no promise of savings, appreciation, insurance, tax, or future-cost outcome;
- planning ranges described as ranges, not predictions;
- anomaly language described as a review trigger;
- engagement and saved intent separated from resolved and verified outcomes;
  and
- commercial relationships and alternatives disclosed where applicable.

Record the named reviews in governance storage. Environment booleans do not
replace those records.

## Operations and target environment

1. Run `npm run drill:ownership-costs` in the target environment.
2. Save the output with the deployment ID and commit SHA.
3. Open Admin → Ownership Cost Operations.
4. Review every critical anomaly and record its disposition.
5. Confirm Prometheus has loaded
   `production-ownership-cost-alert-rules`.
6. Confirm Grafana has loaded dashboard UID `ctc-ownership-costs`.
7. Record the immutable review ID in
   `OWNERSHIP_COST_OPERATIONS_REVIEW_EVIDENCE_ID`.
8. Confirm `OWNERSHIP_COST_UNCONTAINED_HIGH_RISK_GAP_IDS` is empty only after
   every high-risk gap is contained or closed.

The launch gate must remain `BLOCKED` until all evidence and governance records
are present. Do not turn a failed check into an approval by changing an
environment variable.
