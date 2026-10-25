# Ask Cozy Reserve Fund parity

This is the Reserve Fund detail appendix to the all-tools register in [`ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md`](ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md).

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

**Decision-oriented overview (October 24, 2026).** The Reserve Fund answer now leads with a plain verdict instead of a sentence containing every metric. A purpose-built use of the governed `PROGRESS` block shows funded percentage, recorded balance against target, monthly plan, near-term gap, planning style, and the next three capital needs. When a contributor has no recorded balance, the single primary action is **Add current balance**; otherwise it is **Log a balance change**. The capital windows follow the overview, while recalculation and planning-style controls follow the near-term needs instead of preceding them. The full allocation, ledger, reconciliation, evidence, and boundary detail remains available below for this first modernization slice; collapsing that secondary material is a later presentation slice.

**Compact presentation follow-up (October 24, 2026).** The answer now stays at the same standard reading measure as Home Actions even though it contains a capital timeline. The three near-term capital needs render as responsive cards under **Upcoming needs** instead of full-width action rows. **Adjust the plan** has a reserve-specific control surface: balance and recalculation are two compact action cards, while Conservative, Moderate, and Aggressive are a responsive three-option planning-style row with the current choice called out directly. Allocations, contribution history, reconciliation suggestions, evidence, and the planning boundary remain fully available under one collapsed **Plan details** disclosure. No calculation, canonical data, role requirement, confirmation boundary, or command action changed.
