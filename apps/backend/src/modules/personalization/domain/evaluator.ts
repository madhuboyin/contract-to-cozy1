// apps/backend/src/modules/personalization/domain/evaluator.ts
//
// Typed rule evaluator — the other half of the "typed rule validator/
// evaluator" item in docs/personalization/09-implementation-roadmap.md's
// "first implementation step". Evaluates a validated RuleNode (ruleAst.ts)
// against trait/fact-value maps using three-valued (Kleene strong) logic,
// per 04-target-architecture.md: "Unknown data is three-valued (TRUE,
// FALSE, UNKNOWN); safety rules fail closed, while profiling rules can
// emit a question opportunity."
//
// `trait`/`all`/`any`/`not`/`fact` are evaluated. `history`/`date` remain
// structurally valid (ruleAst.ts already checked their shape) but always
// evaluate to UNKNOWN here, tagged `notImplemented: true` — no current
// definition needs them, and implementing them now would be speculative.
import { RuleNode } from './ruleAst';

export type ThreeValued = 'TRUE' | 'FALSE' | 'UNKNOWN';

export type TraitPrimitive = boolean | number | string | null;
export type TraitReading =
  | { known: true; value: TraitPrimitive | TraitPrimitive[] }
  | { known: false };

export type TraitMap = Record<string, TraitReading>;
/** Same shape as TraitMap — a distinct type alias since facts and traits are conceptually different data sources (context assembler vs. trait derivation), keyed by the `fact` op's `path`. */
export type FactMap = Record<string, TraitReading>;

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

/** Shared by `trait` and `fact` ops — both compare a known reading against an expected value the same way. */
function evaluateComparison(
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

function evaluateNode(
  node: RuleNode,
  traits: TraitMap,
  facts: FactMap,
  path: string,
  evidence: EvaluationEvidence[],
): ThreeValued {
  switch (node.op) {
    case 'all': {
      const childResults = node.children.map((child, i) => evaluateNode(child, traits, facts, `${path}.all[${i}]`, evidence));
      return allNode(childResults);
    }
    case 'any': {
      const childResults = node.children.map((child, i) => evaluateNode(child, traits, facts, `${path}.any[${i}]`, evidence));
      return anyNode(childResults);
    }
    case 'not': {
      const childResult = evaluateNode(node.child, traits, facts, `${path}.not`, evidence);
      return notNode(childResult);
    }
    case 'trait': {
      const reading = traits[node.key];
      let result: ThreeValued;
      if (!reading || !reading.known) {
        result = 'UNKNOWN';
      } else {
        result = evaluateComparison(node.cmp, reading.value, node.value) ? 'TRUE' : 'FALSE';
      }
      evidence.push({ path, op: node.op, result, detail: `trait:${node.key} ${node.cmp}` });
      return result;
    }
    case 'fact': {
      const reading = facts[node.path];
      let result: ThreeValued;
      if (!reading || !reading.known) {
        result = 'UNKNOWN';
      } else {
        result = evaluateComparison(node.cmp, reading.value, node.value) ? 'TRUE' : 'FALSE';
      }
      evidence.push({ path, op: node.op, result, detail: `fact:${node.path} ${node.cmp}` });
      return result;
    }
    case 'history':
    case 'date': {
      evidence.push({ path, op: node.op, result: 'UNKNOWN', notImplemented: true, detail: `${node.op} evaluation not implemented in this slice` });
      return 'UNKNOWN';
    }
  }
}

/**
 * Evaluates a validated RuleNode against trait and fact value maps.
 * Callers must pass the result of ruleAst.ts's validateRuleAst() — this
 * function does not re-validate structure. `facts` defaults to `{}` for
 * callers (and existing tests) that only use `trait` nodes.
 */
export function evaluateRule(node: RuleNode, traits: TraitMap, facts: FactMap = {}): EvaluationResult {
  const evidence: EvaluationEvidence[] = [];
  const result = evaluateNode(node, traits, facts, '$', evidence);
  return { result, eligible: result === 'TRUE', evidence };
}
