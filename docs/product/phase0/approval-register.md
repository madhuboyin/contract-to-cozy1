# Phase 0 Approval Register

This register records the human release gates that code cannot approve on behalf of accountable owners. A recommendation remains blocked until the executable approval records supplied at launch cover every role required by its tier and commercial status.

## Framework policy approval

| Role | Status | Reviewer | Approved at | Policy version | Notes |
| --- | --- | --- | --- | --- | --- |
| Product | Pending | — | — | `phase0-v1` | Confirms jobs, action vocabulary, outcome definition, and user controls. |
| Domain | Pending | — | — | `phase0-v1` | Confirms material, regulated, and safety recommendation boundaries. |
| Trust | Pending | — | — | `phase0-v1` | Confirms evidence, uncertainty, escalation, and correction controls. |
| Legal / Compliance | Pending | — | — | `phase0-v1` | Required for regulated/coverage and safety/emergency launches. |
| Commercial Integrity | Pending | — | — | `phase0-v1` | Required when a provider, purchase, or financing action is commercial. |

## Recording an approval

For each accountable reviewer:

1. Replace `Pending` with `Approved` only after an actual review.
2. Record reviewer identity and an ISO-8601 approval timestamp.
3. Keep the policy version exact; approval for an older version does not authorize a newer version.
4. Provide the same fields to `evaluateRecommendationLaunchReadiness` for the specific recommendation launch.
5. Reopen approval when safety policy, commercial relationships, ranking logic, or required evidence changes materially.

## Database application gate

| Gate | Status | Owner | Evidence |
| --- | --- | --- | --- |
| Generate and apply the Prisma enum migration | Pending | Repository owner | Owner-managed migration output and successful schema validation |
| Reset/reseed development and test databases if needed | Pending | Repository owner | Environment-specific verification |

No migration script is stored in this repository. There are no real users and no data backfill is required.
