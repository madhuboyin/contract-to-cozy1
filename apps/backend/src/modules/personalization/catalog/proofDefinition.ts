// apps/backend/src/modules/personalization/catalog/proofDefinition.ts
//
// The "one inactive HVAC-filter definition" item in
// docs/personalization/09-implementation-roadmap.md's first implementation
// step — the one exception to the "no rule logic" Phase 0 scope decision
// that governs the other 27 entries in catalogPlan.ts. This definition has
// a real, evaluatable ruleAst, but stays `status: 'DRAFT'` (inactive) —
// nothing reads or surfaces it to any user; it exists to prove the
// validator/evaluator/evaluation-run pipeline works end to end.
//
// Deliberately a different code from catalogPlan.ts's `hvac_filter_pet_adjusted`
// (which is pet-adjusted by design and needs household data) — this one
// depends only on the property-only `hvacFilterReplacementOverdue` trait,
// per the roadmap's "without collecting household data" constraint. See
// adr-0001-personalization-module-foundation.md.
import { RuleNode } from '../domain/ruleAst';

export const HVAC_FILTER_PROOF_DEFINITION_CODE = 'hvac_filter_replacement_check_proof';
export const HVAC_FILTER_PROOF_CATEGORY = 'low_cost_prevention';
export const HVAC_FILTER_PROOF_RULE_VERSION = 1;

export const HVAC_FILTER_PROOF_RULE_AST: RuleNode = {
  op: 'trait',
  key: 'hvacFilterReplacementOverdue',
  cmp: 'eq',
  value: true,
};
