# Ask Cozy Skill-less Operation Governance Audit

**Date:** November 5, 2026

**Scope:** Findings Implementation Plan, Phase 1 (`ASK_COZY_TECHNICAL_ARCHITECTURE_FINDINGS_IMPLEMENTATION_PLAN.md` §5). Every Ask operation that no Skill owns, classified by how it is entered and governed.

**Source of truth:** `SKILL_GOVERNANCE_EXCEPTIONS` in `apps/backend/src/services/intelligence/skillGovernanceExceptions.contract.ts`. The table below was generated from it and from `npm run audit:ask-architecture`; regenerate it instead of hand-editing. Counts are a point-in-time measurement.

## Evidence labels

- **Executed:** the boot validator, the Phase 0 inventory, and the registry tests were run against the real registries. No database, Redis, or model was involved.
- **Code-traced:** the entry-path claims for the 65 governed commands rest on the coverage-matrix notes and the registries, not on a live request.
- **Source-analysed:** the deterministic typed route claim is read from the `resolveAskOperation` AST and cross-checked by a test against every record's declared entry paths.
- **Not claimed:** that a listed entry path is the only one at runtime. The validator proves the records are structurally consistent with the registries; it does not trace every client request.

## Result

| Classification | Count | Meaning |
|---|---|---|
| `TEMPORARY_GAP` | 23 | Message-routable, no Skill: 20 reads and 3 confirmation-gated commands. Each has an owner and the removal condition below. |
| `GOVERNED_INTERNAL_COMMAND` | 65 | Excluded from fuzzy routing and confirmation-gated. 60 are entered by a declared action only; 5 by a declared action or a deterministic typed pattern. |
| `DETERMINISTIC_TYPED_READ` | 4 | Read-only, excluded from fuzzy routing, reachable by a deterministic typed route. |
| `LAUNCH_ONLY` | 2 | Read-only, reached only by a launch context; no typed pattern reaches them. |
| `INTERNAL_CAPTURE` | 5 | Created programmatically by conversational capture. |
| `INTENTIONAL_PLATFORM` | 5 | Orchestrator-native boundary/discovery responses with no role floor. |
| **Total** | **104** | 99 former carve-outs plus the 5 null-floor operations the validator exempted structurally |

**Removal condition for every `TEMPORARY_GAP`:** assign exactly one owning Skill, or make the operation non-message-routable through an approved deterministic entry-path classification.

## Findings that changed the plan's assumptions

1. **"Internal" does not mean unreachable from a message.** `ASK_INTERNAL_OPERATION_IDS` only removes an operation from fuzzy/semantic routing. Nine Skill-less internal operations (`HOME_BASICS_GUIDE`, `SEASONAL_HOME_CARE`, `NOTIFICATIONS_OVERVIEW`, `NOTIFICATION_SETTINGS_OVERVIEW`, and the five commands marked "yes" in the governed-command table) are still returned by a deterministic pattern in `resolveAskOperation`. They are classified `DETERMINISTIC_TYPED_READ` or `GOVERNED_INTERNAL_COMMAND` with `DETERMINISTIC_TYPED_ROUTE` declared, never `LAUNCH_ONLY`. The test `entry paths agree with the real deterministic route table` fails if a record disagrees with the source.
2. **Only two of the four launch-style reads are launch-only.** Code comments call `HOME_BASICS_GUIDE` and `SEASONAL_HOME_CARE` non-routable and launch-only, but their stored starter message is matched by a deterministic pattern. Only `HIRING_GUIDE` and `MAINTENANCE_TEMPLATES_BROWSE` have no typed route.
3. **The four `CAPTURE_*_CONFIRM` operations are `INTERNAL_CAPTURE`, not declared-action commands.** The coverage matrix labels them `CONFIRMED_MUTATION` because of its priority rule, but `conversationalCapture.ts` creates them programmatically. The taxonomy describes the entry path; their confirmation and command invariants are validated separately.
4. **The temporary gaps include 16 reads that a typed pattern reaches, and 4 that only fuzzy routing reaches** (`CLAIM_CHECKLIST_VIEW`, `INSPECTION_NEGOTIATION_PACKAGE`, `INSPECTION_REPORT_COMPARE`, `INSPECTION_REPORT_FINDINGS`). Their records declare `MESSAGE_ROUTING` only.
5. **The gap is about governance, not the risk of the read.** A read-only, message-routable operation with no Skill still skips Skill feature flags, allowlists, and risk policy. For the three commands, confirmation protects the write but does not replace those controls.
6. **Matrix labelling oddity, not changed here.** `askInteractionCoverageMatrix.ts` gives `NOTIFICATIONS_OVERVIEW` and `NOTIFICATION_SETTINGS_OVERVIEW` the class `INTERNAL_CAPTURE`, although their notes describe read-only conversations. The exception records classify them from behavior; the matrix label is a separate cleanup.

## Validator rules added

`validateSkillOperationGovernanceCoverage` now rejects: a Skill-less operation with no record; a record for an operation a Skill now owns; a record for an unknown operation; an empty reason, governing reference, entry-path set, or control set; an entry path outside the record's class; an internal, launch-only, capture, or governed-command record whose operation is message-routable; a temporary gap that is not message-routable; a temporary gap without an owner or removal condition; a governed command without exactly one domain command, a confirmation control, or a declared-action entry path; a read-only record with a domain command or a confirmation control; a launch-only record declaring a typed route; a typed read without a typed route, a deterministic execution mode, or an owner; a platform record with a role floor; and a non-platform record without one. Duplicate registrations are reported through the same startup check. `KNOWN_UNGOVERNED_OPERATIONS` is now derived from the registry for existing consumers and is not a second source.

## Audit table

### TEMPORARY_GAP (23)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| BUYER_INSURANCE_READINESS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | buyer.insurance-readiness |
| BUYER_LOAN_ESTIMATES | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | buyer.loan-estimates |
| CLAIM_CHECKLIST_VIEW | VIEWER | MESSAGE_ROUTING | no | claim-checklist.view |
| COMMUNITY_UPDATES | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | community.updates |
| COVERAGE_REVIEW_STATUS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | coverage.review-status |
| ENVIRONMENT_REPORT | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | environment-report.read |
| FINANCING_OVERVIEW | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | financing.overview |
| HOME_BRIEFING_VIEW | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | home-briefing.view |
| HOME_RECORD_EXPORT | CONTRIBUTOR | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE, DECLARED_ACTION | yes | home-record-export.command |
| HOME_RECORD_EXPORT_STATUS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | home-record-export.status |
| HOME_WORK_ITEMS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | home-work-items.list |
| HOUSEHOLD_ACCESS_SUMMARY | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | household.access-summary |
| INSPECTION_NEGOTIATION_PACKAGE | CONTRIBUTOR | MESSAGE_ROUTING | no | inspection-negotiation-package.build |
| INSPECTION_REPORTS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | inspection-reports.list |
| INSPECTION_REPORT_COMPARE | VIEWER | MESSAGE_ROUTING | no | inspection-report-compare.view |
| INSPECTION_REPORT_FINDINGS | VIEWER | MESSAGE_ROUTING | no | inspection-report-findings.view |
| PERMIT_TRACKER_STATUS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | permits.status |
| RECALL_MATCH_UPDATE | CONTRIBUTOR | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE, DECLARED_ACTION | yes | recalls.update |
| RECALL_REVIEW | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | recalls.review |
| RISK_MITIGATION_PLAN | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | risk-mitigation.plan |
| ROOM_PLANT_RECOMMENDATIONS | CONTRIBUTOR | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE, DECLARED_ACTION | yes | plant-advisor.room-recommendations |
| SAVED_RESULTS | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | saved.results |
| WORK_OVERVIEW | VIEWER | MESSAGE_ROUTING, DETERMINISTIC_TYPED_ROUTE | yes | work.overview |

### GOVERNED_INTERNAL_COMMAND (65)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| BUYER_CLOSING_DISCLOSURE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_CLOSING_ITEM_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_CONTRACT_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_INSURANCE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_LOAN_ESTIMATE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_PLAN_SETUP_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| BUYER_WALKTHROUGH_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| CAPITAL_TIMELINE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| CLAIM_ACTIVITY_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| COVERAGE_ANALYSIS_RUN | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| COVERAGE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| COVERAGE_RECORD_CHECK | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| COVERAGE_TERM_REVIEW | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| DIY_PROJECT_NOTE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| DIY_SKILL_PROFILE_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |
| DO_NOTHING_SCENARIO_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| DO_NOTHING_SIMULATION_RUN | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| ENVIRONMENT_REPORT_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| FINANCING_PROFILE_COMMAND | OWNER | DECLARED_ACTION | no | n/a |
| GUIDANCE_STEP_DECLARE | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOA_COMPLIANCE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_BRIEFING_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |
| HOME_BRIEFING_SHARE_COMMAND | OWNER | DECLARED_ACTION | no | n/a |
| HOME_HABITS_GENERATE | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_HABIT_PREFERENCES_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_HABIT_UPDATE | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_JOURNEY_SET | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_PLANT_ADD | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_RECORD_EXPORT_SHARE | CONTRIBUTOR | DECLARED_ACTION, DETERMINISTIC_TYPED_ROUTE | yes | n/a |
| HOME_RECORD_STATE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_UPGRADE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| HOME_WORK_ITEM_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| INSPECTION_FINDINGS_CHECK | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| INSPECTION_FINDING_DECISION_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| INSPECTION_REPORT_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| INSPECTION_REPORT_REVIEW | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| MAINTENANCE_EVIDENCE_ATTACH | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| MATERIAL_SPEC_ADD | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| MATERIAL_SPEC_UPDATE | CONTRIBUTOR | DECLARED_ACTION, DETERMINISTIC_TYPED_ROUTE | yes | n/a |
| NEGOTIATION_SHIELD_BUYER_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| NEGOTIATION_SHIELD_CASE_ANALYZE | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| NEGOTIATION_SHIELD_CASE_ATTACH | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| NEGOTIATION_SHIELD_CASE_START | CONTRIBUTOR | DECLARED_ACTION, DETERMINISTIC_TYPED_ROUTE | yes | n/a |
| NEGOTIATION_SHIELD_CASE_UPDATE | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| NEIGHBORHOOD_INTERACTION_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |
| NOTIFICATION_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |
| NOTIFICATION_SETTINGS_COMMAND | VIEWER | DECLARED_ACTION, DETERMINISTIC_TYPED_ROUTE | yes | n/a |
| OWNERSHIP_COST_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| PAST_HAZARD_OUTCOME_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| PERMIT_TRACKER_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| PRICE_FINALIZATION_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| PROPERTY_PURCHASE_DATE_SET | OWNER | DECLARED_ACTION | no | n/a |
| PROPERTY_TAX_APPEAL_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| PROPERTY_TAX_COMPARABLE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| QUOTE_COMPARISON_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| RENOVATION_CASE_START | CONTRIBUTOR | DECLARED_ACTION, DETERMINISTIC_TYPED_ROUTE | yes | n/a |
| RENOVATION_READINESS_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| SAVED_ARCHIVE_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |
| SAVINGS_BENEFIT_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| SEASONAL_CHECKLIST_SETUP | OWNER | DECLARED_ACTION | no | n/a |
| SEASONAL_ITEM_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| SELLER_PREP_CASE_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| SERVICE_PRICE_CHECK_RUN | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| STATUS_BOARD_COMMAND | CONTRIBUTOR | DECLARED_ACTION | no | n/a |
| WORK_REQUEST_COMMAND | VIEWER | DECLARED_ACTION | no | n/a |

### DETERMINISTIC_TYPED_READ (4)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| HOME_BASICS_GUIDE | VIEWER | DETERMINISTIC_TYPED_ROUTE, LAUNCH_CONTEXT | yes | home-basics.guide |
| NOTIFICATIONS_OVERVIEW | VIEWER | DETERMINISTIC_TYPED_ROUTE, LAUNCH_CONTEXT | yes | notifications.overview |
| NOTIFICATION_SETTINGS_OVERVIEW | VIEWER | DETERMINISTIC_TYPED_ROUTE, LAUNCH_CONTEXT | yes | notification.settings.overview |
| SEASONAL_HOME_CARE | VIEWER | DETERMINISTIC_TYPED_ROUTE, LAUNCH_CONTEXT | yes | seasonal.home-care |

### LAUNCH_ONLY (2)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| HIRING_GUIDE | VIEWER | LAUNCH_CONTEXT | no | hiring-guide.read |
| MAINTENANCE_TEMPLATES_BROWSE | VIEWER | LAUNCH_CONTEXT | no | maintenance.templates-browse |

### INTERNAL_CAPTURE (5)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| CAPTURE_EVENT_CONFIRM | CONTRIBUTOR | PROGRAMMATIC_CAPTURE | no | n/a |
| CAPTURE_EVIDENCE_CONFIRM | CONTRIBUTOR | PROGRAMMATIC_CAPTURE | no | n/a |
| CAPTURE_FACT_CONFIRM | CONTRIBUTOR | PROGRAMMATIC_CAPTURE | no | n/a |
| CAPTURE_WARRANTY_CONFIRM | CONTRIBUTOR | PROGRAMMATIC_CAPTURE | no | n/a |
| SELL_HOLD_RENT_GOAL_CAPTURE | CONTRIBUTOR | PROGRAMMATIC_CAPTURE | no | n/a |

### INTENTIONAL_PLATFORM (5)

| Operation | Role floor | Entry paths | Typed route in source | Owner |
|---|---|---|---|---|
| CAPABILITY_DISCOVERY | none | ORCHESTRATOR_BOUNDARY, MESSAGE_ROUTING | yes | n/a |
| EMERGENCY_BOUNDARY | none | ORCHESTRATOR_BOUNDARY, MESSAGE_ROUTING | yes | n/a |
| GROUNDED_GUIDANCE | none | ORCHESTRATOR_BOUNDARY, MESSAGE_ROUTING | yes | n/a |
| OUT_OF_SCOPE_BOUNDARY | none | ORCHESTRATOR_BOUNDARY, MESSAGE_ROUTING | yes | n/a |
| UNSAFE_RESTRICTED_BOUNDARY | none | ORCHESTRATOR_BOUNDARY, MESSAGE_ROUTING | yes | n/a |

## Next

The 23 `TEMPORARY_GAP` entries are the Skill-authoring backlog. Phase 1 writes no Skills and gives no operation a synthetic Skill. Each owner above is the operation's canonical owner (its adapter key, restated as `canonicalOwner` in the coverage matrix); who schedules that work is a repository-owner decision.
