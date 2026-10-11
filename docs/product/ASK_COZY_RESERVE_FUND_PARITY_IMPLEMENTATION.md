# Ask Cozy Reserve Fund parity

Ask Cozy's `CAPITAL_RESERVE_PLAN` now includes the canonical Reserve Fund state and workflows previously available only in the traditional Reserve Fund Planner.

The read result includes current balance, total active target, funded percentage, monthly recommendation, near-term shortfall, current planning posture, the calculation method, active and retired allocations, recent contribution history, and pending expense-reconciliation suggestions. The existing capital-window timeline and 5/10-year horizon control remain available.

Mutations use the internal `RESERVE_FUND_COMMAND` operation and require confirmation. Supported actions are:

- log a deposit, withdrawal, or balance correction;
- remove an erroneous contribution and reverse its balance effect;
- change Conservative, Moderate, or Aggressive posture and recalculate;
- manually recalculate from current Capital Timeline and Property Context data;
- accept a matched expense and retire its reserve line item.

The contribution form explicitly states that the ledger is self-reported and does not connect to a bank or transfer money. Reads remain available to household viewers. Both Ask and traditional Reserve Fund mutation routes require at least the `CONTRIBUTOR` household role.

All computations and writes continue through `HomeReserveFundService`, `HomeReserveFundCalculationService`, and `HomeReserveFundReconciliationService`; Ask does not implement parallel reserve math.
