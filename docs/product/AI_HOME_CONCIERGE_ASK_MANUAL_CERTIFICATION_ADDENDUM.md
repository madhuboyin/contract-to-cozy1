# AI Home Concierge Ask — Manual Certification Living Addendum

**Product:** ContractToCozy — Ask Cozy
**Document type:** Manual Testing and Release-Certification Addendum
**Status:** Living document
**Version:** 1.5
**Date:** August 15, 2026
**Parent:** `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md`

---

## 1. Purpose

This addendum defines the product-authored Ask Cozy prompts and runtime scenarios that must be manually certified. It complements automated routing, trust, semantic-relevance, integration, and end-to-end tests; it does not replace them.

The checklist exists because a prompt can route correctly and still fail after context composition, canonical execution, answer-trust validation, response persistence, or frontend presentation. Every prompt shown by Ask Cozy is a product promise and is therefore a release-blocking golden path.

## 2. Living-document requirement

This is a **living document**. It shall be updated in the same change whenever any of the following occurs:

- a fixed, fallback, lifecycle, capability-explorer, attention, decision, or other suggested prompt is added, removed, or reworded;
- a dynamic prompt template or its category changes;
- an operation, context provider, canonical adapter, trust rule, clarification path, confirmation path, CTA, or audience rule changes;
- manual testing, automated testing, an audit, or a deployed environment reveals a new failure scenario;
- a new lifecycle, property state, role, language, data-availability state, or operational degradation mode becomes supported; or
- a formerly optional source becomes required, or a required source becomes optional.

A prompt or scenario is not complete merely because it exists in code. It must appear in this inventory with an expected operation and expected behavior. A change that affects this inventory without updating it is documentation drift and fails release readiness.

## 3. Scope and source of truth

This inventory covers the current homeowner-visible Ask Cozy categories:

1. Understand
2. Maintain
3. Protect
4. Save
5. Decide
6. Plan and Monitor

The implementation remains the runtime source of truth. The current prompt sources are:

- `apps/backend/src/services/ask/askLifecyclePromptPolicy.ts`;
- `CONCIERGE_CAPABILITY_GROUPS` in `apps/backend/src/services/ask/askOrchestrator.service.ts`;
- dynamic prompt builders in `apps/backend/src/services/ask/askFocusedGuidance.ts` and `askConciergePromptPolicy.ts`; and
- frontend fallback prompts in `apps/frontend/src/components/ask/AskWorkspace.tsx`.

Dynamic prompts cannot be exhaustively enumerated because record titles and entity names are data-driven. Their templates and mandatory representative substitutions are listed below.

## 4. Prompt certification inventory

### 4.1 Understand

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | Give me a summary of my home record. | `PROPERTY_SUMMARY` |
| [ ] | How complete is my home record? | `PROPERTY_SUMMARY` |
| [ ] | Summarize this home record before closing. | `PROPERTY_SUMMARY` |
| [ ] | Give me a summary of my new home record. | `PROPERTY_SUMMARY` |
| [ ] | Summarize my home record for a buyer. | `PROPERTY_SUMMARY` |
| [ ] | Give me a summary of this home record. | `PROPERTY_SUMMARY` |
| [ ] | Show missing inventory details. | `INVENTORY_LOOKUP` |
| [ ] | Show incomplete inventory records. | `INVENTORY_LOOKUP` |
| [ ] | Which systems are nearing end of life? | `INVENTORY_LOOKUP`; directly returns recorded lifecycle matches or a truthful no-match/empty-record answer without clarification. |

Expected behavior:

- return a direct summary or completeness answer grounded in the selected home;
- distinguish a complete record from missing, conflicted, stale, or unavailable information;
- never turn missing source data into an all-clear;
- show only role-appropriate record-review or capture actions; and
- treat both missing-inventory word orders as the same incomplete-inventory request and continue successfully after inline context capture or clarification.

### 4.2 Maintain

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | What maintenance tasks are due this month? | `MAINTENANCE_STATUS` |
| [ ] | Create a maintenance task for changing my HVAC filter. | `MAINTENANCE_TASK_CREATE` |
| [ ] | What home actions need attention before closing? | `HOME_ACTIONS` |
| [ ] | What maintenance tasks should I handle first? | `MAINTENANCE_STATUS` |
| [ ] | What maintenance tasks are coming due? | `MAINTENANCE_STATUS` |
| [ ] | What home actions need attention before listing? | `HOME_ACTIONS` |
| [ ] | What maintenance tasks are pending? | `MAINTENANCE_STATUS` |

Dynamic attention templates:

| Test | Prompt/template | Expected operation |
| --- | --- | --- |
| [ ] | What should I do next for “{maintenance action title}”? | `HOME_ACTIONS` with `HOME_ACTION` launch context |
| [ ] | How should I prepare for the multi-day heat risk at this home? | `HOME_ACTIONS` with `HOME_ACTION` launch context |
| [ ] | How should I prepare for the {weather or environment event} at this home? | `HOME_ACTIONS` with `HOME_ACTION` launch context |

Mandatory representative substitutions:

- [ ] What should I do next for “Schedule HVAC service”?
- [ ] What should I do next for “Inspect exterior drainage”?
- [ ] What should I do next for “Replace smoke detector batteries”?
- [ ] How should I prepare for the freeze warning at this home?

Seasonal maintenance probes:

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | What seasonal tasks are pending? | `MAINTENANCE_STATUS` |
| [ ] | What summer tasks are pending? | `MAINTENANCE_STATUS` |
| [ ] | What winter tasks are coming due? | `MAINTENANCE_STATUS` |
| [ ] | Show completed seasonal tasks. | `MAINTENANCE_STATUS` |
| [ ] | Show dismissed seasonal tasks. | `MAINTENANCE_STATUS` |
| [ ] | List pending seasonal tasks. | `MAINTENANCE_STATUS` |

Expected behavior:

- ordinary maintenance questions use canonical maintenance data even when optional seasonal or journey context is unavailable;
- empty canonical maintenance data returns an explicit verified empty state rather than a generic source failure;
- seasonal questions use seasonal checklist state and return a typed limitation when that optional source is specifically required by the question; and
- create/update/complete requests require the applicable capture and confirmation flow before mutation.

### 4.3 Protect

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | Which items are missing coverage? | `COVERAGE_GAPS` |
| [ ] | What changed recently for this home? | `HOME_CHANGE_SUMMARY` |
| [ ] | Which items are missing coverage records? | `COVERAGE_GAPS` |
| [ ] | Which systems or appliances are missing coverage records? | `COVERAGE_GAPS` |
| [ ] | Which items may be missing coverage? | `COVERAGE_GAPS` |

Dynamic attention template:

| Test | Prompt/template | Expected operation |
| --- | --- | --- |
| [ ] | What should I do next for “{incident, recall, or coverage action title}”? | `HOME_ACTIONS` with `HOME_ACTION` launch context |

Mandatory representative substitutions:

- [ ] What should I do next for “Review the refrigerator recall”?
- [ ] What should I do next for “Add the HVAC warranty record”?
- [ ] What should I do next for “Review the open water-damage incident”?

Expected behavior:

- report recorded gaps, incidents, recalls, or material changes without inventing coverage;
- distinguish no matching records from an unavailable source; and
- preserve emergency, authorization, and professional boundaries where applicable.

### 4.4 Save

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | Where could I save money on this home? | `SAVINGS_OPPORTUNITIES` |
| [ ] | What are my biggest ownership costs? | `OWNERSHIP_COSTS` |
| [ ] | What are the ownership costs for this home after purchase? | `OWNERSHIP_COSTS` |
| [ ] | Where could I reduce ownership costs? | `SAVINGS_OPPORTUNITIES` |

Dynamic attention template:

| Test | Prompt/template | Expected operation |
| --- | --- | --- |
| [ ] | What should I do next for “{savings opportunity title}”? | `HOME_ACTIONS` with `HOME_ACTION` launch context |

Mandatory representative substitutions:

- [ ] What should I do next for “Claim the available utility rebate”?
- [ ] What should I do next for “Review the insulation savings opportunity”?
- [ ] What should I do next for “Reduce the home’s energy costs”?

Expected behavior:

- distinguish recorded ownership costs from estimates and unavailable inputs;
- show assumptions, limitations, and time basis where applicable; and
- never present a generic saving suggestion as a verified property-specific saving.

### 4.5 Decide

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | Help me compare repair and replacement options for a home system or appliance. | Focused entity clarification, then `REPLACEMENT_GUIDANCE` or `HVAC_DECISION_START` |
| [ ] | Help me compare contractor quotes. | `QUOTE_COMPARISON_REVIEW` |
| [ ] | Help me compare selling, holding, or renting this home. | `SELL_HOLD_RENT_ANALYSIS` |

Dynamic prompts:

| Test | Prompt/template | Expected operation |
| --- | --- | --- |
| [ ] | Should I repair or replace my {inventory item}? | `REPLACEMENT_GUIDANCE` with `INVENTORY_ITEM` launch context |
| [ ] | Help me continue this decision: {decision title} | `HVAC_DECISION_CONTINUE` with `DECISION_THREAD` launch context |

Mandatory representative substitutions:

- [ ] Should I repair or replace my refrigerator?
- [ ] Should I repair or replace my HVAC system?
- [ ] Should I repair or replace my water heater?
- [ ] Help me continue this decision: Repair or replace the refrigerator
- [ ] Help me continue this decision: Repair or replace the HVAC system

Expected behavior:

- generic questions request only the entity or facts needed to continue;
- entity-bound prompts retain the selected inventory item or decision thread;
- comparison answers expose material assumptions, evidence, confidence, and limitations; and
- Ask does not silently substitute maintenance status, home actions, or another nearby operation.

### 4.6 Plan and Monitor

| Test | Prompt | Expected operation |
| --- | --- | --- |
| [ ] | Create a capital reserve plan for future replacements. | `CAPITAL_RESERVE_PLAN` |
| [ ] | Monitor my important home deadlines. | `HOME_DEADLINE_MONITOR` |
| [ ] | What home actions should I handle in my first 90 days? | `HOME_ACTIONS` |
| [ ] | Which home actions should I plan for next? | `HOME_ACTIONS` |
| [ ] | Help me prepare for selling my home. | `MAJOR_EVENT_ENTRY` |
| [ ] | What should I plan for next? | `HOME_ACTIONS` |

Dynamic attention template:

| Test | Prompt/template | Expected operation |
| --- | --- | --- |
| [ ] | What should I do next for “{project or sale-preparation action title}”? | `HOME_ACTIONS` with `HOME_ACTION` launch context |

Mandatory representative substitutions:

- [ ] What should I do next for “Prepare the home for listing”?
- [ ] What should I do next for “Complete the kitchen renovation permit”?
- [ ] What should I do next for “Plan the roof replacement”?

Expected behavior:

- planning reads return prioritized, property-specific work rather than unrelated guidance;
- monitor creation captures the target, date or threshold, channel, and other required inputs before confirmation;
- capital planning distinguishes recorded facts, estimates, and assumptions; and
- material changes require confirmation, authorization recheck, and idempotent execution.

## 5. Required execution matrix

Every fixed prompt and every dynamic-template representative shall be exercised against all applicable states below. `N/A` must be recorded with a reason; it shall not be silently skipped.

| State | Required assertion |
| --- | --- |
| Normal populated home | Correct operation, direct useful response, correct selected home, valid blocks and CTAs |
| No matching records | Verified empty state; no fabricated records and no generic failure |
| Partial records | Available facts shown with explicit limitations; missing inputs not treated as facts |
| Optional provider unavailable | Canonical answer remains available unless the question explicitly requires that optional source |
| Required provider unavailable | Honest operation-specific unavailable state; no false all-clear |
| Provider timeout | Same required/optional behavior as an unavailable provider; retry semantics are accurate |
| Stale provider | Staleness is disclosed when used; irrelevant stale optional evidence does not block the answer |
| Semantic validator enabled | Correct answer passes; mismatch or genuine uncertainty follows the intended repair path |
| Semantic validator disabled | Certified deterministic journeys remain usable |
| New conversation | Prompt completes without relying on prior hidden context |
| Pending clarification | New prompt does not become incorrectly bound to stale clarification state |
| Pending capture or confirmation | Resume/cancel/new-request behavior is explicit and does not mutate unexpectedly |
| Empty history after clear | Prompt behaves like a new request and retains selected-home scope |
| Owner | All authorized read and mutation affordances behave as defined |
| Contributor | Only role-appropriate reads, captures, confirmations, and CTAs are shown |
| Viewer | Authorized reads work; write and correction controls that mutate data are omitted or blocked |
| Model/classifier unavailable | Safety, deterministic routing, supported reads, and focused clarification remain usable |
| Backend restart/redeployment | Persisted pending work resumes safely and a new prompt can still be started |
| Production-like schema | All providers required by the prompt can query the deployed schema; optional missing schema does not poison unrelated reads |

### 5.1 Session lifecycle matrix

| Test | Expected behavior |
| --- | --- |
| Open Ask Cozy normally | A fresh empty conversation opens; the prior transcript is not rendered automatically |
| Open an explicit session or notification link | The referenced session and execution are restored |
| Recent-session inventory | At most five non-empty sessions for the selected home are shown, newest first, and every item was active within the rolling previous seven days |
| Open a recent session | The exact selected transcript is restored and accepts follow-up questions in the same session |
| Start a new conversation | The current transcript leaves the workspace without being deleted and becomes eligible for the recent-session list |
| Session older than seven days | It is absent from the recent-session list without changing backend retention or canonical artifacts |
| Switch selected home | No transcript or context from the previous home is carried into the new home |
| Pending consequential workflow | It remains available in the pending-work surface independently of the five-session/seven-day recent list |
| Delete current conversation | The session disappears while domain records and artifacts created through Ask remain unchanged |

## 6. Cross-cutting manual assertions

For every executed row, record and verify:

- displayed prompt and submitted text are identical unless a dynamic context binding is intentionally attached;
- selected property ID and visible property label are correct;
- routed operation and Skill match the inventory;
- response status is appropriate (`ANSWERED`, `READY_WITH_LIMITATIONS`, clarification, confirmation, or a truthful unavailable state);
- the first visible block directly addresses the question;
- counts, dates, money, statuses, and entities match canonical records;
- an empty answer is backed by a complete authoritative read;
- optional failures do not masquerade as required-source failures;
- clarification asks one relevant question and offers relevant choices;
- correction and retry controls perform the action their labels promise;
- links and CTAs remain within the selected home and are valid for the household role;
- mutations do not occur before confirmation;
- refresh, navigation, and session resume do not duplicate mutations or lose pending work; and
- the homeowner UI contains no internal enum, operation ID, fact key, or implementation terminology.

## 7. Result recording

Each certification run shall record:

| Field | Required value |
| --- | --- |
| Run date/time | ISO timestamp and local timezone |
| Environment | Local, staging, or production |
| Frontend version | Commit or deployment identifier |
| Backend version | Commit or deployment identifier |
| Database/schema version | Applied schema identifier or confirmation |
| Tester | Name or identifier |
| Property fixture | Property ID/label and relevant state description |
| Prompt ID/template | Stable prompt ID or dynamic template name |
| Submitted prompt | Exact text |
| Expected operation | Registered operation ID |
| Actual operation | Observed operation ID |
| Expected state | Expected response status and key behavior |
| Actual state | Observed response status and key behavior |
| Result | Pass, fail, or N/A with reason |
| Evidence | Screenshot, execution ID, trace ID, or log reference |
| Defect/regression | Issue or test reference when failed |

## 8. Release criteria

Ask Cozy is manually certified for release only when:

1. every currently displayed fixed prompt passes its applicable execution matrix;
2. every dynamic template passes all mandatory representative substitutions;
3. no first-party prompt produces an unrelated answer, unexplained clarification, generic trust rejection, false all-clear, unauthorized CTA, or cross-property result;
4. optional-source degradation does not block unrelated canonical functionality;
5. required-source degradation fails truthfully and safely;
6. all mutation prompts preserve capture, confirmation, authorization, idempotency, and audit behavior;
7. every critical or major defect has been fixed and retested; and
8. the deployed frontend and backend versions tested are the versions proposed for release.

Passing this checklist is bounded evidence for the scenarios recorded. It reduces release risk but does not prove that no defect exists. Every newly discovered failure shall be added here and converted into automated regression coverage where practical.

## 9. Change log

### 9.1 Baseline findings and resolution status

The initial inventory validation found the following release-blocking mismatches. Both routing defects are fixed in the local implementation and protected by automated regressions. They remain deployment-verification rows until retested through the deployed application:

| Prompt | Expected | Current local routing observation after remediation on August 15, 2026 |
| --- | --- | --- |
| Create a capital reserve plan for future replacements. | `CAPITAL_RESERVE_PLAN` | `CAPITAL_RESERVE_PLAN` through deterministic precedence; deployed retest pending |
| Monitor my important home deadlines. | `HOME_DEADLINE_MONITOR` | `HOME_DEADLINE_MONITOR` through deterministic precedence; deployed retest pending |

The generic repair-or-replace prompt intentionally lacks an entity and currently requests clarification. That is acceptable only when the clarification is focused on selecting the home system or appliance and continues to the appropriate registered decision operation.

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | August 15, 2026 | Initial living inventory of fixed and dynamic Ask Cozy category prompts, degradation states, manual assertions, evidence fields, and release criteria |
| 1.1 | August 15, 2026 | Added the missing-inventory response suggestion and its post-capture/clarification continuation as a release-blocking regression scenario |
| 1.2 | August 15, 2026 | Recorded local remediation of the capital-reserve and general home-deadline routing failures; retained both as deployed manual-verification rows |
| 1.3 | August 15, 2026 | Expanded the incomplete-inventory regression from one synthetic item to the exact first-party prompt across empty, no-match, multi-item, synthesized-summary, and post-clarification canonical result shapes |
| 1.4 | August 15, 2026 | Added the exact lifecycle inventory suggestion across empty, no-match, matched-record, and post-clarification outcomes; required focus-specific typed answer validation |
| 1.5 | August 15, 2026 | Added fresh-by-default Ask sessions, explicit restoration of the five most recent sessions within a rolling seven-day window, home isolation, deep-link behavior, and pending-work independence |
