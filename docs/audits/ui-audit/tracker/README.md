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
- Updates are manual and can be reviewed in normal product/design/engineering planning.

## Commands

No required command automation is tied to this tracker.
