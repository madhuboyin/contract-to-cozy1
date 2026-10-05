# Ask Cozy exact-four: opportunity and starter inventory (step 8b draft, for owner review)

**Status:** DRAFT for owner review. No producer, registry entry or code has been written for it. Governing scope: `ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md` Appendix C.15 and C.16, and `ASK_COZY_EXACT_FOUR_REGISTRY_PACKET.md`.

**Evidence labels.** *Executed*: produced by running the code (the operation, role, audience and safety facts below were dumped from `askOperationRegistry.ts` and `getAskAudiencePolicy`). *Code-read*: traced by reading source. *Unverified*: a proposal whose data source I have not confirmed. Nothing here ran against the real backend.

## 1. Findings that change the design (read first)

1. **A viewer's row is carried by starters, not opportunities (code-read, arithmetic).** Viewers cannot use profile captures (`PROPERTY_CONTEXT_AREA_CAPTURE` is a CONTRIBUTOR operation) or the exact-record mutation chips, and the policy allows at most **one** opportunity or capability unrelated to the current answer. So a viewer's four is: urgent work and continuation (when they exist) + at most one opportunity + **starters for everything else**. Worst case is three or four starters. Starters are also removed when their destination is already on screen (presentation deduplication) and when they are the current answer's own outcome, so the eligible pool must exceed four. I propose **at least eight defined starters, with at least six expected to be eligible on a sparse home** (section 4). A sparse new home may have only about four starters that always return non-empty content, which is too thin; the viewer fixture must test exactly that case.
2. **Read-only outcomes must be declared repeatable, or they exhaust themselves (executed).** Eligibility suppresses an outcome already completed in the session unless the operation registry declares it repeatable (`completedSemanticKeyHashes ... && !isRepeatableOutcome`), and the lifecycle now also suppresses completed non-repeatable outcomes durably in every slot class. A read starter the user opens once would never be offered again. Proposal: every read-only starter and read-only opportunity outcome goes in `REPEATABLE_OUTCOMES`; repetition is then governed by the offer cooldown and the soft starter rotation. Mutation and capture outcomes stay non-repeatable.
3. **Ask's existing operating mode is derived from the onboarding `ownershipState` (code-read), the signal you ruled out for audiences.** `operatingModeForOwnershipState` maps `SHOPPING` and `UNDER_CONTRACT` to BUYING, `RECENT_OWNER` and `ESTABLISHED_OWNER` to OWNING, and `PREPARING_TRANSFER` to SELLING; the audience policy then gates operations by mode. Executed policy facts: 68 operations allow every mode including `UNKNOWN`; `SELL_HOLD_RENT_ANALYSIS`, `CAPITAL_RESERVE_PLAN` and `SELLER_PREP_CHECKLIST` allow OWNING and SELLING and **explain** (not eligible) when the mode is `UNKNOWN`; `REFINANCE_ANALYSIS` allows OWNING only; the `BUYER_*` operations allow BUYING only. Executed with a VIEWER household and a homeowner account (`evaluateAskAudienceApplicability`, purpose EXECUTION):

   | Operation | UNKNOWN | OWNING | SELLING | BUYING |
   |---|---|---|---|---|
   | `CAPITAL_RESERVE_PLAN` | CONTEXT_REQUIRED | APPLICABLE | APPLICABLE | INAPPLICABLE_EXPLAIN |
   | `REFINANCE_ANALYSIS` | CONTEXT_REQUIRED | APPLICABLE | INAPPLICABLE_EXPLAIN | INAPPLICABLE_EXPLAIN |
   | `SELLER_PREP_CHECKLIST` | CONTEXT_REQUIRED | APPLICABLE | APPLICABLE | INAPPLICABLE_EXPLAIN |
   | `BUYER_DEADLINES` | CONTEXT_REQUIRED | INAPPLICABLE_EXPLAIN | INAPPLICABLE_EXPLAIN | APPLICABLE |
   | `PROPERTY_SUMMARY` | APPLICABLE_GENERAL | APPLICABLE | APPLICABLE | APPLICABLE |

   So an onboarding `ownershipState` of `UNKNOWN` (or never answered) makes every mode-limited opportunity ineligible, and only the all-mode operations survive. Consequences: (a) universal starters are safe; (b) any mode-limited opportunity inherits a stale, undated self-report, and a home with an active sale case but `ESTABLISHED_OWNER` would get the wrong gating; (c) it disagrees with the workflow-based profile audiences (D12). This is a broader decision than the exact-four scope (D-O3).
4. **Most "why now" signals already exist as Property Context facts (code-read), so one batched snapshot read can feed the whole opportunity producer.** The catalog has `recalls.unresolvedMatches`, `inspection.openFindings`, `events.activeRadarMatches`, `financial.upcomingCapitalExposure`, `coverage.warranties`, `coverage.insurancePolicies`, `maintenance.tasks`, `guidance.activeSignals` and `risk.activeIncidents`. Two signals are not catalog facts and are **unverified**: hidden-savings matches (for the savings opportunity) and refinance opportunities (which today surface through the Home Actions loader). The producer is nonessential and is dropped first when the 250 ms pipeline budget is exceeded; for a viewer that would remove opportunities but not starters, so starters must not depend on the same snapshot (D-O5).
5. **Speculative intent cannot create an opportunity, but an open decision can be continued (code-read).** Selling/holding/renting is recorded only as a decision thread whose own copy says nothing was listed or sold. Offering "Compare selling, renting, and staying" because the user might sell is excluded. Offering "Pick up your sell, hold or rent comparison" when the user already has an **open** decision thread is a continuation of work they started, so it is `CONTINUE_WORK`, not an opportunity.
6. **Mortgage chips stay out of the first activation (from step 8a).** There is no operation that can launch mortgage status, and the rate has no typed launch. The only mortgage-related item proposed here is the read-only refinance analysis, gated on a known status and rate and on mode OWNING.
7. **`RECALL_REVIEW` has no audience policy entry (executed).** Every other candidate has one. Before it can be an urgent-work launch it needs a policy (all modes, viewer) or an explicit exemption; I could not tell from the code whether absence means "allowed" or "blocked", and I have not run it.

## 2. Slot sources that are not opportunities

| Slot class | Proposed source | Launch (read, VIEWER) | Why-now signal | Status |
|---|---|---|---|---|
| `URGENT_WORK` | Canonical Home Actions with priority `NOW` (`HOME_ACTION_PRIORITIES` = NOW, SOON, PLAN, CONSIDER) | `HOME_ACTIONS` | A `NOW` action exists | Code-read; adapter not built |
| `URGENT_WORK` | Unresolved recall matches | `RECALL_REVIEW` | `recalls.unresolvedMatches` non-empty | Needs finding 7 resolved |
| `URGENT_WORK` | Active high-severity radar matches | `HOME_EVENT_RADAR_FEED` | `events.activeRadarMatches` with severity `high` or above | Severity threshold unverified |
| `CONTINUE_WORK` | Open decision thread (sell/hold/rent, HVAC) and open guidance journey | `HVAC_DECISION_CONTINUE`, `GUIDANCE_JOURNEYS_LIST`, sell/hold/rent analysis | The thread or journey is open (not abandoned, completed or archived) | Existing continuation mechanisms; needs registering as a granted producer |

`URGENT_WORK` and `CONTINUE_WORK` need their own producer ids with explicit grants; the shared result producer may claim neither urgent work nor starters.

## 3. Proposed first-activation opportunities (`HOME_OPPORTUNITY`)

Labels lead with the outcome and avoid product names. Every launch is a read-only operation started from the stored action's `operationId` (the verified-selection path already writes it into the launch context). "Why now" tokens would be added to `REGISTERED_WHY_NOW_REASONS`; confidence only qualifies them.

| # | Label (outcome-led) | Operation | Outcome key | Who may get it | Why-now token and source | Evidence |
|---|---|---|---|---|---|---|
| O1 | See the big projects coming up | `CAPITAL_RESERVE_PLAN` | `REVIEW_CAPITAL_OUTLOOK` | VIEWER+; OWNING or SELLING | `WHY_NOW_CAPITAL_ITEMS_UPCOMING`: a ready capital timeline item with its window in the next 24 months (`financial.upcomingCapitalExposure`) | Executed ops facts; signal code-read |
| O2 | Check what's expiring soon | `WARRANTY_LOOKUP` | `REVIEW_EXPIRING_WARRANTIES` | VIEWER+; all modes | `WHY_NOW_WARRANTY_EXPIRING`: a warranty expiring within 60 days (`coverage.warranties`) | Executed ops facts; signal code-read; 60 days is my proposal |
| O3 | Review the open inspection items | `INSPECTION_FINDINGS` | `REVIEW_OPEN_FINDINGS` | VIEWER+; all modes | `WHY_NOW_OPEN_FINDINGS`: at least one unresolved finding (`inspection.openFindings`) | Executed ops facts; signal code-read |
| O4 | Look for savings you may be missing | `SAVINGS_OPPORTUNITIES` | `REVIEW_SAVINGS_MATCHES` | VIEWER+; all modes | `WHY_NOW_SAVINGS_MATCHES`: unreviewed hidden-savings matches exist | **Unverified source**: matches are not a catalog fact |
| O5 | Check whether refinancing could help | `REFINANCE_ANALYSIS` | `REVIEW_REFINANCE_OUTLOOK` | VIEWER+; **OWNING only** | `WHY_NOW_REFINANCE_OPPORTUNITY`: status `MORTGAGED`, a recorded rate, and an open refinance opportunity from the radar | **Unverified source**; reads `interestRateBps` from the financing profile, not `financial.currentMortgage` (recorded contract defect) |
| O6 | Get the home ready to list | `SELLER_PREP_CHECKLIST` | `REVIEW_SELLER_PREP` | VIEWER+; OWNING or SELLING | `WHY_NOW_SALE_CASE_ACTIVE`: a live sale case (`PREPARING`, `LISTED`, `UNDER_CONTRACT`), the same governed signal as the SELLER audience | Executed ops facts; signal is the step 7 adapter |
| O7 | Keep your closing on track | `BUYER_DEADLINES` | `REVIEW_BUYER_DEADLINES` | VIEWER+; **BUYING only** | `WHY_NOW_BUYER_JOURNEY_ACTIVE`: a pre-closing buyer journey with a milestone due within 14 days | Executed ops facts; 14 days is my proposal. **Conflicts with finding 3**: the operation is gated by `ownershipState`-derived BUYING while the audience is workflow-derived |

**Deliberately not proposed for the first activation**

| Candidate | Why not |
|---|---|
| Find plants that fit your rooms (`PLANT_CARE_OUTLOOK`) | No why-now signal exists. A room existing is readiness, not relevance, and the light-detail capture has no Ask launch (step 8a finding). It stays out until a signal is defined (D-O6). |
| Compare selling, renting, and staying (`SELL_HOLD_RENT_ANALYSIS`) | Speculative intent (finding 5). Only the continuation of an open thread qualifies, as `CONTINUE_WORK`. |
| Home Continuity Plan (`HOME_DIGITAL_WILL`) | Highly sensitive, explicit-trigger only, excluded by the earlier decision. It is registered as an all-mode CONTRIBUTOR read operation, so nothing in the registry stops it from being nominated; the producer allowlist must exclude it. |
| Property tax appeal, renovation permit readiness, HVAC decision start | Each needs an intent or a seasonal or deadline signal I could not find. |
| Any mutation, `OWNER`-floor or `MATERIAL_DECISION` read that has no signal | Not opportunities; they stay as results the user asks for. |
| Mortgage status, mortgage rate chips | No launch operation (step 8a). |

## 4. Curated starters (`CURATED_STARTER`)

Starters are viewer-safe, all-mode, `STANDARD` safety, read-only, and repeatable. Executed facts for each: role floor VIEWER; audience policy `BUYING+OWNING+SELLING+UNKNOWN` with `ALLOW_GENERAL`.

| # | Label | Operation | Always returns content on a sparse home? |
|---|---|---|---|
| S1 | See how complete your home record is | `PROPERTY_SUMMARY` | Expected (unverified); also the only starter executed as `APPLICABLE_GENERAL` in every mode |
| S2 | See your home at a glance | `HOME_STATUS_BOARD` | Likely (unverified) |
| S3 | See what maintenance is coming up | `MAINTENANCE_STATUS` | Likely (seasonal tasks generate) |
| S4 | Preview the next few months of upkeep | `MAINTENANCE_FORECAST` | Likely |
| S5 | See what changed in your home recently | `HOME_CHANGE_SUMMARY` | No (empty on a new home) |
| S6 | Review your home's history | `HOME_TIMELINE_EVENTS` | No |
| S7 | Browse what's recorded about your systems and appliances | `INVENTORY_LOOKUP` | No (needs items) |
| S8 | Find a document you've saved | `DOCUMENT_LOOKUP` | No (needs documents) |
| S9 | Review your daily home habits | `HOME_HABITS` | Unverified |
| S10 | Pick up a guided journey | `GUIDANCE_JOURNEYS_LIST` | No (needs a journey) |

Each starter carries a **readiness predicate** (for example S7 requires at least one inventory item) so an empty-state answer is never offered as a helpful next step. That leaves four dependable starters (S1 to S4) on a brand-new home, which is exactly the viewer worst case and no margin; the viewer fixture must prove the row reaches four there, and I would not activate if it only reaches four by luck (D-O4).

## 5. Outcome registry and launch entries needed (for approval)

- **Outcomes** registered per operation in `SUGGESTED_ACTION_OUTCOMES` (for example `PROPERTY_SUMMARY: ['OPEN_SUMMARY']`), bounded tokens, validated by the registry test.
- **Repeatable** set: every read outcome above in `REPEATABLE_OUTCOMES` (finding 2).
- **Producer grants:** `home-opportunities.signals` (HOME_OPPORTUNITY only, no ownership or goal claims), `home-opportunities.urgent` (URGENT_WORK only), `home-starters.curated` (CURATED_STARTER only), plus the existing result producer unchanged.
- **Ownership:** none of these claim current-result ownership; they are unrelated opportunities, so the one-opportunity cap, the seven-day cooldown and the reserved-slot rule apply.
- **Launch:** the verified selection already routes by the stored `operationId`; each read operation must be confirmed to accept a message-free launch (some parse sub-parameters from the message). I have not verified this per operation.

## 6. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| D-O1 | Approve, drop or add opportunities O1 to O7 | Approve O1, O2, O3 now (signals are catalog facts). Hold O4 and O5 until their sources are verified. Decide O6, O7 with D-O3 |
| D-O2 | Declare read-only outcomes repeatable | Approve |
| D-O3 | Reconcile operating mode with workflow state (buyer journey and sale case first, `ownershipState` as fallback) | Treat as a separate, broader change. For the first activation use only all-mode operations for starters, and accept existing mode gating for O1, O5, O6, O7 |
| D-O4 | Starter list, readiness predicates and the "at least eight defined, six eligible" bar | Approve the bar; add or replace starters until a sparse-home viewer fixture clears it with margin |
| D-O5 | Starters must not depend on the opportunity snapshot | Approve; starters use cheap per-operation readiness checks |
| D-O6 | Plants: define a why-now signal or defer | Defer |
| D-O7 | Mortgage chips | Defer, as decided in step 8a |
| D-O8 | Label copy and the 60 and 14 day windows | Review wording |
| D-O9 | `RECALL_REVIEW` audience policy gap | Resolve before it is used as urgent work |

## 7. What I would build next (after your review)

Registry entries and repeatable declarations, then the three producers behind a shared batched context read, each with its grant and tests; then the viewer sparse-home fixture as the activation gate. None of it is wired into the live finalizer until the atomic activation.
