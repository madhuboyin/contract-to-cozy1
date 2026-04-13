# CtC Route Audit Tracker (Track 1)

This folder is the operational tracker for P0/P1 route quality execution.

## Files

- `route-audit-tracker.v1.json`
  - Master route rows for P0/P1 execution.
- `p0-p1-route-inventory.v1.json`
  - Canonical list of required P0/P1 routes that must be present in tracker.
- `repeated-issue-taxonomy.v1.json`
  - Locked issue taxonomy for consistent tagging.

## Governance

- P0/P1 routes are fully populated in `route-audit-tracker.v1.json`.
- Taxonomy is locked in `repeated-issue-taxonomy.v1.json`.
- Route priority source of truth is `p0-p1-route-inventory.v1.json`.
- Track 3 extends tracker coverage to P2/P3 route families and publishes buyer-readiness trend scorecards.
- Updates can be generated with the Track 3 pass script and then reviewed in product/design/engineering planning.

## Commands

- `npm -C apps/frontend run audit:track3:pass`
  - Expands tracker rows to untracked routes, runs a weighted full-route rescore pass, and publishes buyer-readiness trend scorecards.
  - Outputs:
    - `docs/audits/ui-audit/tracker/route-audit-tracker.v1.json`
    - `docs/audits/ui-audit/scorecards/buyer-readiness-trend.v1.json`
    - `docs/audits/ui-audit/scorecards/buyer-readiness-trend.v1.md`
