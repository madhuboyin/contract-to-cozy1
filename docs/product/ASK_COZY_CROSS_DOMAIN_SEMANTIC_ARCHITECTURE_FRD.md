# Ask Cozy — Cross-Domain Semantic Request Architecture FRD

**Status:** Draft v1.34 for owner review

**Date:** 2026-11-17

**Revision 2026-11-17 — composed recorded-data filters:** The typed inventory slice now treats a linked receipt as a governed inventory-to-record relation and supports `missing receipt AND (room A OR room B)` without dropping either condition. Reviewed semantic examples route compound capability reads for Appliance Oracle risk plus an estimated replacement-cost threshold, seller-prep material blockers plus a maximum estimated cost, and saved furnace replacement options plus ROI without bypassing fast-path certification. The corresponding handlers apply the filters to their canonical data rather than rewriting the prompt as an unrelated clarification.

**Revision 2026-11-18 — maintenance month plus cost:** `maintenance due next month AND cost more than $N` is one executable typed query. The calendar-month window and strict cost threshold are both applied. A task uses its recorded actual cost when present, otherwise its recorded estimate (labelled as estimated); a task with neither is excluded and disclosed as unknown. Result rows show due date and cost, and an answer never presents the unfiltered month list as satisfying the cost-filtered request.

**Revision 2026-11-18 — completed maintenance cost presentation:** The answer summary reports the confirmed-match count and the excluded unknown-cost count without enumerating every task. Names, recorded/estimated costs, and completion dates remain on the result rows. Those rows are grounded `MAINTENANCE_TASK` records rendered through the canonical Ask maintenance detail workspace rather than static semantic labels.

**Revision 2026-11-21 — live UI review, slice 1 (trust and correctness):** Implements three P0 items of the consolidated Ask UI review and the 2026-11-17 owner decision (1). (a) **Own-versus-rent.** The saved Sell/Hold/Rent result (selling now, living in the home, renting it out) never supplies the verdict. The crossover model answers when a tenant rent for a comparable home and the home value are known; otherwise the answer leads with "I can’t determine the owning-versus-renting break-even yet", names what it needs in plain words, and mentions the saved analysis only as separate, clearly labelled context. The facet is `PARTIAL_MISSING_SLOTS` with no metrics and no collection row. The monthly rent is still never derived from the saved net figures. (b) **Confirmed and unknown are separate collections.** The project-permit answer lists only projects confirmed as needing a permit in the matches list and in the receipt (`totalMatchCount === confirmedCount` already required this; the executor had counted unknown projects as confirmed). Projects whose permit requirement is not recorded form their own "Needs confirmation" list (`SliceRichPresentationInput.unconfirmedRows`, block id suffix `-needs-confirmation`, `CrossDomainFacetExecutionResult.unconfirmedRows`), in single-facet and compound answers; the equivalence verifier requires that list's size to equal the receipt's unknown count and that no confirmed record is in it; projects confirmed as not needing a permit are not shown. Copy is homeowner language with correct plurals. (c) **Claims state follows the question.** A fresh claims question reads its own state words (`claimsStateFromWords`): "which claims are still open" reads open records and the "Open" chip is active, so the records, headline and control agree; an emergency follow-up keeps all records. **Not done / open:** whether a draft claim counts as open is unchanged (drafts are open); "Office Desk" classified as a project needs a data check; presentation families, row semantics, the generic adapter's titles, counts and "Matched records", density, and actions are slices 2-5 of the review. Unit-tested and typechecked only; not browser- or live-verified. Full Ask suite: 4607 of 4901 pass versus 4590 of 4887 on clean HEAD, no new failures.

**Revision 2026-11-21 — live UI review, slice 2 (explicit presentation semantics):** Renderer selection no longer depends on a block id string. The contract (`ask.contract.ts`) gains three optional, additive fields: `presentationFamily` on SUMMARY (`DIRECT_ANSWER`, `ENTITY_LIST`, `ANALYSIS`, `COMPARISON`, `CLARIFICATION`, `BOUNDARY`, `WORKFLOW`: the one family an answer selects), `recordKind` on GROUPED_LIST (`INVENTORY_ITEM`, `MAINTENANCE_TASK`, `CLAIM`, `PERMIT`, `WARRANTY`, `DOCUMENT`, `HOME_EVENT`) and `matchReason` on rows (why the record is in the answer). The shared rich-presentation adapter takes `family` and `recordKind`, derives the family when omitted (a list when there are records, a direct answer when there are none) and defaults each row's `entityType` from the kind; the cross-domain executor derives the kind from the receipt's source type (`RECORD_KIND_OF_SOURCE_TYPE`), declares `ANALYSIS` for own-vs-rent and refinance and `COMPARISON` for quotes, and the compound builder sets kinds on its claim, permit and generic lists. The client (`GroupedListBlock.tsx`, `withCanonicalListId`) renders the canonical domain list for a declared kind whatever the block id is (claims, permits, warranties, inventory, home events); maintenance and documents are deliberately not mapped because their renderers need paging and grouping metadata a generated list does not carry. Tests: `crossDomainRendererConformance.test.js` (every cross-domain answer passes the real block schema, declares a family, and typed lists declare their kind) and `recordKindRenderer.test.tsx`. Frontend: `next build` passes; the 11 failing Ask component suites are identical to clean HEAD. Not browser-verified.

**Revision 2026-11-21 — live UI review, slice 3 (analyses are results, not collections):** Own-versus-rent and refinance break-even no longer present as a one-row list. `buildSliceAnalysisPresentation` (`slice/analysisPresentation.ts`) builds the answer from existing block types: a SUMMARY of family `ANALYSIS` whose title is the conclusion (or, when inputs are missing, what cannot be determined yet), one support line, up to four typed key facts as `bullets`, an ASSUMPTIONS block (rent growth, appreciation, financing, carrying and selling costs; rates, closing costs, loan balance), an INFO LIMITATION note for context that is not the answer (the saved Sell/Hold/Rent analysis), and the evidence line. Money is whole dollars with separators (`$233,001`), never raw cents. Missing inputs are not "unknown records": the receipt's unknown count is 0 for analyses and no "records need confirmation" boundary is shown; the missing inputs are named in plain words. The equivalence verifier counts no rows for an `ANALYSIS` summary (the summary is the displayed result) but still rejects a list posing as one with an ungrounded row. In a compound answer an analysis facet adds only its assumptions and note, never a list section. The facet's `summary` string and `metrics` are unchanged for existing consumers. Tests: `crossDomainAnalysisPresentation.test.js` (5). Not browser-verified.

**Revision 2026-11-21 — live UI review, slice 4 (density, duplication and homeowner wording):** (a) **Lists.** The rich-presentation adapter declares `listDensity: 'DENSE'` (compact one-line rows, no Auto/List/Cards chooser), gives a list no heading of its own unless the producer supplies one (the answer heading is not repeated), has no default "Matched records" group, and states "Showing N of M" only when it shows part of the records (the count is said once, in the answer). The generic list draws no empty header, and a single section whose heading is empty or repeats the list heading is not drawn but stays for assistive technology (the count is not repeated). (b) **Copy.** Optional plurals agree with the count everywhere block copy is humanized (`fixOptionalPlurals`: "0 projects", "1 permit requirement"); a summary that names two or more of the rows listed below it is shortened to the sentence before the list, and a disclosure sentence after it is kept (`withoutRowEnumeration`). (c) **Uncertainty note.** One calm line ("1 record could not be confirmed, so it isn’t counted either way."), `INFO` unless records conflict, with no instruction the homeowner cannot act on from the answer ("Add or correct the missing details", "Confirm … on the item detail page" are removed); a warranty answer keeps its warranty heading. The calm chrome renders an `INFO` note with no suggestions as a footnote, so the note no longer draws as a warning panel. (d) **Claims.** A status badge is sentence case ("Draft"), and a row's secondary line is omitted when it only repeats the title ("Water damage claim" no longer carries "water damage"). Verified already in code and unchanged: "Change and resend" is shown on hover or focus (always visible only below the `lg` breakpoint, for touch); the calm chrome hides the generic suggestion list. Tests: `crossDomainCompactPresentation.test.js`, `genericListChrome.test.tsx`; existing tests that pinned "(s)" plurals, a row enumeration in the permit and claim summaries, and the old note were updated to the new copy. **Open, needs an owner decision or a live run:** whether the claims filter chips fold behind a "Refine" control (they double as pinned follow-up controls), the draft-versus-open claim wording, viewport-fit acceptance checks (they need the running app), the warranty heading "Warranty linkage requires confirmation" (system wording that an existing test pins), and the single next-step panel's size (not reproduced from code). Not browser-verified.

**Revision 2026-11-21 — live UI review, slice 5 (conformance gates and the first browser verification):** (a) **Contract gate.** `crossDomainRendererConformance.test.js` now fails if parsing a real block against the contract drops any key. The contract strips a key it does not declare, and two producer fields were being silently lost before the homeowner saw them: a row's `subtitle` (secondary line, for example "Permit requirement not recorded") and `badge` (state). The adapter now writes the contract's own fields: the secondary line is the row's `description` (description and subtitle said once if equal, else why it matched) and the state is `badgeLabel` (omitted when there is none). (b) **Browser acceptance.** `apps/frontend/e2e/ask/compactAnswers.spec.ts` (12 checks, desktop Chromium, run with the existing `ASK_ACCEPTANCE_FIXTURE=1` Ask build and `playwright.ask.config.ts`) serves the blocks the backend really builds (`apps/backend/scripts/ask-dump-cross-domain-answers.js` writes `e2e/ask/compactAnswerBlocks.json`; `crossDomainAnswerFixtureCurrent.test.js` fails when the file is stale) and checks: no system wording, no "(s)", no raw-cent figures; an unknown-only permit answer and an own-vs-rent limitation answer end well inside a 720px window (measured: 519px and 440px of 720px, leaving room for the composer); dense rows are 42px; the own-vs-rent conclusion carries its facts and a quiet "Based on 1 source · 5 assumptions" cue; a claims list has no stray count fragment. (c) **Defects the browser found that unit tests could not:** the lost `subtitle` and `badge` above; the claims renderer printing "· 1" for an empty group heading (a list of a known record kind now names its group: Claims, Permits, Warranties, Items, Tasks, Documents, Events); the permit answer leading with a topic label ("Project permit requirements") instead of the answer. List answers are now answer first: the headline is the summary's first sentence ("1 project needs a permit.") and what follows is the one supporting line (`answerFirst`); `title` and `body` are unchanged for every other consumer. A summary that re-lists a single row as the whole tail of its sentence ("1 open claim: Water-damage claim.") is shortened like a multi-row enumeration. (d) **Open, not changed:** a semantic inventory answer's SUMMARY is deliberately not drawn above the canonical inventory table (`registry.tsx`), so a warranty list shows no visible answer sentence; the claim list's status pill is lowercase ("open"); mobile and the 900px-and-taller viewports are not covered by the new spec; the existing desktop Playwright Ask suite was run on this tree and on the pre-session code (only the two frontend files this work changed were swapped back): both show the same 51 failures (date-dependent fixtures such as "expires soon" and "to plan soon", the landing page, the explore rail, home actions, screenshot sizes), so none are introduced here; a one-off extra failure in the full parallel run passed 3 of 3 in isolation on both builds. Those 51 pre-existing failures are not fixed here. Not run against a real backend.

**Revision 2026-11-21 — owner review of the first five UI slices (contract hardening, draft claims, decisions):** (a) **The presentation family is a contract at the result level.** `AskOperationResult.presentationFamily` is stored with the answer and carried on the execution response (`presentationFamily`, null when a producer has not declared one); every semantic-stack answer declares it, a clarification is declared `CLARIFICATION` at persistence, and `answerFamilyAnatomy.ts` (backend, enforced by the response contract) and `features/ask/answerFamilyAnatomy.ts` (the client's copy, applied in the response card) define what a family promises: `ANALYSIS` carries no collection (no list, no table); `DIRECT_ANSWER` carries a list only when the list declares `justifiedCollection`; `ENTITY_LIST` declares a `recordKind` on every list (except the separate "needs confirmation" list) and has at most one list per kind. The server rejects a response that breaks its declared family; the client shows only what the family permits (an analysis never shows a list) and reports the violation. (b) **Kinds are declared, never omitted.** `recordKind` gains the kinds the shared list renders (project, quote, tax bill, insurance policy, recall, inspection finding, seller-readiness item, buyer task, claim document, saved result, environmental risk, other); every cross-domain list declares one, mixed generic sections declare `OTHER`. (c) **Renderer selection no longer rewrites identity.** The client chooses a domain renderer by `canonicalRendererId(block)` and passes the block unchanged, so a block's id keeps keying view state, detail targets and evidence references; the anatomy rule forbids two lists of one kind in an answer. (d) **Maintenance and document lists are routed.** They are chosen only when every row carries what those renderers require (`RENDERER_ROW_REQUIREMENTS`: a maintenance row names its entity type and its task's status, a document row its entity type); the finalizer normalizes maintenance rows from the snapshot, and any other list of that kind falls back to the shared list. Raw ISO timestamps in row text are now plain dates. (e) **Draft claims are not open claims.** Open (active) means filed and not closed: in progress, submitted, under review, approved or denied; a draft is its own state and closed is closed (`OPEN_CLAIM_STATUSES`, `DRAFT_CLAIM_STATUSES`, `CLOSED_CLAIM_STATUSES`; `UNFINISHED_CLAIM_STATUSES` keeps record browsing as before). The claims answer counts and lists only open claims under "Open", lists drafts under "Draft claims" only when everything is asked for, and says once "N draft claim records are not counted as open" (a count is read even when drafts are not listed). The cross-domain answer does the same. (f) **Decisions applied.** An own-vs-rent analysis offers "Add comparable rent" (when it cannot compute) or "Adjust assumptions" (when it can): the governed Sell / Hold / Rent assumptions command, which reviews a change before it saves; it is allowlisted for the data-point answer and offered to no viewer. The semantic inventory and maintenance answers show their summary sentence above the table. The warranty uncertainty heading is "Warranty record needs confirmation". Claim filter chips are folded behind one "Refine" control that names what is applied. One sentence-case status formatter (`formatStatusLabel`) serves every record list. The skill-handoff panel is one inline "Next: … →" action (its access-and-context note stays for assistive technology). (g) **Verification, stated exactly.** Backend Ask suite: see the commit message for the exact passed, failed, skipped, todo and cancelled counts; failures are the pre-existing baseline set, so this is "no new failures", not a green suite. Browser: fixture-backed acceptance (the backend's real blocks served through the Ask API fixture), not end-to-end validation: it does not exercise API serialization, real authentication or property access, database record shapes, live claim and project relationships, source evidence or a real saved session. It now covers 390x844, 768x1024, 1280x720, 1440x900 and a 320px width (200% zoom), long and unbroken titles, and many rows, with no horizontal scroll, nothing wider than the screen and 24px minimum targets. The existing desktop Playwright Ask suite had 51 failures at the pre-session code; pinning the browser clock and the fixtures' own relative dates to their authoring date (`FIXTURE_NOW`, 2026-09-24) fixes the 3 that were date-dependent; the remaining 48 are, by kind: 20 expected element not found, 6 text or value differs, 6 selector matches two or more elements, 6 timeouts waiting to act, 5 element count differs, 2 screenshot differences, 2 layout metrics, 1 control state. Those are selector and shell drift to be fixed one by one in a separate stabilization task. **Not done:** the tenant-rent action opens the existing assumptions form (all assumptions, reviewed before saving), not a rent-only prompt; the action's round trip through a real backend has not been run; mobile for the existing (non-new) browser specs is not re-run.

**Scope:** All Ask Cozy homeowner turns, all product domains, reads, analyses, guided workflows, and confirmed writes

**Primary objective:** Make the correctness of a basic home question depend on its meaning and the home's authorised data—not on matching one expected sentence

**Supersedes:** The target-understanding, query-planning, capability-selection, answer-verification, and evaluation design in `ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` where this document is more specific

**Does not supersede:** Existing authentication, property authorisation, privacy, safety-boundary, consequential-action confirmation, domain business rules, or canonical domain-service requirements

**v1.1 amendment:** Makes the deterministic plan producer and generated shared lexicon mandatory; adds early structural admission convergence, schema-derived registry governance, capability-wide canonical-relation enforcement, an in-domain-not-understood recovery, presentation-quality requirements, cardinality-first warranty modelling, and broader cross-domain acceptance examples. It does not authorize blanket execution of regex-matched reads or writes.

**v1.2 amendment:** Adds deterministic semantic-job selection for analyses and workflows, migration and retirement governance for legacy recognizers, a thin end-to-end vertical slice before registry generalization, a formal independence rule for admission evidence, conflict-aware transitional warranty reads, and declared semantic meaning tags for relationship predicates.

**v1.3 amendment:** Defines bounded and intersected relation authorization, replay-time reauthorization, indexed protected-span mapping, deterministic/provider invocation and reconciliation, the query-versus-presentation boundary, canonical duplicate-field semantics, Boolean query logic, and complete six-facet retrieval under bounded provider budgets. It also corrects stale baseline and delivery statements that implied the public child-execution contract still capped composition below six.

**v1.4 amendment:** Makes Phase 1 structural admission implementable without weakening evidence independence; specifies the deterministic parser pipeline; converts post-slice rollout into end-to-end domain waves with per-domain enablement; requires facet-aware stage-one segmentation or union target retrieval; defines projection behavior for conflicted records; and requires batched or safely version-gated replay reauthorization.

**v1.5 amendment:** Replaces the temporary per-family structural verifier with the first shared-lexicon typed-grammar subset in Phase 1; moves provider integration to an optional early parallel track after the vertical slice; defines exclusive facet ownership during mixed new/legacy migration; adds offline model-assisted lexicon enrichment governance; and separates correctness for a declared domain scope from measured homeowner-language coverage.

**v1.6 amendment:** Records the 2026-11-16 owner decision for canonical warranty relationships. Item-specific warranties are zero-to-many through `Warranty.inventoryItemId`; property and whole-home plans remain property-scoped and use evidence-backed `WarrantyApplicability` rows for item, inventory-category or home-system applicability. `InventoryItem.warrantyId` is retired. Recorded linkage, plan applicability, contract coverage, explicit absence, unknown and conflict remain distinct meanings.

**v1.7 amendment:** Records the 2026-11-16 owner decision that `UNKNOWN` warranty and coverage records appear by default in a separate owner-visible result group. Unknown records are never merged with confirmed protection, confirmed gaps, explicit absence, exclusions or conflicts; confirmed and unknown populations and totals remain separately labelled in every projection.

**v1.8 amendment:** Records the 2026-11-16 owner decision that duplicate-looking scalar fields without an existing governed equivalence rule are explicitly distinct business meanings by default. No reader, writer, backfill or analysis may substitute or coalesce them, and differing values are not a conflict merely because the fields look similar. Equivalence requires a later field-specific owner approval with authoritative storage, normalization, conflict, write-target, consolidation and provenance rules.

**v1.9 amendment:** Records the 2026-11-16 owner approval to send protected and minimized homeowner text to the configured structured semantic provider for read-only semantic planning. Raw identifiers, raw property records, the server-only placeholder bijection, database identifiers, answer generation, database execution and consequential actions are outside this approval. Provider-terms acceptance, semantic-provider activation and latency/cost ceilings remain independent deployment gates.

**v1.10 amendment:** Records the 2026-11-16 owner approval of structured-provider budget policy `semantic-provider-budget-1.0.0`: 600 ms Stage 1 latency, 1,200 ms Stage 2 latency per call/batch, USD 0.015 estimated cumulative cost per turn, three concurrent Stage 2 calls and six admitted facets. Breaches fail closed without partial or consequential execution. These are hard ceilings, not latency SLOs; cost remains an estimate until provider usage metadata is converted through an approved pricing table.

**v1.11 amendment:** Records the 2026-11-16 owner decision to defer creation of an independently authored, human-adjudicated evaluation corpus because the required budget and staffing are unavailable. The internal developer-authored sealed-proxy suite remains approved for regression, invariant and implementation feedback only. It does not satisfy independent-provenance, human-adjudication, per-stratum sample-size or macro/per-domain confidence gates; Phase 6 remains incomplete and no FR-EVAL completion, production-readiness, real-homeowner-language coverage or sub-1% incorrect-high-confidence claim may be made from it.

**v1.12 amendment:** Records the 2026-11-17 implementation of `FR-PLAN-5` (no silent partial interpretation) for three live-evaluation failures, with no change to requirements: composed clauses carrying an explicit numeric qualifier their operation cannot apply, the completed-only maintenance view (live prompt #63), and the warranty read asked about recalls (live prompt #61). The owner chose, for a part that cannot be fully answered, to run the clean parts and name the gap. Nothing here is browser-verified, no general legacy-operation admission gate exists, and `FR-PLAN-5` is not declared complete.

**v1.13 amendment:** Records the 2026-11-17 implementation of fixes from an external review of a 20-prompt live evaluation, with no change to requirements: (1) one shared emergency-boundary wording for a suspected gas leak on every path, (2) classifier vocabulary for "safety notices/alerts" and scheduling phrasings, and (3) honesty wording so an absence of data is never presented as a finding (`FR-PLAN-5`, `FR-ANS` answer correctness). A finding that no fast-path rule is certified is recorded because it changes where routing vocabulary work belongs. Nothing here is browser- or live-verified, and the routing items for "schedule … next month" and "city approvals" remain open.

**v1.14 amendment:** Records the 2026-11-17 implementation of the presentation items from the same external review of the 20-prompt live evaluation, with no change to requirements: an explicit calendar-month window on maintenance answers, a plain-language reading of the saved Sell/Hold/Rent result, and a grouped, open-items-only seller readiness answer. Two correctness defects were found while doing this and are fixed: a category question ignored its month, and waived seller-readiness items were counted as still to finish. An owner decision on whether an own-versus-rent question should answer from the saved Sell/Hold/Rent analysis at all is open. Nothing here is browser- or live-verified.

**v1.15 amendment:** Records the 2026-11-17 implementation of two more items from the external review of the 20-prompt live evaluation, with no change to requirements: a plain out-of-scope boundary for preparing or filing a tax return, and a specific answer for a compare request whose two names nothing recognised. The review's remaining routing findings ("schedule … next month", "city approvals", "protection coverage") were traced and are recorded below as one open calibration decision. Nothing here is browser- or live-verified.

**v1.16 amendment:** Records the 2026-11-17 implementation of two items from the second external review (the 20-prompt composite evaluation), with no change to requirements: an age comparison ("older than N years") as a typed WHERE predicate, which changes the semantic plan contract from 1.4.0 to 1.5.0 (an optional whole-year `thresholdYears` on a registered predicate), and an honest partial-answer label for a typed answer that ignored a dollar comparison. The review's central finding is recorded below: the cross-domain unresolved-word check ignores digits and a closed-class word list, so numeric thresholds and some whole clauses are dropped while `grammarComplete` stays true; the label is a containment, and applying those conditions is open. Nothing here is browser- or live-verified.

**v1.17 amendment:** Records the 2026-11-17 implementation of one more item from the second external review (the 20-prompt composite evaluation), with no change to requirements: how a list of rooms combines with other conditions in the typed stack, and the rule that words that were not understood are reported before any question about the words that were. Two correctness defects were found while doing this; one predates the review item and returned wrong answers to ordinary questions. Nothing here is browser- or live-verified.

**v1.18 amendment:** Records the 2026-11-17 implementation of the "filters with data behind them" items from the second external review (the 20-prompt composite evaluation), with no change to requirements: a claim-type filter, "over N years old" as an age, and a correction to the cross-domain emergency gate, which treated the bare words "fire" and "smoke" as emergencies. It also records a defect in the claim list that ignored the plan's own conditions. The state-semantics value introduced for the age predicate in v1.16 is renamed `ATTRIBUTE_FILTER` because it now also covers an equality filter. Nothing here is browser- or live-verified.

**v1.19 amendment:** Records two 2026-11-17 changes, with no change to requirements: (1) an "or" between questions about different domains is two questions, and a part that cannot be answered is named on the answered section instead of being dropped (`FR-PLAN-4`, `FR-PLAN-5`); and (2) two safety corrections: phrasings of a fire, smoke or alarm emergency that neither safety gate caught, one of them a regression from narrowing the fire/smoke pattern in v1.18, are now caught by both gates, and the gas-leak wording is tightened. Owner decisions on the review follow-ups are recorded at the end of the second row. Nothing here is browser- or live-verified.

**v1.20 amendment:** Records the 2026-11-17 audit of every clarification card and the first step (a contract, a production repair and a test over every producer) of the owner-approved clarification-card work, with no change to requirements. Two producers were found to build cards that do not work: the slice "no A or B" card and the cross-domain clarifications. They are pinned as known defects that may only shrink; rebuilding them is the next steps of the approved order. Nothing here is browser- or live-verified.

**v1.27 amendment:** Records the typed permit-record queries (2026-11-17), with no change to requirements: "pending / open / active / expired / finaled permits" are answered from the home's permit records (`query.permit.filter`, `relation.permit.self`, `predicate.permit.matches_filter`, lexeme `status.permit.finaled`). The authority's official status decides; what the household reported is shown beside it and never counted as official. "Open" and "pending" both mean not finaled, expired or voided (said in the answer); a record with no confirmed official status is counted as open and named; a permit reported completed or expired but not confirmed is named and not counted as finaled or expired. No records says that is not the same as nothing having been permitted. "Open claims or pending permits" now answers both parts. A bare "permits" question, with no status word, stays with the Permit Tracker read. Two wrong answers found and fixed: "open permits for this home" and "open projects for this home" were answered with seller listing readiness ("home" is a listing alias), so the seller rule no longer fires when the clause names another record. Five tests that used "pending permits" as their unanswerable example now use "open projects". Executed on a hand-computed fixture with a with/without regression comparison over 362 files; not browser- or live-verified, and "pending" is treated as "open" pending an owner ruling.

**v1.28 amendment — compound result interaction (2026-11-18):** A compound answer must preserve the grounded entity type and the canonical Ask-native detail treatment of each facet. It must not flatten claims or permit records into static generic rows. Claim rows open the existing canonical claim detail inline; permit rows open the current property-scoped permit record inline. Neither interaction navigates to a desktop page, and opening detail performs a fresh authorized read so stale answer data is not presented as current.

**v1.29 amendment — claims and permits presentation (2026-11-20):** The compound open-claims/pending-permits answer is count-first: its title names the applied views and its summary states both counts in one line with natural pluralization. Claims and permits remain symmetric sections even when one side has zero records. A zero-permit section says no pending permit records were found in this home record; the distinct warning that the local permitting office may hold records not added here is a separate informational boundary, not embedded in the answer sentence. Claim and permit collections use compact divider rows with a quiet chevron; the whole row title remains the accessible inline-detail control, so a repeated visible "View details" label is unnecessary. Canonical fresh detail reads and governed actions are unchanged.

**v1.26 amendment:** Records the typed maintenance filters from the third live run (2026-11-17), with no change to requirements: a completed-status filter and a strictly-greater-than cost threshold ("which completed maintenance tasks cost over $1,000?"). A task's cost is its recorded actual cost, else its estimate labelled "estimated"; a task with neither is named as unknown and never counted as zero or as under the threshold; only completed tasks are listed; a viewer gets a redaction. A completed question that also names a due window, overdue or a category is not matched rather than answered with that condition dropped, and a cost question without the completed status is still not matched. Only "over / more than / above / exceeding / greater than" is applied; "under" and "at least" are not, and the partial-answer label now names only amounts the plan did not apply. A thousands comma ("$1,200") no longer splits a clause. Executed on a seeded home with hand-computed expectations and a with/without regression comparison over 295 files (no new failures after regenerating the registry drift snapshot for the new lexeme); not browser- or live-verified.

**v1.25 amendment:** Records the first part of the refuse-versus-partial work from the third live run (2026-11-17): the agreement-gate refusal now names the words it could not match, and the finding that a blanket "run what is clean" rule cannot be built until the per-capability filters exist. No change to requirements. Nothing here is browser- or live-verified.
**v1.24 amendment:** Records the relevance gate for clarification cards (2026-11-17), the first of the open findings listed in v1.23: a card no longer offers an option the prompt shares no distinctive word with. No change to requirements. Nothing here is browser- or live-verified, and the corpus measurement uses the local router, which differs from live.
**v1.23 amendment:** Records a fix to a false disclosure found in the third live evaluation run (2026-11-17), with no change to requirements: the "part of your question isn't answered here" note is no longer added to a typed answer that covered the whole message. The same review's other findings are recorded as open, not fixed. Nothing here is browser- or live-verified.
**v1.22 amendment:** Records step 3 of 4 of the owner-approved clarification-card work (2026-11-17), with no change to requirements: the cross-domain clarifications become real cards, and the manual/receipt branch now evaluates the plan's own conditions (a new capability: "at least one missing"). It also records the results of the step 2 re-runs, which the v1.21 row left open. Nothing here is browser- or live-verified.
**v1.21 amendment:** Records step 2 of 4 of the owner-approved clarification-card work (2026-11-17), with no change to requirements: the slice "no A or B" card is rebuilt with typed readings, and the contract gains typed option payloads. It also records a behaviour change found while verifying the new readings: "neither A nor B" no longer counts an unknown or conflicted warranty as "no warranty", which changes results that existing tests had pinned. The step 1 row's "remaining steps" list is superseded by the row below. Nothing here is browser- or live-verified.

---

## 0. Implementation status

**Last updated:** 2026-11-17

This section is the maintained repository implementation ledger for this FRD. It records code that exists and has received the validation named below; it does not change the requirements, declare a phase complete, or imply cross-domain language coverage beyond the implemented family. Update this section whenever an implementation slice changes status, scope, contract version, validation evidence, or a known boundary.

### 0.1 Implemented foundation

| Area | Status | Current implementation |
|---|---|---|
| Phase 0 baseline & invariants (`§18 Phase 0`) | Implemented | `src/services/ask/semantic/governance/index.ts` and `scripts/ask-semantic-governance-baseline.js` generate and mechanically verify the authoritative cross-domain ontology baseline (`semanticOntologyBaseline.ts`, 14 `§5` domains + safety boundary, 20 catalogued `DataPointEntity` models, 107 approved data points reconciled against 525 Prisma models, 734 enums, and 118 `PROPERTY_FACT_CATALOG` entries, plus exhaustive 231-operation `ASK_OPERATION_DOMAIN_OWNERSHIP` with skill-domain reconciliation and zero default fallback), duplicate/legacy scalar field coalescence manifest (`scalarFieldCoalescenceManifest.ts`, 17 groups verified across all 525 Prisma DMMF models against 22 discovered candidate duplicate/shadow/overlapping pairs via `discoverCandidateDuplicateScalarFields`), recognizer-retirement manifest (`recognizerRetirementManifest.ts`, 14 buckets covering all 383 TypeScript AST-scanned recognizer/vocabulary files across Ask and Ask-adjacent entry points and 4,168 live AST signals under `FR-ONT-8` via `discoverLiveAskRecognizerSources`), relationship meaning-tag manifest, duplicate-definition report and traversable relation-path bounds (`relationGovernanceBaseline.ts`, 11 predicate meaning tags, 143 storage/token access sites verified across all 90 repository-wide `src/` relation files and 139 `(file, semanticRelationId)` access pairs via `discoverRepositoryRelationStorageAccessFiles`, 10 bounded relation paths, 17 dual-parent schema models audited), and 4 executable seeded property archetypes (`fixtureData` evaluated via `evaluateSeededArchetypeFixtures`) + 16 independent semantic families verified for seeded fixture readiness and data-state coverage (`verifySeededFamilyFixtureReadiness`; prompt/plan execution occurs incrementally in Phases 1–3) + 8 containment regression cases labelled `CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF` (`seededScenarioCatalogue.ts`). |
| Duplicate-looking scalar default classification | Implemented (`FR-ONT-2`; owner decision recorded 2026-11-16) | `scalarFieldCoalescenceManifest.ts` classifies every discovered candidate pair as governed equivalence, intentionally distinct, or `DISTINCT_UNLESS_EQUIVALENCE_APPROVED`. The former pending pairs—brand/manufacturer, category/asset type, lot-size representations without verified units, and maintenance service/category/asset classification—keep separate schema fields and never coalesce unless a later field-specific approval changes their manifest entry. Unaccounted discovered pairs fail validation. |
| Phase 1 immediate correctness containment (`§18 Phase 1`) | Implemented; canonical warranty model approved and applied | `src/services/ask/semantic/containment/index.ts` coordinates the Phase 1 basic-read family manifest and runtime grammar admission. The 2026-11-16 warranty decision retires `InventoryItem.warrantyId`, uses `Warranty.inventoryItemId` for zero-to-many item warranties, and uses evidence-backed `WarrantyApplicability` rows for property-plan item/category/system applicability. `warrantyCanonicalModel.ts` owns scope and state invariants; `warrantyApplicability.service.ts` owns canonical applicability writes and resolution; Ask, inventory, coverage, risk, sale-readiness, status-board and property-context consumers use the canonical relations. |
| Remote fallback fail-closed containment | Implemented | `askRemoteFallbackTypedClaims.ts` fails closed with an empty claim selection (`[]`) when the remote claim-selection provider throws or fails schema validation, eliminating the top-6 unrelated property-claim fallback on provider error. |
| `FR-PLAN-5` no silent partial interpretation, three cases (2026-11-17) | Partially implemented; unit-tested and typechecked only, not browser- or live-verified | (1) Composed clauses: `composition/unappliedQualifiers.ts` detects an explicit relative window ("in the next 90 days"), age threshold ("older than 10 years") or amount threshold ("over $500"); `decompose.ts` defers a clause whose routed operation cannot apply it as `UNAPPLIED_QUALIFIER`, and `runComposedTurn.ts` names it in the not-answered list in the homeowner's own words. The per-operation list of applied qualifiers is empty because no handler has been verified to read them (the warranty handler, for one, reduces "expiring in the next 90 days" to its fixed 60-day status). When only one clean clause remains the single-operation path answers with the generic declined-composition note, which does not name the qualifier. (2) Live #63, "completed maintenance tasks that have attached invoices": `maintenance.handler.ts` headlined a completed-only view with open and overdue counts ("5 tasks are overdue") and ignored the invoice condition; a completed-only view is now headlined and chipped by the completed list it shows, and an attached-document request is disclosed as not applied. The invoice filter itself is **not** applied: the task set this read loads carries no Home Records link. (3) Live #61, "appliances that have open recalls and no active warranty": the typed parsers returned `NONE_FITS` with "open" and "recalls" unresolved, but the legacy `WARRANTY_LOOKUP` route has no typed-grammar agreement check and answered the warranty half. `handlers/recallsWithWarranty.ts` now answers the combined question (`RECALL_WARRANTY_COMBINED`) from recorded data in `warranties.handler.ts`: items (appliances only when the word is used) with an `OPEN` `RecallMatch`, split by whether an active warranty applies, where a warranty applies when linked through `Warranty.inventoryItemId` or a `WarrantyApplicability` row marked `COVERED`, and "active" is the Warranties page's own `warrantyStatus` (`ACTIVE` or `EXPIRING`). An item whose warranty dates need review is listed in a separate group and counted either way (owner decision v1.7); a recall awaiting confirmation (`NEEDS_CONFIRMATION`) is not counted as open and is mentioned once; "with an active warranty" is supported as the opposite polarity. The answer reports recorded recalls and warranties only and does not say a repair would be covered. A recall-and-warranty message whose warranty side cannot be read still fails closed with `WARRANTY_UNAPPLIED_RECALL_CONDITION` and two example phrasings. This is a bespoke read in the warranty handler, **not** a typed-grammar plan: no lexicon, relation, snapshot, receipt or drift-snapshot change, so the typed parsers still return `NONE_FITS` for the prompt, the answer carries no execution receipt, and it declares no sources, so it is not composable or replayable. Unit and fake-database tests only. **Open:** a general typed-agreement gate for legacy operations; expressing the recall-and-warranty combination as a typed plan with a receipt (both relations exist in the registry); the real attached-document filter; the `WARRANTY_LOOKUP` routing assertion in `warrantyLookupCapabilitySlice.test.js` and six composition tests that fail with and without this work. |
| Emergency boundary wording, one source (2026-11-17, `76ffa85f`) | Implemented; unit-tested and typechecked only, not live-verified; wording awaits owner review | Live prompt "my furnace smells like gas" missed the registry emergency pattern (it matched "smell gas", "gas smell" and "gas leak" but not "smells like gas") and was caught by the cross-domain parser, which answered every safety boundary with one generic sentence ("seek immediate emergency help or professional assistance") that told the homeowner nothing to do. `support/emergencyBoundary.ts` is now the single wording: leave the home right away, no switches, appliances, flame or phone inside, no vehicle start in an attached garage, call 911 or the local emergency number and the gas utility from outside, do not try to find or fix the cause, do not re-enter until responders say so. The registry's `EMERGENCY_BOUNDARY` handler and the cross-domain `BOUNDARY` result both use it. The registry pattern now also matches "smells like/of gas", "gas odor/odour" and rotten-egg or sulfur smells, and not "smells rotten" alone. The cross-domain block keeps its existing id and type (`SUMMARY` `cross-domain-safety-boundary`) because new block ids are stripped unless allowlisted. **Open:** the exact wording (garage line, 911) is unreviewed by the owner; the real path from prompt to card was not run in the app. |
| Routing vocabulary for safety notices and scheduling (2026-11-17, `089ea43d`) | Partially implemented; one of three cases fixed | Added classifier examples in `askOperationSemanticPackages.ts`: "safety notices/alerts" now reach `RECALL_REVIEW` ("active safety notices for my appliances" scores 0.50 against 0.32 and resolves; before, recalls was not even a candidate), and scheduling examples lead `MAINTENANCE_TASK_CREATE`. **Finding:** `FAST_PATH_CERTIFICATES` is empty, so no regex rule is certified and every registry rule is demoted; editing a registry regex therefore does not change live routing, and the classifier's semantic examples and scores are what move it. **Not fixed:** "schedule gutter cleaning next month" ranks `MAINTENANCE_TASK_CREATE` first (0.49) but is within 0.10 of the next candidate, and "city approvals still needed for projects" (0.45) stays unresolved; permit examples were added then reverted because they moved `RENOVATION_PERMIT_READINESS` scores on sealed fixtures v2-024 and v2-057 and the calibration drift ratchet requires a deliberate re-derivation of the evidence rows. A stricter confidence gate for command and decision operations is suspected, not confirmed. The local skill-routing stage returns `UNSUPPORTED` outside production, so the live path that resolves other near-miss prompts was not reproduced. A 30-file routing and semantic-package set has 43 failing tests with and without this change (identical names). |
| Honesty wording: absence of data is not a finding (2026-11-17, `bde5631e`) | Implemented; unit-tested and typechecked only, not live-verified | In `crossDomainExecutor.ts`: (a) deductible: a policy with no recorded deductible was shown as "$0.00" because the loader converted a missing value to 0 cents; `deductibleRecorded` now carries whether one is recorded and a missing one is stated as not recorded; no policy reads "No insurance policy is recorded for this home, so no deductible can be determined"; several policies are all listed instead of only the first. (b) claim documents: "No missing claim documents" is split into no claims recorded, claims recorded but none listing required documents (so nothing was checked), and every listed requirement having a linked document, with a note for claims that list no requirements. (c) recalls: "No recalls affect visible inventory items" now states how many items were checked, how many have no model number recorded and cannot be matched (`modelNumber` added to the extended item record), and that it is not a guarantee that no recall exists; matches are called "recall matches to review" because unconfirmed matches are included. A 10-file cross-domain regression set has 3 failures with and without this change (identical). **Open from the same review, not done:** the combined coverage-gap answer for "protection coverage" (the grouped seller checklist, the "next month" window and the own-versus-rent wording are in the next row). |
| Presentation: month window, saved Sell/Hold/Rent wording, seller checklist (2026-11-17, `81701661`) | Implemented; unit-tested and typechecked only, not live-verified | In `crossDomainExecutor.ts`: (a) **Month window.** A calendar-month constraint ("due next month") is now stated in the answer ("due in December 2026 (the whole calendar month, in your home's time zone)") so it can be audited. A category question ("plumbing tasks due next month") previously returned before any time check and silently ignored the month; the window now applies to every branch (`FR-PLAN-5`). (b) **Saved Sell/Hold/Rent result.** The persisted analysis compares SELL (sell now), HOLD (keep the home to live in) and RENT (keep it and rent it out); the answer showed the raw token ("winner: SELL") and a signed dollar figure ("net owning advantage -$233,001.16", which is hold minus rent-out). Both are now said in words, and a sentence states that the saved analysis does not compare owning with renting a home as a tenant. That sentence is added only when the answer states the saved analysis' result: a persisted outcome that also has rent and home-value inputs is answered by the computed crossover model, whose figures are not the saved analysis', and carries no such note. The existing leading sentence ("Owning does not beat renting…") is unchanged because an existing test codifies it. **Open owner decision:** whether an own-versus-rent question should answer from the saved Sell/Hold/Rent analysis at all, since that analysis is not a tenant-versus-owner comparison; the answer now says so but still leads with it. (c) **Seller readiness.** The answer concatenated every open title into one sentence (73 in the live run). It now states the count, a breakdown by requirement class, the five most urgent titles and "N more below", and lists items grouped most urgent first (could block a sale, needs a professional's decision, needs checking, optional improvements, presentation) through a `groupKey` that the receipt helper now passes to the presentation adapter. The loader previously treated every status other than `RESOLVED` as pending, so `WAIVED` items (the homeowner decided to disclose rather than fix) were counted as still to finish; they are now excluded and called out separately, and `PURSUING` items stay open. `category` and `requirementClass` are now loaded. A 10-file cross-domain regression set has 3 failures with and without this change (identical). **Open from the same review:** a grouped, most-urgent-first seller answer does not yet offer "the complete checklist separately", and `category` is loaded but not yet used for grouping. |
| Tax-return boundary and unrecognized compare names (2026-11-17, `1a5d6be5`) | Implemented; unit-tested (7 tests, one end to end through the real data-point handler) and typechecked only, not live-verified | (a) **Tax filing (live #19).** "Prepare and file my itemized IRS tax return deductions for depreciation" returned `NONE_FITS` from both parsers and a clarification between two unrelated record views (`INVENTORY_LOOKUP`, `MATERIAL_SPECS_LIST` at 0.50 each, matched on generic words). `taxFilingRequestPattern` in `askOperationRegistry.ts` now routes a request that has both a filing verb and a return or form noun (tax return, IRS, 1040, Schedule A–E, itemized deductions, file my taxes) to `OUT_OF_SCOPE_BOUNDARY`, and never matches a message containing "property tax" because the property-tax appeal, assessment and bill reads are in scope; "does the IRS allow a deduction for solar" and "what is the capital gains tax if I sell" are not matched. The `boundary.out-of-scope` handler returns tax-specific copy (`TAX_PREPARATION_NOT_SUPPORTED`, aliased to `OUT_OF_DOMAIN` in `recoveryOutcomes.ts`) under the existing allowlisted block id `out-of-scope-boundary`: Ask cannot prepare or file a return or say what is deductible, which needs a tax professional, and offers only follow-ups verified to route (`HOME_RECORD_EXPORT`, `OWNERSHIP_COSTS`, `PROPERTY_TAX_APPEAL_READINESS`). The existing out-of-scope copy is unchanged for non-tax requests. No depreciation data or tax-summary feature is offered because none was verified. **Product decision still open:** how wide the tax boundary should be, since Cozy has some tax-related features. (b) **Unrecognized compare names (live #20).** "Compare Harbor and UnknownFakeBuilder" ended in the data-point reader's last-resort notice (`DATA_POINT_NOT_IDENTIFIED`), whose example ("the serial number of my refrigerator") is about something never asked, because the in-domain recovery in `FR-REC` needs verified subject evidence and two unknown names give none. `support/unresolvedCompare.ts` now recognises a "compare X and Y" request where both sides are short and neither points at the homeowner's own records (no leading my, our, the, this, these, those, both, all, any, each, every, a, an) and the handler answers `COMPARE_SUBJECTS_NOT_RECOGNIZED` under the existing block id `data-point-unidentified`: it did not recognize either name in the home records, compared nothing, and suggests two contractor quotes or two inspection reports or checking the spelling. It says "didn't recognize", never "doesn't exist", because a typo cannot be told from an unknown name. Other requests keep the previous notice. (c) **Manifest.** The fast-path rule manifest was stale after the 2026-11-17 gas-smell pattern change (`76ffa85f`); regenerating it with `node scripts/ask-fast-path-rules.js --write` corrected the emergency rule's hash and recorded the out-of-scope rule's new condition. A 45-file regression set has 30 failing tests of 433 with and without this change (identical). **Traced, not changed:** "show appliances lacking protection coverage" (`COVERAGE_GAPS` scores 0.80 against 0.59 but the typed grammar has no "lacking" or "protection coverage", and `COVERAGE_COMPARISON_STATUS` appears as a lexical-neighbour option), "schedule gutter cleaning next month" and "city approvals still needed for projects". The cascade deliberately refuses to let the classifier execute when a demoted regex rule also fired (`FR-FAST-3/7`) and requires the HIGH confidence band for a write or high-materiality operation, so these need a deliberate calibration change (a possible drift-ratchet re-derivation), not more examples. |
| Age filter and amount-comparison label (2026-11-17, `8c470661`, `9eef72fb`) | Age filter implemented and unit-tested (8 tests, one end to end through the real data-point handler); amount-comparison label implemented and unit-tested (5 tests, one end to end); both typechecked only, not live-verified | (a) **Age filter (live: "which appliances have no warranty or are older than 10 years?").** The prompt asked an abstract "neither … nor / either … or" question whose two buttons both carried `INVENTORY_ITEMS_READ` and submitted only that operation id, so the choice was discarded; the button labels were fixed strings ("warranty", "due maintenance") for every prompt; and "older than 10 years" was not understood by either parser, yet the clarification was raised with that condition unresolved, so either button would have dropped it. "Older than N years" and "more than N years old" (1-100 whole years) are now a typed condition: the plan schema is 1.5.0 with an optional `thresholdYears` on a registered predicate; `relation.inventory_item.age` (path `path.inventory_item.age`, predicate `predicate.inventory_item.older_than_years`, storage `InventoryItem.installedOn`) is registered in `semanticRelationRegistry.ts`, the slice relation set, the Wave 1 rollout manifest, the lexicon and both governance baselines (new `ATTRIBUTE_FILTER` (named `ATTRIBUTE_THRESHOLD` when first added, renamed in v1.18) state semantics); the drift snapshot is regenerated. The parser treats an age condition as restating its own predicate, so "no warranty or older than 10 years" is a plain either-or (the negation belongs to the first condition) and is no longer the ambiguous "no A or B" shape; negation attaches to the age condition only when it is the only condition ("not older than 10 years"); "neither … nor", "and" and an age alone work. The executor compares the recorded install date strictly before the same calendar day N years before the as-of date (exactly N years is not older). An item with no install date is evaluated both as old and as not old and is unknown when the two differ: it is not matched and is counted separately, never treated as "not old" (which would have matched every undated item for "not older than N"). The answer describes the condition tree in words ("Matching: no warranty linked in your home record, or older than 10 years (by recorded install date)") instead of describing only the warranty half, and says how many items have no install date. **Not supported:** "newer/younger than", ages in months, an age from a purchase date, "over N years old" (the live composite prompt "over 5 years old" is not matched), and the still-ambiguous bare "no A or B" (for example "no warranty or due maintenance"), whose card still has the dead-button defect above. Receipts stored under plan 1.4.0 will not replay. (b) **Amount comparisons (live: "show maintenance tasks due next month that cost more than $50").** The typed stack has no dollar-threshold condition, and the cross-domain builder's unresolved-word check skips every digit token and a closed-class word list, so the condition was dropped, `grammarComplete` stayed true and all tasks due next month were presented as the answer. `semantic/amountComparison.ts` detects a comparator followed by a dollar amount ("more than $50", "over $1,000", "at least $2k", "under 500 dollars"; never a time window such as "over 2 years" or a bare number); `dataPointRead.handler.ts` wraps the slice, cross-domain and quote typed-stack returns so an answered result says "Partial answer: I couldn't apply …, so this list is not filtered by it", gets "(not filtered by amount)" on its title, a caution tone and `READY_WITH_LIMITATIONS`; the receipt's block keeps its id so entailment still passes. A result that is not an answer is untouched. This is a containment, not the filter: maintenance `estimatedCost` and `actualCost`, claim type (`ClaimType.WATER_DAMAGE`) and inventory replacement cost exist in the schema, so these conditions are implementable. **Open (from the composite review):** the same closed-class list lets whole clauses vanish (an "open claims or pending permits" question returned claims alone with nothing unresolved), a room alternative under a negated relation ("missing receipts in the kitchen or laundry room") is wrongly asked as "neither … nor", and multi-domain "A or B" questions are not answered in one section per part. Regression comparisons: a 135-test semantic set and a 433-test registry set have 3 and 30 failing tests with and without these changes (identical names). |
| Room lists and unrecognized-words-first (2026-11-17, `28a2295c`) | Implemented; unit-tested (8 tests) and typechecked only, not live-verified | In `deterministicSemanticParser.ts` and `slice/sliceExecutor.ts`. (a) **The live prompt (#15).** "Show items with missing receipts in the kitchen or laundry room" asked an abstract "neither … nor / either … or" question about the two rooms. The room alternative was treated as the ambiguous "no A or B" shape because "missing" reads as a negation, but the negation belongs to the receipts; a choice of places is inclusive. The follow-up refinement path already read rooms that way; the main parser did not. (b) **A latent defect found while fixing it.** The grouped-room branch forced the top-level join to OR and the single-room branch applied the relation's negation to the room, so executed against the seeded home: "has a warranty in the kitchen or basement" returned all five items (expected: the two with a linked warranty), "no warranty in the kitchen" returned nothing (expected: the Dishwasher), and, once the question was removed, "no warranty in the kitchen or basement" also returned all five. A list of rooms ("kitchen or laundry room", and "kitchen and laundry room", which colloquially means either) is now one positive group; the "or" words between the rooms belong to the list, and only an "or" beyond them coordinates the conditions (and a negated bare "no A or B" is still the ambiguous shape, still asked); otherwise the conditions are all required, so "no warranty in the kitchen or basement" is no warranty AND in either room. "Neither a warranty nor in …" excludes the warranty and every listed room. A room is negated only when it is the only condition ("items not in the kitchen"). The same grouping applies when the other condition is an age comparison. Warranty states `UNKNOWN` and `CONFLICTED_LINKS` remain excluded from both "has" and "has no" answers, as before. (c) **Unrecognized words first (`FR-PLAN-5`).** The ambiguity question used to be returned before the unresolved-words check, so a question with an unrecognised part got a question about the part that was understood. Unresolved words are now reported first (`NONE_FITS`), and the ambiguity question is asked only when everything was understood. (d) **Answer wording.** Any answer with more than one condition now describes the whole condition tree in words ("Matching: no warranty linked in your home record and in Kitchen or Laundry Room."), a room list as one place phrase, and a group joined differently from its parent in parentheses; before, only the warranty half was described. **What #15 does now:** it no longer asks the wrong question; the typed stack does not understand "receipts" (the cross-domain stack knows document relations but not room names), so the prompt fails closed with the in-domain recovery that names what was and was not recognised. It is not answered. **Open:** missing-document conditions ("missing receipts or manuals") are not available to the typed stack, which would need the receipt and manual relations in the slice registry, the item document ids in the slice snapshot and a parser atom, and care not to take "neither a manual nor a receipt" away from the cross-domain path that answers it today; the cross-domain stack has no room names. A 568-test semantic and registry set and a 246-test routing set have 33 and 43 failing tests with and without this change (identical names). |
| Claim type filter, "over N years old", fire/smoke emergency gate (2026-11-17, `b2da3a45`) | Implemented; unit-tested (9 tests in `claimTypeFilter.test.js`, one end to end through the real handler; 1 added to `inventoryAgeFilter.test.js`) and typechecked only, not live-verified; the emergency-gate change awaits owner review | (a) **Claim type (live: "show open claims that are related to water damage").** "Show open claims for water damage" parsed as a complete plan (nothing unresolved, `grammarComplete` true) for `predicate.claim.has_status = OPEN` alone: "water damage" was recognised as a lexeme that only the claim-document job used, so the type was dropped and every open claim was listed. `Claim.type` (`WATER_DAMAGE`, `FIRE_SMOKE`, `STORM_WIND_HAIL`, `THEFT_VANDALISM`, `LIABILITY`, ...) is now a predicate, `predicate.claim.has_type` on `relation.claim.self`, with its governance entry and a regenerated drift snapshot (13 new lexemes). The claim facet in `crossDomainPlanBuilder.ts` now covers status and/or type: "open claims related to water damage" is open AND water damage, "water damage claims" applies the type to every status, and "related" is a closed-class word. Claim-type words are water damage, fire or smoke, storm, hail, wind, theft, vandalism, burglary and liability; plumbing, electrical, HVAC and appliance are deliberately not claim-type words because they are ambiguous next to maintenance questions. The type value is carried in the plan's string-valued `enumStatus` parameter. The claim-list executor in `crossDomainExecutor.ts` previously ignored `facet.where` and always listed open claims; it now applies the plan's status and type conditions, says the answer is by the type each claim was filed under, and counts a claim with no recorded type apart instead of guessing it into a type. Plain "open claims" is unchanged and claim-document questions are not taken by the claim list (both pinned by tests). `Claim.type` is loaded from the database. (b) **"Over N years old" (live composite prompt, "… are over 5 years old").** The age phrase also matches "over N years old"; a bare "over N years" stays a duration and is not an age. (c) **A false emergency found while doing this (pre-existing).** `EMERGENCY_SAFETY_PATTERNS` in the cross-domain builder treated the bare words "fire" and "smoke" as an emergency, so "show open fire claims", a smoke-detector maintenance question or "Smoke & CO detector check" was answered with the emergency card, and the home's own "Fire or smoke claim" could not be asked about. Fire and smoke now count only when they describe something happening: "on fire", "there is a fire", "fire right now", "fire in the kitchen/house/…", "I smell smoke or burning", "smoke is coming/pouring/filling", "the house is filling with smoke" and "smoke alarm going off". Nine real emergency phrasings are pinned as still caught by the cross-domain gate, and the registry's own safety stage catches most of them independently; "sparks", "arcing" and "electrical fire" are unchanged. **This is a safety-pattern change and is unreviewed by the owner.** Known residual: a fire or smoke emergency worded in a way none of these patterns names will no longer be caught by the cross-domain gate on the single word "fire" or "smoke" (the registry stage still applies). Regression comparisons: a 568-test semantic and registry set, a 246-test routing set and a 647-test set of every test that mentions emergencies, smoke, fire or boundaries have 33, 43 and 57 failing tests with and without these changes (identical names). **Open:** maintenance cost thresholds (`estimatedCost` and `actualCost` exist) and a "completed" task status are not supported by either parser, so "which completed maintenance tasks cost over $1000?" still fails closed; an inventory replacement-cost threshold and "high failure risk" are likewise unsupported (the latter needs a product definition of "high"); the dropped second clause of "open claims or pending permits" and one-section-per-part answers for "A or B" across domains. |
| Multi-domain "or" and unanswered parts (2026-11-17, `3df7ee38`) | Implemented; unit-tested (7 tests, one end to end through the real data-point handler) and typechecked only, not live-verified | In `crossDomainPlanBuilder.ts` and `crossDomainExecutor.ts`. (a) **The live prompt (#3 of the composite review).** "Are there any open claims or pending permits for this home?" answered the open claims and nothing else, with nothing unresolved: the builder split a compound question only on commas and "and", so an "or" stayed inside one clause, the first domain's job (claims) was compiled, and the other part was ignored without a word, so "no permits" could be read into a claims-only answer. "Show open claims or open projects" behaved the same. (b) **The split.** An "or" between parts about different domains is now two questions. Domains are grouped as claim (claim, claim document), project (project, permit), recall, quote, buyer task, maintenance task, warranty, insurance policy, inspection finding and environmental risk; generic words are deliberately not families (the word "home" is an alias of the listing entity and would have made every "for this home" question two-domain, and rooms, items and tax say nothing about which domain was asked about). The parts are split only when every part names a domain and the parts' domains are pairwise different; an "or" inside one domain stays a condition ("no warranty or older than 10 years", "open claims or water damage claims"). (c) **Partial answers.** Previously one uncompilable clause failed the whole question (`NONE_FITS`). In a question of several parts, a part that cannot be answered is now recorded as a `DOMAIN_NOT_SEARCHED` overflow facet and the other parts are still answered; only when no part can be answered is the question not understood. This also changes the "and" case: "open claims and pending permits" now answers the claims and names the permits part (it failed outright before). (d) **Plain-language note.** The answer carried a developer string ("Overflow (facet-2:DOMAIN_NOT_SEARCHED)") that reached the homeowner; it is replaced by "I couldn’t answer “pending permits for this home” here, so that part isn’t included in this answer", and a single answered section carries the note on its own summary with the title suffix "(partly answered)", a caution tone and `READY_WITH_LIMITATIONS`; the receipt-bound block keeps its id so entailment still passes, and a test pins that no developer text reaches the homeowner. The structured `overflowFacets` record keeps its reason code. **Not supported (named, not answered):** permit records and an open-projects list have no typed job (the only permit job is "projects that need a permit"); a one-tap follow-up question for the unanswered part is not offered. One answered facet is not given a section per part; each answered part is a section, an unanswered part is a sentence. A 568-test semantic and registry set, a 246-test routing set and a 647-test safety and boundary set have 33, 43 and 57 failing tests with and without this change (identical names). |
| Clarification-card audit and contract (2026-11-17, `266394ab`) | Step 1 of 4 implemented; unit-tested (7 tests in `clarificationContract.test.js`) and typechecked only, not live-verified; two defects found and not yet fixed | **How a card works.** A card's buttons send only an `operationId`; the backend accepts it if it is in the stored `parameters.clarification.candidateOperationIds`, forces that operation and re-runs the original message (`execution/askClarification.ts`), and the frontend card uses the operation id as its React key (`CaptureCards.tsx`). So two options with the same operation id are one choice shown twice, and the label the user read is discarded; a card whose result has no stored clarification (version, expiry, candidate operations) is buttons that fail with "This clarification is no longer active"; and a card never has exactly one option (`FR-REC-1`). **Audit.** Executed over 142 messages (the 129 routing certification fixtures plus the live prompts that clarified) and all 228 operations: the routing "What would you like to focus on?" cards (17 produced, 3 options each) have no repeated operation, label or handler; the 228 operations have 228 distinct card labels and no two share a handler (`adapterKey`), so distinct operation ids are distinct actions. Read from the code: the did-you-mean card, the answer-relevance card and the correction card dedupe by construction, the composed-turn inline questions dedupe in `clarificationOptionsFor`, free-text clarifications (`durableFreeTextClarification`) have no options, and entity and property pickers choose between distinct records. **Defects (executed).** (F1) The slice "no A or B" card (`sliceExecutor.ts`, for example "which appliances have no warranty or due maintenance"): both options are `INVENTORY_ITEMS_READ` (one distinct action for two buttons), the labels are fixed strings ("warranty", "due maintenance") for every prompt, the schema accepts the card as valid, and the result's `parameters` carries no `clarification`, which nothing fills in, so pressing a button would throw "no longer active" (read from the submit and persistence code; not run through the database). (F2) The cross-domain clarifications (`AMBIGUOUS_NEGATIVE_COORDINATION`, for example "which appliances have no manual or receipt"; `AMBIGUOUS_QUOTE_SELECTION` and `UNRESOLVED_FOLLOW_UP_INPUT` are read from the code and were not triggered): the result is `NEEDS_CLARIFICATION` but carries no card; the options are two plain strings inside a differently shaped object with no version, expiry or candidate operations, so the user can only retype. **Why the contract allowed it.** `AskClarificationSchema` has no uniqueness rule, `candidateOperationIds` is stored separately from the options and matches them only by convention, `routingClarificationResult` relies on the cascade for uniqueness, and an operation-id payload cannot express two different meanings of one operation, which is why F1 was written with identical ids. **Step 1 (implemented).** `support/clarificationContract.ts` defines the contract: distinct effective actions (`effectiveActionKey`: the operation id plus a hash of any typed payload, none today, so two options with the same operation and different payloads are distinct), distinct labels, never one option, a stored clarification that exists, matches the card's version and expiry and covers every option's operation, and a `NEEDS_CLARIFICATION` result always carries a card. `enforceClarificationContract` runs where a fresh execution is stored (`createAskExecution.ts`): duplicate options (or labels) collapse, a lone option becomes a free-text question, the stored clarification is written or corrected, and a warning is logged, so a violating card degrades to a free-text question instead of dead buttons (the F1 card now shows a plain question without its two buttons, which never worked). The repair does not cover the answer-after-clarification resume path or the feedback correction card, and it does not repair a result with no card (F2). `clarificationContract.test.js` pins the rules, the repair and its idempotence, runs every producer I can run against the contract (routing cards from the fixtures, did-you-mean, free-text), pins F1 and F2 as an exact known-defect list that may only shrink (fixing one makes its assertion fail until the entry is removed), and a structural guard fails if any file other than the seven audited ones starts building cards (`allowFreeText`). **Remaining steps, owner-approved order:** (2) rebuild the F1 card with typed payloads: each option carries a resolved plan run through the existing `planOverride` mechanism, not retyped text, with labels built from the user's own words; (3) turn the F2 clarifications into real cards; (4) the frontend stops using the operation id as the React key and sends the typed payload. A 953-test clarification and execution set, a 568-test semantic and registry set and a 246-test routing set have 106, 33 and 43 failing tests with and without this change (identical names). |
| Clarification cards, step 2: the "no A or B" card with typed readings (2026-11-17, `29103e12`) | Implemented; unit-tested (11 tests in `clarificationContract.test.js` including one end to end through the real data-point handler, 4 frontend tests in `clarificationCardPayload.test.tsx`) and typechecked, `next build` passes; not live-verified; the submit path is exercised through the handler and the pure resolver, not through the database | **The old card had a third defect.** Besides the duplicate action and the missing stored clarification (v1.20), its operation id `INVENTORY_ITEMS_READ` is not in the operation registry at all, so pressing a button could never have worked. **The rebuilt card.** For a bare "no A or B" over warranty and maintenance (for example "which appliances have no warranty or due maintenance") the card asks "Your question can be read two ways. Which do you mean?" with two buttons whose labels are built from the two conditions in the order the homeowner named them: "Items with no warranty, and items with maintenance due" and "Items with no warranty and no maintenance due" (reversed order gives "Items with no maintenance due, and items with a warranty" and "Items with no maintenance due and no warranty"); no "neither/nor/either" wording appears. A question whose shape cannot be labelled safely (a room is also named, or the conditions are not warranty and maintenance) is asked as a plain free-text question with no buttons. Both options run `DATA_POINT_READ`; they differ by a typed payload. **Typed payloads (contract).** `AskClarification` options gain an optional `optionId`; `SubmitAskClarification` gains `optionId`. The payload (`BOOLEAN_READING` with `reading` = `EITHER_OR` or `NEITHER_NOR`, a closed set validated by `ClarificationOptionPayloadSchema`) is kept on the server in `parameters.clarification.candidateOptions` and never sent to the client, which sends only the option id; the client cannot supply a payload. `effectiveActionKey` includes the payload, so two options with the same operation and different payloads are distinct (and the contract still rejects two that are the same). `buildPayloadClarification` builds such a card so the contract holds by construction (it throws on a card that would violate it), and `resolveClarificationChoice` decides on the server what a press means: a typed option is found by its id, a bare operation-id press is refused when typed options share that operation, and an unknown payload kind is never accepted. **Running the choice.** The submit step passes the chosen reading to the operation as `suppliedInput.clarifiedReading`; the data-point handler and `capabilityInvoke`'s own pre-handler semantic dispatch (which parses the message before the handler does and re-asked the question until it was told the reading) both validate it with `clarifiedReadingFrom` and re-apply it to the ORIGINAL message through the parser (`coordinationReading`), so the answer is computed on current data and no plan is stored. Under EITHER_OR the negation belongs to the condition named first and the other stands on its own; under NEITHER_NOR every condition is excluded. **Eligibility.** For an owner-occupied home `DATA_POINT_READ` is not audience-discoverable, so the generic option check would have rejected the button for the normal case; the check is waived only for a server-authored typed option whose operation equals the operation the execution already ran (re-running it grants nothing new), and the operation's own authorization still applies. **Frontend.** The clarification card sends the option id when an option has one (otherwise the operation id, unchanged) and keys its buttons by it, so two buttons that run the same operation no longer collide. **Behaviour change found while verifying (affects results that were pinned).** "Neither a warranty nor …" was built as NOT(has a warranty), which counted an unknown or conflicted warranty state as "no warranty": the seeded Sump Pump (conflicting links) matched "neither warranty nor due maintenance". It is now built from explicit negations (`has_no_warranty_record`, `has_no_due_maintenance`, NOT of a positive predicate for rooms, age and overdue) joined with AND, so unknown and conflicted states are not counted either way, consistent with every other warranty answer and the owner decision on unknown records. Two existing tests and the slice invariant suite expected the Sump Pump with no stated reason (they recorded the observed behaviour); they now expect the Dishwasher only, with a comment, and one test of this work that pinned the old tree shape was updated. This changes "neither" for typed prompts generally. **Verified by test (hand-computed on a four-item home):** either-or returns the Dishwasher, Furnace and Washer; neither-nor returns the Dishwasher and Washer; an unknown reading is ignored and the question is asked again; the repair at storage time leaves a valid card alone; the known-defects list now holds only the cross-domain question. **Remaining, owner-approved order:** (3) turn the cross-domain clarifications (`AMBIGUOUS_NEGATIVE_COORDINATION` for "no manual or receipt", `AMBIGUOUS_QUOTE_SELECTION`, `UNRESOLVED_FOLLOW_UP_INPUT`) into real cards using the same payload mechanism; (4) audit the remaining cards against the contract (the frontend key and payload are done). Not covered: the repair does not yet run on the answer-after-clarification resume path or the feedback correction card; the labels are built for warranty plus maintenance only. A 246-test routing set has 43 failing tests with and without this change; the 953-test clarification and execution set, the 568-test semantic and registry set and the 647-test safety set were re-run after the pinned expectations were updated (results recorded when they finish: all three came back identical to their baselines, 953 tests with 106 failing, 568 with 33 and 647 with 57). |
| Clarification cards, step 3: cross-domain clarifications become real cards (2026-11-17, `e7f79314`) | Implemented; unit-tested (8 tests in `crossDomainClarificationCards.test.js`, including one end to end through the registered data-point handler against a fake database; `clarificationContract.test.js` now has an empty known-defects list that it asserts may not grow) and typechecked; not live-verified; the submit step and database round trip are not run; quote pairs tested on constructed data only | **What was wrong.** The cross-domain clarifications produced no card: the result carried a differently shaped object in `parameters` and two internal strings (`MISSING_EITHER_DOCUMENT`, `MISSING_BOTH_DOCUMENTS`) as "options", with nothing to press. **"No manual or receipt".** The card now asks "Your question can be read two ways. Which do you mean?" with "Items missing a manual or a receipt (at least one)" and "Items missing both a manual and a receipt". Each carries a typed `DOCUMENT_MISSING` payload (`mode` = `EITHER_MISSING` or `BOTH_MISSING`), its own kind rather than a reuse of `BOOLEAN_READING`, because here "either" means no manual or no receipt (the negation applies to both), not the asymmetric either-or of step 2. The parser takes the chosen mode and builds explicit negations joined with OR or AND, so a missing document is never confused with an unknown one; once the mode is chosen the question is not asked again. **New capability.** The manual/receipt branch of the executor used to filter on "both missing" whatever the plan said; it now evaluates the plan's conditions. "At least one missing" answers "N inventory item(s) are missing a manual, a receipt, or both"; "both missing" keeps the existing "neither a manual nor a receipt" answer, unchanged. Single-document phrasings ("missing a manual", "no receipt" alone) are still unsupported: that is the typed document predicates of the approved order. **Quote selection.** When exactly three quotes match, the card offers the three pairs, each labelled with both contractors and their amounts and carrying a typed `QUOTE_PAIR` payload of two ids; the ids are resolved against the property's own quotes when the comparison runs, so ids from elsewhere compare nothing, and the same id twice is not a pair. With more than three candidates, or when two pairs would read identically (the same contractor and amount), the card is a plain question with no buttons ("Tell me the two contractors, for example …"), written with a stored clarification so an answer can be accepted. **Contract.** `ClarificationOptionPayloadSchema` gains `DOCUMENT_MISSING` and `QUOTE_PAIR`; `suppliedInputFromPayload` is the one server-side mapping from a stored payload to supplied input (`clarifiedDocumentMode`, `clarifiedQuoteIds`), validated on the way in by `clarifiedDocumentModeFrom` and `clarifiedQuoteIdsFrom`; `buildFreeTextClarification` builds the no-button card. The stored `parameters.clarification` is now the card's (what a press is checked against); the raw cross-domain clarification stays inside `parameters.crossDomainExecution.clarification`, and one existing test that read the old location was updated. The reason code `UNRESOLVED_FOLLOW_UP_INPUT` was removed: nothing produced it. **Verified by test (hand-computed on the seeded home: Furnace has neither document, Water Heater a manual only, Dishwasher both):** at least one missing returns Furnace and Water Heater, both missing returns Furnace, an unknown mode is ignored and the question is asked again, a chosen pair compares exactly those two quotes. **Regression comparisons against baselines.** The 568-test, 246-test and 647-test sets were identical with and without this change (33, 43 and 57 failing). The 953-test set showed one extra failure, the test that read the old `parameters.clarification` location; it was fixed and the file re-run (30 tests passing across the three affected files), and the full set was not re-run afterwards. **Remaining, owner-approved order:** (4) audit the remaining cards against the contract. Not covered: the repair does not yet run on the answer-after-clarification resume path or the feedback correction card. |
| Composition note no longer added to a complete typed answer (2026-11-17, `54776967`) | Implemented; 3 new tests in `compositionNotices.test.js` (8 pass), `tsc` clean; a 5-file composition and routing set (64 tests) has the same 5 failures with and without the change; not live-verified; `createAskExecution` was not run end to end | **What was wrong (executed probe).** For "which kitchen appliances have no warranty and are over 5 years old?" the typed slice builds one condition (no warranty AND kitchen AND older than 5 years), with nothing unresolved, and answers it. Separately, `decomposeForComposition` splits "…and are over 5 years old" into two clauses; the age clause does not route to a known read alone, so the decomposer returns `NOT_COMPOSED` (`CLAUSE_NOT_COMPOSABLE`), and `createAskExecution.ts` appended the FR-DEC-4 note ("Part of your question isn't answered here… Ask the other part on its own") whatever the answer covered. The homeowner was told a part was missed when it was not. The same prompt joined with "or" is a single clause and never had the note. **The fix.** `typedAnswerCoversWholeMessage` (in `composition/notices.ts`) is true only for an `ANSWERED` result that carries a semantic read receipt (the slice answers only when no word is unresolved) or whose cross-domain execution is `ANSWERED` with no overflow facets; the note is skipped in that case. A `PARTIAL` cross-domain answer names its own gap and keeps the note; legacy operations, clarifications and unsupported results are unchanged. **Limits.** The probe used a hand-built eligible-operations list, so the live reason code may differ (the fix does not depend on it). A typed answer that is `ANSWERED` with a receipt but covers only part of the message would now skip the note; no such path was found, since both executors report their own gaps. **Open from the same review, not fixed:** (a) clarification cards whose options do not relate to the prompt (#4, #8, #12, #14, #15, #18): a relevance gate is proposed; (b) refuse-versus-partial is inconsistent for unsupported filters (#2 and #13 answer partly, #9, #17 and #20 refuse), and refusal headlines such as "I need a clearer question" describe capability gaps wrongly; (c) #16 is refused whole (`NONE_FITS`, executed) although "open claims" is answerable; (d) #3's live headline ("2 open claims.") does not match the typed answer's wording, so it may have come from `INCIDENT_CLAIM_STATUS`, which may not mention permits (needs the live block text); the typed answer does name them as not searched; (e) draft claims are counted as "open" (owner decision); (f) #13's headline does not carry its not-filtered caveat. |
| Relevance gate for clarification cards (2026-11-17, `40bf61ab`) | Implemented; 7 new tests in `clarificationRelevance.test.js` plus the existing `didYouMean.test.js` pass; the 6 card test files (80 tests), the 246-test routing set and the 953-test execution set have the same failures with and without the change (8, 43, 106); `tsc` clean; not live-verified; calibration drift ratchet not run | **What was wrong.** "Did you mean one of these?" (`support/didYouMean.ts`) and "What would you like to focus on?" (`routingClarificationResult` in `createAskExecution.ts`) offered the router's nearest operations. Nearest is not related: in the third live run six of twenty prompts (#4, #8, #12, #14, #15, #18) were offered options the homeowner could not connect to their words ("missing receipts in the kitchen or laundry room" was offered insurance-policy facts and claims). **The gate** (`support/clarificationRelevance.ts`, pure, no model). A lookup option is offered only when the message shares at least one *distinctive* word with that operation's own vocabulary (intent description, supported jobs, positive examples, taken from the registry, so a new operation is covered without editing a list). A word is distinctive when it is not generic ("show", "items", "and", "have", months and similar) and appears in at most 20 of the 231 operations' vocabularies. The gate runs before the three-option limit, so an unrelated first choice no longer uses a slot. **Safeguards.** (1) A message with no distinctive word, or one that shares a word with no candidate, is not judged and nothing is removed, because the gate cannot tell a paraphrase ("chores", "fridge") from an unrelated option. (2) Write operations are exempt: a write is chosen by its verb and what it acts on ("the water heater") is an argument, not part of the operation's vocabulary; the first version dropped the work-update write for "I replaced the water heater last week" and broke an existing test. Writes are still offered only for command wording (unchanged). (3) The upgrade-goal question is not filtered (its options are goals). (4) When the gate leaves one option, the card is a free-text question that names it ("Did you mean to ask: …?" / "This sounds like it is about …") rather than a lone button, because the clarification contract allows no options or at least two. **Measured on the 581 routing-corpus prompts that reach a card (executed, local router).** Options shown fell from 1,581 to 1,305 (257 wrong options removed, about 22% of the wrong ones); the correct option stayed in 405 of the 419 cases where it was offered and was removed in 14 (3.3%), mostly vocabulary gaps ("fridge", "chores", "big repairs"), several of them cases where a wrong option that shared one word was kept; 132 cases are left with fewer than two options and become named-option questions. Every card still allows free text, so none becomes a dead end. Threshold choice: 12 removes about a third of the wrong options but loses the correct one in 22 cases (5.3%); 20 was chosen, and 30 changes nothing over 20. **Limits.** The gate is lexical: it cannot remove a wrong option that shares a word with the prompt (the recall option for "seller readiness items that involve appliances" shares "appliances"), and it does not fix a prompt whose right operation is not among the candidates. Of the six live prompts only #4 and #15 were run through the gate offline (the claims option is dropped, the document options stay); #8, #12, #14 and #18 were not. **Remaining from the same review:** refuse-versus-partial consistency and refusal headlines; #16 as a partial answer; #3's live text; draft claims counted as "open"; #13's headline caveat. |
| Honest refusal at the typed-grammar agreement gate; why a blanket partial-answer rule is not buildable yet (2026-11-17, `c7a8375e`) | Implemented; 4 new tests in `unmatchedWords.test.js`; `tsc` clean; the 953-, 568- and 647-test sets have the same failures with and without the change (106, 33, 57); not live-verified; that the live prompts reach this gate was traced in code, not reproduced (skill routing cannot run locally) | **What was wrong.** When the legacy data-point reader's agreement gate declined a read (`DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED`), the homeowner saw the headline "I need a clearer question" over "I could not verify the target entity and projection independently". The question was clear; the capability was missing, so the headline sent people to rephrase a well-formed question (live #9, #17 and #20 are of this kind). **The fix.** `support/unmatchedWords.ts`: the headline is "I can't answer that as asked", and the body names the phrases that could not be matched, taken from the typed parser's own unresolved spans plus any amount comparison (which the typed stack cannot apply): adjacent unresolved words are merged ("licensed professional"), at most three phrases are shown in the order written, and a span that covers most of the message is not named. Example, live #9: "I couldn't match “completed” and “over $1000” to anything I can look up in your home record, so I didn't run this and haven't guessed. Ask it without those parts, or ask the parts one at a time." When nothing can be named the copy is generic and still true. The reason code and block id (`data-point-semantic-agreement-required`) are unchanged. **Finding: a blanket "run what is clean, name the gap" rule is not buildable yet (executed probes on the seeded home).** For #9, #16, #17, #19 and #20 the typed stack returns `NONE_FITS` because words are unresolved ("completed", "estimated", "scheduled", "licensed professional", "failure risk"), and removing the unresolved words does not leave an answerable question: "which maintenance tasks cost over $1000?" is still `NONE_FITS` (the typed stack has no cost field for tasks), and so are "estimated replacement cost" and "scheduled". #2 works only because its qualifier (an amount comparison) is caught after the fact. Turning these refusals into partial answers therefore needs the per-capability filters already on the approved order (completed status and cost thresholds for maintenance with the owner's semantics, typed permits, failure risk once defined), not a generic rule; a generic strip would also need a polarity guard ("unapproved" in #5 would flip the meaning to a superset). **Not changed.** The answer-trust validator's headline "I'm not sure that answers your question" (#5, #19, #20) is a different mechanism for a prepared answer that could not be verified, and is accurate there; #16 (claims half answerable, inspection half not) and #3 (permits disclosure, needs the live block text) are separate; draft claims counted as "open" and #13's headline caveat remain open. |
| Maintenance filtered by season and professional requirement (2026-11-20, `763e67e4`) | The maintenance read applies a `next/this/coming <season>` due-date window (spring Mar–May, summer Jun–Aug, fall Sep–Nov) and no longer also keyword-matches the season in task text. A question that also asks for a licensed-professional filter (not recorded on a task) says so, offers the season read first, then due and all tasks. Unit-tested in `maintenanceSeasonWindow.test.js` and `answerRelevanceRecovery.test.js`; `tsc` clean; not browser-verified. Open: the dishwasher-routing test in `answerRelevanceRecovery.test.js` fails, not confirmed pre-existing. |
| Empty furnace comparison offers a way to create the option (2026-11-20) | An owner asking to compare furnace options with none saved now sees "You haven't saved any furnace or HVAC options yet, so there is nothing to compare" (return-on-investment sentence only when asked, no "planner" wording) and two buttons: "Compare repair vs replace for my furnace" (`HVAC_DECISION_START`, id `hvac-decision-start`, allowlisted for `HOME_UPGRADE_SCENARIOS`) then "Show all saved upgrade options". Non-owners get only the second. Unit-tested in `homeUpgradeScenariosCapabilitySlice.test.js`; the same file has 3 routing/registration failures (GROUNDED_GUIDANCE vs HOME_UPGRADE_SCENARIOS, source-scan relevance reasons) that this change does not touch, not confirmed pre-existing on a clean tree; not browser-verified. |
| Recall-and-warranty answer withheld when appliances lack model numbers (2026-11-20) | "show appliances that have open recalls and no active warranty" routed correctly but its "Recall check incomplete" answer was blocked as `ANSWER_FAVORS_DIFFERENT_OPERATION`, because `WARRANTY_LOOKUP` had only a source-scan contract and the text-similarity check read the recall wording as another operation. `WARRANTY_LOOKUP` now has real-path evidence (`realPath.warrantyLookup.test.js`: combined, check-incomplete, none-matching, list, empty) and the regenerated manifest, so the runtime contract accepts those variants; the test also runs the check-incomplete answer through the answer-trust pipeline. Reproduced with fixtures, not the owner's data. Item-level variants (`warranty-item-*`, `warranty-evidence`) are not driven yet, so they still fall to text similarity. `answerContractManifest.test.js` (coverage-shape assertion) and one `warrantyLookupCapabilitySlice` routing test fail; neither involves this change, not confirmed pre-existing on a clean tree. |
| Quote comparison with a named scope and licence numbers (2026-11-20) | "compare kitchen quotes and show contractor license numbers" ended in "I'm not sure that answers your question" plus a "part of your question isn't answered" note. The review now shows the comparison whose category or scope matches the named scope (not only the latest); when none matches it shows the latest and says "None of your recorded comparisons is for kitchen, so this is the most recent one.", which the grounded delivery check accepts because the answer states what it read. "show contractor license numbers" after a quote comparison is covered by the whole operation (`wholeOperationCoversLaterClauses`), so no unanswered-part note. Tested in `quoteReviewStrip.test.js` (2 new tests pass). The same file has 3 failures (extra `quote-review-outcome-sharing` block, a relevance reason code, create-workspace routing) that also fail on a clean checkout of the prior commit. The cause of the owner's "not sure" block is inferred from the code, not reproduced on their data; not browser-verified. |
| Emergency gate misses and gas wording (2026-11-17, `3bf46290`) | Implemented; unit-tested (4 tests pinning 19 emergency and 10 ordinary phrasings on both gates) and typechecked only, not live-verified; the wording awaits owner confirmation | (a) **Documented misses.** An external review of the v1.18 narrowing supplied paraphrases; run against the code, five were caught by neither gate (the cascade fell to `REMOTE_FALLBACK` and the cross-domain parser returned `NONE_FITS`): "I smell something burning", "the alarm is going off", "the room is filling with smoke", "there are flames" and "I can see flames in the kitchen". "The room is filling with smoke" was caught before the v1.18 narrowing (by the bare word "smoke"), so that one was a regression introduced by it. "Fire right now" was caught only by the cross-domain gate. All are now caught by BOTH the registry's emergency pattern (the routing cascade's safety stage; the fast-path rule manifest is regenerated) and `EMERGENCY_SAFETY_PATTERNS` in the cross-domain builder, so a phrasing one gate misses is still caught by the other: burning smells ("something is burning", "smell something burning/burnt"), "filling or full of smoke" with any subject, "there are/I can see flames" and "flames coming/spreading", an alarm or smoke/fire/CO detector "going off, sounding or blaring", and "fire right now". `emergencyParaphrases.test.js` asserts every emergency phrasing trips both gates and ordinary questions that only mention fire, smoke, a flame or an alarm (a fire claim, a smoke-detector task, "does my alarm system have a warranty", "flame retardant") trip neither. **Known residual:** a phrasing none of the patterns names is not caught on the single word "fire" or "smoke"; patterns are extended only from documented misses. A generic "alarm going off" now raises the emergency card, including for a security alarm; that is accepted. (b) **Gas wording (`support/emergencyBoundary.ts`, the one source for the registry handler and the cross-domain boundary).** The answer now reads: leave the home right away if you can do so safely and take everyone with you; while inside or near the building do not use switches, lights, appliances or other electrical devices, do not use a flame, and do not use a phone; do not start a vehicle or use a garage-door opener in an attached garage; from outside and away from the building call 911 or the local emergency number, and the gas utility's emergency line if gas was smelled; do not try to find or fix the cause and do not go back in until responders say it is safe. It now names electrical devices and switches and the garage-door opener. **Owner decisions recorded 2026-11-17 on the review follow-ups:** (1) an own-versus-rent question is answered only from the computed own-versus-tenant-rent model and otherwise says the saved Sell/Hold/Rent analysis cannot answer it (not yet implemented; the pinned test is to be updated); (2) routing calibration is approved as targeted vocabulary changes with deliberate row re-derivation, operation by operation with before and after fixtures, keeping the HIGH confidence band for writes and not relaxing the gate globally; (3) clarification cards: every option carries a distinct executable payload (a typed intent plus resolved arguments), card construction is rejected when two options would serialise to the same effective action, backed by a contract-level test, and every existing card is audited (not yet implemented; the known defect is that the card submits only an operation id and options sharing an operation id are indistinguishable); (4) the fire/smoke gate stays narrowed with defense-in-depth fixtures, extended only from documented misses; (5) the tax boundary stays narrow and is defined by activity (preparing, completing, filing or representing on a return or IRS form, and definitive personalised entitlement claims), not by the word "deduction"; (6) typed permit queries, maintenance filters (completed status and cost thresholds with `actualCost` else `estimatedCost` labelled as estimated, a missing cost unknown and never zero, and strictly greater than the stated amount), and typed missing-receipt and missing-manual predicates are approved, with room lists joined by "or" inclusive; (7) "high failure risk" stays unimplemented until the owner defines the score source, cutoff, missing-date handling and whether recalls or condition influence it; until then the replacement-cost filter applies and the answer says failure risk cannot be evaluated; (8) the global typed-agreement gate is deferred behind the order: clarification payloads, maintenance and document filters, typed permit queries, a typed plan and receipt for recall and warranty, the invoice filter when records exist, then reassessment; (9) every answer should record which conditions were applied, unsupported, unknown because of missing data, or omitted after explicit user confirmation (a predicate-level receipt; not yet designed). |
| `IN_DOMAIN_NOT_UNDERSTOOD` recovery (`§15`, `FR-REC`) | Implemented for the data-point/semantic entry dead end; not yet raised from every unresolved path | `recovery/inDomainNotUnderstood.ts` assesses a message with the generated shared lexicon (`collectCrossDomainRecoveryEvidence`) and, only when a specific registered entity/field/relation/category is verified (generic words such as `home`/`things` do not count), returns a `READY_WITH_LIMITATIONS` card that names the verified subject and any unrecognised homeowner words, offers at most three materially distinct questions Ask answers today (round-robin across areas; a test proves each still parses to a validated plan), and asks one focused question. It shows no home facts and no actions. It is its own `COVERAGE_DEFECT` code in `RECOVERY_OUTCOMES` (`ASK_RECOVERY_IN_DOMAIN_NOT_UNDERSTOOD`), counted in `ask_recovery_outcome_total`, and is accepted by the source-authorization and provisional-read limitation registries. Wired at the `DATA_POINT_NOT_IDENTIFIED` dead end in `dataPointRead.handler.ts`, which also covers `GROUNDED_GUIDANCE` turns promoted by the semantic entry dispatcher. Messages with no verified subject keep the generic reply. Each occurrence increments `ask_understanding_coverage_gap_total{kind,area}` (bounded area id only; never message text, spans or record ids) so a per-area `IN_DOMAIN_NOT_UNDERSTOOD` rate can be reported against that area's turn count (`FR-EVAL-3 #32`); the evaluation harness does not yet report it. The legacy `GROUNDED_GUIDANCE` remote-fallback path is not connected. §19 #21 unsupported-demand (`CAPABILITY_ABSENT`) telemetry is still open: `CAPABILITY_ABSENT` is reserved for a deterministic or human-labelled absence and no detection rule exists yet. |
| Canonical plan contract | Implemented foundation | `semanticRequestPlan.ts`, schema version `1.4.0` (adds the `ELAPSED_WINDOW` time constraint), defines the common deterministic/provider plan envelope, bounded facets, source spans, target kinds, projections, polarity and a recursive typed `WHERE` contract. Facet validation requires registered subject/relation/target/predicate agreement and a two-way match between declared data-query relations and `WHERE` predicates. Plan validation also requires unique stable facet ids, in-plan dependency references and an acyclic dependency graph. |
| Shared semantic lexicon | Implemented for the Phase 1 cross-domain basic-read subset | `sharedSemanticLexicon.ts`, version `phase1-subset-1.3.0`, generates normalized runtime lexemes with canonical-label or reviewed-alias lineage across all 11 `§5` domain groups (`DOMAIN`, `ENTITY`, `FIELD`, `RELATION`, `JOB`, `PROJECTION`, `POLARITY`) and verifies (`verifyProtectionLexemeSeparation`) that warranty, insurance, policy, coverage, and claim tokens remain disjoint. |
| Recognizer retirement (`FR-ONT-8`) | Four families retired end to end (item-to-warranty relation; item field absence; item stale service; property-tax time series), which removes the whole legacy Shape 7-9 module; all other recognizers remain inventory-only | The item-to-warranty relation legacy recognizer (Shape 9 `NO_WARRANTY`/`HAS_WARRANTY` in `dataPointShapes789.ts`, its where-clause, runner and renderer, and `warrantyShapeGrammarAgreement`) is deleted; the typed grammar plus cross-domain executor is the sole producer (`FR-CAP-3` "migrate fully to the typed grammar"). Parity evidence over 13,446 generated phrasings: every prompt the legacy recognizer would have executed (792, after its own grammar-agreement gate) is also parsed by the typed grammar, there were 0 legacy-only answers, and all 792 reach the semantic entry (`CROSS_DOMAIN_PLAN_MATCH`) identically before and after; the 2,016 legacy-only matches were already refused by that gate, so they lose nothing. A second, handler-local definition of the relation (`linkedWarranties` where-clause, `FR-ONT-7`) is gone. `provisionalRead.ts` now grounds any typed semantic receipt against an independently built grammar plan instead of a legacy shape; `WARRANTY_LOOKUP`'s family disposition is corrected to `DEMOTED_GROUNDED_ONLY` (it never used the removed grammar-agreement function). `ASK_RETIRED_RECOGNIZER_FAMILIES` records the successor, parity evidence and forbidden tokens, and `validateRetiredRecognizerFamilies` fails if a retired token reappears in `src/`. The inventory entry's live signal count fell 247 to 233. The parity corpus is generated, not human-adjudicated, and was a one-off script (not checked in). **Second family, field absence ("which appliances have no serial number recorded"):** the typed grammar had no coverage of these (0 of 324 legacy-answered phrasings), so the successor was built first and the legacy `ABSENCE` shape deleted only after parity: a grammar rule for the new registered job `query.inventory_item.field_absence` (one registered item field, negative polarity, specific field wins over a generic one it contains, two distinct fields are left unresolved), reviewed lexicon vocabulary (field aliases from the absence registry and data-point catalogue, `lack`/`not on file`-style negation and recorded-status wording, household/HVAC item nouns, `give me`), and an executor that reads the registered columns for visible items only, treats blank text as not recorded and a recorded $0 as recorded, applies the data-point catalogue audience floor so a restricted gap never names items, and returns an unavailable answer (never "everything is recorded") when the columns were not loaded. Parity over 17,220 generated phrasings: the legacy recognizer answered 14,880, the grammar answers 13,800 with the same field (0 mismatches), the 1,080 it does not are the three value-question wordings (`did we install`, `did i install`, `cost when i bought`) that only mean something as value reads, and it answers 2,160 more than the legacy planner did. Known differences: hidden items are no longer counted and whitespace-only text counts as not recorded. **Third family, stale service ("which appliances have I not serviced in over a year"):** again built first. The plan contract gained an `ELAPSED_WINDOW` time constraint (`semanticRequestPlan.ts`, schema `1.4.0`), the cross-domain grammar a service-gap rule with a bounded lexical window recognizer (explicit quantity, at most 50 years or 600 months; "in the last year" or "over a decade" stay unresolved rather than guessed; an explicit window wins over "never"), and the executor a `query.inventory_item.service_gap` job that judges whole dates in the property timezone, lists recorded dates older than the window as the confirmed gap, and keeps items with no service date as a separate unknown population (the legacy folded them into the total) so nothing claims an unrecorded service did not happen. It shares the field-absence audience floor and unavailable-data handling. Parity over 17,680 phrasings: legacy answered 10,880, the grammar answers 10,080 with an identical window (0 mismatches) and 1,120 the legacy planner refused; the 800 it does not answer are non-phrasings and the legacy misreading of an unparseable window as "never". The legacy `STALE_SERVICE` shape, its window regex, `shapeWhere` and the generic inventory shape query are deleted; `dataPointShapes789.ts` now holds only the tax time series, the one Shape 7-9 recognizer left. **Fourth family, property-tax time series ("how has my property tax changed"):** the typed grammar covered 2 of 961 legacy-answered phrasings (and those 2 as a different, two-period job), so the successor was built first: a grammar rule for the new job `query.property_tax.change_over_time` (projection `TIMELINE`; change-over-time vocabulary and tax subjects in the generated lexicon; an assessment word wins unless "bill" is also said, a bare "tax" is the bill; the two-period compare and unpaid-bill jobs keep their own phrasings) and an executor job over the declared time series (`TIME_SERIES_REGISTRY`: entity, column, ordering, supersession exclusion, period cap), loaded only when needed, with the catalogue audience floor, unavailable-data handling, the original wording, and years with no recorded amount as a separate unknown population in the receipt. Parity over 1,128 phrasings: legacy answered 961, the grammar answers 959 with the identical subject (0 mismatches); the other 2 ("compare ... to last year") were already owned by the compare job in production. All 959 reach the semantic entry identically before and after. `dataPointShapes789.ts` is deleted outright along with its handler renderer and the `planShape789` / `SHAPE_789` hooks in routing, the provisional-read check and the legacy-vs-grammar comparison. The receipt-grounding check now also requires the receipt's subject entity to match the question's, so a tax-bill receipt cannot ground an assessed-value question. |
| Schema-to-registry drift check (`FR-ONT-6`, `§19 #5`) | Implemented for the generated entity/field registries, bounded relation paths and the cross-domain lexicon; the schema-derived generator for ontology metadata beyond the catalogued data-point entities is not built | `governance/registryDrift.ts` builds a deterministic snapshot (`registry-drift-1.0.0`: 20 entities with every scalar/enum column of their Prisma models, 107 fields with Prisma type, nullability, enum vocabulary and audience floor, the bounded relation-path ids, the 15 domain ids and a digest of the 492-lexeme runtime lexicon) and compares it with the committed `registryDriftSnapshot.generated.json`, naming each added/removed/changed entity or field. `scripts/ask-semantic-registry-drift.js` reports drift, `--check` exits non-zero, and `--write` regenerates the snapshot after review. `crossDomainSemanticRegistryDrift.test.js` fails when the generated state differs from the snapshot and proves detection against a real in-process change to the Prisma datamodel, not only a hand-edited snapshot. Reviewed overrides (`ENTITY_METADATA`, reviewed lexicon aliases) are covered through their effect on the generated registries and lexicon, not by a separate override file. Drift is detected at test/CI time against the generated Prisma client; there is no runtime check. |
| Deterministic typed grammar | Implemented for the Phase 1 basic-read subset | `deterministicSemanticParser.ts`, version `typed-grammar-0.5.0`, performs offset-preserving tokenization, registry annotation, bounded typo recovery, morphological normalization, conversational determiner/possessive handling, typed slot assembly, unresolved-span reporting and stable facet construction across the 13 selected Phase 1 basic-read families. |
| Typo handling | Implemented for bounded single-token aliases | One-edit matching is limited to registry aliases of at least five characters and requires one unique best semantic identity per role. Exact annotations remain authoritative. |
| Morphology | Implemented for the initial possession and number subset | Common `do`/`have` tense forms and bounded singular/plural forms share semantic annotations while retaining original spans. This is not yet a general morphological engine. |
| Property-backed entity resolution contract | Implemented as a pure authorization-bounded seam | `propertyEntityResolver.ts`, version `property-entity-resolver-0.1.0`, returns `RESOLVED`, `MULTIPLE_MATCHES`, `MISSING`, `UNAUTHORISED` or `NOT_APPLICABLE`; hidden matches return no record identity or label. Live property loading and parser attachment remain to be integrated. |
| Typed Boolean query contract | Implemented contract and deterministic assembly seam; surface parsing deferred | `SemanticWhereExpressionSchema` permits only bounded `PREDICATE`, `AND`, `OR` and `NOT` nodes. `semanticBooleanAssembler.ts`, version `semantic-boolean-0.1.0`, assembles explicit conjunction, either/or and neither/nor meanings from registered predicates, rejects duplicates and invalid arity, and returns clarification for ambiguous negative `OR`. Warranty plans emit a registered predicate and `path.inventory_item.warranty`; natural-language connective annotation is not yet wired to multi-node plans. |
| Relation registry | Implemented for canonical item-warranty and property-plan applicability relations | `semanticRelationRegistry.ts`, `warrantyCanonicalModel.ts`, and `warrantyApplicability.service.ts` bind item-specific warranty links to `Warranty.inventoryItemId` and whole-home plan applicability to typed, evidence-backed `WarrantyApplicability` targets. Plan validation rejects unknown or cross-field-inconsistent relation constraints and predicate/path pairs. |
| Canonical warranty relation, applicability and state model | Implemented (`FR-QUERY-7`; owner decision recorded 2026-11-16) | Prisma removes `InventoryItem.warrantyId`, adds `Warranty.scopeKind` and `WarrantyApplicability`, and preserves item-specific recorded links, applicable property plans, exclusions, unknowns, explicit no-coverage evidence and conflicts as separate states. `HOME_WARRANTY_PLAN` cannot link directly to an item; item/category/system applicability requires one typed target and confirmed applicability requires provenance. Database migration generation remains owner-operated per repository policy. |
| Default `UNKNOWN` warranty/coverage grouping | Owner-approved 2026-11-16; implementation consistency audit pending | Ordinary warranty and coverage projections shall include unknown records by default in a separately labelled `Coverage unclear` or `Needs confirmation` group. Unknown rows and counts shall not contribute to confirmed-protection or confirmed-gap totals. Existing `COVERAGE_GAPS` presentation already uses `COVERAGE_UNCLEAR`; generic semantic and cross-domain projections still require consistency verification against this rule. |
| Legacy admission agreement | Implemented (`FR-CAP-3`) | `legacyGrammarAgreement.ts` provides `warrantyShapeGrammarAgreement`, `dataPointReadGrammarAgreement`, `savedResultsGrammarAgreement`, and `verifyLegacyCandidateGrammarAgreement` to independently compare legacy candidates with the typed grammar plan on semantic job/relation, subject, polarity, projection, material filters, and required slots before admission across `dataPointRead.handler.ts` and `savedResults.handler.ts`. |
| Minimal read receipt and entailment | Implemented (`FR-ANS-1`, `FR-ANS-2`) | `semanticExecutionReceipt.ts` (`buildSemanticReadReceipt`) and `semanticReceiptEntailment.ts` (`verifySemanticReadReceiptEntailment`) validate plan lineage, registered predicates, resolved-record cardinality, separated confirmed/conflicted/unknown populations, authorization, provenance and answer projection across `dataPointRead.handler.ts` (`dataPointQueryResult`, `shape789Result`, and single-point `dataPointReadResult`) and `savedResults.handler.ts` (`savedResultsFromPage`). |
| Command preview admission & presentation humanizer | Implemented (`FR-CAP-4`, `FR-ANS-6`) | `commandPreviewAdmission.ts` validates semantic job, target entity, parameters, and required slots before any uncertified command candidate opens a preview. `presentationHumanizer.ts` humanizes registered enums and internal codes at the shared rendering boundary and strips retry actions (`retryable: false`, `actions: []`) from deterministic contract or entailment failures. |
| Phase 2A thin end-to-end semantic slice (`§18 Phase 2A`) | Implemented (`§19 Artifacts #9, #23, #26`) | `src/services/ask/semantic/slice/index.ts` coordinates the Phase 2A inventory, warranty, and maintenance vertical slice: minimum slice registry (`sliceRegistry.ts` covering `InventoryItem`, `Warranty`, `PropertyMaintenanceTask`, `InventoryRoom`, `HomeSystem`, 16 fields, 4 bounded relations, and 2 capabilities), indexed typed placeholder span map (`placeholderSpanMap.ts` with `[ITEM_i]`/`[DATE_i]`/`[MONEY_i]`/`[SERIAL_i]`/`[ROOM_i]` and bidirectional `raw <-> protected <-> minimized` round-trip verification), `CAPABILITY`/`COMMAND`/Boolean `AND`/`EITHER_OR`/`NEITHER_NOR`/`NOT` parsing in `deterministicSemanticParser.ts` + `sharedSemanticLexicon.ts`, vertical-slice executor (`sliceExecutor.ts` with `resolvePropertyEntityReference`, `classifyTransitionalWarrantyLinks`, bounded depth <= 2 traversal, `gateUncertifiedCommandPreview`, `applySliceFollowUpRefinement`, and `replaySliceExecutionWithAuthorization`), rich presentation adapter (`richPresentationAdapter.ts` with `verifyRichPresentationPopulationEquivalence`), and discovered abstraction changes (`SLICE_DISCOVERED_ABSTRACTION_CHANGES`) + metamorphic suite (`runSliceMetamorphicSuite`). |
| Minimized homeowner-text provider processing | Owner-approved 2026-11-16; operational activation remains gated | The configured structured provider may receive only protected and minimized homeowner text for read-only semantic planning. `resolveDefaultSemanticProviderPolicy` independently requires `ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED`, `ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED`, and `ASK_SEMANTIC_PROVIDER_APPROVED`; no single flag authorizes outbound text. Raw identifiers, property records, database IDs and the server-only `ProtectedSpanMap` remain prohibited. |
| Structured-provider latency/cost limits | Owner-approved 2026-11-16 (`semantic-provider-budget-1.0.0`) | Hard ceilings are Stage 1 `600 ms`, Stage 2 `1,200 ms` per call/batch, cumulative estimated provider cost `USD 0.015` per turn, Stage 2 concurrency `3`, and admitted facets `6`. `PROVIDER_BUDGET_EXCEEDED` fails closed to deterministic handling or an honest unavailable result. Fixed provider estimates are governance approximations, not exact billing telemetry. |
| Phases 2B–5 end-to-end domain waves (`§18 Phases 2B–5`) | Built for all 14 `§5` domains + safety boundary; every domain is `PARTIAL`, none is `ENABLED_FOR_DECLARED_SCOPE` (`§19 Artifacts #10–#13, #17, #24–#30, #34–#38`) | `src/services/ask/semantic/crossDomain/index.ts` delivers all 5 end-to-end domain waves across all 14 `§5` homeowner domains + `domain.safety_boundary` (`PARTIAL` in `semanticOntologyBaseline.ts` and `DOMAIN_ENABLEMENT_RECORDS`, each record listing `missingDependencies`: an independently adjudicated corpus, per-domain sample sizes for the confidence bound, and live provider evaluation; `isFacetFamilyEnabled` gives the new stack ownership only of explicitly registered jobs/relations (the union of the rollout registrations, a family registered with one rollout can be read for another domain) and any other facet is `UNRESOLVED` with `NO_ENABLED_OWNER`; `DOMAIN_ENABLEMENT_RECORDS` with measured `§18` `DomainLanguageCoverageProfile`s built by `buildMeasuredDomainCoverageProfiles` and gated by `verifyDomainRolloutManifestIntegrity` in `domainRolloutManifest.ts`), extended relation registry (`semanticRelationRegistry.ts` + `relationGovernanceBaseline.ts`), extended typed `WHERE` / calendar-period / YoY-compare / closing-date constraints (`semanticRequestPlan.ts` + `semanticBooleanAssembler.ts`), generated lexicon & token-annotation grammar parser (`crossDomainPlanBuilder.ts`, `cross-domain-grammar-2.0.0`, with 1-edit typo recovery, fail-closed unresolved spans, 6-facet segmentation, `dependsOn` linking, `DOMAIN_NOT_SEARCHED` overflow reporting, and Stage 0 safety pre-evaluation), exclusive mixed-stack facet ownership (`assignMixedStackFacetOwnership`, `NEW_STACK \| LEGACY_STACK \| UNRESOLVED` with zero double-execution), offline lexicon enrichment collision governance (`OFFLINE_LEXICON_ENRICHMENT_PROPOSALS`), unified wave execution & Prisma-backed production path (`crossDomainExecutor.ts` with `loadCrossDomainPropertySnapshot` + `executeCrossDomainOnProperty` wired into `dataPointReadResult` in `dataPointRead.handler.ts`, verifying `verifySemanticReadReceiptEntailment`, `verifyRichPresentationPopulationEquivalence`, role redaction/reauthorization, and follow-up refinement), and `evaluateCrossDomainGovernanceReport` verifying all 30 `§20` acceptance rows (`ROW_01`..`ROW_30`) and multi-axis metamorphic pairs across all 15 domains and 6 axes (`PARAPHRASE`, `INFLECTION`, `NEGATION`, `COORDINATION`, `TYPO_AND_NOISE`, `WORD_ORDER`). The `§22.1` canonical warranty decision is implemented under `FR-QUERY-7`; the remaining `§22` owner decisions stay open. The `§18` wave exit (at least one domain `ENABLED_FOR_DECLARED_SCOPE`) is therefore not met; execution behaviour is unchanged by the downgrade (the evaluation still resolves 27/27) because every registered family stays owned by the new stack. |
| Parallel Track P & Phase 6 — Provider integration, risk-stratified calibration & end-to-end evaluation (`§12 FR-UND-1..8`, `§16 FR-EVAL-1..6`, `§18 Track P & Phase 6`) | Implemented and wired into production `resolveAskSemanticEntryDecision` / `capabilityHandlerRegistry` / `createAskExecution` / `dataPointReadResult`; offline sealed-proxy invariants verified (`11/15` gates) while Phase 6 `FR-EVAL` exit criteria remain NOT satisfied (`frEvalExitSatisfied=false`: macro/per-domain 95% lower CI, `< 1%` Wilson upper bound at `>= 381`/stratum, and independent held-out human-adjudicated corpus provenance remain unmet; corpus creation is owner-deferred for lack of budget/resources; §22 live external provider evaluation also remains open) (`§19 Artifacts #17–#22, #28–#30, #33, #35, #38`) | `src/services/ask/semantic/semanticEntryDispatcher.ts`, `capabilityHandlerRegistry.ts`, `createAskExecution.ts`, `dataPointRead.handler.ts`, `legacyGrammarAgreement.ts` (`evaluateLegacyVsSemanticGrammarAgreement`), `src/services/ask/semantic/evaluation/index.ts`, `crossDomainExecutor.ts` (`loadAuthorizedProviderContext`), and `placeholderSpanMap.ts` (`ITEM`/`ROOM`/`VENDOR`) deliver Track P and Phase 6: entry-path semantic promotion from fallbacks, clarifications, non-deterministic legacy semantic collisions (e.g. misrouted `BUYER_DOCUMENT_READINESS`/`PROPERTY_SUMMARY`), and Phase 2A matches via `resolveAskSemanticEntryDecision`; `semanticProviderOrchestrator.ts` (server-assigned stable facet IDs, `FACET_SPANS` + `FLAT_DOMAIN_LIST` single-union fallback, concurrency-capped batching `maxConcurrentStage2Calls = 3`, enforced `maxStage1LatencyMs`/`maxStage2LatencyMs`/`maxEstimatedCostUsdPerTurn` budgets returning `PROVIDER_UNAVAILABLE` on breach, strict domain validation returning `SCHEMA_INVALID` on unknown domains, coordinate-based `raw <-> protected <-> minimized` span mapping, property-backed `dynamicEntities`/`dynamicQuotes` protection and binding before external provider calls, `FR-UND-6` deterministic fallback preservation, 6-facet `DOMAIN_NOT_SEARCHED` overflow, `GeminiSemanticUnderstandingProvider` gated by `§22` `ASK_SEMANTIC_PROVIDER_APPROVED`, and `SealedOfflineStructuredProvider`), `riskStratifiedCalibration.ts` (11-feature `extractMultidimensionalConfidence`, all 6 `SEMANTIC_RISK_STRATUM_POLICIES`, held-out split + `LEAVE_ONE_OUT_CV` out-of-fold PAV calibration without fitting and scoring on the same rows and returning `eceEvaluated: false` / `expectedCalibrationError: null` when `sampleCount < 2`, separating `observedZeroErrorPassed` from strict `< 1%` Wilson 95% upper bound requiring `>= 381` independent observations/stratum), `endToEndEvaluationHarness.ts` (executing all 27 cases—both `DATA_POINT_READ` and separate legacy ops—through `resolveAskRoutingCascade` + `resolveHierarchicalSkillRouting` + `resolveAskSemanticEntryDecision` + `executeOperationCore -> capabilityInvoke` without persisted `createAskExecution` rows, verifying strict `expectedExecutionStatus`, exact `expectedRecordIds` set equality, and mandatory `expectedJobMatch` presence rather than permissive subset/empty-job checks; 8-dimension semantic `evaluateLegacyVsSemanticGrammarAgreement` vs co-occurrence; non-circular pre-correctness high-confidence admission; explicit `corpusProvenance` `INTERNAL_DEVELOPER_PROXY` and `providerEvaluationDisclosure` `OFFLINE_SIMULATOR` disclosures; instrumented `composeAskSavedPage` Prisma query counts across `N=5,25,100`; multi-case `FR-EVAL-3` invariants; macro-by-domain lower 95% CI separate from pooled Wilson bound; `FR-EVAL-5` correlated metamorphic invariance separate from independent Wilson `n`; `11/15` `FR-EVAL-4` gates with `4` fail-closed external/statistical prerequisite blocks; and `§19 #22` matrix), plus CLI runner `scripts/ask-semantic-evaluation.js`. |

### 0.2 Current evidence

- Ask architecture, guardrails, bootstrap, Saved, Phase 0–6, and warranty suites (`askImportGraphGuardrails.test.js`, `askRuntimeBootstrap.test.js`, `crossDomainSemanticGovernance.test.js`, `crossDomainSemanticContainment.test.js`, `crossDomainSemanticArchitectureSlice.test.js`, `crossDomainSemanticRollout.test.js`, `crossDomainSemanticEvaluation.test.js`, `semanticPhase1WarrantyUnderstander.test.js`, `transitionalWarrantyRead.test.js`, `askSaved.test.js`, plus `canonicalWarrantyModel.test.js`): 99/99 passing on 2026-11-16. The Phase 2A production snapshot loader (`sliceExecutor.ts`) now reads evidence-backed `WarrantyApplicability` (status `COVERED`, property-plan scope) instead of hard-coding a null plan link after the `InventoryItem.warrantyId` retirement; the Phase 6 sealed-proxy stubs and the relation access-site manifest were updated to match.
- Phase 6 evaluation CLI (`node scripts/ask-semantic-evaluation.js`): `offlineInvariants=PASSED`, `frEvalExitSatisfied=false` (`11/15` `FR-EVAL-4` gates passing; `--check` exits nonzero fail-closed because 4 external/statistical prerequisites remain unmet; `corpus=INTERNAL_DEVELOPER_PROXY`, `independentlyAuthored=false`, `providerKind=OFFLINE_SIMULATOR`, `liveExternalModelEvaluated=false`; entry-path `CASCADE_SKILL_SEMANTIC_ENTRY_AND_EXECUTE_OPERATION_CORE_CAPABILITY_INVOKE` with `persistedAskExecutionFlowExercised=false`: `rawCascadeNonFallback=9/27`, `semanticEntryPromoted=25`, `allRoutedResolved=27/27`, `dataPointReadResolved=25/25`, `separateLegacyOpsResolved=2/2`; 8-dimension legacy-vs-grammar agreement `56.3%` (`agreed=9`, `collisions=7`, `grammarExpanded=9`, `falseAdmissionsPrevented=7`); calibration `LEAVE_ONE_OUT_CV` `observedZeroError=PASSED`, `independentObs=27`, `maxStratumLOO_ECE=0.0318`, `incorrectHighConfidence=0`; correlated `FR-EVAL-5` metamorphic invariance separate at `domainPairs=24/24`, `invarianceVariants=27/27`; instrumented `composeAskSavedPage` replay queries `5/5/5` across `N=5,25,100`). Failing `FR-EVAL` exit gates: `GATE_END_TO_END_MACRO_RESOLVED_CI` (`macroPoint=100.00%`, `meanDomainLower95=51.32%`, `minDomainLower95=34.24%`), `GATE_WILSON_95_UPPER_BOUND_UNDER_1PCT` (`minIndependentSamples=1/381`, `maxUpper95=79.35%`), `GATE_INDEPENDENT_HELD_OUT_PROVENANCE` (`humanAdjudicated=0`), and `GATE_LIVE_EXTERNAL_PROVIDER_EVALUATED` (`UNRESOLVED_OWNER_APPROVAL`).
- Backend TypeScript validation: `npm run typecheck` passing on 2026-11-16.
- Repository hygiene: `git diff --check` passing for the current slice.
- Runtime services and a database were not started; seeded cross-domain evaluation and unit suites exercised environment-independent execution paths. External live LLM traffic remains disabled until provider terms and semantic-provider activation are approved. Homeowner-text processing and budget policy `semantic-provider-budget-1.0.0` are approved and remain enforced at runtime.
- Graphify was refreshed after each completed code slice; known extraction warnings remain for the optional SQL parser dependency and two unrelated frontend syntax-extraction failures.

### 0.3 Open external/runtime scope

- An independently authored, human-adjudicated corpus large enough for the FR-EVAL confidence gates is owner-deferred because budget and staffing are unavailable. Live database/LLM provider runtime calibration against real homeowner production traffic (`isRealHomeownerTrafficDistribution: true`), remaining provider contractual/privacy and activation approval, application of the owner-generated canonical-warranty database migration, and multi-locale language coverage beyond `en-US` remain separate future operational milestones.

---

## 1. Executive decision

Ask Cozy shall use one cross-domain semantic request architecture for every homeowner turn.

The system shall no longer treat a prompt as a sentence that must resemble a registered example. It shall interpret the prompt into a typed **Semantic Request Plan**, validate that plan against the current user's authorised property context and the registered data/capability ontology, and then execute it through one of two deterministic planners:

1. a **Data Query Planner** for facts, lists, details, counts, comparisons, aggregates, missing-data questions, and relations; or
2. a **Capability Planner** for calculations, assessments, recommendations, workflows, and commands.

Two producers shall emit the same versioned plan contract: a mandatory deterministic semantic parser for explicit, common and low-risk meanings, and a structured-output provider for broader wording and multi-facet recall. Either producer may propose meaning. Neither may query arbitrary tables, invent fields or capabilities, bypass authorisation, execute a write, or compose the final factual answer. Deterministic code remains authoritative for validation, execution, provenance, and effect control.

This architecture applies across Ask Cozy. Warranty prompts are regression examples, not the design boundary.

---

## 2. Why this FRD exists

Homeowners do not know Ask Cozy's operation names, example phrases, record models, or internal domain boundaries. The following are semantically ordinary requests:

- “list down all items which don't have warranty”
- “provide details of all items without warranty”
- “how many appliances are not having warranty”
- “which items are having warranty”
- “show plumbing and electrical maintenance due next month”
- “which appliances have no manual or receipt?”
- “how much did I spend on repairs last year?”
- “what claims are still open and what documents are missing?”
- “which projects need a permit?”
- “what changed in my ownership costs?”

Differences in politeness, grammar, inflection, word order, projection (`LIST`, `DETAIL`, `COUNT`), polarity (`HAS` versus `HAS_NOT`), or a named relation must not send equivalent requests to unrelated operations or guidance.

The current system contains useful foundations—operation registration, a data-point catalogue, query templates, domain handlers, safety boundaries, property-scoped authorisation, typed presentation blocks, composition, and an understanding-provider interface—but still has multiple phrase-sensitive routing and query layers. Coverage is therefore bounded by hand-written vocabulary and examples rather than by the home's actual data and registered capabilities.

This is an architectural defect, not a request for more warranty regexes.

---

## 3. Governing product outcomes

### 3.1 Required outcomes

Ask Cozy shall:

1. Understand equivalent homeowner wording consistently across every supported domain.
2. Answer a populated, authorised home-data question directly when a safe deterministic read path exists.
3. Distinguish list, detail, count, aggregate, comparison, existence, missingness, and analysis requests.
4. Preserve positive and negative meaning, including `has`, `does not have`, `missing`, `expired`, and `unknown` as distinct states.
5. Resolve named items, rooms, projects, documents, policies, claims, and other entities against the authorised property's records—not only a global noun list.
6. Support relational questions spanning registered entities without treating the presence of two entity nouns as ambiguity by default.
7. Select a registered domain capability for analyses and workflows without depending on one canonical prompt.
8. Carry semantic context across turns so that “what about the kitchen?” refines the prior subject and request rather than starting an unrelated turn.
9. Produce an answer whose rows, count, polarity, fields, time range, and provenance are structurally entailed by the execution result.
10. Fail closed without fabricating relevance, while returning an intent-preserving next step.
11. Measure correctness on independent prompt families and seeded property scenarios across all domains.

### 3.2 Non-goals

This FRD does not require:

- correct interpretation of every possible utterance;
- a general-purpose chatbot;
- model-authored factual answers;
- arbitrary natural-language-to-SQL;
- exposing internal tables or operation identifiers to homeowners;
- removal of authentication, authorisation, safety interception, confirmation, or domain invariants;
- enabling every registered operation merely because it is labelled read-only;
- release cohorts, staged rollout machinery, or manual production certification for nonexistent users;
- a bespoke deterministic rule for each discovered prompt.

---

## 4. Definitions

### 4.1 Semantic Request Plan

A typed, provider-independent representation of what the homeowner requested. It expresses meaning, not execution code.

### 4.2 Data Query

A read over registered entities, fields, and relations using an allowlisted query algebra. Examples include listing appliances without warranties, counting open claims, comparing annual tax bills, and finding projects missing permits.

### 4.3 Capability

A registered product function that performs domain logic beyond retrieval, such as reserve planning, replacement guidance, recall review, refinance analysis, seller preparation, or a confirmed command.

### 4.4 Projection

The requested output shape: `EXISTS`, `COUNT`, `LIST`, `DETAIL`, `AGGREGATE`, `COMPARE`, `TIMELINE`, or `ANALYSIS`.

### 4.5 Polarity and record state

`HAS`, `HAS_NOT`, `UNKNOWN`, `CONFLICTED`, `CONFLICTED_LINKS`, `EXPIRED`, `INACTIVE`, `MISSING_EVIDENCE`, and `NOT_APPLICABLE` are separate states. Absence of a linked record is not automatically proof that a real-world warranty, policy, permit, or document does not exist. A conflict is neither confirmed positive nor confirmed negative.

For warranty and coverage results, `UNKNOWN` records shall be included by default in their own owner-visible group, labelled `Coverage unclear` or an equivalent approved plain-language label. They shall not be counted as confirmed protection or as confirmed gaps. `CONFLICTED` and `CONFLICTED_LINKS` remain separate conflict populations. `COUNT`, `LIST`, `DETAIL`, `AGGREGATE`, and `COMPARE` projections shall preserve separately labelled confirmed, unknown, and conflicted populations; an explicit filter may narrow to one population but may not silently reclassify another.

### 4.6 Semantic equivalence family

Independently written prompts that request the same plan, including grammatical variation, reordered clauses, synonyms, typos, and conversational framing.

### 4.7 Execution receipt

The typed, immutable result of a query or capability execution. It records the validated plan, resolved entities, applied filters, result rows or measures, missing-data states, authorisation decision, provenance, and answer-contract variant.

### 4.8 Shared semantic lexicon

A versioned, generated artifact consumed by every plan producer and resolver. It contains approved homeowner labels and aliases for registered domains, semantic jobs, entities, fields, relations, projections, time expressions and enum values. It is generated from the registries plus reviewed overrides; it is not a second hand-maintained prompt catalogue.

---

## 5. Product-domain scope

The architecture shall cover every registered Ask capability and every owner-visible property datum. Reporting shall use the canonical domain registry; it shall not hard-code a permanent domain count.

The initial cross-domain evaluation shall include at least these groups:

| Domain group | Representative meanings that must be expressible |
|---|---|
| Property profile | facts, rooms, systems, condition, property attributes |
| Appliances and inventory | items, categories, location, age, cost, condition, replacement |
| Maintenance and seasonal care | due, overdue, completed, upcoming, cost, service gaps |
| Warranties, insurance, and coverage | linked, active, expired, absent, evidence missing, coverage gaps |
| Claims and incidents | status, type, date, amount, checklist, documents, timeline |
| Documents and records | presence, absence, type, item/project linkage, evidence completeness |
| Ownership costs and reserves | spending, budgets, trends, funding gaps, forecasts |
| Property tax and financing | bills, assessments, appeals, loans, refinance, break-even |
| Projects, DIY, permits, quotes | status, dependencies, permit need, quotes, materials, next steps |
| Buyer and seller preparation | deadlines, readiness, checklist, documents, decisions |
| Risk, recalls, inspections, and environment | findings, recalls, hazards, mitigation, evidence |
| Home events and timeline | changes, service, replacements, incidents, historical sequence |
| Household and account context | roles, lifecycle applicability, authorised recovery |
| Cross-domain and composed requests | multiple independent or dependent facets in one turn |

Adding a domain shall require ontology and execution registration, not changes to a central list of prompt sentences.

---

## 6. Target architecture

```text
RAW HOMEOWNER MESSAGE
  │
  ├─ 1. pre-property safety / restricted-request / explicit-command boundary
  │
  ├─ 2. authenticate + authorise property, role, lifecycle and runtime availability
  │
  ├─ 3. protect identifiers; create raw + normalised + minimised representations
  │
  ├─ 4. semantic plan producers
  │       ├─ deterministic semantic parser (mandatory baseline)
  │       └─ structured-output provider (broader recall)
  │               ↓
  │          typed Semantic Request Plan with source spans and alternatives
  │
  ├─ 5. deterministic plan validator
  │       ├─ ontology membership
  │       ├─ eligibility / authorisation / sensitivity
  │       ├─ entity and slot resolution
  │       ├─ confidence / ambiguity / effect policy
  │       └─ facet dependency validation
  │
  ├─ 6A. Data Query Planner ───────┐
  │       facts / relations         │
  │       counts / comparisons      ├─ typed execution receipt
  │                                 │
  └─ 6B. Capability Planner ────────┘
          analysis / workflow / command
                    │
          7. deterministic domain execution
                    │
          8. structural answer verifier + renderer
                    │
          9. semantic conversation-state update
```

Safety boundaries run on the complete original message before any property read. A governing boundary ends the turn. A write target can only open its own preview and must pass the existing confirmation and pre-effect revalidation flow.

---

## 7. Canonical Semantic Request Plan

### FR-PLAN-1 — Required envelope

Every interpreted turn shall return one of:

- `MATCH`
- `NONE_FITS`
- `INSUFFICIENT_TEXT`
- `BOUNDARY`
- `SCHEMA_INVALID`
- `PROVIDER_UNAVAILABLE`

A `MATCH` shall contain one to six ordered facets. Each facet shall include:

```ts
interface SemanticFacet {
  id: string;
  sourceSpan: { start: number; end: number; text: string };
  requestClass: 'DATA_QUERY' | 'CAPABILITY' | 'COMMAND';
  domainCandidates: RankedDomainCandidate[];
  subject: EntityReference | null;
  relations: RelationConstraint[];
  polarity: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN' | null;
  projection: 'EXISTS' | 'COUNT' | 'LIST' | 'DETAIL' |
              'AGGREGATE' | 'COMPARE' | 'TIMELINE' | 'ANALYSIS';
  fields: FieldReference[];
  where: BooleanExpression | null;
  sort: SortExpression[];
  limit: number | null;
  time: TimeExpression | null;
  groupBy: FieldReference[];
  targetCandidates: RankedTargetCandidate[];
  requiredSlots: RequiredSlot[];
  dependsOn: string[];
  evidence: {
    jobMatch: string;
    subjectNamed: boolean;
    relationNamed: boolean;
    projectionNamed: boolean;
    polarityNamed: boolean;
  };
  confidenceSignals: ConfidenceSignals;
}
```

The production contract may use equivalent names, but it shall preserve every semantic dimension above.

### FR-PLAN-2 — Three target kinds

The understanding contract shall support:

1. `QUERY` — a semantic data query compiled through the Query Registry;
2. `CAPABILITY` — a semantic job resolved through the Capability Registry; and
3. `COMMAND` — a consequential action that can only produce a confirmation preview.

A generic query shall not be disguised as `DATA_POINT_READ` with ad hoc parameters. A domain analysis shall not be disguised as a query.

### FR-PLAN-3 — Meaning preservation

Normalisation may annotate or derive canonical tokens, but shall preserve:

- original text;
- protected spans;
- normalized text;
- provider-minimised text;
- source offsets;
- negation;
- comparison direction;
- time boundaries;
- quantity and units;
- conjunction/disjunction;
- requested projection.

The system shall never destructively strip a preamble if doing so can change meaning. Safety evaluation shall use the raw message and, where applicable, the normalized representation; either may trigger a boundary.

Protected values shall use indexed, typed placeholders such as `[PERSON_1]`, `[CONTRACTOR_2]`, and `[POLICY_REF_1]`; repeated values of the same type shall never collapse to an indistinguishable token. The server shall retain a non-provider-visible `ProtectedSpanMap` containing, for each placeholder, its raw span, protected span, minimised span, semantic role, and any authorised entity candidate. Provider source spans shall be expressed and validated against the exact minimised payload sent to that provider, then mapped through this bijection to raw source spans and eligible entity candidates. A missing, overlapping, ambiguous, or non-bijective mapping is `SCHEMA_INVALID`; code shall not validate minimised offsets against the raw message.

### FR-PLAN-4 — Multi-facet semantics

Clause splitting shall be semantic, not limited to a fixed list of second-clause prefixes. Dependencies shall be explicit. Independent safe facets may execute when another facet needs clarification. A dependent facet shall not execute until its dependency is resolved.

### FR-PLAN-5 — No silent partial interpretation

If a qualifier, field, relation, time constraint, entity, or requested facet cannot be represented or validated, it shall be reported as unresolved. The system shall not execute the representable subset while presenting it as a complete answer.

### FR-PLAN-6 — Multiple producers, one contract

The deterministic parser and every provider adapter shall emit the same versioned plan schema. Producer output shall include lineage and version. A deterministic plan may execute without a provider only when it passes the same ontology, entity, relation, slot, authorisation and admission validation as a provider plan. When producers disagree materially, the decision policy shall use independently calibrated evidence or clarify; it shall not silently prefer the higher numerical score.

### FR-PLAN-7 — Mandatory deterministic coverage

The deterministic parser shall cover explicit, low-risk meanings that can be derived from the approved lexicon and typed grammar, including:

- request projection;
- positive and negative relation predicates;
- registered entity and field names;
- property-backed entity references;
- registered semantic-job identification for analyses and workflows, using job aliases, required slots, applicable entity types, lifecycle context and adjacent-negative evidence;
- bounded comparisons and aggregates;
- calendar and relative time expressions;
- follow-up refinements of an existing validated plan; and
- exact registered command language that opens a confirmation preview.

Its grammar shall operate over semantic annotations and registry identities, not operation-specific sentence regexes. Unsupported or ambiguous meanings shall remain unresolved rather than being coerced into the closest plan.

The mandatory implementation approach is a lexicon-annotated token stream followed by typed slot assembly:

1. tokenize while preserving raw, protected and minimised offsets;
2. apply typo-tolerant, registry-generated annotations for domains, semantic jobs, entities, fields, relations, projections, enum values, quantities and time expressions;
3. apply morphological normalization so inflections such as `have`, `has`, `having`, singular/plural and common tense variants share a semantic annotation without losing the original token;
4. resolve property-backed entity candidates and attach only opaque authorised identities;
5. assemble subject, relation, polarity, projection, Boolean predicates, time and required slots through typed grammar rules;
6. compute explicit negation scope and coordination semantics before candidate admission;
7. construct facets and dependencies independently of surface word order; and
8. return every unconsumed meaningful token range as an unresolved span.

Operation-specific sentence patterns, per-handler synonym tables, and a chain of regexes that directly selects an operation do not conform. Regex may be used inside bounded lexical or morphological recognizers, but its output shall be a semantic annotation rather than a route claim. The metamorphic runner shall prove inflection, negation, coordination, typo and meaning-preserving word-order invariance for every declared deterministic family.

For a deterministic `CAPABILITY` plan, the parser shall produce ranked semantic-job candidates and evidence rather than selecting a flat operation id. The Capability Planner shall resolve the validated job to an eligible capability and operation adapter. Common explicit jobs—including status/retrieval, readiness, deadline, comparison, break-even, replacement guidance, risk review and saved-result retrieval—shall be included in the declared deterministic coverage when their required distinctions can be represented safely.

---

## 8. Semantic ontology and registries

### FR-ONT-1 — Entity Registry

Every queryable entity shall declare:

- stable entity id;
- homeowner-facing singular and plural labels;
- owning domain;
- property-scope rule;
- minimum audience;
- sensitivity class;
- identity fields and safe display fields;
- supported fields;
- supported relations;
- resolver adapter;
- query adapter;
- provenance adapter.

### FR-ONT-2 — Field Registry

Every queryable field shall declare its type, units, null semantics, enum vocabulary, supported operators, projection eligibility, sort/group/aggregate eligibility, audience floor, sensitivity, and canonical data-point identity.

When persisted models contain duplicate or legacy representations of one business meaning, the registry shall additionally declare a stable semantic field id, authoritative storage field, legacy aliases, ordered coalescence rule, blank-versus-null handling, conflict behavior, write target, backfill/consolidation disposition, and provenance preference. A reader shall not silently prefer whichever duplicate field it happens to query. Conflicting non-empty values within an approved equivalence group shall produce `CONFLICTED` with provenance unless a reviewed domain rule deterministically resolves them. Fields that merely look similar—such as brand versus manufacturer, or a property roof versus an inventoried roof component—are explicitly distinct business meanings by default. They shall not substitute for one another, share a write target, be consolidated, or produce a conflict merely because their populated values differ. Business equivalence requires a later field-specific owner approval defining authoritative storage, aliases, normalization or unit conversion, conflict behavior, write target, consolidation/backfill disposition, and provenance.

### FR-ONT-3 — Relation Registry

Relations shall be first-class, directional declarations. Each relation shall define:

- stable `semanticRelationId` and `meaningVersion`;
- source and target entity;
- cardinality;
- canonical storage path;
- inverse name;
- supported predicates such as `HAS_ANY`, `HAS_NONE`, `HAS_ACTIVE`, `HAS_EXPIRED`, `MISSING_EVIDENCE`, and `IN_ROOM`;
- treatment of `UNKNOWN` and unlinked legacy records;
- authorisation propagation;
- query compiler implementation;
- seeded verification scenarios.

Every traversable relation path shall have a stable path id and declare maximum depth, maximum parent cardinality, maximum child cardinality, maximum joined rows, cycle policy, filter placement, and authoritative property-scope parent. The default is one registered edge; deeper paths require an explicit reviewed declaration. Filters, audience floors, lifecycle rules, and property ownership shall apply at every node. When multiple parent chains can authorize a record, execution shall require the intersection of all applicable authorization constraints and use the strictest audience/sensitivity floor; one permissive parent shall never override another restrictive parent. An invisible intermediate or terminal record shall behave as not found and shall not leak through counts, existence, provenance, or error copy.

Every executable relationship predicate or writer shall additionally declare a stable `predicateId`, its `semanticRelationId`, direction, state semantics, canonical adapter id, usage (`READ`, `WRITE` or `DERIVED`) and, for a specialized derivation, its canonical parent predicate. Untagged relationship logic is non-conformant.

Equivalent business relationships shall have one canonical storage and query definition. In particular, item-to-warranty status shall not be computed through competing links or handler-specific predicates.

Every query compiler, capability handler, analysis service, answer verifier and writer that evaluates or changes a registered business relationship shall use the registry-owned predicate or writer adapter. Reimplementing the same relationship in a handler-local query is a conformance failure.

### FR-ONT-4 — Capability Registry

Every routable capability shall declare:

- stable capability id and semantic job id;
- owning domain and operation adapter;
- read, preview, or effect class;
- audience, lifecycle, runtime, and entity requirements;
- input schema and required slots;
- supported projections;
- composability and dependency rules;
- grounded-check or typed execution-receipt contract;
- answer variants;
- recovery behavior;
- representative positive, adjacent-negative, and cross-domain examples.

Routing shall be hierarchical:

```text
domain set → request class → semantic job → capability → operation adapter
```

Operation ids remain execution implementation details. The semantic interpreter shall not need to choose among hundreds of flat operation names in one prompt.

### FR-ONT-5 — Registry completeness

Build-time governance shall fail when an owner-visible field has no data-point registration, a declared relation has no compiler, a routable capability has no execution contract, or a registered answer variant is not produced by its handler code path.

Source scanning alone shall not establish conformance.

### FR-ONT-6 — Schema-derived defaults and reviewed overrides

Registry construction shall derive, where mechanically knowable, stable model and field identities, types, nullability, enum values, relation candidates and storage cardinality from Prisma; it shall derive existing audience, sensitivity, provenance and product-data identities from the approved data-point and property-context catalogues. Human-reviewed overrides shall own homeowner labels, aliases, business null semantics, canonical relationship meaning, exclusions, safe display fields and domain applicability.

The shared semantic lexicon shall be generated from these approved registries and overrides. No producer or handler may maintain a competing general-purpose synonym list. Narrow aliases may exist only as registry-owned overrides with lineage and collision tests.

Lexicon breadth shall be maintained through a governed offline enrichment pipeline. Candidate aliases, abbreviations, inflections, projection phrases and adjacent negatives may be collected from sealed-suite misses, unsupported-demand telemetry, domain terminology, approved synthetic paraphrases, or proposals from an offline model. Model-proposed vocabulary shall never ship directly or create a runtime dependency. Candidates shall be classified by semantic role, normalized, deduplicated, checked for cross-domain/job/entity/relation collisions, reviewed in auditable batches, approved by a named human owner, versioned, and accompanied by positive and adjacent-negative fixtures before lexicon generation. The record shall retain proposal source, reviewer, decision, semantic identity and retirement history.

Broad context-dependent words shall not receive unrestricted global mappings merely to increase recall. For example, an abbreviation such as `w/o` is a negation annotation, “details of” is a projection phrase, “equipment” may be an entity/category alias, and “things” requires contextual resolution. The same generated artifact shall remain the only general homeowner vocabulary consumed at runtime.

Schema or catalogue changes that make a generated registry or lexicon stale shall fail conformance until regenerated and reviewed.

### FR-ONT-7 — Duplicate-definition governance

The repository shall maintain a generated cross-domain report of every code path that reads, writes or derives a registered relationship. Mechanical discovery shall flag direct storage queries outside registry-owned adapters. Semantic duplicate detection shall group declared predicates by `semanticRelationId` and fail on multiple canonical adapters, incompatible cardinality, direction, state/null semantics or meaning versions. An explicitly approved specialized derivation may consume a canonical predicate and add domain logic; it must declare its canonical parent and may not redefine the underlying relationship.

### FR-ONT-8 — Recognizer migration and retirement

Every pre-existing prompt recognizer and vocabulary source shall be inventoried, including deterministic operation rules, data-point aliases/cues, query-template nouns, shape parsers, semantic-router aliases, fallback equivalence tables, handler-local entity/category/time vocabulary and follow-up patterns. Each shall have exactly one governed disposition:

- `MIGRATE_TO_LEXICON`;
- `MIGRATE_TO_TYPED_GRAMMAR`;
- `REPLACE_WITH_PROPERTY_RESOLUTION`;
- `RETAIN_SAFETY_BOUNDARY`;
- `RETAIN_CERTIFIED_OPTIMIZATION`; or
- `RETIRE`.

A recognizer-retirement manifest shall record its owner, current code path, successor registry/grammar identity, parity fixtures, collision evidence, status and deletion criterion. During migration, a legacy recognizer may contribute candidate evidence only through the canonical plan contract; it shall not independently claim or execute a turn in parallel with its successor. Once parity and negative-collision evidence pass, competing vocabulary and claim paths shall be removed. Raw-message safety and restricted-request recognizers remain independently owned and are not folded into ordinary semantic routing.

---

## 9. Dynamic entity and context resolution

### FR-ENT-1 — Property-backed resolution

After property authorisation, resolvers shall match against the property's actual item names, room names, project titles, providers, documents, claims, policies, tasks, and other registered entity identities. Global aliases may improve recall but shall not define the universe of resolvable entities.

### FR-ENT-2 — Candidate states

Entity resolution shall return one of:

- `RESOLVED`
- `MULTIPLE_MATCHES`
- `MISSING`
- `UNAUTHORISED`
- `NOT_APPLICABLE`

It shall never silently choose between materially different property records.

### FR-ENT-3 — Context inheritance

Conversation state shall store semantic references, not only text:

- active property;
- prior plan and facets;
- resolved entity ids;
- active domain and capability;
- filters, relation, polarity, projection, and time range;
- outstanding slots and clarification options;
- execution ids and workflow/thread ids.

“What about the kitchen?”, “only the expired ones”, “how many?”, and “show details” shall refine the prior plan when unambiguous. Context shall expire or be cleared when a new explicit subject conflicts with it.

### FR-ENT-4 — No context privilege escalation

Inherited entities and filters shall be reauthorised on every turn and immediately before execution or preview. Reopening conversation history, saved results, execution details, exports, or refreshed answer cards shall re-resolve every record id and registered parent chain against current property membership, role, audience, lifecycle, sensitivity, and record visibility. Stored receipts are audit evidence, not continuing authorization. Records or fields no longer visible shall be redacted deterministically; a stale receipt shall never recreate a previously authorized disclosure.

Replay authorization over a session or page shall deduplicate and batch lookups by property, entity type, record id and relation-path id, and shall reuse one current authorization view per property/role/policy version. A version fast path may avoid row re-resolution only when the receipt records—and the server verifies unchanged—property visibility version, lifecycle version, role, authorization-policy version and relation meaning version. Missing or changed versions require full revalidation. Implementations shall include bounded-query-count assertions and shall not issue one authorization query per receipt row or displayed record.

---

## 10. Data Query Planner

### FR-QUERY-1 — Query algebra

The planner shall support an allowlisted algebra:

```text
FROM <registered entity>
WHERE <typed predicates and registered relation predicates>
PROJECT <exists | count | list | detail | aggregate | compare | timeline>
FIELDS <registered visible fields>
GROUP BY <registered groupable fields>
SORT <registered sortable fields>
LIMIT <bounded integer>
TIME <property-timezone interval>
```

No provider-generated SQL, Prisma object, delegate name, column name, or unrestricted expression may execute.

`WHERE` shall be a typed Boolean AST containing only `AND`, `OR`, `NOT`, and registered `PREDICATE` nodes. Relation traversal shall reference stable registered path ids and remain within their declared depth, cardinality, joined-row, cycle, authorization, and lifecycle bounds. The compiler shall reject an unregistered or unbounded path rather than infer a storage join.

### FR-QUERY-2 — Required shapes

For every eligible registered entity/relation pair, the planner shall support where meaningful:

1. single-record detail;
2. multi-record list;
3. filtered list;
4. exists / does-not-exist;
5. count;
6. sort and top-k;
7. aggregate and group;
8. time-series and period comparison;
9. missing field or missing related record;
10. positive and negative cross-entity relations;
11. historical gaps and timeline sequences.

Unsupported combinations shall return a precise capability absence or clarification; they shall not be mapped to the nearest unrelated query.

### FR-QUERY-3 — Projection correctness

The result shall honor the requested projection:

- `COUNT` returns a count and the population definition;
- `LIST` returns matching labels;
- `DETAIL` returns declared requested fields for each match;
- `EXISTS` returns yes/no/unknown with evidence;
- `AGGREGATE` declares measure, function, and population;
- `COMPARE` identifies both periods or groups and the delta;
- `TIMELINE` returns ordered dated events with precision.

Projection semantics for conflicted data are mandatory:

- `COUNT` excludes conflicted records from confirmed positive and confirmed negative populations and returns a separate `conflictedCount`;
- `EXISTS` returns `CONFLICTED` rather than an unqualified yes/no when resolving the conflict could change the result;
- `AGGREGATE` excludes a record only when the conflicting field affects the requested measure or its population predicate, and reports the excluded conflict count and affected measure;
- `LIST` and `DETAIL` place conflicted records in a separately labelled group with provenance-safe explanation; and
- `COMPARE` reports conflict exclusions independently for each period or population.

Receipts shall contain confirmed population, conflicted population, unknown population and exclusion reasons separately. Renderers shall not add those states together into a confirmed answer.

### FR-QUERY-4 — Positive, negative, and unknown

`HAS_NONE` shall be evaluated against a canonical relation and shall remain distinct from `UNKNOWN` and `MISSING_EVIDENCE`. Answers shall state which meaning was used—for example, “no warranty linked in your home record,” not “has no warranty” when the record cannot prove real-world absence.

Connectives shall be represented rather than flattened. Coordinated values for one single-valued field, such as “plumbing and electrical tasks,” mean membership in the requested value set when the domain semantics permit it; predicates on different fields normally mean `AND`; explicit “either A or B” means `OR`; and “neither A nor B” means `NOT A AND NOT B`. Ambiguous negative coordination such as “without a manual or receipt” shall clarify unless the surrounding language or a reviewed product rule establishes whether the homeowner means missing either document or missing both. The receipt and renderer shall state the interpreted population.

### FR-QUERY-5 — Time semantics

Relative and calendar periods shall be resolved in the property's timezone. The plan and receipt shall store inclusive/exclusive boundaries and date precision. “Last year,” “next two weeks,” “in October,” and comparisons between periods shall not silently degrade to all-time results.

### FR-QUERY-6 — Limits and completeness

Result limits shall be explicit. If more rows match than are displayed, the answer shall report the total and truncation. Predicate overflow shall clarify or decline; it shall never drop filters silently.

### FR-QUERY-7 — Canonical warranty and property-plan applicability policy

Item-specific warranties shall use the zero-to-many `Warranty.inventoryItemId` relation. Property and whole-home plans shall remain property-scoped and shall use `WarrantyApplicability` to declare exactly one item, inventory-category or home-system target with `COVERED`, `EXCLUDED` or `UNKNOWN` status and provenance. A plan's existence shall not imply that every item is covered. Readers shall return one of:

- `ITEM_WARRANTY_LINKED`;
- `PROPERTY_PLAN_APPLICABLE`;
- `PROPERTY_PLAN_EXCLUDED`;
- `CONFLICTED`;
- `NO_LINK_RECORDED`;
- `EXPLICIT_NO_COVERAGE`; or
- `UNKNOWN`.

User-visible copy shall say “linked in your home record” or “recorded as applicable” unless policy terms establish coverage of the specific failure. Absence of item warranties and applicable plans means `NO_LINK_RECORDED`, not confirmed absence, unless explicit homeowner evidence supports `EXPLICIT_NO_COVERAGE`. Conflicts, exclusions and unknowns shall remain separate from confirmed gaps. `InventoryItem.warrantyId` is not a valid read or write path.

Authenticated applicability writes are exposed at `PUT /api/home-management/warranties/:warrantyId/applicabilities`; deletion uses `DELETE /api/home-management/warranties/:warrantyId/applicabilities/:applicabilityId`. Both operations authorize through warranty ownership, and item targets must belong to the warranty property.

For `COUNT`, `AGGREGATE`, `EXISTS` and `COMPARE`, `CONFLICTED_LINKS` follows the conflict rules in FR-QUERY-3 and shall never count as confirmed covered or confirmed uncovered.

---

## 11. Capability Planner

### FR-CAP-1 — Semantic job selection

Capabilities shall be selected by semantic job, required inputs, entity applicability, role, lifecycle, and runtime availability. Example-sentence similarity may provide evidence but shall not be the sole decision rule.

### FR-CAP-2 — Eligible catalogue only

The interpreter and planner shall receive only capabilities eligible for the authorised user/property context, or opaque eligibility-safe descriptors where revealing availability would expose restricted information.

### FR-CAP-3 — Read admission

A read capability may execute only when it has either:

- a standardized typed execution receipt plus structural validator; or
- a capability-specific grounded check and code-path answer contract.

An operation's `READ` label alone is insufficient. Conversely, a valid deterministic match shall not be discarded merely because a sentence-specific fast-path certificate is absent; it remains candidate evidence for semantic validation and normal capability selection.

Admission shall converge incrementally by capability family. A deterministic candidate may execute before sentence-rule certification only when all of the following hold:

1. the registered effect is an exact, reversible property-scoped read;
2. a second independent semantic signal agrees with its semantic job, or the deterministic plan itself validates completely against the typed grammar;
3. required entity, relation, polarity, projection and slots resolve;
4. the operation has a typed receipt or capability-specific grounded check that verifies those dimensions; and
5. authorization, lifecycle and source-availability checks pass.

The repository shall not place every operation labelled `READ` on a provisional allowlist. Source-scan-only answer contracts do not satisfy this requirement.

For this requirement, two signals are independent only when their evidence-generation algorithms and likely failure modes differ materially. They may consume the same approved shared lexicon and canonical registry identities; vocabulary governance and evidence independence are separate concerns. A legacy sentence recognizer and a compositional typed grammar can therefore be independent when the grammar constructs and validates the complete semantic plan without consuming the recognizer's selected operation, captures or score. Acceptable combinations also include a deterministic typed-grammar plan and a structured provider plan; a semantic plan and separately resolved property entity/slot applicability; an exact registered command grammar and current workflow-state validation; or an explicit homeowner clarification selection and the original candidate generator. The execution receipt is independent evidence about result entailment, not independent evidence that the original intent was selected correctly.

Existing provisional-read families are not grandfathered. Each shall obtain agreement from the Phase 1 typed-grammar subset, migrate fully to the typed grammar, obtain a valid deterministic certificate, or remain demoted.

The following do not count as independent: two scores derived from the same alias/example table; a regex and feature-hash classifier built from the same vocabulary; two outputs of one provider call; a route and answer generated by the same handler; or candidate selection and validation using the same untyped similarity function. Every admitted capability family shall declare the allowed evidence combination and its lineage in telemetry.

### FR-CAP-4 — Commands and effects

A command plan may open only the matching confirmation preview. The pre-effect step shall recheck property membership, role, lifecycle, record version, required slots, and idempotency. No model confidence can authorize an effect.

An uncertified sentence match alone shall not open a write preview. The semantic job, target entity, command parameters and required slots must first validate. Preview generation remains non-executing; the existing confirmation and pre-effect checks still govern the effect.

### FR-CAP-5 — Capability absence

If the requested analysis or workflow is not registered, Ask shall preserve the interpreted intent in its response, identify the missing capability without claiming the user asked something else, and record unsupported demand.

### FR-CAP-6 — Query and presentation ownership

The Data Query Planner owns retrieval semantics: entity population, Boolean predicates, relation traversal, projection, grouping, ordering, limits, time bounds, authorization, and the canonical execution receipt. A domain presentation adapter may convert that receipt into approved rich UI, including chips, grouped views, view state, explanatory labels, and authorized row actions; it shall not change the queried population or recompute business predicates independently.

Existing list/detail/read operations shall either become presentation adapters over a canonical query receipt or be registered as explicit derived-read capabilities when they add domain assessment beyond retrieval. Derived coverage, readiness, risk, cost, or recommendation assessments remain capabilities with their own typed receipts. This boundary shall prevent the same homeowner question from reaching inconsistent data semantics merely because one route renders a richer card.

---

## 12. Understanding and confidence policy

### FR-UND-1 — Interpreter implementation

The architecture shall implement both a deterministic semantic parser and a real structured-output understanding provider. Both shall consume the same eligible registry and generated semantic lexicon and produce the same plan contract. The deterministic parser is the always-available baseline for its declared grammar; the provider expands recall and multi-facet interpretation. Provider-specific schemas shall adapt into the canonical plan; downstream execution shall not depend on provider-native output.

### FR-UND-2 — Two-stage retrieval

For large catalogues, interpretation shall use bounded two-stage retrieval:

1. detect preliminary facets and return, for each, a minimised source span, ranked domain candidates and overflow metadata;
2. validate and map those spans to raw text, then assign stable facet ids before target retrieval;
3. search capabilities, entities, fields, and relations through a bounded union request, facet-centric requests, or domain-group requests;
4. merge candidates deterministically by stable facet id, raw source span, and semantic identity; and
5. validate every target against the full eligible registry.

Concurrency and provider-call limits are latency/cost controls, not permission to omit an independently requested facet. Every detected facet shall receive target retrieval or an explicit `DOMAIN_NOT_SEARCHED`/budget-overflow state in the plan and answer. A request may contain six facets even when the provider budget allows only three concurrent target calls; batching or a union call shall be preferred, and any remaining overflow shall produce an honest partial plan rather than disappear. Dependencies, including cross-domain dependencies, shall reference the stable facet ids allocated before stage two; provider-local array indexes are not dependency identities.

Domain-group or facet-centric stage-two fan-out is conformant only when stage one produced the facet spans and preliminary dependency identities needed for stable server-side IDs. If stage one returns only a flat domain list, stage two shall be one union target call over the selected domains so that one component owns span segmentation and dependency construction. Stable IDs shall be derived server-side from the validated raw span, occurrence identity and turn identity; provider-generated indexes or arbitrary IDs are not authoritative.

### FR-UND-3 — Confidence is multidimensional

The decision policy shall consider at least:

- request-class confidence;
- domain recall;
- target margin;
- entity resolution;
- relation and polarity evidence;
- slot completeness;
- projection evidence;
- effect/materiality class;
- language/locale;
- route type;
- provider availability.

A provider label such as `HIGH` shall never map directly to a fixed probability.

### FR-UND-4 — Risk-stratified admission

Certification and thresholds shall be stratified by semantic risk:

| Stratum | Default behavior |
|---|---|
| Exact, reversible, property-scoped data read | execute when plan and entity/relation validation pass |
| Aggregate/comparison/derived read | execute with typed receipt and structural verification |
| Recommendation or material analysis | execute registered capability; disclose assumptions |
| Ambiguous entity, polarity, relation, or material slot | clarify |
| Write or consequential action | preview and explicit confirmation only |
| Safety/restricted boundary | governing boundary response |

The system shall not require the same evidence budget for a reversible list query and a consequential write. It shall report both success-rate and incorrect-high-confidence bounds; one shall not be substituted for the other.

### FR-UND-5 — Deterministic fast paths

A certified deterministic rule may bypass semantic interpretation only when its stable id, hash, ownership, positive families, adjacent negatives, cross-operation collisions, entity requirements, and telemetry lineage are current. An uncertified rule may nominate candidates but may not establish route trust by itself.

### FR-UND-6 — Provider-independent availability

Provider outage, privacy disallowance, timeout or budget exhaustion shall not disable meanings within the deterministic parser's declared coverage. Telemetry shall report deterministic-plan success, provider-expanded success, producer disagreement and unresolved prompts separately. The product shall not claim provider-independent coverage beyond the measured deterministic grammar.

### FR-UND-7 — Producer invocation and reconciliation

After raw-message safety evaluation and context authorization, the deterministic parser shall run synchronously first. When it produces a complete validated plan covering every meaningful source span and admission policy permits execution, the runtime may skip the provider. When any span is unresolved, ambiguous, outside declared deterministic coverage, or requires broader multi-facet recall, the provider shall receive the complete approved minimised context plus explicit unresolved-span markers; it shall not receive only a fragment that removes dependency context.

Producer outputs shall reconcile by stable raw source span and semantic identity, not by array position or score alone. Equivalent facets merge with lineage from both producers. Non-equivalent claims over the same span are a material disagreement and shall be resolved through independently calibrated evidence or a focused clarification. Stable facet ids shall be allocated before target retrieval so dependencies survive batching and cross-domain merging. Offline evaluation shall run both producers on all eligible sealed scenarios even when production short-circuiting would skip the provider, so incremental coverage and disagreements remain measurable.

### FR-UND-8 — Mixed-stack migration ownership

During domain waves, raw safety boundaries and the new semantic parser shall inspect the complete message first. Every meaningful source span shall have exactly one execution owner:

1. a validated facet within an `ENABLED_FOR_DECLARED_SCOPE` family uses the new query/capability architecture;
2. a facet in a `PARTIAL` domain uses the new architecture only when its semantic family is explicitly enabled;
3. an unowned remainder may be offered to a legacy recognizer only when the migration manifest assigns that recognizer exclusive ownership of the span and family;
4. legacy output shall adapt into the canonical plan, authorization, receipt and answer-verification contracts before composition;
5. the new and legacy stacks shall never execute the same span; and
6. unsupported, unresolved, unavailable and non-enabled facets shall be reported explicitly and never dropped.

A dependency between new-stack and legacy-stack facets may execute only when both sides have stable semantic identities, compatible typed receipts and validated authorization. Otherwise the dependent facet shall clarify or remain withheld. Telemetry shall record the owner and migration status of every facet.

---

## 13. Execution receipts and answer correctness

### FR-ANS-1 — Typed receipt

Every executed query or capability shall produce a typed receipt containing:

- validated plan version and facet id;
- target entity/capability and operation adapter;
- resolved record ids;
- applied predicates, relations, time bounds, sort, group, and limit;
- row count and total match count;
- selected fields or measures;
- missing/unknown/not-applicable states;
- provenance and source timestamps;
- authorization and applicability decision;
- authorization-chain evidence, visibility/lifecycle versions, and receipt-currentness metadata sufficient for replay-time reauthorization;
- answer variant id;
- child execution ids for composed turns.

### FR-ANS-2 — Structural entailment

Before rendering, the verifier shall prove that the answer variant is compatible with:

- request class;
- subject/entity;
- relation;
- polarity;
- projection;
- requested fields;
- filters and time range;
- result cardinality;
- provenance;
- missing-data state.

Bag-of-words similarity or source scanning alone shall never establish answer correctness.

### FR-ANS-3 — Operation-owned variants

Handlers shall export typed answer variants shared by the handler, receipt validator, and renderer. A build-time test shall execute or statically trace each declared code path sufficiently to establish that the handler produces the registered variant. Source-scan-only contracts cannot bypass relevance validation.

### FR-ANS-4 — Composed answers

The public response contract shall represent up to the supported six child facets without a lower child-execution cap. Each facet shall be labeled answered, missing data, clarified, unavailable, unsupported, or withheld due to dependency. Partial completion shall be explicit.

### FR-ANS-5 — Honest fallback

Remote fallback claim selection shall initialize with no selected claims. Provider error, timeout, schema failure, or zero verified matches shall not cause arbitrary grounded facts to be shown. Fallback may use only structurally relevant facts and must preserve the requested intent.

### FR-ANS-6 — Homeowner-facing presentation

Every registry field, enum and relationship state shown to a homeowner shall use its approved homeowner label. Internal enum tokens, operation ids, field keys, reason codes and implementation wording shall not appear as answer copy. A genuine user-recorded value may remain verbatim when changing it would alter the record; the renderer shall distinguish such values from system-authored labels.

Retry behavior shall match the failure class:

- transient provider, source or runtime unavailability may offer retry;
- a deterministic contract, plan-entailment or presentation-conformance failure shall not offer the same request as a likely remedy;
- a resolvable semantic mismatch shall produce a focused clarification or candidate choice; and
- an internal deterministic defect shall produce a non-fabricating unavailable response and telemetry, not blame the homeowner for insufficient wording.

Presentation conformance shall be tested for every answer variant, including humanized enum values, units, dates, money, unknown/missing distinctions, truncation, provenance labels and action applicability.

---

## 14. Privacy, security, and authorization

### FR-SEC-1

Safety, restricted-request, explicit-command, and emergency boundaries shall inspect the complete raw message before property access. Normalized text shall receive a second boundary check. A boundary on either representation governs.

### FR-SEC-2

Known identifiers shall be protected before normalization. The final provider payload shall be minimized independently and checked for routing-meaning loss. Homeowner-text processing through this boundary was owner-approved on 2026-11-16. Provider terms shall be recorded and the separate operational gates shall be active before provider use.

Protection shall use indexed typed placeholders and the server-only `ProtectedSpanMap` required by FR-PLAN-3. The provider shall receive neither the bijection nor raw identifiers. Provider spans shall validate against the exact payload sent, then map back to raw spans and authorised entity candidates on the server. Mapping failures, duplicate placeholder identities, or attempts to bind a placeholder to an ineligible record shall fail closed and shall be separately observable from ordinary semantic ambiguity.

### FR-SEC-3

Every query and capability shall be property scoped and audience filtered at execution, even when the same checks passed during planning. Counts and existence answers are data disclosures and use the same authorization floor as their underlying records.

### FR-SEC-4

Model output shall never contain executable database identifiers, delegate names, raw predicates, SQL, or effect instructions. All references resolve through server-owned registries.

### FR-SEC-5

Logs and evaluation artifacts shall separate raw, protected, minimized, and semantic representations with appropriate retention and access controls. Telemetry shall not log raw home-record values merely to debug routing.

---

## 15. Recovery contract

Every unresolved turn shall end in exactly one typed recovery:

| Recovery | Required response |
|---|---|
| Missing record data | name the missing field/relation and offer an authorized capture path |
| Ambiguous entity | show materially distinct matching entities |
| Ambiguous meaning | ask one question that distinguishes the competing plans |
| In-domain but not understood | state the verified subject/domain evidence, offer no more than three materially distinct candidate jobs when supported, and ask one focused clarification; otherwise say what detail is needed without showing unrelated home facts |
| Unauthorized | state that the action/data is unavailable to this role and who can act, without leaking data |
| Lifecycle-inapplicable | explain why and offer the applicable alternative |
| Capability absent | preserve the requested job and record unsupported demand |
| Provider unavailable | use a verified deterministic route or state temporary inability; show no arbitrary facts |
| Unsupported query combination | name the unsupported combination; do not answer a broader query |
| Out of domain | concise boundary with a home-related redirect |
| Safety/restricted | governing safety response |

A one-option clarification loop, unrelated guidance card, or false “which records?” prompt when the relation is expressible is a failure.

`IN_DOMAIN_NOT_UNDERSTOOD` is distinct from `CAPABILITY_ABSENT`, `OUT_OF_DOMAIN`, provider failure and ambiguous meaning. It applies when the message is clearly about the authorised home but no producer yields a validated plan and the evidence is insufficient to present competing plans safely. It shall be recorded as an understanding-coverage defect.

---

## 16. Evaluation and quality gates

### FR-EVAL-1 — Evaluation unit

The primary unit is an independently authored **semantic scenario family**, not a prompt copied from a rule. Each family shall include:

- canonical labelled Semantic Request Plan;
- at least one seeded property scenario with populated data;
- missing-data and unknown-state variants;
- role/lifecycle variants where applicable;
- natural paraphrases from independent authors;
- grammatical, polite, reordered, typo, and inflection variants;
- adjacent-negative and cross-domain collision prompts;
- expected execution receipt and answer assertions.

### FR-EVAL-2 — Coverage

The sealed suite shall cover every registered domain, semantic job, entity, relation, projection, effect class, and answer variant. Metrics shall be reported macro-by-domain and distribution-weighted. A strong warranty score cannot hide failures in documents, maintenance, projects, finance, buyer/seller, risk, or any other domain.

### FR-EVAL-3 — Layered metrics

The system shall report separately:

1. plan schema-valid rate;
2. facet recall and precision;
3. domain top-k recall;
4. entity resolution accuracy;
5. relation/polarity accuracy;
6. projection accuracy;
7. query-equivalence accuracy;
8. capability-selection accuracy;
9. exact row-set/count/aggregate accuracy;
10. answer-entailment accuracy;
11. missing-data recovery accuracy;
12. authorization/effect safety;
13. provider unavailability and fallback outcomes;
14. end-to-end resolved rate;
15. wrong-answer and false-decline rates;
16. deterministic-parser coverage and correctness;
17. provider-expanded incremental coverage;
18. producer-disagreement rate and outcome;
19. deterministic semantic-job selection accuracy;
20. recognizer-migration parity and collision rate;
21. presentation-conformance accuracy; and
22. latency by producer and route;
23. Boolean-expression and interpreted-population accuracy;
24. relation-bound and intersected-authorization conformance;
25. protected-span round-trip and entity-binding accuracy;
26. replay-time reauthorization/redaction accuracy;
27. six-facet retrieval completeness, overflow disclosure and cross-domain dependency accuracy;
28. conflicted-population projection accuracy;
29. legacy-recognizer versus typed-grammar agreement, false-admission and lineage results;
30. replay authorization query counts by page/session size;
31. per-domain deterministic resolved rate, provider-incremental resolved rate and combined resolved rate; and
32. per-domain `IN_DOMAIN_NOT_UNDERSTOOD`, unsupported and false-decline rates.

### FR-EVAL-4 — Product gates

Before claiming the architecture meets the product objective, the sealed suite shall demonstrate:

| Metric | Gate |
|---|---:|
| End-to-end resolved rate, macro-by-domain | lower 95% confidence bound ≥ 90% |
| Populated-data direct-answer rate | lower 95% confidence bound ≥ 90% |
| Plan facet recall and precision | each ≥ 95% |
| Semantic-job selection accuracy | ≥ 95% overall and reported per job family |
| Entity, relation/polarity, and projection accuracy | each ≥ 95% |
| Exact query result correctness | ≥ 99% on deterministic seeded scenarios |
| Answer structural entailment | ≥ 99% |
| Presentation conformance | ≥ 99% and zero internal identifiers in seeded homeowner-visible answers |
| Protected-span round trip | 100% on seeded repeated-placeholder and entity-binding cases |
| Relation-bound and authorization conformance | 100%; zero cross-property or audience-floor disclosures |
| Six-facet accounting | 100% retrieved or explicitly marked overflow/unavailable; zero silently dropped facets |
| Replay reauthorization | 100% redaction after seeded role, membership, lifecycle, or visibility changes |
| Conflict projection semantics | 100% separation of confirmed, unknown and conflicted populations in seeded projections |
| Replay query growth | bounded batch count by property/path group; no per-row authorization-query growth |
| False decline on supported, answerable prompts | ≤ 1% |
| Incorrect high-confidence selection | upper 95% confidence bound < 1% per risk stratum |
| Wrong write routing or unconfirmed effect | zero observed; statistical bound reported |
| Dead-end or unrelated fallback | ≤ 1% |

No result may be described as “90% of real homeowner prompts” until a representative adjudicated real-traffic distribution exists. Offline results shall be labelled sealed-proxy results.

Correctness and language coverage shall be reported separately. Passing exact-result, authorization and incorrect-high-confidence gates proves correctness only for admitted semantic families; it does not establish broad paraphrase coverage. Every domain report shall state its independently authored answerable scenario count, deterministic resolved rate, provider-incremental resolved rate, combined resolved rate, `IN_DOMAIN_NOT_UNDERSTOOD` rate, unsupported rate, false-decline rate and confidence intervals.

### FR-EVAL-5 — Metamorphic invariants

For a meaning-preserving transformation, the validated plan and deterministic result shall remain equivalent. Required transformations include polite framing, singular/plural, active/passive possession, common negation forms, clause reordering where dependencies are unchanged, punctuation, casing, common typos, and follow-up projection changes.

### FR-EVAL-6 — Diagnostic sweeps

Routing sweeps and example hit rates remain diagnostics. They do not prove answer correctness because they do not, by themselves, verify entity resolution, query semantics, exact rows, handler output, or answer entailment.

---

## 17. Current-state baseline and known architectural gaps

The following figures are implementation baselines, not permanent requirements. They shall be regenerated from source by the implementation plan.

| Area | Current observed baseline (2026-11-14) | Consequence |
|---|---:|---|
| Registered operations | 231 total; 124 message-routable | a flat operation choice is too broad and counts must be derived |
| Routing sweep | 708 prompts; 13.4% direct hit; 63.8% fallback; 3.4% misroute | post-demotion, pre-certification diagnostic; current phrase coverage is not a correctness architecture |
| Data catalogue | 107 points across 10 catalogue domains | catalogue is useful but does not cover all owner-visible data |
| Query templates | 11 | generic querying is sparse relative to the property model |
| Weighted data reachability | 32% direct; 57% reachable | routing alone cannot reach the 90% objective |
| Answer contracts | 5 code-path, 11 typed-but-untested, 108 source-scan-only | most operations lack structural answer evidence |
| Human-confirmed sealed rows | 0 of 10,716 proposed | current certification claims are not established |
| Composition response capacity | decomposition and public response contract permit up to six children | the remaining gap is semantic discovery, dependency preservation and honest overflow—not response-schema capacity |

Known high-priority correctness gaps to address during implementation include:

1. competing item-to-warranty relationship paths that can yield contradictory coverage answers;
2. fallback claim selection that can retain unrelated candidates after provider failure;
3. semantic token expansion that conflates insurance, claims, policies, coverage, and warranties;
4. noun-list and handler-local entity/category/time vocabularies;
5. multi-entity ambiguity instead of relation parsing;
6. incomplete positive/negative relation symmetry;
7. source-scan answer contracts;
8. default-disabled model understanding and certification policy not differentiated by semantic risk;
9. follow-up handling bound to specific operations and sentence patterns;
10. no mandatory provider-independent producer of the cross-domain semantic plan;
11. no generated shared lexicon or schema-to-registry drift contract;
12. deterministic candidates discarded before structurally verified capability-family admission; and
13. inconsistent humanization and retry behavior across answer variants;
14. deterministic parsing does not yet guarantee semantic-job selection for analyses and workflows;
15. existing recognizers and vocabulary sources have no prompt-recognition retirement plan;
16. correlated routing signals can be mistaken for independent evidence; and
17. relationship predicates lack machine-checkable semantic meaning tags;
18. relation paths lack one governing bound and intersected-authorization contract;
19. provider spans are not governed by a raw/protected/minimised offset bijection;
20. deterministic/provider invocation, reconciliation and cross-domain dependency identities are underspecified;
21. generic query semantics and rich domain presentation can diverge;
22. duplicate persisted scalar fields can coalesce inconsistently or contradict one another;
23. Boolean coordination and negative connective semantics are not represented consistently; and
24. saved or replayed receipts do not yet have a complete reauthorization/redaction contract.

These are cross-domain examples of missing abstractions. Fixing them individually without the registries, plan contract, planners, receipts, and evaluation system in this FRD does not satisfy the architecture.

---

## 18. Delivery requirements

Implementation shall be incremental by architectural seam, not by adding prompt phrases domain by domain.

### Phase 0 — Baseline and invariants

- Generate authoritative operation, domain, entity, field, relation, capability, and answer-variant inventories.
- Inventory duplicate/legacy scalar fields and classify each pair as one canonical semantic field with governed coalescence or as intentionally distinct business meanings.
- Inventory every existing recognizer and vocabulary source and create the recognizer-retirement manifest required by FR-ONT-8.
- Generate a cross-domain duplicate-definition report for relationship reads, writes and derived analyses, including direct storage access outside canonical adapters.
- Inventory every traversable relation path, property-scope parent and current traversal/cardinality limit; flag unbounded paths and permissive dual-parent authorization.
- Derive candidate entity, field, enum and storage-relation metadata from Prisma and reconcile it with the data-point and property-context catalogues.
- Reconcile counts and archive superseded implementation-ledger rows.
- Define seeded scenarios and independent semantic families across all domains.
- Add exact current failures as regression tests, labelled containment rather than coverage proof.

**Exit:** inventories are generated; contradictions and uncovered owner-visible data are explicit; no 90% claim.

### Phase 1 — Immediate correctness containment

- Implement the conflict-aware warranty read adapter in FR-QUERY-7 and prohibit writes through ambiguous links.
- Apply the approved canonical model: zero-to-many item warranties through `Warranty.inventoryItemId`, property-scoped whole-home plans through evidence-backed `WarrantyApplicability`, and no `InventoryItem.warrantyId` field. Update all readers, writers and analyses to use registry-owned predicates; database migration and deployment-time row reconciliation remain owner-operated.
- Make remote fallback fail closed with an empty selection on error.
- Separate warranty, insurance, policy, coverage, and claim semantic tokens.
- Remove any answer-gate bypass based only on source-scan contracts.
- Introduce the standardized minimal read receipt and structural grounded-validator interface.
- Build the first shared-lexicon typed-grammar subset for the Phase 1 basic-read set, using the token-annotation and slot-assembly design in FR-PLAN-7. The set shall be selected reproducibly: include the known warranty/inventory, maintenance, item-cost and saved-result false-decline families plus at least one already-supported safe `DETAIL`, `LIST`, `COUNT`, `EXISTS` or missing-relation family from each §5 domain group where the required canonical read exists. Prioritization shall use seeded answerability, cross-domain reuse and measured diagnostic false declines—not presumed user popularity. The selected and deferred families, with reasons, shall be recorded in the Phase 1 evidence artifact.
- Migrate those reads to the receipt interface. Until the typed grammar becomes the sole producer for a family, a legacy candidate may execute only when the independently constructed grammar plan agrees on semantic job/relation, subject, polarity, projection, material filters and required slots.
- Require semantic job, target entity, parameters and required slots to validate before any uncertified command candidate opens a preview.
- Humanize registered enums and internal codes at the shared rendering boundary, and remove retry actions from deterministic contract or entailment failures.

**Exit:** known contradictory and unrelated-answer paths are closed; the selected Phase 1 families produce complete typed-grammar plans from the single shared lexicon and use structural receipts, or remain demoted; no existing provisional family is grandfathered; no throwaway verifier vocabulary or blanket read/write allowlist exists.

### Phase 2A — Thin end-to-end semantic slice

- Implement the minimum Entity, Field, Relation and Capability registry subset for inventory, warranty and maintenance.
- Extend the Phase 1 lexicon and typed grammar to the complete inventory, warranty and maintenance slice.
- Extend the understanding contract with `QUERY`, `CAPABILITY` and `COMMAND` facets; preserve raw/normalized/minimized text; implement indexed typed placeholders and the raw/protected/minimised span map.
- Run one complete path through deterministic semantic-job/query selection, property-backed entity resolution, plan validation, query or capability adapter, typed receipt, structural answer verification, homeowner rendering and semantic follow-up.
- The slice shall include: inventory fact/detail/count; positive, negative, unknown and conflicted warranty states; maintenance due-date and item relations; Boolean `AND`/`OR`/`NOT`; bounded relation traversal; one analysis such as replacement guidance; one confirmed command preview; one follow-up refinement; and replay after an authorization change.
- Implement one query-backed rich presentation adapter and prove that it preserves the canonical receipt population and predicates.
- Record abstraction changes discovered by the slice before expanding registry generation to other domains.

**Exit:** all three target kinds execute through the same plan boundary in the slice; exact seeded results, adjacent negatives and the slice metamorphic suite for inflection, negation, coordination, typos and word order pass; provider absence does not break declared deterministic coverage; no slice-specific vocabulary bypasses the registry.

After Phase 2A, the numbered domain-wave sequence and Provider Track P may proceed concurrently. Provider Track P is a parallel learning and coverage-expansion track, not a sequential phase between Phase 2A and Phase 2B, and it is not a prerequisite for deterministic correctness or provider-independent availability.

### Phases 2B–5 — End-to-end domain waves

After the slice, delivery shall proceed in end-to-end domain waves rather than completing ontology, query, capability and answer layers horizontally across every domain. The wave manifest shall order the §5 domain groups by prerequisite readiness and cross-domain reuse; it shall not imply traffic popularity where no representative usage data exists.

Each wave shall carry its selected domain group from registration to trusted homeowner output:

1. reconcile schema-derived entities, canonical fields, relations, path bounds, semantic jobs and reviewed overrides;
2. generate the domain lexicon and deterministic token annotations;
3. implement and measure typed-grammar coverage, entity resolution, conversation refinements and unresolved-span behavior;
4. implement safe Boolean query adapters and/or hierarchical capability adapters, including preview-only commands where applicable;
5. migrate legacy data-point queries, retrieval operations and recognizers to canonical adapters or record an explicit retained-boundary/deferred disposition;
6. emit typed receipts, conflict populations, authorization-chain evidence and code-path answer variants;
7. implement query-backed presentation adapters and structural answer verification;
8. pass exact seeded results, adjacent negatives, cross-domain collisions, metamorphic paraphrases, replay authorization/redaction and presentation checks; and
9. publish the per-domain enablement record defined below.

Shared generators and compiler infrastructure may be improved between waves, but a wave shall incorporate the resulting correction before it is enabled. No domain is considered delivered merely because its registry entries, parser vocabulary, adapter or answer contract exists in isolation.

**Per-domain correctness states:**

- `ENABLED_FOR_DECLARED_SCOPE` — every included entity, field, relation, semantic job, projection and exclusion is declared; exact result, authorization, replay, receipt, answer, presentation and domain risk gates pass for those families; and every legacy recognizer has a governed disposition. This state is not a claim of broad homeowner-language coverage.
- `PARTIAL` — the enabled semantic families and missing dependencies are explicitly listed; unsupported prompts recover honestly and the product does not imply domain-wide coverage.
- `NOT_ENABLED` — the new architecture shall not claim or advertise semantic coverage for that domain.

Every record shall separately publish a coverage profile: registry/lexicon/parser versions; supported and excluded semantic families; independently authored answerable scenario count; deterministic resolved rate; provider-incremental and combined resolved rates when available; `IN_DOMAIN_NOT_UNDERSTOOD`, unsupported and false-decline rates; confidence intervals; incorrect-high-confidence results; seeded and metamorphic evidence; replay query-count evidence; legacy-recognizer disposition; and unresolved P0/P1 items. Product copy and progress reporting shall name the correctness state and coverage profile separately.

**Wave exit:** at least one domain reaches `ENABLED_FOR_DECLARED_SCOPE`; all other domains retain their prior honest behavior or are explicitly `PARTIAL`/`NOT_ENABLED`; no cross-domain regression or low phrasing coverage is hidden by aggregate metrics. The phases repeat until every approved §5 domain reaches its intended state and the global completion definition can be evaluated.

### Parallel Track P — Early provider expansion after Phase 2A

Provider integration may begin after Phase 2A, in parallel with Phases 2B–5, once provider terms and semantic-provider activation in §22 are recorded. Homeowner-text processing through the protected/minimized boundary and budget policy `semantic-provider-budget-1.0.0` were approved on 2026-11-16.

- Connect the provider through the canonical plan schema, indexed-placeholder minimization boundary and span-mapping validator for the slice domains first.
- Implement deterministic-first invocation, unresolved-span provider expansion, semantic reconciliation and conforming facet-aware or union two-stage retrieval.
- Run both producers on every eligible slice scenario, including cases production would short-circuit, and measure deterministic coverage, provider incremental coverage and disagreement.
- Feed observed long-tail misses and disagreements back into grammar, lexicon, plan and wave design before later domains are enabled.
- Add each subsequent wave's eligible catalogue to both producers and repeat the same evidence report.

**Track exit:** the slice has measured provider-incremental coverage and disagreement outcomes, or the track records the specific unresolved owner decision that prevents provider use without blocking deterministic waves.

### Phase 6 — Full calibration and end-to-end evaluation

Phase 6 begins after the required domain-wave scope is complete and either Provider Track P has completed or its unresolved approval or budget decision is formally recorded.

- Complete any provider catalogue expansion not already delivered by Provider Track P and the domain waves.
- Verify all detected facets receive bounded retrieval or an explicit `DOMAIN_NOT_SEARCHED` overflow result and preserve stable cross-domain dependencies.
- Calibrate by semantic risk stratum.
- Execute both producers over the sealed cross-domain suite, including production-short-circuited cases, and publish layer metrics.

**Exit:** all FR-EVAL gates pass, or the result identifies failed domains/strata without a completion claim.

---

## 19. Required implementation artifacts

The implementation is incomplete until the repository contains:

1. versioned semantic plan schemas;
2. mandatory deterministic semantic parser;
3. versioned generated shared semantic lexicon;
4. generated entity/field/relation/capability registry manifests;
5. schema/catalogue registry generator, reviewed overrides and drift check;
6. semantic relation/predicate meaning-tag manifest;
7. cross-domain duplicate relationship-definition report and conformance check;
8. recognizer/vocabulary inventory and retirement manifest;
9. Phase 2A vertical-slice fixtures and evidence report;
10. safe query compiler and registry-owned adapters;
11. capability planner and operation adapters;
12. property-backed entity resolver;
13. semantic conversation-state contract;
14. typed execution-receipt schemas and structural admission checks;
15. handler-owned answer-variant manifests and conformance checks;
16. presentation-label/format registry and presentation conformance checks;
17. cross-domain sealed evaluation manifest;
18. seeded property scenario catalogue;
19. metamorphic paraphrase runner;
20. per-layer and per-producer measurement report;
21. unsupported-demand and in-domain-not-understood telemetry;
22. current requirement-to-evidence matrix;
23. indexed-placeholder and protected-span-map contract with round-trip fixtures;
24. registered relation-path manifest with depth, cardinality, joined-row, cycle and authorization bounds;
25. canonical semantic-field/coalescence manifest with conflict and consolidation rules;
26. query-backed domain presentation adapters and population-equivalence checks;
27. Boolean expression AST, connective fixtures and interpreted-population assertions;
28. producer invocation/reconciliation and stable-facet-identity contract;
29. six-facet retrieval, overflow and cross-domain dependency fixtures;
30. receipt replay reauthorization/redaction harness;
31. Phase 1 typed-grammar subset, family manifest and legacy-versus-grammar agreement tests;
32. deterministic token-annotation and typed-slot grammar specification;
33. facet-aware stage-one schema or documented union-stage-two implementation with stable-id fixtures;
34. domain-wave manifest and per-domain enablement records;
35. conflict-projection and replay query-count fixtures;
36. offline lexicon-enrichment proposal, review, collision and lineage artifacts;
37. mixed-stack facet-ownership manifest and transition fixtures; and
38. per-domain correctness-state and language-coverage reports.

Generated inventories shall be checked into or reproducibly generated by repository scripts. Hand-maintained totals in prose are informative only.

---

## 20. Acceptance examples

The following examples illustrate plan equivalence. They are not a phrase allowlist.

| Prompt family | Required semantic plan |
|---|---|
| “list items without warranty”; “which things have no warranty recorded?” | `QUERY InventoryItem LIST relation Warranty HAS_NONE` |
| “provide details of all items without warranty” | same relation, projection `DETAIL` |
| “how many appliances are not having warranty” | same relation, category `APPLIANCE`, projection `COUNT` |
| “how many appliances have no warranty?” when two records have conflicting links | confirmed-negative count plus a separate `conflictedCount`; conflicted records are not counted as covered or uncovered |
| “which items are having warranty” | `QUERY InventoryItem LIST relation Warranty HAS_ANY` |
| “what maintenance is due next month?” | `QUERY MaintenanceTask LIST status open, due next calendar month` |
| “show plumbing and electrical tasks” | one query with category set `{PLUMBING,ELECTRICAL}` or two explicit facets; neither category dropped |
| “which appliances have overdue maintenance?” | `QUERY InventoryItem LIST relation MaintenanceTask HAS_OVERDUE` |
| “which appliances don't have a manual or receipt?” | focused clarification between “missing either document” and “missing both,” unless prior context or a reviewed domain rule makes the connective unambiguous |
| “how much did I spend on repairs last year?” | aggregate actual repair cost over last calendar year in property timezone |
| “compare this year's tax bill with last year's” | `COMPARE` two registered periods and compute deterministic delta |
| “what claims are open and what documents are missing?” | two related facets with claim entity dependency and explicit partial-completion behavior |
| “which appliances are out of warranty and what's my deductible?” during a mixed migration wave | one exclusive owner per facet; the enabled warranty facet uses the new stack, an eligible non-enabled insurance facet uses its manifest-assigned legacy adapter, and any unresolved remainder is labelled rather than dropped |
| “show open claims, missing claim documents, overdue maintenance, expired warranties, unpaid tax bills, and active projects” | six stable facets; every facet receives bounded retrieval or an explicit overflow state, and cross-domain dependencies use stable facet ids |
| “tell me about my water heater: age, warranty, replacement cost, and whether to repair or replace” | four preliminary facet spans with stable server ids before fan-out, or one union target-planning call that owns segmentation and dependencies |
| “show the documents for my water-damage claim” | registered bounded claim-to-document path; claim and document authorization are both enforced, and an invisible document is not counted or disclosed |
| “do I have recalls and which items are affected?” | recall-review capability plus affected-item receipt, not generic guidance |
| “should I repair the furnace or replace it?” | registered decision capability with resolved furnace and required cost/condition slots |
| “how long until owning beats renting?” | deterministic semantic job `OWN_RENT_BREAK_EVEN` with required cost, horizon and housing-scenario slots resolved by the Capability Planner |
| “what are my contingency deadlines?” | deterministic semantic job `BUYER_CONTINGENCY_DEADLINES` with the active buyer transaction and deadline entities resolved |
| “my furnace is dying—what should I do?” | deterministic semantic job `REPLACEMENT_GUIDANCE` with the furnace entity, condition evidence and required decision slots; emergency wording is still evaluated by the raw safety boundary |
| “show my saved items” | deterministic semantic job `SAVED_RESULTS_RETRIEVAL`, not a generic inventory query |
| “what buyer deadlines are due before closing?” | `QUERY BuyerTask LIST` filtered to open deadlines before the resolved closing date |
| “what do I still need to finish before listing the house?” | seller-preparation capability or registered readiness query with current sale-case context |
| “would refinancing break even within three years?” | refinance break-even capability with the current loan, candidate terms and a three-year horizon; missing financial slots are requested, not invented |
| “which active projects still need a permit?” | `QUERY Project LIST relation Permit HAS_NONE_OR_UNRESOLVED`, preserving unknown versus confirmed-not-required |
| “compare these two kitchen contractor quotes” | quote-comparison capability with two resolved quote entities and declared comparison fields |
| “what environmental risks affect this home this week?” | environment/risk capability scoped to the property and calendar week, with source availability and freshness in the receipt |
| “which inspection findings still need action?” | `QUERY InspectionFinding LIST` filtered to unresolved/actionable state with source report provenance |
| “what about the kitchen?” after an inventory list | prior plan refined by room relation, with inherited projection |

For every row, seeded data shall assert the exact plan, records, counts, missingness semantics, and answer variant.

---

## 21. Decisions recorded by this FRD

1. **Cross-domain scope:** approved by the request for a holistic Ask Cozy architecture.
2. **Typed plan over prompt rules:** the primary routing unit is a Semantic Request Plan.
3. **Two planners:** data retrieval and domain capabilities are separate deterministic execution paths.
4. **Third target kind:** `QUERY` is first-class rather than overloaded onto single data points.
5. **Dynamic resolution:** authorised property data participates in entity resolution.
6. **Canonical relations:** one registered business relationship definition owns each cross-entity predicate.
7. **No blanket read bypass:** read admission requires typed structural evidence, not merely a read label.
8. **Risk-stratified calibration:** reversible data reads and consequential actions use different thresholds and controls.
9. **Typed receipts:** answer correctness is verified structurally against execution.
10. **Cross-domain evaluation:** completion is gated macro-by-domain and cannot be inferred from routing examples.
11. **Provider-independent baseline:** a deterministic semantic parser and generated shared lexicon are required, not optional.
12. **Structural admission convergence:** high-demand read families may execute before sentence-rule certification only after typed plan, entity and grounded-result validation; no blanket read bypass is permitted.
13. **Capability-wide canonical relations:** queries, analyses, handlers and writers consume the same registry-owned business predicates.
14. **Generated registry foundation:** mechanically knowable schema metadata is derived, while homeowner language and business meaning remain reviewed overrides.
15. **Presentation is correctness:** internal codes and inappropriate retry actions are answer-contract failures.
16. **Deterministic jobs:** analyses and workflows are selected first as semantic jobs, not flat operation ids.
17. **Recognizer convergence:** legacy rules and vocabulary receive an explicit migration, retained-boundary or retirement disposition.
18. **Vertical validation before generalization:** the plan and registry abstractions must pass an end-to-end three-target slice before cross-domain expansion.
19. **Evidence independence:** correlated matchers over the same vocabulary do not establish independent agreement.
20. **Transitional warranty honesty:** legacy links are inspected conservatively and reported as record-link states, not treated as proof of coverage.
21. **Declared relationship meaning:** semantic meaning tags make duplicate-predicate governance enforceable.
22. **Bounded relation traversal:** every executable path has reviewed depth/cardinality/join/cycle bounds and authorization is intersected across applicable parent chains.
23. **Protected-span bijection:** provider offsets are validated in minimised coordinates and mapped server-side to raw spans and eligible entities.
24. **Deterministic-first topology:** complete validated deterministic plans may short-circuit production provider calls; unresolved spans invoke provider expansion and semantic reconciliation.
25. **Query/presentation separation:** the query planner owns data semantics while domain presentation adapters own rich rendering without changing the receipt population.
26. **Canonical scalar semantics:** duplicate persisted fields require one governed semantic identity/coalescence rule or an explicit declaration that they mean different things; absent an approved equivalence rule, the default declaration is explicitly distinct.
27. **Boolean query meaning:** conjunction, disjunction and negation are represented as a typed AST and ambiguous coordination clarifies.
28. **Complete facet accounting:** provider budgets cannot silently discard any of the six supported facets or their cross-domain dependencies.
29. **Replay is a new disclosure:** saved receipts and answer history are reauthorized and redacted against current visibility before display.
30. **No provisional grandfathering:** an existing provisional read must obtain an agreeing complete typed-grammar plan, migrate fully to the grammar, or satisfy certification requirements before it can remain admitted.
31. **Domain-wave delivery:** post-slice implementation completes usable domain verticals rather than horizontally finishing one layer for every domain.
32. **Facet-aware staging:** provider fan-out requires stage-one facet spans; a flat domain stage one requires union target planning.
33. **Conflict populations:** confirmed, unknown and conflicted records remain separate in every projection.
34. **One runtime lexicon:** Phase 1 uses the first shared-lexicon typed grammar rather than a temporary verifier vocabulary.
35. **Early provider learning:** approved provider expansion begins after the slice and informs later waves without becoming a deterministic availability dependency.
36. **Exclusive transition ownership:** every facet has one new-stack, legacy-stack or unresolved owner during migration.
37. **Correctness is not coverage:** domain enablement for a declared scope and homeowner-language resolution rates are reported separately.

---

## 22. Owner decisions and remaining approvals

**Resolved 2026-11-16 — canonical warranty model:** Item-specific warranties are zero-to-many through `Warranty.inventoryItemId`. Property/whole-home plans remain property-scoped and use evidence-backed `WarrantyApplicability` rows for item, inventory-category or home-system applicability. `InventoryItem.warrantyId` is retired. A recorded link or applicability row does not by itself prove coverage of a particular failure.

**Resolved 2026-11-16 — default `UNKNOWN` result grouping:** Warranty and coverage records in an `UNKNOWN` state are included by default in a separate owner-visible result group. They are excluded from confirmed-protection and confirmed-gap totals and remain distinct from explicit absence, exclusions, `CONFLICTED`, and `CONFLICTED_LINKS`. Explicit filters may request only unknown or only confirmed populations; ordinary unfiltered results must not silently omit unknown records.

**Resolved 2026-11-16 — duplicate-looking scalar default:** Every duplicate-looking scalar pair without an existing governed equivalence rule is explicitly distinct by default. Readers, writers, analyses and backfills shall not substitute or coalesce the fields, and differing values do not constitute a conflict solely because the fields look similar. A later equivalence decision must be field-specific and must define authoritative storage, aliases, normalization or unit conversion, conflict behavior, write target, consolidation/backfill disposition, and provenance.

**Resolved 2026-11-16 — minimized homeowner-text processing:** The configured structured semantic provider may process protected and minimized homeowner text solely for read-only semantic planning. This approval excludes raw identifiers, raw property records, database identifiers, the server-only placeholder bijection, answer generation, database execution and consequential actions. Provider-terms acceptance and semantic-provider activation remain independent operational gates.

**Resolved 2026-11-16 — structured-provider budgets:** Budget policy `semantic-provider-budget-1.0.0` approves hard ceilings of `600 ms` for Stage 1, `1,200 ms` for each Stage 2 call/batch, `USD 0.015` cumulative estimated cost per homeowner turn, three concurrent Stage 2 calls and six admitted facets. A breach fails closed and cannot authorize partial or consequential execution. These ceilings are not latency SLOs, and estimated cost is not asserted as exact billing until actual usage metadata and an approved pricing table are wired.

**Deferred 2026-11-16 — independent human-adjudicated evaluation corpus:** Creation of an independently authored, human-adjudicated corpus large enough to satisfy the FR-EVAL macro/per-domain confidence and per-risk-stratum Wilson gates is not authorized at this time because the required budget and staffing are unavailable. The existing internal developer-authored sealed-proxy suite may continue to support regression testing, invariant checks and implementation feedback, but it does not satisfy independent provenance, human adjudication or statistical sample-size requirements. `frEvalExitSatisfied` shall remain `false`; Phase 6 remains incomplete; and no FR-EVAL completion, production-readiness, representative real-homeowner-language coverage, or sub-1% incorrect-high-confidence claim may be based on that proxy. This deferral may be revisited when qualified independent authors, adjudicators and funding become available; it does not waive or lower the gates in §16.

1. The final list of owner-visible entities/fields deliberately excluded from Ask, if any.
2. Provider contractual/privacy terms and semantic-provider activation approval for external structured planning.
3. Which recommendation/analysis capabilities require additional materiality disclosures beyond their existing domain rules.

These decisions do not block Phase 0 inventories, schema design, pure planners, seeded fixtures, or containment of known contradictory/fabricated-answer paths.

FR-QUERY-7 now governs the approved canonical warranty model. Applying the corresponding database migration and any deployment-time reconciliation remains an operational database step, not an unresolved product decision.

---

## 23. Completion definition

This FRD is not complete because a new provider is connected, because several example prompts pass, or because deterministic routing hit rate rises.

It is complete only when:

- all required artifacts in §19 exist;
- the deterministic semantic parser and generated shared lexicon cover their declared low-risk grammar without provider access;
- every registered domain is represented in the ontology and sealed suite;
- every approved domain has a current `ENABLED_FOR_DECLARED_SCOPE`, `PARTIAL` or `NOT_ENABLED` correctness record plus a separate language-coverage profile, and only supported families within the declared scope contribute to correctness claims;
- every owner-visible included datum has a deterministic authorised read path;
- registered relations use one canonical definition;
- every traversable relation path is bounded and applies intersected authorization at every node;
- provider protected spans round-trip through the indexed server-side mapping without validating minimised offsets against raw text;
- deterministic and provider plans follow the declared invocation/reconciliation topology and retain stable facet/dependency identities;
- all detected facets receive target retrieval or an explicit overflow state within the supported six-facet plan;
- duplicate persisted scalar fields use an approved canonical/coalescence rule or remain explicitly distinct;
- query-backed rich presentations preserve the canonical query receipt population and predicates;
- Boolean connective semantics and interpreted populations pass seeded assertions;
- receipt replay, saved results, exports and refreshed cards pass current authorization and redaction checks;
- replay authorization uses bounded batching or a verified unchanged-version fast path and passes query-count assertions;
- every admitted Phase 1 read family has a complete typed-grammar plan or valid deterministic certificate, and no provisional family is grandfathered;
- deterministic families pass their token-annotation, slot-assembly and metamorphic invariants;
- conflicted records remain outside confirmed positive/negative populations in every projection;
- query, capability, analysis and writer code paths consume registry-owned relationship adapters, with no unexplained duplicate definition;
- every executable relationship predicate and writer carries the required meaning tags;
- every legacy recognizer has been migrated, explicitly retained as a safety/certified optimization, or retired under FR-ONT-8;
- every mixed-stack facet has one recorded execution owner and no meaningful source span is silently dropped;
- the offline lexicon-enrichment pipeline preserves human approval, collision evidence and one generated runtime vocabulary;
- every routable capability has a typed execution and answer contract;
- every answer variant passes homeowner-facing presentation conformance;
- provider output is advisory and fully validated;
- exact seeded result and safety tests pass;
- all gates in §16 pass with reported confidence intervals; and
- the current requirement-to-evidence matrix contains no unresolved P0/P1 requirement.

Until then, Ask Cozy may have improved coverage, but the cross-domain semantic architecture shall not be reported as complete or as providing a 90% guarantee.

**Unsupported project/quote filter and typed claim rows (2026-11-19).** (1) A question that filters projects by quote approval ("projects in progress with unapproved contractor quotes") that ends in the unverified-answer message now says it cannot filter projects by quote approval (no recorded link between a project and a quote's approval) and offers "Show my projects" and "Review my contractor quotes", instead of the appliance naming hint (`askUnsupportedProjectQuoteFilter`). (2) The typed claim list now emits the claims list's own row (`incident-claim-list`, `entityType: 'CLAIM'`, the stored status, "Filed as <type>", the declared claim actions), so it opens the canonical claim inline. (3) "Open" claims in the typed path now use the claims page's definition (draft, in progress, submitted, under review); before, submitted and under-review claims were left out, and a draft is shown as a draft. Not browser verified; the remaining single-result chrome (repeated heading, "Showing 1 of 1") is unchanged. `crossDomainSemanticEvaluation` (1) and three governance tests fail with and without this change.

**Desktop Playwright Ask suite stabilised (2026-11-21, v1.34).** The 48 pre-existing desktop Ask browser failures were triaged one by one into test drift, fixture drift and product defects; the suite is now 310 passed, 0 failed, 1 parked (`fixme`, W-3). Product defects fixed: (1) a confirmation field marked `optional` (new `optional` flag on `AskConfirmationEditableField`; the Home Event Radar feedback comment sets it) no longer blocks Send and no longer auto-opens for editing, where before "Comment (optional)" made feedback impossible to send without a comment; (2) going Back to the bare Ask address (what closing Explore with Cozy does) while the conversation has no answers keeps the session and the draft in the composer instead of starting a new session that dropped the draft. Test and fixture updates follow deliberate product changes: home timeline opens as the Event list (FRD 1.384), calm landing priorities are one "Home priorities" list with a "1 item needs attention" headline, history is a docked panel closed by "Hide history" with no top navigation, a one-item seller-prep result opens its detail inline, capital/seller-prep/maintenance accessible names, the calm Home Actions list shows three rows behind "Show 3 more actions", and the fixtures now carry the priority bands, room items, documents no-match branch and consent the app requires. Screenshot baselines for the launch and the project tracker were regenerated after reviewing the new images. Open owner decisions: W-1 warranty rows say "Coverage details recorded" rather than the recorded text (FRD 1.383); W-2 a regulated work item with no evidence yet shows "No evidence is attached yet." and not the "does not close it" explanation; W-3 the calm shell hides the header, which held the only phone control that opens conversation history, so history is unreachable on a phone from the landing.
