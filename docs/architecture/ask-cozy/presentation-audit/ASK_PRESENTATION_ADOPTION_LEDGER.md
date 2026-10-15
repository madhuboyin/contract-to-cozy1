# Ask Presentation Adoption Ledger

**Generated:** by `apps/backend/scripts/generate-ask-adoption-ledger.js` from the live operation registry. Do not edit by hand.

**Operations:** 197

Each registered Ask operation has exactly one class. The class is derived from registry facts (family, allowed block types) plus an explicit
list of operations this effort reviewed (`REVIEWED_OPERATIONS` in `apps/backend/src/services/ask/presentation/adoptionLedger.ts`). A test fails
when an operation has no class or this file is out of date. "Already compliant" means covered by a deterministic fixture or contract-level
journey test, not verified in a browser or against a live backend.

| Class | Operations |
|---|---:|
| Already compliant (covered by a fixture or journey test; not runtime-verified) | 16 |
| Requires collection adoption | 53 |
| Requires trust or rationale adoption | 12 |
| Compact receipt: no rich migration needed | 103 |
| Specialized workflow requiring later review | 10 |
| Not applicable (boundary operations) | 3 |

## Already compliant (covered by a fixture or journey test; not runtime-verified)

| Operation | Why |
|---|---|
| `BREAK_EVEN_ANALYSIS` | Covered in this effort: audited against the COMPARE profile; fixture. |
| `BUYER_DEADLINES` | Covered in this effort: exact task identity, reconciliation, journey 5. |
| `BUYER_PLAN_STATUS` | Covered in this effort: reconciliation, journey 5. |
| `COVERAGE_REVIEW_STATUS` | Covered in this effort: audited against the ATTENTION profile; fixture. |
| `DOCUMENT_LOOKUP` | Covered in this effort: collection descriptor (Phase 5). |
| `HOME_EVENT_RADAR_FEED` | Covered in this effort: collection descriptor with cursor continuation (Phase 2). |
| `HOME_STATUS_BOARD` | Covered in this effort: collection descriptor, unknown-is-not-good section, lead sentence; fixtures and journey 1. |
| `HOME_TIMELINE_EVENTS` | Covered in this effort: timeline fixture. |
| `HVAC_DECISION_START` | Covered in this effort: item-carrying warranty follow-up on the decision card, journey 4. |
| `INSPECTION_REPORT_COMPARE` | Covered in this effort: document-evidence fixture. |
| `INVENTORY_LOOKUP` | Covered in this effort: collection descriptor and gated Next control (Phase 2). |
| `MATERIAL_SPECS_LIST` | Covered in this effort: record-explorer fixture. |
| `REFINANCE_ANALYSIS` | Covered in this effort: scenario answer: tradeoff lead, assumptions, dated benchmark; fixtures and journey 2 (the canonical analysis branch is not a pure builder). |
| `REPLACEMENT_GUIDANCE` | Covered in this effort: item-carrying warranty follow-up, journey 4. |
| `SEASONAL_HOME_CARE` | Covered in this effort: plan and walkthrough fixtures; declared truncation; journey 3. |
| `WARRANTY_LOOKUP` | Covered in this effort: item-scoped answer, journey 4 (the whole-home list is not yet migrated). |

## Requires collection adoption

| Operation | Why |
|---|---|
| `APPLIANCE_FAILURE_RISK` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_CLOSING_DAY_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_CONTRACT_TIMELINE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_COST_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_FINANCING_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_INSURANCE_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_LOAN_ESTIMATES` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_MOVE_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_NEGOTIATION_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_TITLE_ESCROW_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `BUYER_WALKTHROUGH_READINESS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `CLAIM_CHECKLIST_VIEW` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `COVERAGE_COMPARISON_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `COVERAGE_GAPS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `DIY_PROJECTS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `DIY_TEMPLATE_BROWSE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `DOCUMENT_PROMOTION_REVIEW` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `DO_NOTHING_SIMULATION` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `GUIDANCE_JOURNEYS_LIST` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `GUIDANCE_JOURNEY_CONTINUE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HIRING_GUIDE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOA_COMPLIANCE_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_ACTIONS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_BASICS_GUIDE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_BRIEFING_VIEW` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_DIGITAL_WILL` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_HABITS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_UPGRADE_SCENARIOS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HOME_WORK_ITEMS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `HVAC_DECISION_OUTCOME_VIEW` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INCIDENT_CLAIM_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INSPECTION_FINDINGS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INSPECTION_NEGOTIATION_PACKAGE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INSPECTION_REPORTS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INSPECTION_REPORT_FINDINGS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `INTELLIGENCE_ENVELOPE_QUERY` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `MAINTENANCE_BUDGET_FORECAST` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `MAINTENANCE_FORECAST` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `MAINTENANCE_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `MAINTENANCE_TEMPLATES_BROWSE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `NEGOTIATION_SHIELD_CASES` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `NEIGHBORHOOD_CHANGE_FEED` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `OWNERSHIP_COSTS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PAST_HAZARD_EXPOSURE` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PERMIT_TRACKER_STATUS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PLANT_CARE_OUTLOOK` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PRICE_FINALIZATIONS_LIST` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PROJECT_TRACKER_PROJECTS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PROPERTY_BRIEFS_LIST` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `PROPERTY_SUMMARY` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `RECALL_REVIEW` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `SAVINGS_OPPORTUNITIES` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |
| `SERVICE_PRICE_CHECKS` | A read that can return a list or table: declare the collection (source total, delivered, continuation) and check the Next control. |

## Requires trust or rationale adoption

| Operation | Why |
|---|---|
| `CAPITAL_RESERVE_PLAN` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `FINANCING_OVERVIEW` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `HOME_DEADLINE_MONITOR` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `HVAC_DECISION_CONTINUE` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `HVAC_DECISION_SCENARIO` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `HVAC_SPECIALIST_ENGAGE` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `PROPERTY_TAX_APPEAL_READINESS` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `QUOTE_COMPARISON_REVIEW` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `REFINANCE_RATE_MONITOR` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `RENOVATION_PERMIT_READINESS` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `SELLER_PREP_CHECKLIST` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |
| `SELL_HOLD_RENT_ANALYSIS` | A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile. |

## Compact receipt: no rich migration needed

| Operation | Why |
|---|---|
| `BUYER_CLOSING_DISCLOSURE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_CLOSING_ITEM_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_CONTRACT_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_FINDING_DISPOSITION` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_INSURANCE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_LIFECYCLE_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_LOAN_ESTIMATE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_PLAN_SETUP_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_TASK_COMPLETE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_TASK_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_TASK_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `BUYER_WALKTHROUGH_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPITAL_TIMELINE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_EVENT_CONFIRM` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_EVIDENCE_CONFIRM` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_FACT_CONFIRM` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CAPTURE_WARRANTY_CONFIRM` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CLAIM_ACTIVITY_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CLAIM_FILE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `CLAIM_TRANSITION` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `COVERAGE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_COMPLETION_RECOVER` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_ABANDON` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_COMPLETE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_NOTE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_PROJECT_START` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_SKILL_PROFILE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DIY_STEP_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DOCUMENT_PROMOTION_CONFIRM` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DO_NOTHING_SCENARIO_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `DO_NOTHING_SIMULATION_RUN` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `FINANCING_PROFILE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `GUIDANCE_JOURNEY_DISMISS` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `GUIDANCE_STEP_SKIP` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOA_COMPLIANCE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_BRIEFING_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_BRIEFING_SHARE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_CORRECT` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_FEEDBACK` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_MARK_DONE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_PREFERENCES` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_STATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_RADAR_TASK` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_EVENT_VISIBILITY` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABITS_GENERATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABIT_PREFERENCES_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_HABIT_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_JOURNEY_SET` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_PLANT_ADD` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_RECORD_STATE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_UPGRADE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOME_WORK_ITEM_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HOUSEHOLD_INVITATION` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_DECISION_ABANDON` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_DECISION_OUTCOME_REPORT` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_DECISION_OUTCOME_UNLINK` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_PREFERENCE_FORGET` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `HVAC_PREFERENCE_SAVE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INSPECTION_FINDING_DECISION_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INSPECTION_FINDING_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INSPECTION_REPORT_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INVENTORY_ITEM_CORRECT` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `INVENTORY_ITEM_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MAINTENANCE_TASK_COMPLETE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MAINTENANCE_TASK_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MAINTENANCE_TASK_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `MATERIAL_SPEC_ADD` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_BUYER_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_ANALYZE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_ATTACH` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_START` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEGOTIATION_SHIELD_CASE_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `NEIGHBORHOOD_INTERACTION_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `OPERATIONAL_WORK_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `OWNERSHIP_COST_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PAST_HAZARD_OUTCOME_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PERMIT_TRACKER_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PRICE_FINALIZATION_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROJECT_TRACKER_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROJECT_TRACKER_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_BRIEF_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_CONTEXT_AREA_CAPTURE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_PURCHASE_DATE_SET` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_TAX_APPEAL_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `PROPERTY_TAX_COMPARABLE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `QUOTE_COMPARISON_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `QUOTE_COMPARISON_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RECALL_MATCH_UPDATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RENOVATION_CASE_START` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RENOVATION_READINESS_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `RESERVE_FUND_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `ROOM_CREATE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `ROOM_PLANT_RECOMMENDATIONS` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `ROOM_RENAME` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SAVINGS_BENEFIT_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SEASONAL_CHECKLIST_SETUP` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SEASONAL_ITEM_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SELLER_PREP_CASE_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SELLER_PREP_ITEM_DECISION` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SELL_HOLD_RENT_GOAL_CAPTURE` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `SERVICE_PRICE_CHECK_RUN` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `STATUS_BOARD_COMMAND` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |
| `WARRANTY_CORRECT` | A confirmed write or proposal; its result is a compact receipt or review card, so no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator. |

## Specialized workflow requiring later review

| Operation | Why |
|---|---|
| `BUYER_DISCLOSURE_FUNDS_READINESS` | A read with no list or table block allowed: a direct-answer profile only, not yet audited. |
| `BUYER_DOCUMENT_READINESS` | A read with no list or table block allowed: a direct-answer profile only, not yet audited. |
| `BUYER_INSPECTION_REVIEW` | A read with no list or table block allowed: a direct-answer profile only, not yet audited. |
| `CAPABILITY_DISCOVERY` | A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later. |
| `DIY_PROJECT_GUIDE` | A read with no list or table block allowed: a direct-answer profile only, not yet audited. |
| `GROUNDED_GUIDANCE` | A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later. |
| `GUIDANCE_JOURNEY_CREATE` | A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later. |
| `HOME_CHANGE_SUMMARY` | A read with no list or table block allowed: a direct-answer profile only, not yet audited. |
| `INCIDENT_CONTINUATION` | A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later. |
| `MAJOR_EVENT_ENTRY` | A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later. |

## Not applicable (boundary operations)

| Operation | Why |
|---|---|
| `EMERGENCY_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
| `OUT_OF_SCOPE_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
| `UNSAFE_RESTRICTED_BOUNDARY` | A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy. |
