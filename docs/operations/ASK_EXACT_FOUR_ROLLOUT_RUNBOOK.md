# Ask exact-four: rollout and verification runbook

Scope: the shared Ask finalizer now selects exactly four distinct typed Suggested Next Actions for a settled, property-scoped answer, using four curated starter
sources (`PROPERTY_SUMMARY` x2, `SEASONAL_HOME_CARE` x2, `HOME_BASICS_GUIDE` x2, `HIRING_GUIDE` x1). Activated on `main` in merge `e698ceaf` (code commit
`252f1efd`); the dismissal control shipped in `0fa05af2`. Design: `docs/product/ASK_COZY_EXACT_FOUR_OPPORTUNITY_INVENTORY.md` and
`ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN.md` (Appendix C.15/C.16).

Nothing in this runbook has been run against the real database or the Pi. Treat every expectation below as a hypothesis to confirm.

## 1. Before the rollout

- `prisma db push` has created `ask_suggested_action_lifecycles` and the `AskSuggestedActionDismissalReason` enum (done by the owner). In workers, `npx prisma generate`.
- Seasonal seed SQL run (`apps/backend/prisma/seasonalTaskTemplates.pgadmin.seed.sql`), so the three tropical fall templates exist (done by the owner).
- Backend and frontend images rebuilt, then an explicit rollout restart (`:latest` never restarts pods on its own).

## 2. Immediately after the restart

1. **Boot is healthy.** The backend must not crash-loop. The boot-time governance check fails fatally if an Ask operation lacks a Skill owner and is not in `KNOWN_UNGOVERNED_OPERATIONS`;
   the three new operations (`SEASONAL_HOME_CARE`, `HOME_BASICS_GUIDE`, `HIRING_GUIDE`) are carved out there; `PROPERTY_SUMMARY` already has a Skill. A crash-loop right after this rollout points at that check first (`kubectl logs` for `Ask operation ... has a property role floor but no owning Skill`).
2. **Ask a typed question on a property** (for example "What maintenance is pending?"). The settled answer should show four chips. On a home with data, expect fewer starters and more specific actions
   only if other producers nominated; today only the result producer and the four starters exist.
3. **Run the two `PROPERTY_SUMMARY` starter questions on an empty property as a viewer**, then `apps/backend/prisma/askStarterCheck.pgadmin.sql`. This is the owner's outstanding gate.

## 3. Metrics (Prometheus)

All counters are bounded labels only; no homeowner text.

| Metric | Meaning |
|---|---|
| `ask_suggested_actions_exact_four_total{result}` | One increment per finalized answer that went through exact-four. `result` is `FULL` (four shown), `DEGRADED` (a bounded shortage) or `EXEMPT` (recovery, pending interaction). **Sum this to count answers.** |
| `ask_suggested_actions_exact_four_reasons_total{result,reason}` | One increment per reason. A single answer may add several, so **never sum it as an answer count.** |
| `ask_suggested_actions_candidates_total{stage,mode}` | `nominated`, `invalid`, `eligible`, `rejected`, `selected`. |
| `ask_suggested_actions_pipeline_duration_seconds{mode}` | Finalizer wall time. Budget is 250 ms (`SUGGESTED_NEXT_ACTION_BUDGET.pipelineMs`); watch the Pi. |
| `ask_suggested_actions_producer_failures_total{producer,reason}` | `ERROR` or `BUDGET`. A starter producer showing `BUDGET` means the pipeline is over budget and starters are being dropped first. |
| `ask_suggested_actions_lifecycle_missing_row_total` | A selection or completion marker found no lifecycle row (a failed offer write, or a wrong identity). Should stay near zero. |

Useful queries:

```promql
# Share of answers that reached four vs degraded
sum(rate(ask_suggested_actions_exact_four_total[15m])) by (result)

# Why answers degrade (reasons; not an answer count)
sum(rate(ask_suggested_actions_exact_four_reasons_total{result="DEGRADED"}[15m])) by (reason)

# Starters dropped for budget
sum(rate(ask_suggested_actions_producer_failures_total{reason="BUDGET"}[15m])) by (producer)

# Finalizer p95
histogram_quantile(0.95, sum(rate(ask_suggested_actions_pipeline_duration_seconds_bucket[15m])) by (le))
```

Expected healthy shape: `FULL` dominates. `DEGRADED` with `COOLDOWN_SUPPRESSED` is expected only for users who dismissed several starters; `NO_CANDIDATES` with `PRODUCER_DROPPED` means the starters
were dropped for budget. `UNEXPLAINED` should never appear.

## 4. Database checks (pgAdmin, read-only)

```sql
-- Offers recorded: one row per user, property and outcome. Expect up to 7 starter rows per active property.
SELECT "operationId", "outcomeKey", count(*) AS rows, sum("offerCount") AS offers, max("lastOfferedAt") AS last_offered
FROM "ask_suggested_action_lifecycles"
GROUP BY 1, 2 ORDER BY 1, 2;

-- Active dismissals per user and property (the supported bound is 30).
SELECT "userId", "propertyId", count(*) AS dismissals
FROM "ask_suggested_action_lifecycles"
WHERE "dismissalReason" IS NOT NULL
GROUP BY 1, 2 HAVING count(*) > 20 ORDER BY dismissals DESC;

-- Selections and completions recorded for starters.
SELECT "operationId", "outcomeKey", count(*) FILTER (WHERE "selectedAt" IS NOT NULL) AS selected, count(*) FILTER (WHERE "completedAt" IS NOT NULL) AS completed
FROM "ask_suggested_action_lifecycles" GROUP BY 1, 2 ORDER BY 1, 2;
```

## 5. What can go wrong, and the first move

| Symptom | Likely cause | First move |
|---|---|---|
| Backend crash-loops at boot | Governance carve-out missing for an operation | Check `KNOWN_UNGOVERNED_OPERATIONS`; if urgent, revert `252f1efd` |
| Answers slower on the Pi | Finalizer now does a lifecycle read and up to four offer writes | Check the p95 query and `ask_suggested_actions_pipeline_duration_seconds`; starters are dropped first under budget |
| Fewer than four chips | `DEGRADED` reasons above; or a user dismissed several starters | Read the reason counter; check dismissals per user |
| The same four starters every time | Rotation is soft (least recently offered first, 7-day window) | Expected on a home with no other producers; more producers add variety |
| `lifecycle_missing_row_total` rising | Offer writes failing (table missing, permissions) | Confirm the table exists and the backend role can write it |
| A starter's wording is wrong | Authored content | Edit `homeBasicsGuide.ts` / `hiringGuide.ts` / the seasonal catalog; the wording was approved 34 of 34 on October 5, 2026 |

## 6. Rollback

Revert the activation commit `252f1efd` (and its merge `e698ceaf` if needed), rebuild, and restart. The lifecycle table can stay: it is only read and written by
the finalizer, and reverting stops both. The dismissal endpoint and the UI control are independent and harmless without exact-four.
