// Mirrors which RenovationInspectionStageType values have a non-empty checklist
// in apps/backend/.../inspectionReadinessChecklists.data.ts. PLAN_REVIEW and
// PRE_CONSTRUCTION are documentation-only stages — nothing to photograph.
export const READINESS_CHECKABLE_STAGE_TYPES = new Set([
  'FOUNDATION',
  'FRAMING',
  'ROUGH_IN',
  'ELECTRICAL',
  'PLUMBING',
  'MECHANICAL',
  'INSULATION',
  'FINAL',
  'OTHER',
]);
