// apps/backend/src/modules/personalization/domain/evaluator.ts
//
// Typed rule evaluator — the other half of the "typed rule validator/
// evaluator" item in docs/personalization/09-implementation-roadmap.md's
// "first implementation step". Evaluates a validated RuleNode (ruleAst.ts)
// against a trait-value map using three-valued (Kleene strong) logic, per
// 04-target-architecture.md: "Unknown data is three-valued (TRUE, FALSE,
// UNKNOWN); safety rules fail closed, while profiling rules can emit a
// question opportunity."
//
// Scope limit (see docs/personalization/adr-0001-personalization-module-foundation.md):
// only `trait`/`all`/`any`/`not` are actually evaluated — that's everything
// this proof's one HVAC-filter definition needs. `fact`/`history`/`date`
// nodes are structurally valid (ruleAst.ts already checked their shape) but
// always evaluate to UNKNOWN here, tagged `notImplemented: true` so a
// caller can tell "we don't have this data" apart from "we haven't wired
// this evaluation path yet" — implementing them for real needs the
// context-assembler/normalized-fact infrastructure, which is Phase 1 scope.
import { RuleNode } from './ruleAst';

export type ThreeValued = 'TRUE' | 'FALSE' | 'UNKNOWN';

export type TraitPrimitive = boolean | number | string | null;
export type TraitReading =
  | { known: true; value: TraitPrimitive | TraitPrimitive[] }
  | { known: false };

export type TraitMap = Record<string, TraitReading>;

export interface EvaluationEvidence {
  path: string;
  op: RuleNode['op'];
  result: ThreeValued;
  detail?: string;
  notImplemented?: boolean;
}

export interface EvaluationResult {
  result: ThreeValued;
  /** True only when result === 'TRUE' — never treat UNKNOWN as eligible. */
  eligible: boolean;
  evidence: EvaluationEvidence[];
}

function notNode(a: ThreeValued): ThreeValued {
  if (a === 'TRUE') return 'FALSE';
  if (a === 'FALSE') return 'TRUE';
  return 'UNKNOWN';
}

/** Kleene strong AND: FALSE dominates, then UNKNOWN, else TRUE. */
function allNode(results: ThreeValued[]): ThreeValued {
  if (results.some((r) => r === 'FALSE')) return 'FALSE';
  if (results.some((r) => r === 'UNKNOWN')) return 'UNKNOWN';
  return 'TRUE';
}

/** Kleene strong OR: TRUE dominates, then UNKNOWN, else FALSE. */
function anyNode(results: ThreeValued[]): ThreeValued {
  if (results.some((r) => r === 'TRUE')) return 'TRUE';
  if (results.some((r) => r === 'UNKNOWN')) return 'UNKNOWN';
  return 'FALSE';
}

function evaluateTraitComparison(
  cmp: 'eq' | 'in' | 'gte' | 'lte' | 'exists',
  actual: TraitPrimitive | TraitPrimitive[],
  expected: unknown,
): boolean {
  switch (cmp) {
    case 'exists':
      return actual !== null && actual !== undefined;
    case 'eq':
      return actual === expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as TraitPrimitive);
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    default:
      return false;
  }
}

function evaluateNode(node: RuleNode, traits: TraitMap, path: string, evidence: EvaluationEvidence[]): ThreeValued {
  switch (node.op) {
    case 'all': {
      const childResults = node.children.map((child, i) => evaluateNode(child, traits, `${path}.all[${i}]`, evidence));
      return allNode(childResults);
    }
    case 'any': {
      const childResults = node.children.map((child, i) => evaluateNode(child, traits, `${path}.any[${i}]`, evidence));
      return anyNode(childResults);
    }
    case 'not': {
      const childResult = evaluateNode(node.child, traits, `${path}.not`, evidence);
      return notNode(childResult);
    }
    case 'trait': {
      const reading = traits[node.key];
      let result: ThreeValued;
      if (!reading || !reading.known) {
        result = 'UNKNOWN';
      } else {
        result = evaluateTraitComparison(node.cmp, reading.value, node.value) ? 'TRUE' : 'FALSE';
      }
      evidence.push({ path, op: node.op, result, detail: `trait:${node.key} ${node.cmp}` });
      return result;
    }
    case 'fact':
    case 'history':
    case 'date': {
      evidence.push({ path, op: node.op, result: 'UNKNOWN', notImplemented: true, detail: `${node.op} evaluation not implemented in this proof` });
      return 'UNKNOWN';
    }
  }
}

/**
 * Evaluates a validated RuleNode against a trait-value map. Callers must
 * pass the result of ruleAst.ts's validateRuleAst() — this function does
 * not re-validate structure.
 */
export function evaluateRule(node: RuleNode, traits: TraitMap): EvaluationResult {
  const evidence: EvaluationEvidence[] = [];
  const result = evaluateNode(node, traits, '$', evidence);
  return { result, eligible: result === 'TRUE', evidence };
}
