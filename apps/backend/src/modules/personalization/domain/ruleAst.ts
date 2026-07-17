// apps/backend/src/modules/personalization/domain/ruleAst.ts
//
// Typed rule AST + validator — the "typed rule validator/evaluator" item
// named in docs/personalization/09-implementation-roadmap.md's "first
// implementation step". Mirrors the RuleNode shape from
// docs/personalization/04-target-architecture.md's "Rule AST" section
// exactly, as a Zod schema, plus the depth/child-count/path/value limits
// that section calls for ("Validation limits depth, child count,
// operators, paths and values.").
//
// `fact`/`history`/`date` ops are validated here (their shapes are provably
// correct) but not evaluated — see evaluator.ts's module comment for why.
import { z } from 'zod';

export const TRAIT_COMPARATORS = ['eq', 'in', 'gte', 'lte', 'exists'] as const;
export const FACT_COMPARATORS = ['eq', 'in', 'gte', 'lte', 'exists'] as const;
export const DATE_COMPARATORS = ['before', 'after', 'withinDays'] as const;

/**
 * Allowlisted fact paths — deliberately small and non-sensitive for this
 * proof. Phase 1's context assembler owns the real, larger allowlist; this
 * exists so the validator has something concrete to reject non-allowlisted
 * paths against, per the doc's "Validation limits... paths" requirement.
 */
export const ALLOWED_FACT_PATHS = [
  'core.dwellingType',
  'core.yearBuilt',
  'location.zipCode',
] as const;

export const ALLOWED_HISTORY_EVENTS = [
  'MAINTENANCE_TASK_COMPLETED',
  'RECOMMENDATION_DISMISSED',
] as const;

export const ALLOWED_DATE_PATHS = [
  'financial.financingProfile.purchaseDate',
  'financial.latestEquity.asOfDate',
] as const;

export const MAX_RULE_DEPTH = 6;
export const MAX_CHILDREN = 20;

const jsonValueSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.lazy(() => jsonValueSchema)),
]);

export type RuleNode =
  | { op: 'all' | 'any'; children: RuleNode[] }
  | { op: 'not'; child: RuleNode }
  | { op: 'trait'; key: string; cmp: (typeof TRAIT_COMPARATORS)[number]; value?: unknown }
  | { op: 'fact'; path: (typeof ALLOWED_FACT_PATHS)[number]; cmp: (typeof FACT_COMPARATORS)[number]; value?: unknown }
  | {
      op: 'history';
      event: (typeof ALLOWED_HISTORY_EVENTS)[number];
      withinDays?: number;
      countCmp?: { cmp: 'gte' | 'lte' | 'eq'; value: number };
    }
  | {
      op: 'date';
      field: (typeof ALLOWED_DATE_PATHS)[number];
      cmp: (typeof DATE_COMPARATORS)[number];
      value: string | number;
    };

const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({
      op: z.enum(['all', 'any']),
      children: z.array(ruleNodeSchema).min(1).max(MAX_CHILDREN),
    }),
    z.object({
      op: z.literal('not'),
      child: ruleNodeSchema,
    }),
    z.object({
      op: z.literal('trait'),
      key: z.string().min(1),
      cmp: z.enum(TRAIT_COMPARATORS),
      value: jsonValueSchema.optional(),
    }),
    z.object({
      op: z.literal('fact'),
      path: z.enum(ALLOWED_FACT_PATHS),
      cmp: z.enum(FACT_COMPARATORS),
      value: jsonValueSchema.optional(),
    }),
    z.object({
      op: z.literal('history'),
      event: z.enum(ALLOWED_HISTORY_EVENTS),
      withinDays: z.number().int().positive().optional(),
      countCmp: z
        .object({
          cmp: z.enum(['gte', 'lte', 'eq']),
          value: z.number(),
        })
        .optional(),
    }),
    z.object({
      op: z.literal('date'),
      field: z.enum(ALLOWED_DATE_PATHS),
      cmp: z.enum(DATE_COMPARATORS),
      value: z.union([z.string(), z.number()]),
    }),
  ]),
);

export interface RuleAstValidationResult {
  success: boolean;
  data?: RuleNode;
  errors: string[];
}

function measureDepth(node: RuleNode, depth: number): number {
  switch (node.op) {
    case 'all':
    case 'any':
      return Math.max(depth, ...node.children.map((c) => measureDepth(c, depth + 1)));
    case 'not':
      return measureDepth(node.child, depth + 1);
    default:
      return depth;
  }
}

/**
 * Validates a raw (untrusted) value as a RuleNode: shape (via Zod), then
 * depth limit (MAX_RULE_DEPTH) — the one structural limit Zod's recursive
 * schema can't express on its own.
 */
export function validateRuleAst(input: unknown): RuleAstValidationResult {
  const parsed = ruleNodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const depth = measureDepth(parsed.data, 0);
  if (depth > MAX_RULE_DEPTH) {
    return {
      success: false,
      errors: [`Rule AST depth ${depth} exceeds MAX_RULE_DEPTH (${MAX_RULE_DEPTH})`],
    };
  }

  return { success: true, data: parsed.data, errors: [] };
}
