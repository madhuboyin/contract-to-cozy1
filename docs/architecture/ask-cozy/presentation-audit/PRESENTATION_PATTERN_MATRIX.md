# Ask Cozy Presentation Pattern Matrix

## Minimum practical pattern set

Nine patterns cover the present 30 block renderers without inventing one pattern per tool.

| Pattern | Existing blocks/primitives | Representative operations | Required interactions |
|---|---|---|---|
| 1. Direct answer / status summary | `SUMMARY`, chips, `METRIC_ROW`, `LIMITATION`, `BOUNDARY` | property summary, status board, coverage | follow-up, refresh where relevant |
| 2. Prioritized action list | `PRIORITY_LIST`, grouped list, maintenance stack | home actions, maintenance, seasonal care | filter, review, mutate, remind later (future) |
| 3. Record explorer | `GROUPED_LIST`, `TABLE`, detail sheet/sub-renderers | inventory, warranties, documents, claims | search/filter/page/detail/correct |
| 4. Comparison / financial insight | `COMPARISON`, `SCENARIO_COMPARISON`, `METRIC_ROW`, `ASSUMPTIONS` | refinance, HVAC, sell/hold/rent, coverage | scenario change, explain, start workflow |
| 5. Timeline / milestone | `TIMELINE`, `WORKFLOW_PROGRESS`, `PROGRESS` | home timeline, buyer deadlines, capital timeline | filter, detail, continue workflow |
| 6. Guided decision / task guide | `TASK_GUIDE`, `DECISION_PROGRESS`, `WHY_NOW`, `DECISION_TRACE` | DIY, guidance journeys, decision threads | next/skip/pause/help/confirm |
| 7. Document/evidence insight | `EVIDENCE`, `RELATED_RECORDS`, `OUTPUT_ARTIFACTS`, `CHANGE_SUMMARY` | documents, inspection, promotion | attach/review/promote/navigate |
| 8. Monitor / proactive insight | `MONITOR`, `PROACTIVE_INSIGHT`, `RECOMMENDATION_CHANGE` | refinance monitor, proactive attention | pause/stop/change threshold |
| 9. Empty/error/recovery | `EMPTY_STATE`, `ERROR_STATE`, `CAPABILITY_LIST`, boundaries | all operations | retry, add context, choose capability |

## Coverage by operation family

| Registry family | Count | Primary pattern(s) |
|---|---:|---|
| Command | 103 | guided action, recovery, status receipt |
| Record query | 47 | record explorer, direct answer, evidence |
| Status summary | 23 | status summary, prioritized action list |
| Decision analysis | 14 | comparison/financial insight, guided decision |
| Workflow guidance | 3 | task guide/timeline |
| Monitor | 2 | monitor/proactive insight |
| Capability discovery | 1 | empty/recovery/capability list |
| General home guidance | 1 | direct answer/guide |
| Unsafe/restricted | 2 | boundary/recovery |
| Out of scope | 1 | boundary/recovery |

## Intent-dependent presentation

The same domain can already vary presentation by routing or producer branch:

- “When does the roof warranty expire?” can be a direct summary plus evidence.
- “Show all warranties” can be a record explorer.
- “Which warranties need attention?” can be a prioritized list.

The architecture supports this today, but it is implicit. The recommended extension is a small producer-owned presentation profile (`DIRECT_ANSWER`, `COLLECTION`, `ATTENTION`, `COMPARE`, `GUIDE`) validated against result shape. It should not be persisted merely to mirror UI vocabulary, and it should not replace block types.

## Existing reusable components to preserve

- block registry and core blocks;
- grouped-list declared patterns;
- task guide, lifespan, progress, timeline, comparison strip;
- evidence/related-record/output-artifact blocks;
- typed action links and item dispatch;
- confirmation/capture cards;
- result view state and compatibility fallback.

## Missing shared capabilities

- uniform delivered/total/paging/disclosure semantics;
- standardized source/freshness/basis display for material estimates;
- a reusable compact action-overflow policy;
- a consistent “why this matters” field that does not depend on block IDs;
- validated intent-to-presentation profiles for the same operation/domain.
