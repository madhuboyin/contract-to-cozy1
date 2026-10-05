# Ask Cozy exact-four: opportunity and starter inventory (step 8b draft, revision 3, for owner review)

**Status:** REVISION 2 after owner review (three corrections below). No producer or opportunity registry entry has been written; the only code change is the explicit `RECALL_REVIEW` audience policy (finding 7). Governing scope: `ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md` Appendix C.15 and C.16, and `ASK_COZY_EXACT_FOUR_REGISTRY_PACKET.md`.

**Evidence labels.** *Executed*: produced by running the code (the operation, role, audience and safety facts below were dumped from `askOperationRegistry.ts` and `getAskAudiencePolicy`). *Code-read*: traced by reading source. *Unverified*: a proposal whose data source I have not confirmed. Nothing here ran against the real backend.

## 1. Findings that change the design (read first)

1. **A viewer's row is carried by starters, not opportunities (code-read, arithmetic).** Viewers cannot use profile captures (`PROPERTY_CONTEXT_AREA_CAPTURE` is a CONTRIBUTOR operation) or the exact-record mutation chips, and the policy allows at most **one** opportunity or capability unrelated to the current answer. So a viewer's four is: urgent work and continuation (when they exist) + at most one opportunity + **starters for everything else**. Worst case is three or four starters. Starters are also removed by history and availability rules (section 4a measures exactly which; **an earlier version of this paragraph wrongly said presentation deduplication and the current answer's own outcome remove starters; the measurement shows neither does today**), so the eligible pool must exceed four. I propose **at least eight defined starters, with at least six expected to be eligible on a sparse home** (section 4). A sparse new home may have only about four starters that always return non-empty content, which is too thin; the viewer fixture must test exactly that case.
2. **Read-only outcomes must be declared repeatable, or they exhaust themselves. Two mechanisms, with different status.**
   - *Session-level suppression is ACTIVE today (executed code path).* The production finalizer is passed `completedSemanticKeyHashes` by `executeOperation.ts` and `askConfirm.ts` (`loadCompletedSuggestedActionKeyHashes`), and the eligibility `HISTORY` rule drops an outcome already completed in the session unless `isRepeatableOutcome`. A read starter opened once in a session is not offered again in that session.
   - *Durable lifecycle suppression is IMPLEMENTED BUT NOT ACTIVE.* `askSuggestedActionLifecycle.service.ts` and the policy's `completedLifecycleKeys` exist and are tested, but nothing calls them from the finalizer; they activate only with the atomic wiring (step 10). Until then the lifecycle table (not yet pushed) has no effect.
   - *Proposal (narrowed after review).* Declare repeatable **only the specific read outcomes this inventory approves** (the reviewed O1 to O3 and starters, once approved), by explicit entry in `REPEATABLE_OUTCOMES`; not a blanket rule for every read operation, and a registry test must fail for any outcome that is repeatable without an approved entry. Repetition is then governed by the offer cooldown and the soft starter rotation (both inactive until wiring; the session rule above is the only active one).
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
7. **`RECALL_REVIEW` is allowed today; the gap was fragility, now closed (executed and code-read).** It has no audience policy entry, but execution only looks up a policy when the operation belongs to a skill (`audiencePolicy = skill ? getAskAudiencePolicy(...) : undefined`), `RECALL_REVIEW` belongs to none, and discovery treats a missing policy as discoverable (`if (!policy) return true`). Executed: 12 operations have no policy and all 12 are skill-less (`RECALL_REVIEW`, `RECALL_MATCH_UPDATE`, `CAPABILITY_DISCOVERY`, the three boundary operations, `GROUNDED_GUIDANCE`, the four `CAPTURE_*_CONFIRM` operations and `SELL_HOLD_RENT_GOAL_CAPTURE`). Relying on absence is fragile: adding `RECALL_REVIEW` to a skill would fail `validateAskAudiencePolicies` and execution would fail closed (`ASK_SKILL_POLICY_MISMATCH`). **Resolved:** `askAudiencePolicy.ts` now carries an explicit all-mode, viewer-floor, discoverable policy for `RECALL_REVIEW`, with a test pinning that it matches the previous behavior in every mode, equals the operation's role floor, and that the policy set still validates. `RECALL_MATCH_UPDATE` (a CONTRIBUTOR command) is not an exact-four launch and is left as is.

## 2. Slot sources that are not opportunities

| Slot class | Proposed source | Launch (read, VIEWER) | Why-now signal | Status |
|---|---|---|---|---|
| `URGENT_WORK` | Canonical Home Actions with priority `NOW` (`HOME_ACTION_PRIORITIES` = NOW, SOON, PLAN, CONSIDER) | `HOME_ACTIONS` | A `NOW` action exists | Code-read; adapter not built |
| `URGENT_WORK` | Unresolved recall matches | `RECALL_REVIEW` | `recalls.unresolvedMatches` non-empty | Finding 7 resolved (explicit policy added) |
| `URGENT_WORK` | Active high-severity radar matches | `HOME_EVENT_RADAR_FEED` | `events.activeRadarMatches` with severity `high` or above | Severity threshold unverified |
| `CONTINUE_WORK` | Open decision thread (sell/hold/rent, HVAC) and open guidance journey | `HVAC_DECISION_CONTINUE`, `GUIDANCE_JOURNEYS_LIST`, sell/hold/rent analysis | The thread or journey is open (not abandoned, completed or archived) | Existing continuation mechanisms; needs registering as a granted producer |

`URGENT_WORK` and `CONTINUE_WORK` need their own producer ids with explicit grants; the shared result producer may claim neither urgent work nor starters.

## 3. Proposed first-activation opportunities (`HOME_OPPORTUNITY`)

Labels lead with the outcome and avoid product names. Every launch is a read-only operation started from the stored action's `operationId` (the verified-selection path already writes it into the launch context). "Why now" tokens would be added to `REGISTERED_WHY_NOW_REASONS`; confidence only qualifies them.

| # | Label (outcome-led) | Operation | Outcome key | Who may get it | Why-now token and source | Evidence |
|---|---|---|---|---|---|---|
| O1 | See the big projects coming up | `CAPITAL_RESERVE_PLAN` | `REVIEW_CAPITAL_OUTLOOK` | VIEWER+; OWNING or SELLING | `WHY_NOW_CAPITAL_ITEMS_UPCOMING`: a ready capital timeline item with its window in the next 24 months (`financial.upcomingCapitalExposure`) | Executed ops facts; signal and launch code-read (see verification) |
| O2 | Check what's expiring soon | `WARRANTY_LOOKUP` | `REVIEW_EXPIRING_WARRANTIES` | VIEWER+; all modes | `WHY_NOW_WARRANTY_EXPIRING`: a warranty expiring within `WARRANTY_EXPIRING_DAYS` (60) days (`coverage.warranties`) | Executed ops facts; signal and launch code-read; message-dependent (see verification) |
| O3 | Review the open inspection items | `INSPECTION_FINDINGS` | `REVIEW_OPEN_FINDINGS` | VIEWER+; all modes | `WHY_NOW_OPEN_FINDINGS`: at least one unresolved finding (`inspection.openFindings`) | Executed ops facts; signal code-read |
| O4 | Look for savings you may be missing | `SAVINGS_OPPORTUNITIES` | `REVIEW_SAVINGS_MATCHES` | VIEWER+; all modes | `WHY_NOW_SAVINGS_MATCHES`: unreviewed hidden-savings matches exist | **Unverified source**: matches are not a catalog fact |
| O5 | Check whether refinancing could help | `REFINANCE_ANALYSIS` | `REVIEW_REFINANCE_OUTLOOK` | VIEWER+; **OWNING only** | `WHY_NOW_REFINANCE_OPPORTUNITY`: status `MORTGAGED`, a recorded rate, and an open refinance opportunity from the radar | **Unverified source**; reads `interestRateBps` from the financing profile, not `financial.currentMortgage` (recorded contract defect) |
| O6 | Get the home ready to list | `SELLER_PREP_CHECKLIST` | `REVIEW_SELLER_PREP` | VIEWER+; OWNING or SELLING | `WHY_NOW_SALE_CASE_ACTIVE`: a live sale case (`PREPARING`, `LISTED`, `UNDER_CONTRACT`), the same governed signal as the SELLER audience | Executed ops facts; signal is the step 7 adapter |
| O7 | Keep your closing on track | `BUYER_DEADLINES` | `REVIEW_BUYER_DEADLINES` | VIEWER+; **BUYING only** | `WHY_NOW_BUYER_JOURNEY_ACTIVE`: a pre-closing buyer journey with a milestone due within 14 days | Executed ops facts; 14 days is my proposal. **Conflicts with finding 3**: the operation is gated by `ownershipState`-derived BUYING while the audience is workflow-derived |

**Verification of O1 to O3 (the approval conditions; code-read, nothing run against a database)**

| | Launch routing | What the handler reads from the stored message | Exact signal predicate | Result |
|---|---|---|---|---|
| O3 `INSPECTION_FINDINGS` | Forced by the stored `operationId` ("a declared item action is authoritative", `createAskExecution.ts`), so no message classification is involved | **Nothing.** `inspectionFindingsResult(userId, propertyId)` ignores the message | `inspection.openFindings` is findings with `status = 'OPEN'` on `CONFIRMED` reports (`prismaAssemblers.ts`); predicate: count at least 1 | Message-free and the predicate matches the handler's own data |
| O1 `CAPITAL_RESERVE_PLAN` | Forced the same way | Only a horizon: `parseCapitalTimelineHorizonRequest` matches "5 year" or "10 year" and returns null otherwise | `financial.upcomingCapitalExposure` is items with `windowEnd >= now` and a READY analysis; predicate: at least one starting within 24 months | The stored message must contain neither phrase (so it uses the default horizon); the 24-month predicate must be checked against the default horizon the answer shows (**not yet checked**) |
| O2 `WARRANTY_LOOKUP` | Forced the same way | **The message decides the focus**: `warrantyFocus` treats "expiring", "runs out" and similar as the expiring view | The handler's own constant `WARRANTY_EXPIRING_DAYS = 60` (the 60 days I proposed is that existing constant) | Not message-free. The stored message must say "expiring" (server-authored, so deterministic), and the why-now predicate must **import the same constant**, or the chip could promise expiring warranties the answer does not show |

So: O3 is cleared. O1 and O2 are conditional on the checks above, plus a test that each stored message produces the intended focus.

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

**The "eight defined, six expected eligible" bar is withdrawn (owner review).** A count is a heuristic and does not establish exact-four availability: on a sparse home only S1 to S4 are dependable, and those are still unverified. It is replaced by a behavior-level invariant.

**Invariant (to be enforced by an enumerating test, not asserted by a count).** *For every minimum supported viewer state, the governed deterministic fallbacks alone yield four eligible, distinct, ledger-backed actions after eligibility, presentation deduplication, history and cooldown.* A **deterministic fallback** is a starter whose eligibility depends only on facts the finalizer already holds for that state (no data-dependent readiness that can be empty), whose operation is available, in-role and in-audience for that state, and whose answer is meaningful for it.

**Minimum supported viewer states to enumerate (each must pass):**

| Dimension | Values |
|---|---|
| Household role | VIEWER (the minimum); CONTRIBUTOR and OWNER must also pass (they have more, never fewer) |
| Operating mode | `UNKNOWN`, `BUYING`, `OWNING`, `SELLING` (so only operations allowed in every mode can be deterministic fallbacks) |
| Home data | empty property (no inventory, rooms, warranties, documents, journeys), plus a minimally seeded property |
| **Current answer** | **Every message-routable operation, and the landing state.** This is the state that breaks a count: if the current answer is itself one of the dependable starters, that starter is removed (the current outcome is never re-offered), and any other starter its card already presents is removed by presentation deduplication. With four dependable starters, asking "what maintenance is coming up" can leave two |
| Degraded availability | any single operation disabled by operational controls, and the opportunity producer dropped by the pipeline budget (starters must not depend on it) |
| Session history | starters already used in the session (they must be repeatable) |

**What the invariant implies today.** Because the worst-case current answer removes the answer itself plus whatever its blocks present, the deterministic pool must exceed four by the largest number of starter destinations any single answer can remove. That number is a measurable property (run `collectPresentationIdentities` over each operation's real result blocks), not a guess. If it cannot be established, exact-four is **not activated** for that state; shortage is never redefined as acceptable. Each starter keeps a readiness predicate so an empty-state answer is never offered, but a predicate-gated starter does not count as a deterministic fallback.

### 4a. Availability measurement (executed; revision 3)

`tests/ask/exactFourAvailabilityMatrix.test.js` runs the real availability function (role and operating mode), the real eligibility rules and the real exact-four policy over the state matrix above, with starters registered provisionally inside the test (production registries untouched). The pool it draws hypothetical starters from is the 28 operations that are all-mode, viewer-floor, standard-safety reads; that is structural only, since many are data-dependent or typed-only.

**What actually removes a starter today (executed or source-guarded):**

| Mechanism | Removes starters? | Evidence |
|---|---|---|
| Presentation deduplication | **No, structurally.** A published identity needs a node with `entityType` and `id`; a starter has neither, so its semantic key can never be in the set | Executed over every block shape in the test |
| The current answer's own outcome | **No, today.** The finalizer passes `currentOutcomeKeyHashes: new Set()`, so the answer the user just got can be re-offered (a UX gap, and the reason the invariant's "current answer" row only matters if this is fixed) | Source guard |
| Prompt history | **Yes, and it ignores repeatability.** The stored message of any of the last 5 completed executions in the session plus the current message is suppressed. Declaring an outcome repeatable does **not** help | Executed: a repeatable outcome whose message was asked is `SUPPRESSED: EQUIVALENT_PROMPT_ASKED` |
| Completed semantic history | Only non-repeatable outcomes | Code-read |
| Operation availability (health, role, audience) | Yes, one disabled operation removes its starter; mode and role do not change an all-mode viewer starter, and CONTRIBUTOR and OWNER never have fewer | Executed matrix |

**Measured minimal pool of deterministic starters** (the number that must be dependable on a sparse home for the invariant to hold in every supported state):

| Regime | Minimal pool | Why |
|---|---|---|
| Current rules | **11** | 4 + 6 history removals (5 recent plus the current message) + 1 disabled operation |
| Current rules, and the finalizer also excludes the current answer's outcome | **12** | one more removal |
| Prompt-history rule respects repeatability | **5** | 4 + 1 disabled operation; history no longer removes repeatable starters |
| Same, and the current answer's outcome is excluded | **6** | 4 + 1 disabled + 1 current |

**Verdict for the four dependable starters (S1 to S4) as they stand: the invariant is RED.** One disabled operation leaves three; one starter used in the last five turns leaves three; four starters used in a row leave none. A user exploring by clicking starters is the normal case, so this is not an edge. Only about four starters can be shown to return content on a sparse home, so the current rules (11 or 12) cannot be met; the rule change (5 or 6) can be, with S1 to S4 plus one or two more dependable starters.

**Decisions this forces (new):**

| # | Decision | Recommendation |
|---|---|---|
| D-O10 | Make the prompt-history rule respect `isRepeatableOutcome` (a small eligibility change, not made here) | Approve. It is the difference between an unmeetable 11 and a meetable 5. Existing repeatable outcomes (the platform "start again" and "review current record" actions) would no longer be hidden by recent identical messages, which is the intent of declaring them repeatable. Repetition is then governed by the offer cooldown and soft rotation (inactive until wiring) |
| D-O11 | Populate `currentOutcomeKeyHashes` so the answer just produced is not re-offered | Approve in principle (it fixes a real UX gap) but note it raises the minimal pool by one (6 with D-O10) |
| D-O12 | Should a card or button with the same destination suppress a starter (the plan says a visible action with the same semantic destination suppresses the compact one)? Today it cannot, because identities need an entity | Decide explicitly. If yes, define an entity-less operation-level identity; it removes more starters, so the measurement must be re-run with the largest number of starter destinations a single answer presents. I have not measured that number |
| D-O4 | Starter pool | Needs at least 5 to 6 dependable starters **after** D-O10 (S1 to S4 plus one or two), proven by this test on a sparse home; not approvable until those are verified to return content |

## 5. Outcome registry and launch entries needed (for approval)

- **Outcomes** registered per operation in `SUGGESTED_ACTION_OUTCOMES` (for example `PROPERTY_SUMMARY: ['OPEN_SUMMARY']`), bounded tokens, validated by the registry test.
- **Repeatable** set: only the specifically reviewed read outcomes (O1 to O3 and the approved starters), each by explicit entry in `REPEATABLE_OUTCOMES`; a registry test fails for a repeatable outcome without an approved entry (finding 2).
- **Producer grants:** `home-opportunities.signals` (HOME_OPPORTUNITY only, no ownership or goal claims), `home-opportunities.urgent` (URGENT_WORK only), `home-starters.curated` (CURATED_STARTER only), plus the existing result producer unchanged.
- **Ownership:** none of these claim current-result ownership; they are unrelated opportunities, so the one-opportunity cap, the seven-day cooldown and the reserved-slot rule apply.
- **Launch:** the verified selection already routes by the stored `operationId`; routing is forced by the stored `operationId` (verified), so launch never depends on message classification; handlers may still read the server-authored stored message for sub-parameters. Verified for O1 to O3 (section 3); not yet verified for the starters or O4 to O7.

## 6. Decisions (revision 2)

| # | Decision | Status after owner review |
|---|---|---|
| D-O1 | Opportunities O1 to O7 | **O1 to O3 approved conceptually**, contingent on verifying message-free typed launch and the exact signal predicates: O3 is verified; O1 needs the horizon alignment check and a stored message with no "5 year" or "10 year"; O2 needs the shared `WARRANTY_EXPIRING_DAYS` predicate and an "expiring" message. O4 and O5 held until sources are verified. O6 and O7 wait for D-O3 |
| D-O2 | Repeatable read outcomes | **Narrowed:** only the specifically reviewed read outcomes, by explicit registry entry, never a blanket rule for future read operations |
| D-O3 | Operating-mode reconciliation | **Kept separate**, as proposed. First activation uses only all-mode operations for starters and accepts existing mode gating for O1, O5, O6, O7 |
| D-O4 | Starter bar | **Not approved.** The count is withdrawn; the behavior-level invariant and state matrix above replace it. Needs your approval of the matrix and of the "do not activate if a state cannot be proven" rule |
| D-O5 | Starters must not depend on the opportunity snapshot | Recommended; implied by the degraded-availability row |
| D-O6 | Plants | Defer |
| D-O7 | Mortgage chips | Defer |
| D-O8 | Label copy and windows | Review wording; the 60-day window is the existing `WARRANTY_EXPIRING_DAYS` constant, the 24-month and 14-day windows are still my proposals |
| D-O9 | `RECALL_REVIEW` audience policy | **Resolved:** explicit all-mode viewer policy added and tested (finding 7) |

## 7. What I would build next (after your review)

First the enumerating availability test and the measurement of how many starter destinations a single answer can remove (this decides whether the starter pool is sufficient and is the activation gate); then registry entries and the specifically reviewed repeatable declarations; then the three producers behind a shared batched context read, each with its grant and tests. None of it is wired into the live finalizer until the atomic activation.
