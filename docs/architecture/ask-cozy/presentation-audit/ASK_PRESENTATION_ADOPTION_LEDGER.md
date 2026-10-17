# Ask Presentation Adoption Ledger

**Generated:** by `apps/backend/scripts/generate-ask-adoption-ledger.js` from the live operation registry. Do not edit by hand.

**Operations:** 197

Each registered Ask operation has exactly one class. The class is derived from registry facts (family, allowed block types) plus an explicit
list of operations this effort reviewed (`REVIEWED_OPERATIONS` in `apps/backend/src/services/ask/presentation/adoptionLedger.ts`). A test fails
when an operation has no class or this file is out of date. "Reviewed implementation" means covered by a deterministic fixture,
contract-level journey, or explicit producer-contract review; it is not verified in a browser or against a live backend.

| Class | Operations |
|---|---:|
| Reviewed implementation (fixture, journey, or producer-contract review; not runtime-verified) | 85 |
| Requires collection adoption | 26 |
| Requires trust or rationale adoption | 0 |
| Compact receipt: no rich migration needed | 83 |
| Specialized workflow requiring later review | 0 |
| Not applicable (boundary operations) | 3 |

## Reviewed implementation (fixture, journey, or producer-contract review; not runtime-verified)

| Operation | Why |
|---|---|
| `APPLIANCE_FAILURE_RISK` | Covered in this effort: the lifespan collection declares the complete analysed-plus-missing appliance total and honest bounded delivery without unsupported continuation. |
| `BREAK_EVEN_ANALYSIS` | Covered in this effort: audited against the COMPARE profile; fixture. |
| `BUYER_CLOSING_DAY_READINESS` | Covered in this effort: closing-day blockers declare the complete canonical blocker total and honest bounded delivery with no unsupported continuation. |
| `BUYER_CONTRACT_TIMELINE` | Covered in this effort: draft and confirmed contingency lists each declare their complete revision-scoped totals and bounded delivery. |
| `BUYER_COST_READINESS` | Covered in this effort: recorded cost items declare the complete eligible task total and bounded delivery. |
| `BUYER_DEADLINES` | Covered in this effort: exact task identity, reconciliation, journey 5. |
| `BUYER_DISCLOSURE_FUNDS_READINESS` | Covered in this effort: direct readiness answer carries canonical Closing Disclosure workspace freshness and the wire-fraud safety boundary. |
| `BUYER_DOCUMENT_READINESS` | Covered in this effort: direct document-readiness answer reports recorded/verified scope without fabricating an observation timestamp. |
| `BUYER_FINANCING_READINESS` | Covered in this effort: unresolved lender conditions declare the complete readiness-workspace total and bounded delivery. |
| `BUYER_INSPECTION_REVIEW` | Covered in this effort: direct inspection answer states the exact open-material-finding rationale and preserves the buyer professional boundary. |
| `BUYER_INSURANCE_READINESS` | Covered in this effort: insurance quotes and requirements independently declare their complete workspace totals and bounded delivery. |
| `BUYER_LOAN_ESTIMATES` | Covered in this effort: active offer revisions declare their complete comparison total and bounded delivery. |
| `BUYER_MOVE_STATUS` | Covered in this effort: open move tasks declare the complete canonical filtered total and bounded delivery. |
| `BUYER_NEGOTIATION_READINESS` | Covered in this effort: negotiation findings declare the complete canonical inspection-finding total and bounded delivery. |
| `BUYER_PLAN_STATUS` | Covered in this effort: reconciliation, journey 5. |
| `BUYER_TASK_UPDATE` | Covered in this effort: the ambiguous-target command declares the complete eligible task total and bounded selection list. |
| `BUYER_TITLE_ESCROW_READINESS` | Covered in this effort: open title and escrow issues declare the complete workspace total and bounded delivery. |
| `BUYER_WALKTHROUGH_READINESS` | Covered in this effort: walkthrough observations and issues independently declare their complete workspace totals and bounded delivery. |
| `CAPABILITY_DISCOVERY` | Covered in this effort: answer-first discovery result explains the match basis before presenting live registry capabilities and readiness. |
| `CAPITAL_RESERVE_PLAN` | Covered in this effort: reserve-plan summary and timeline are covered by capital timeline fixtures and declare dated planning evidence plus a cost/timing boundary. |
| `CLAIM_CHECKLIST_VIEW` | Covered in this effort: claim checklist declares its authoritative item total, bounded fetched rows and delivered rows without unsupported continuation. |
| `CLAIM_TRANSITION` | Covered in this effort: the ambiguous claim-target command declares the authoritative claim total and bounded fetched selection rows. |
| `COVERAGE_COMPARISON_STATUS` | Covered in this effort: the grouped-list comparison branch declares the complete option total and bounded delivery; compact comparison-strip branches are lossless. |
| `COVERAGE_GAPS` | Covered in this effort: the filtered item review declares its complete result total and per-group bounded delivery. |
| `COVERAGE_REVIEW_STATUS` | Covered in this effort: audited against the ATTENTION profile; fixture. |
| `DIY_PROJECTS` | Covered in this effort: active DIY projects pair their cursor-bounded read with the authoritative active-project count and advertise no unsupported continuation. |
| `DIY_PROJECT_GUIDE` | Covered in this effort: reviewed guide fixtures cover canonical project progress, current step, refusal/finished states and permission-aware actions. |
| `DIY_TEMPLATE_BROWSE` | Covered in this effort: reviewed, eligible and applicable templates are evaluated as a complete source set before bounded delivery, with no unsupported continuation. |
| `DOCUMENT_LOOKUP` | Covered in this effort: collection descriptor (Phase 5). |
| `DOCUMENT_PROMOTION_REVIEW` | Covered in this effort: the bounded cross-domain review queue declares its authoritative database total and fetched candidates. |
| `FINANCING_OVERVIEW` | Covered in this effort: ways-to-pay comparison with structured rate evidence (Phase 5 follow-up); overview and project fixtures. |
| `GROUNDED_GUIDANCE` | Covered in this effort: grounded answer declares property/general scope, source evidence when available, confidence limitations and a professional boundary. |
| `GUIDANCE_JOURNEYS_LIST` | Covered in this effort: the fully surfaced, protection-reconciled journey set declares exact source, fetched and delivered totals by urgency. |
| `GUIDANCE_JOURNEY_CONTINUE` | Covered in this effort: one journey’s complete live step set declares exact source, fetched and delivered totals by status. |
| `GUIDANCE_JOURNEY_CREATE` | Covered in this effort: workflow proposal requires a canonical item or approved service, then presents scope and plan type for confirmation before creation. |
| `HOME_ACTIONS` | Covered in this effort: single-property and all-property action shelves declare exact source, fetched and delivered totals for their projected feeds. |
| `HOME_CHANGE_SUMMARY` | Covered in this effort: answer-first 30-day summary scopes covered sources before canonical, deduplicated change blocks and preserves honest empty/unavailable states. |
| `HOME_DEADLINE_MONITOR` | Covered in this effort: monitor proposal resolves one canonical dated obligation and discloses due date, lead time, delivery channel, consent and no-change states before confirmation. |
| `HOME_DIGITAL_WILL` | Covered in this effort: the enabled-entry and trusted-contact sections declare their complete in-memory totals. |
| `HOME_EVENT_CORRECT` | Covered in this effort: the ambiguous-target command pairs its bounded event read with an authoritative visible-event count. |
| `HOME_EVENT_RADAR_FEED` | Covered in this effort: collection descriptor with cursor continuation (Phase 2). |
| `HOME_EVENT_VISIBILITY` | Covered in this effort: the ambiguous-target command pairs its bounded event read with an authoritative visible-event count. |
| `HOME_STATUS_BOARD` | Covered in this effort: collection descriptor, unknown-is-not-good section, lead sentence; fixtures and journey 1. |
| `HOME_TIMELINE_EVENTS` | Covered in this effort: timeline fixture. |
| `HVAC_DECISION_CONTINUE` | Covered in this effort: decision-thread fixtures cover deterministic rationale, canonical-fact evidence, preference references, assumptions and limitations. |
| `HVAC_DECISION_SCENARIO` | Covered in this effort: completed scenario comparison now declares its dated Decision Platform engine basis and an explicit isolated-scenario limitation. |
| `HVAC_DECISION_START` | Covered in this effort: item-carrying warranty follow-up on the decision card, journey 4. |
| `HVAC_SPECIALIST_ENGAGE` | Covered in this effort: ready Specialist recommendation carries its canonical snapshot date, Decision Platform engine version, deterministic rationale and an explicit professional boundary. |
| `INCIDENT_CLAIM_STATUS` | Covered in this effort: the status view declares exact bucket-count source totals, bounded fetched rows and delivered rows for every filter state. |
| `INCIDENT_CONTINUATION` | Covered in this effort: answer-first continuation declares recorded workflow choices, canonical record freshness and an emergency-response boundary. |
| `INSPECTION_FINDINGS` | Covered in this effort: open confirmed findings declare their authoritative filtered total, bounded fetch and delivered deck rows. |
| `INSPECTION_FINDING_UPDATE` | Covered in this effort: both the ambiguous-target selection and batch-review branches declare their authoritative collection semantics. |
| `INSPECTION_NEGOTIATION_PACKAGE` | Covered in this effort: the negotiation package declares the authoritative open-finding total, bounded serious-finding fetch and delivered decisions. |
| `INSPECTION_REPORTS` | Covered in this effort: inspection reports declare their authoritative non-archived total, bounded fetch and delivered report rows. |
| `INSPECTION_REPORT_COMPARE` | Covered in this effort: document-evidence fixture. |
| `INSPECTION_REPORT_FINDINGS` | Covered in this effort: one report’s findings declare their authoritative total, bounded fetch and delivered outcome rows. |
| `INTELLIGENCE_ENVELOPE_QUERY` | Covered in this effort: the paged Envelope read declares fetched and delivered rows, an unknown global total, and the real continuation state. |
| `INVENTORY_ITEM_CORRECT` | Covered in this effort: the ambiguous-target command declares the complete inventory total and bounded selection rows. |
| `INVENTORY_ITEM_CREATE` | Covered in this effort: producer-contract review: the actual workflow emits capture, summary and confirmation blocks only; its broad command allow-list does not represent a list-producing path. |
| `INVENTORY_LOOKUP` | Covered in this effort: collection descriptor and gated Next control (Phase 2). |
| `MAINTENANCE_BUDGET_FORECAST` | Covered in this effort: budget breakdown declares complete category and month totals with no truncation or continuation. |
| `MAINTENANCE_FORECAST` | Covered in this effort: forecast list declares the complete prediction total and honest first-20 delivery truncation with no unsupported continuation. |
| `MAINTENANCE_STATUS` | Covered in this effort: maintenance shelves declare exact canonical totals, delivered rows and server-window continuation state. |
| `MAINTENANCE_TASK_UPDATE` | Covered in this effort: the ambiguous-target command declares the complete task total and bounded selection rows without unsupported continuation. |
| `MAINTENANCE_TEMPLATES_BROWSE` | Covered in this effort: template catalogue declares source, fetched and delivered totals across applicability buckets without offering unsupported continuation. |
| `MAJOR_EVENT_ENTRY` | Covered in this effort: event-specific answer wraps governed capability discovery with an explicit legal, tax, insurance, safety and professional boundary. |
| `MATERIAL_SPECS_LIST` | Covered in this effort: record-explorer fixture. |
| `NEGOTIATION_SHIELD_CASES` | Covered in this effort: case lists and every review subcollection declare source, fetched and delivered totals without unsupported continuation. |
| `NEGOTIATION_SHIELD_CASE_ANALYZE` | Covered in this effort: the confirmed analysis reuses the fully declared review collections in its completion receipt. |
| `NEGOTIATION_SHIELD_CASE_START` | Covered in this effort: the fixed scenario choice grid declares its complete lossless collection. |
| `OPERATIONAL_WORK_UPDATE` | Covered in this effort: the ambiguous-target command declares the complete tracked-work total and bounded selection rows. |
| `PROPERTY_SUMMARY` | Covered in this effort: room and completeness collections declare their authoritative totals and bounded delivery. |
| `PROPERTY_TAX_APPEAL_READINESS` | Covered in this effort: appeal-readiness fixtures cover gaps and canonical facts with reviewed-rule/evidence dates and a tax/appraisal/legal boundary. |
| `QUOTE_COMPARISON_REVIEW` | Covered in this effort: quote-review fixtures cover scope-aligned comparison, per-quote freshness, recorded-evidence dates and the provider-endorsement boundary. |
| `REFINANCE_ANALYSIS` | Covered in this effort: scenario answer: tradeoff lead, assumptions, dated benchmark; fixtures and journey 2 (the canonical analysis branch is not a pure builder). |
| `REFINANCE_RATE_MONITOR` | Covered in this effort: monitor proposal declares the governed benchmark, exact threshold, delivery cadence, quiet hours, source boundary and consent before confirmation. |
| `RENOVATION_PERMIT_READINESS` | Covered in this effort: renovation-readiness fixtures cover the blocking-item basis, dated readiness sources and the legal-compliance boundary. |
| `REPLACEMENT_GUIDANCE` | Covered in this effort: item-carrying warranty follow-up, journey 4. |
| `ROOM_CREATE` | Covered in this effort: producer-contract review: the actual workflow emits capture, summary and confirmation blocks only; its broad command allow-list does not represent a list-producing path. |
| `ROOM_RENAME` | Covered in this effort: the ambiguous-target command pairs its bounded room read with an authoritative room count. |
| `SEASONAL_HOME_CARE` | Covered in this effort: plan and walkthrough fixtures; declared truncation; journey 3. |
| `SELLER_PREP_CHECKLIST` | Covered in this effort: checklist declares its progress basis, canonical Property Sale Case freshness and an explicit listing/disclosure boundary. |
| `SELL_HOLD_RENT_ANALYSIS` | Covered in this effort: comparison and what-if fixtures cover the directional rationale, dated model sources, material assumptions and financial/tax/legal boundary. |
| `WARRANTY_CORRECT` | Covered in this effort: the ambiguous-target command declares the requester-owned warranty total and bounded fetched selection rows. |
| `WARRANTY_LOOKUP` | Covered in this effort: item-scoped answer, journey 4 (the whole-home list is not yet migrated). |

## Requires collection adoption

| Operation | Why |
|---|---|
| `DO_NOTHING_SIMULATION` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HIRING_GUIDE` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOA_COMPLIANCE_STATUS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOME_BASICS_GUIDE` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOME_BRIEFING_VIEW` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOME_HABITS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOME_UPGRADE_SCENARIOS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HOME_WORK_ITEMS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `HVAC_DECISION_OUTCOME_REPORT` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `HVAC_DECISION_OUTCOME_UNLINK` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `HVAC_DECISION_OUTCOME_VIEW` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `NEIGHBORHOOD_CHANGE_FEED` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `OWNERSHIP_COSTS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PAST_HAZARD_EXPOSURE` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PERMIT_TRACKER_STATUS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PLANT_CARE_OUTLOOK` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PRICE_FINALIZATIONS_LIST` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PROJECT_TRACKER_PROJECTS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `PROPERTY_BRIEFS_LIST` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `RECALL_MATCH_UPDATE` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `RECALL_REVIEW` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `ROOM_PLANT_RECOMMENDATIONS` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `SAVINGS_OPPORTUNITIES` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |
| `SELLER_PREP_ITEM_DECISION` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `SELL_HOLD_RENT_GOAL_CAPTURE` | A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own. |
| `SERVICE_PRICE_CHECKS` | A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total. |

## Requires trust or rationale adoption

| Operation | Why |
|---|---|

## Compact receipt: no rich migration needed

| Operation | Why |
|---|---|
| `BUYER_CLOSING_DISCLOSURE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_CLOSING_ITEM_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_CONTRACT_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_FINDING_DISPOSITION` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_INSURANCE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_LIFECYCLE_UPDATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_LOAN_ESTIMATE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_PLAN_SETUP_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_TASK_COMPLETE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_TASK_CREATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_WALKTHROUGH_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPITAL_TIMELINE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_EVENT_CONFIRM` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_EVIDENCE_CONFIRM` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_FACT_CONFIRM` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_WARRANTY_CONFIRM` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CLAIM_ACTIVITY_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CLAIM_FILE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `COVERAGE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_COMPLETION_RECOVER` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_ABANDON` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_COMPLETE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_NOTE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_START` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_SKILL_PROFILE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_STEP_UPDATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DOCUMENT_PROMOTION_CONFIRM` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DO_NOTHING_SCENARIO_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DO_NOTHING_SIMULATION_RUN` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `FINANCING_PROFILE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `GUIDANCE_JOURNEY_DISMISS` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `GUIDANCE_STEP_SKIP` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOA_COMPLIANCE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_BRIEFING_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_BRIEFING_SHARE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_FEEDBACK` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_MARK_DONE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_PREFERENCES` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_STATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_TASK` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABITS_GENERATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABIT_PREFERENCES_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABIT_UPDATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_JOURNEY_SET` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_PLANT_ADD` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_RECORD_STATE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_UPGRADE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_WORK_ITEM_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOUSEHOLD_INVITATION` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_DECISION_ABANDON` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_PREFERENCE_FORGET` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_PREFERENCE_SAVE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INSPECTION_FINDING_DECISION_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INSPECTION_REPORT_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MAINTENANCE_TASK_COMPLETE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MAINTENANCE_TASK_CREATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MATERIAL_SPEC_ADD` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_BUYER_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_ATTACH` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_UPDATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEIGHBORHOOD_INTERACTION_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `OWNERSHIP_COST_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PAST_HAZARD_OUTCOME_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PERMIT_TRACKER_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PRICE_FINALIZATION_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROJECT_TRACKER_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROJECT_TRACKER_CREATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_BRIEF_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_CONTEXT_AREA_CAPTURE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_PURCHASE_DATE_SET` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_TAX_APPEAL_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_TAX_COMPARABLE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `QUOTE_COMPARISON_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `QUOTE_COMPARISON_CREATE` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RENOVATION_CASE_START` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RENOVATION_READINESS_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RESERVE_FUND_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SAVINGS_BENEFIT_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SEASONAL_CHECKLIST_SETUP` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SEASONAL_ITEM_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SELLER_PREP_CASE_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SERVICE_PRICE_CHECK_RUN` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `STATUS_BOARD_COMMAND` | A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |

## Specialized workflow requiring later review

| Operation | Why |
|---|---|

## Not applicable (boundary operations)

| Operation | Why |
|---|---|
| `EMERGENCY_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
| `OUT_OF_SCOPE_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
| `UNSAFE_RESTRICTED_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
