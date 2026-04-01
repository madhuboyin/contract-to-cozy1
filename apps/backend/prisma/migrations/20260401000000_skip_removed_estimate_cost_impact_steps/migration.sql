-- Migration: skip_removed_estimate_cost_impact_steps
--
-- Context:
--   asset_lifecycle_resolution template was bumped from v2.0.0 → v2.1.0.
--   The `estimate_cost_impact` step (stepOrder 3, toolKey: 'true-cost') was
--   removed because it routed users to a property-wide 5-year cost projection
--   that had no item context — the repair/replace cost analysis is already
--   covered inline by RepairReplaceGate in the preceding step.
--
-- What this migration does:
--   For all existing journeys that still have this step in a non-terminal state
--   (PENDING or IN_PROGRESS), mark it as SKIPPED with a TEMPLATE_REMOVED reason
--   so the step resolver bypasses it and advances to check_coverage.
--
--   Steps already COMPLETED or SKIPPED are left untouched — the user
--   either already visited it (completed) or it was previously bypassed.

UPDATE "guidance_journey_steps"
SET
  "status"            = 'SKIPPED',
  "skippedReasonCode" = 'TEMPLATE_REMOVED',
  "skippedReason"     = 'Step removed from asset_lifecycle_resolution template v2.1.0. Repair/replace cost analysis is covered inline by RepairReplaceGate in the preceding step.',
  "skippedAt"         = NOW(),
  "updatedAt"         = NOW()
WHERE
  "stepKey" = 'estimate_cost_impact'
  AND "status" IN ('PENDING', 'IN_PROGRESS');
