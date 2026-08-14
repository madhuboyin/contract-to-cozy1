# Refinance Skill

## Purpose

Help homeowners evaluate a recorded mortgage refinance opportunity and create or manage a governed rate-threshold monitor.

## Select this Skill when

- the homeowner asks whether refinancing the selected home may be worthwhile;
- the homeowner asks what mortgage rate would support a refinance decision; or
- the homeowner explicitly asks to monitor rates against a threshold.

## Do not select this Skill when

- the request concerns general ownership costs without a refinance decision;
- the homeowner asks for loan approval, eligibility certification, or a guaranteed rate;
- the selected property has no relevant financing context and the operation cannot safely disclose its limitation; or
- the request concerns selling, holding, or renting instead of refinancing.

## Operations

- `REFINANCE_ANALYSIS`
- `REFINANCE_RATE_MONITOR`

## Canonical ownership and boundaries

Analysis remains owned by the existing Refinance Radar and financing services. Rate monitoring remains owned by the canonical refinance monitor and notification-preference services. Market-rate data is contextual evidence, not a lender offer.

Analysis requires Viewer access. Creating or changing a monitor requires Contributor or Owner access plus the existing explicit confirmation, consent, freshness, and idempotency controls. Results are educational planning guidance and do not promise approval, savings, closing costs, or an available lender rate.

This document provides semantic guidance only. The machine manifest, operation registry, adapters, and canonical services control execution.
