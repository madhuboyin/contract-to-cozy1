# Recommendation Launch Gate

No material homeowner recommendation should launch until every applicable gate passes.

The executable gate is `evaluateRecommendationLaunchReadiness` in `apps/backend/src/productFramework/recommendationLaunchGate.ts`. Approval records are policy-version-specific and must identify the reviewer, role, timestamp, and optional notes.

## Outcome and action

- [ ] A named homeowner outcome and accountable owner exist.
- [ ] The homeowner's next action is clear and measurable.
- [ ] Completion, intentional deferment, deliberate dismissal, and safe escalation semantics are defined.
- [ ] The interaction improves the Living Home Record or future guidance.

## Evidence and uncertainty

- [ ] Required property facts and evidence are defined.
- [ ] Provenance, freshness, confidence, and missing context are visible.
- [ ] Assumptions are explicit and correctable.
- [ ] Options and material tradeoffs are represented fairly.
- [ ] Low-confidence and unavailable-data fallbacks are safe.
- [ ] Conflicting facts prevent unsupported certainty.

## Safety tier

- [ ] A safety tier is assigned.
- [ ] Material financial guidance includes assumptions, at least two options, tradeoffs, and a professional boundary.
- [ ] Regulated/coverage guidance includes a verified jurisdiction check and professional boundary.
- [ ] Safety/emergency guidance includes conservative fallback and immediate escalation.
- [ ] Domain review is recorded where required.

Required approval roles:

| Tier or condition | Required roles |
| --- | --- |
| Low consequence | `PRODUCT` |
| Material financial | `PRODUCT`, `DOMAIN`, `TRUST` |
| Regulated / coverage | `PRODUCT`, `DOMAIN`, `TRUST`, `LEGAL_COMPLIANCE` |
| Safety / emergency | `PRODUCT`, `DOMAIN`, `TRUST`, `LEGAL_COMPLIANCE` |
| Any commercial action | Add `COMMERCIAL_INTEGRITY` |

## Commercial integrity

- [ ] Commercial involvement is explicitly recorded.
- [ ] Relationship, compensation, and ranking influence are disclosed.
- [ ] Selection criteria are understandable.
- [ ] A non-commercial alternative is available.
- [ ] `NOT_RECORDED` cannot reach a commercial CTA.

## Control and accountability

- [ ] The user can correct, defer, snooze, dismiss, mark already done, or mark not relevant as appropriate.
- [ ] Material recommendation version and evidence are auditable.
- [ ] Recommendation reversal, complaint, and incident handling are defined.
- [ ] AI output is schema-validated and cannot bypass tier controls.

## Measurement and operations

- [ ] Entry, trigger, signal, action, recommendation, execution, verification, and outcome lineage is available.
- [ ] Importance and action-window policies are defined.
- [ ] Quality, calibration, outcome, override, and failure metrics are observable.
- [ ] Support and rollback paths are ready.
- [ ] Post-launch review has a named owner and schedule.

## Database policy

- [ ] Any required `schema.prisma` change is included.
- [ ] No Prisma or SQL migration script is included.
- [ ] The repository owner has the schema diff needed to generate and apply the migration.
