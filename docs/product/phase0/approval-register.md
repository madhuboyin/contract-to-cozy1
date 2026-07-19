# Phase 0 Approval Register

This register records the human release gates that code cannot approve on behalf of accountable owners. Reviews are deferred during internal beta because there are no real users. They become blocking before real-user launch when `ENFORCE_HUMAN_POLICY_APPROVALS=true`.

## Framework policy approval

| Role | Status | Reviewer | Approved at | Policy version | Notes |
| --- | --- | --- | --- | --- | --- |
| Product | Deferred — internal beta | — | — | `phase0-v1` | Required before real-user launch; confirms jobs, action vocabulary, outcome definition, and user controls. |
| Domain | Deferred — internal beta | — | — | `phase0-v1` | Required by tier before real-user launch; confirms material, regulated, and safety recommendation boundaries. |
| Trust | Deferred — internal beta | — | — | `phase0-v1` | Required by tier before real-user launch; confirms evidence, uncertainty, escalation, and correction controls. |
| Legal / Compliance | Deferred — internal beta | — | — | `phase0-v1` | Required for regulated/coverage and safety/emergency real-user launches. |
| Commercial Integrity | Deferred — internal beta | — | — | `phase0-v1` | Required for commercial real-user launches involving a provider, purchase, or financing action. |

## Recording an approval

For each accountable reviewer:

1. Replace `Pending` with `Approved` only after an actual review.
2. Record reviewer identity and an ISO-8601 approval timestamp.
3. Keep the policy version exact; approval for an older version does not authorize a newer version.
4. Provide the same fields to `evaluateRecommendationLaunchReadiness` for the specific recommendation launch.
5. Reopen approval when safety policy, commercial relationships, ranking logic, or required evidence changes materially.

Do not replace `Deferred — internal beta` with `Approved` merely to enable testing. Beta testing is controlled by `ENFORCE_HUMAN_POLICY_APPROVALS`; approval records must remain genuine human attestations.

## Database application gate

| Gate | Status | Owner | Evidence |
| --- | --- | --- | --- |
| Generate and apply the Prisma enum migration | Pending | Repository owner | Owner-managed migration output and successful schema validation |
| Reset/reseed development and test databases if needed | Pending | Repository owner | Environment-specific verification |

No migration script is stored in this repository. There are no real users and no data backfill is required.
