# Buyer and seller read operations vs the owner audience policy (audit, 2026-11-12)

**Policy (owner, 2026-11-12):** ordinary journey status, stage, milestone and date information is shared household information (VIEWER reads, CONTRIBUTOR changes). Actual financial amounts, rates, loan offers, financing terms, contract terms, title/ownership details and sensitive identifiers are OWNER. High-level readiness ("loan estimate received") may stay VIEWER if it reveals no amount, rate, account identifier or contract term. Audit individually; no bulk promote or demote.

**Method and honesty.** The 16 VIEWER-floor read operations came from `ASK_OPERATION_DEFINITIONS.propertyRoleFloor` (executed). The handler text was **read, not executed**; I read the handlers listed under "Read" below by opening the code and grepping for money, rate, term and free-form fields. The "Not read in detail" operations were not opened beyond their registration, so they carry **no classification** here. **No floor was changed.**

## Read: individual findings
| Operation | What it returns (from the handler) | Against the policy | Recommended action (owner to confirm) |
|---|---|---|---|
| BUYER_LOAN_ESTIMATES | Lender name, note rate, APR, monthly payment, cash to close, issue date, lowest-APR comparison (`buyerLoanEstimates.handler.ts`) | **Violates**: rates, loan offers, payment and cash-to-close amounts | Raise to OWNER |
| BUYER_INSURANCE_READINESS | Carrier, annual premium, deductible, quote validity, requirements (`buyerInsurance.handler.ts`) | **Violates** for premium and deductible amounts; requirement titles/dates are ordinary | Either OWNER, or keep VIEWER and drop the two amounts for non-owners |
| BUYER_COST_READINESS | Sum of recorded near-term estimated costs and each task's `money(estimatedCostCents)` (`buyerPlan.handler.ts` ~1200) | **Violates**: amounts | OWNER, or hide the amounts for non-owners |
| BUYER_FINANCING_READINESS | Appraisal/underwriting status, clear-to-close flag, lender-condition titles, due dates, **condition `notes` as description** | Statuses are readiness-level (fine). Condition titles and free-form notes can carry loan terms | Keep VIEWER, remove `notes` for non-owners (or owner decision on titles) |
| BUYER_TITLE_ESCROW_READINESS | Open title/escrow issue titles and status | Issue titles can hold title/ownership details (liens, vesting) | Owner decision: VIEWER with counts and status only, or OWNER for titles |
| BUYER_CONTRACT_TIMELINE | Contingency labels, due dates, target closing date, accepted date | Dates are ordinary; contingency labels are contract terms in effect | Owner decision: dates VIEWER, labels OWNER or keep VIEWER |
| BUYER_DISCLOSURE_FUNDS_READINESS | Booleans only (funds ready, wire instructions verified, questions resolved) and a wire-fraud notice | Readiness-level, no amount or identifier | Keep VIEWER |
| BUYER_CLOSING_DAY_READINESS | Counts of five closing-day checks; blocker task titles | Ordinary status | Keep VIEWER |

## Not read in detail (no classification)
SELLER_PREP_CHECKLIST, BUYER_PLAN_STATUS, BUYER_DEADLINES, BUYER_MOVE_STATUS (it calls the lender-readiness service, so it needs a read), BUYER_DOCUMENT_READINESS, BUYER_INSPECTION_REVIEW, BUYER_WALKTHROUGH_READINESS, BUYER_NEGOTIATION_READINESS. These need the same read before any classification; `BUYER_PLAN_STATUS` and `BUYER_DEADLINES` are expected to be ordinary status and dates, which is the consistency case that motivated this audit, but that is **expected, not verified**.

## Consequences
Three operations return amounts or rates to viewers today (loan estimates, insurance quotes, cost readiness). That is the opposite of the generic data-point policy, which refuses money to viewers. The generic reads (v4) now follow the policy; the direct operations do not until the owner decides the actions above. Changing an operation's floor can also change its audience policy, suggestion and replay behavior, so each change needs its own tests.
