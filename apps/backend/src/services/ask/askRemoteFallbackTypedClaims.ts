import { z } from 'zod';
import { sourceRegistryEntry } from '../intelligence/sourceRegistry';

export const ASK_LLM_PURPOSES = ['ASK_COZY_REMOTE_FALLBACK_SYNTHESIS'] as const;
export type AskLlmPurpose = typeof ASK_LLM_PURPOSES[number];

export const ASK_LLM_PURPOSE_CONTRACTS = Object.freeze({
  ASK_COZY_REMOTE_FALLBACK_SYNTHESIS: {
    purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS' as const,
    routeId: 'ai:ask',
    modelTier: 'FAST' as const,
    structuredOutputRequired: true,
    maxOutputClaims: 6,
  },
});

export function validateAskLlmPurposeContracts(): string[] {
  return Object.values(ASK_LLM_PURPOSE_CONTRACTS).flatMap((contract) => {
    const issues: string[] = [];
    const source = sourceRegistryEntry(contract.routeId);
    if (!source || source.kind !== 'AI') issues.push(`${contract.purpose}: governed AI route ${contract.routeId} is not registered`);
    if (!contract.structuredOutputRequired) issues.push(`${contract.purpose}: structured output must be required`);
    if (!Number.isInteger(contract.maxOutputClaims) || contract.maxOutputClaims < 1) issues.push(`${contract.purpose}: invalid output cap`);
    return issues;
  });
}

const TypedFactRefSchema = z.object({ id: z.string().trim().min(1) }).strict();
export const AskRemoteFallbackTypedClaimSchema = z.object({
  claimType: z.enum(['SEVERITY_STATEMENT', 'DEADLINE_STATEMENT', 'COST_COMPARISON']),
  factRefs: z.array(TypedFactRefSchema).min(1).max(2),
  comparisonOperator: z.enum(['GREATER_THAN', 'LESS_THAN', 'APPROXIMATELY_EQUAL']).optional(),
}).strict().superRefine((claim, ctx) => {
  const expectedRefs = claim.claimType === 'COST_COMPARISON' ? 2 : 1;
  if (claim.factRefs.length !== expectedRefs) {
    ctx.addIssue({ code: 'custom', path: ['factRefs'], message: `${claim.claimType} requires ${expectedRefs} fact reference(s)` });
  }
  if ((claim.claimType === 'COST_COMPARISON') !== Boolean(claim.comparisonOperator)) {
    ctx.addIssue({ code: 'custom', path: ['comparisonOperator'], message: 'Only COST_COMPARISON requires comparisonOperator' });
  }
});

const ProviderOutputSchema = z.object({
  claims: z.array(AskRemoteFallbackTypedClaimSchema).max(20),
}).strict();

export type AskRemoteFallbackTypedClaim = z.infer<typeof AskRemoteFallbackTypedClaimSchema>;

export interface AskRemoteFallbackFact {
  key: string;
  value: unknown;
  source: string | null;
  observedAt: string | null;
  confidence: number | null;
  /** Optional explicit numeric metadata. Inference is deliberately conservative. */
  numericUnit?: 'USD' | 'USD_CENTS';
  comparisonBasis?: 'ONE_TIME' | 'MONTHLY' | 'ANNUAL' | 'BALANCE';
}

export interface AskRemoteFallbackClaimProvider {
  select(input: {
    purpose: AskLlmPurpose;
    question: string;
    candidates: readonly AskRemoteFallbackTypedClaim[];
  }): Promise<unknown>;
}

export interface RenderedAskRemoteFallbackClaim {
  claim: AskRemoteFallbackTypedClaim;
  text: string;
  facts: readonly AskRemoteFallbackFact[];
}

// A fact key may use dotted segments (`risk.severity`) or camel-cased leaf
// names (`quote.repairCost`). The terminal boundary keeps unrelated prose-like
// keys from being classified while accepting both canonical key styles.
const severityKey = /(?:severity|risk|condition|priority)(?:\.|$)/i;
const deadlineKey = /(?:date|due|deadline|expiry|expiration|renewal|expiresAt|validUntil)(?:\.|$)/i;
const costKey = /(?:cost|price|amount|value|expense|premium|payment)(?:cents|usd)?(?:\.|$)/i;

function labelFor(key: string): string {
  return key.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 160);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (/%/.test(value)) return null;
    const parsed = Number(value.replace(/[$\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function moneyMetadata(fact: AskRemoteFallbackFact): { unit: 'USD' | 'USD_CENTS'; basis: 'ONE_TIME' | 'MONTHLY' | 'ANNUAL' | 'BALANCE' } | null {
  const key = fact.key.toLowerCase();
  const raw = typeof fact.value === 'string' ? fact.value.trim() : '';
  if (raw.includes('%')) return null;
  const unit = fact.numericUnit
    ?? (/(?:cents)(?:\.|$)/i.test(fact.key) ? 'USD_CENTS'
      : raw.startsWith('$') || /(?:usd|cost|price|amount|value|expense|premium|payment|balance)(?:cents|usd)?(?:\.|$)/i.test(fact.key) ? 'USD' : null);
  if (!unit || numeric(fact.value) === null) return null;
  const basis = fact.comparisonBasis
    ?? (/monthly|permonth|per_month/i.test(key) ? 'MONTHLY'
      : /annual|yearly|peryear|per_year|premium/i.test(key) ? 'ANNUAL'
        : /balance/i.test(key) ? 'BALANCE' : 'ONE_TIME');
  return { unit, basis };
}

function normalizedUsd(fact: AskRemoteFallbackFact): number | null {
  const metadata = moneyMetadata(fact);
  const value = numeric(fact.value);
  if (!metadata || value === null) return null;
  return metadata.unit === 'USD_CENTS' ? value / 100 : value;
}

function formatUsd(value: number, basis: NonNullable<ReturnType<typeof moneyMetadata>>['basis']): string {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  return basis === 'MONTHLY' ? `${amount}/month` : basis === 'ANNUAL' ? `${amount}/year` : amount;
}

function comparisonOperator(left: number, right: number): AskRemoteFallbackTypedClaim['comparisonOperator'] {
  const tolerance = Math.max(Math.abs(left), Math.abs(right), 1) * 0.02;
  if (Math.abs(left - right) <= tolerance) return 'APPROXIMATELY_EQUAL';
  return left > right ? 'GREATER_THAN' : 'LESS_THAN';
}

export function buildAskRemoteFallbackClaimCandidates(
  facts: readonly AskRemoteFallbackFact[],
): AskRemoteFallbackTypedClaim[] {
  const candidates: AskRemoteFallbackTypedClaim[] = [];
  for (const fact of facts) {
    if (scalar(fact.value) === null) continue;
    if (severityKey.test(fact.key)) candidates.push({ claimType: 'SEVERITY_STATEMENT', factRefs: [{ id: fact.key }] });
    if (deadlineKey.test(fact.key)) candidates.push({ claimType: 'DEADLINE_STATEMENT', factRefs: [{ id: fact.key }] });
  }
  const costs = facts.filter((fact) => costKey.test(fact.key) && moneyMetadata(fact) !== null).slice(0, 8);
  for (let left = 0; left < costs.length; left += 1) {
    for (let right = left + 1; right < costs.length; right += 1) {
      const leftMetadata = moneyMetadata(costs[left]);
      const rightMetadata = moneyMetadata(costs[right]);
      if (!leftMetadata || !rightMetadata || leftMetadata.basis !== rightMetadata.basis) continue;
      const leftValue = normalizedUsd(costs[left]);
      const rightValue = normalizedUsd(costs[right]);
      if (leftValue === null || rightValue === null) continue;
      candidates.push({
        claimType: 'COST_COMPARISON',
        factRefs: [{ id: costs[left].key }, { id: costs[right].key }],
        comparisonOperator: comparisonOperator(leftValue, rightValue),
      });
    }
  }
  return candidates.slice(0, 20);
}

function signature(claim: AskRemoteFallbackTypedClaim): string {
  return JSON.stringify(claim);
}

function renderClaim(claim: AskRemoteFallbackTypedClaim, factsByKey: ReadonlyMap<string, AskRemoteFallbackFact>): RenderedAskRemoteFallbackClaim | null {
  const facts = claim.factRefs.map((ref) => factsByKey.get(ref.id)).filter((fact): fact is AskRemoteFallbackFact => Boolean(fact));
  if (facts.length !== claim.factRefs.length) return null;
  if (claim.claimType === 'SEVERITY_STATEMENT') {
    const value = scalar(facts[0].value);
    return value === null ? null : { claim, facts, text: `${labelFor(facts[0].key)} is recorded as ${value}.` };
  }
  if (claim.claimType === 'DEADLINE_STATEMENT') {
    const value = scalar(facts[0].value);
    return value === null ? null : { claim, facts, text: `${labelFor(facts[0].key)} is recorded as ${value}.` };
  }
  const leftMetadata = moneyMetadata(facts[0]);
  const rightMetadata = moneyMetadata(facts[1]);
  const left = normalizedUsd(facts[0]);
  const right = normalizedUsd(facts[1]);
  if (!leftMetadata || !rightMetadata || leftMetadata.basis !== rightMetadata.basis
    || left === null || right === null || comparisonOperator(left, right) !== claim.comparisonOperator) return null;
  const relation = claim.comparisonOperator === 'GREATER_THAN'
    ? 'is greater than'
    : claim.comparisonOperator === 'LESS_THAN' ? 'is less than' : 'is approximately equal to';
  return { claim, facts, text: `${labelFor(facts[0].key)} (${formatUsd(left, leftMetadata.basis)}) ${relation} ${labelFor(facts[1].key)} (${formatUsd(right, rightMetadata.basis)}).` };
}

/**
 * The model selects only from deterministic typed candidates. It never emits
 * prose or values; every accepted comparison is recomputed before rendering.
 */
export async function selectAndRenderAskRemoteFallbackClaims(input: {
  question: string;
  facts: readonly AskRemoteFallbackFact[];
  provider: AskRemoteFallbackClaimProvider;
}): Promise<RenderedAskRemoteFallbackClaim[]> {
  const candidates = buildAskRemoteFallbackClaimCandidates(input.facts);
  if (!candidates.length) return [];
  const allowed = new Map(candidates.map((claim) => [signature(claim), claim]));
  let selected = candidates.slice(0, ASK_LLM_PURPOSE_CONTRACTS.ASK_COZY_REMOTE_FALLBACK_SYNTHESIS.maxOutputClaims);
  try {
    const parsed = ProviderOutputSchema.parse(await input.provider.select({
      purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS',
      question: input.question,
      candidates,
    }));
    const validated = [...new Map(parsed.claims.flatMap((claim) => {
      const canonical = allowed.get(signature(claim));
      return canonical ? [[signature(canonical), canonical] as const] : [];
    })).values()];
    // A valid empty or fully rejected selection means "no supported claim".
    // Only transport/schema failure uses the deterministic candidate fallback.
    selected = validated.slice(0, ASK_LLM_PURPOSE_CONTRACTS.ASK_COZY_REMOTE_FALLBACK_SYNTHESIS.maxOutputClaims);
  } catch {
    // Deterministic candidates remain the safe fallback when selection fails.
  }
  const factsByKey = new Map(input.facts.map((fact) => [fact.key, fact]));
  return selected.map((claim) => renderClaim(claim, factsByKey)).filter((claim): claim is RenderedAskRemoteFallbackClaim => Boolean(claim));
}
