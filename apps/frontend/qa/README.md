# Frontend QA + Governance Gates

These checks are required for route-level quality before merge.

## Commands

- `npm run qa:priority-routes`
  - Enforces priority-route checks: hierarchy, trust, mobile flow, and consistency.
  - Config file: `qa/priority-route-gates.json`

- `npm run qa:shared-primitives`
  - Blocks raw UI primitive usage in shared/template-governed files.
  - Existing legacy exceptions must be explicitly listed in:
    `qa/baselines/shared-primitives-allowlist.json`

- `npm run qa:visual-drift`
  - Blocks visual drift in governed template/system files using baseline signatures.
  - Governing file list: `qa/baselines/visual-governance-files.json`

- `npm run test:visual-contract`
  - Snapshot regression test for priority route visual contracts.

- `npm run qa:gates`
  - Runs all of the above in sequence.

## Updating baselines intentionally

- Visual drift baseline:
  - `npm run qa:visual-drift:update`

- Visual contract snapshots:
  - `npm run test:visual-contract:update`

Only update baselines when visual changes are intentional and reviewed.

