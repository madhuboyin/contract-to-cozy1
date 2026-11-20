import { z } from 'zod';
import { sourceRegistryEntry } from '../intelligence/sourceRegistry';

export const ASK_LLM_PURPOSES = ['ASK_COZY_REMOTE_FALLBACK_SYNTHESIS', 'ASK_COZY_OPERATION_ROUTING'] as const;
export type AskLlmPurpose = typeof ASK_LLM_PURPOSES[number];

export const ASK_LLM_PURPOSE_CONTRACTS = Object.freeze({
  ASK_COZY_REMOTE_FALLBACK_SYNTHESIS: {
    purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS' as const,
    routeId: 'ai:ask',
    modelTier: 'FAST' as const,
    structuredOutputRequired: true,
    maxOutputClaims: 6,
  },
  // The governed understanding planner may select a registered operation for a message the local router could not place. Output is constrained by the
  // candidate ids plus a confidence; it never carries prose or home data.
  ASK_COZY_OPERATION_ROUTING: {
    purpose: 'ASK_COZY_OPERATION_ROUTING' as const,
    routeId: 'ai:ask',
    modelTier: 'FAST' as const,
    structuredOutputRequired: true,
    maxOutputClaims: 1,
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

/** What to do next when Ask cannot answer. Names two phrasings that do reach an answer; a test keeps both routable. */
export const ASK_NAMING_HINT = 'Try naming the appliance, system, task or document you mean, for example “show my dishwasher details” or “what maintenance is due”.';

/** Shown when nothing in the home record answers the question: says so plainly instead of describing internal claim types. */
export const ASK_NO_SUPPORTED_CLAIM_TEXT = `I couldn’t find anything in your home record that answers this, so I won’t guess. ${ASK_NAMING_HINT}`;

/** Shown in place of a prepared answer that could not be matched to the question when there is no better request to offer. */
export const ASK_UNVERIFIABLE_ANSWER_TEXT = `I couldn’t confirm that the answer I prepared matches what you asked, so I haven’t shown it. ${ASK_NAMING_HINT}`;

/**
 * A question that joins a project's state with a contractor quote's approval ("projects in progress with unapproved contractor quotes") is a real request
 * Ask cannot answer: there is no recorded link between a project and a quote's approval. Saying so, and offering each half separately, replaces the
 * generic "name the appliance" advice, which implies the wording was unclear.
 */
const PROJECT_WORD = /\bprojects?\b/i;
const QUOTE_APPROVAL_WORDS = /\b(?:(?:un)?approved|not approved|pending|accepted|rejected)\b.{0,40}\b(?:quotes?|bids?|proposals?|estimates?)\b|\b(?:quotes?|bids?|proposals?|estimates?)\b.{0,40}\b(?:(?:un)?approved|not approved|pending|accepted|rejected)\b/i;

export const ASK_PROJECT_QUOTE_FILTER_TEXT = 'I can’t filter projects by whether their contractor quotes are approved yet, because a project isn’t linked to a quote’s approval in your home record. I can show your projects, or review your recorded contractor quotes, separately.';

export function askUnsupportedProjectQuoteFilter(question: string): { body: string; actions: Array<{ id: string; label: string; interactionType: 'START_WORKFLOW'; message: string; operationId: 'PROJECT_TRACKER_PROJECTS' | 'QUOTE_COMPARISON_REVIEW' | 'MAINTENANCE_STATUS'; style: 'SECONDARY' }> } | null {
  if (!PROJECT_WORD.test(question) || !QUOTE_APPROVAL_WORDS.test(question)) return null;
  return {
    body: ASK_PROJECT_QUOTE_FILTER_TEXT,
    actions: [
      { id: 'unsupported-filter-show-projects', label: 'Show my projects', interactionType: 'START_WORKFLOW', message: 'Show my projects in the project tracker', operationId: 'PROJECT_TRACKER_PROJECTS', style: 'SECONDARY' },
      { id: 'unsupported-filter-review-quotes', label: 'Review my contractor quotes', interactionType: 'START_WORKFLOW', message: 'Review my contractor quotes', operationId: 'QUOTE_COMPARISON_REVIEW', style: 'SECONDARY' },
    ],
  };
}

// A maintenance task records priority, risk, category and due date, but not whether a licensed professional is required, and a service category alone does
// not prove it. A question filtered on that cannot be answered from the record, so the answer says which filter is missing instead of calling the wording unclear.
const MAINTENANCE_WORD = /\b(?:maintenance|tasks?|chores?)\b/i;
const PROFESSIONAL_REQUIRED = /\b(?:require|requires|required|requiring|need|needs|needing|must (?:be done by|have))\b[^.?!]{0,25}\b(?:licensed|professional|a pro|certified)\b|\b(?:licensed|professional)\b[^.?!]{0,15}\b(?:required|needed)\b/i;
export const ASK_MAINTENANCE_PROFESSIONAL_FILTER_TEXT = 'I can’t filter maintenance tasks by whether a licensed professional is required, because that isn’t recorded on a task. I can show your maintenance by due date, or all of your tasks.';

export type AskUnsupportedFilter = { body: string; actions: Array<{ id: string; label: string; interactionType: 'START_WORKFLOW'; message: string; operationId: 'PROJECT_TRACKER_PROJECTS' | 'QUOTE_COMPARISON_REVIEW' | 'MAINTENANCE_STATUS'; style: 'SECONDARY' }> };

export function askUnsupportedMaintenanceProfessionalFilter(question: string): AskUnsupportedFilter | null {
  if (!MAINTENANCE_WORD.test(question) || !PROFESSIONAL_REQUIRED.test(question)) return null;
  return {
    body: ASK_MAINTENANCE_PROFESSIONAL_FILTER_TEXT,
    actions: [
      { id: 'unsupported-filter-maintenance-due', label: 'Show what maintenance is due', interactionType: 'START_WORKFLOW', message: 'What maintenance is due?', operationId: 'MAINTENANCE_STATUS', style: 'SECONDARY' },
      { id: 'unsupported-filter-maintenance-all', label: 'Show all maintenance tasks', interactionType: 'START_WORKFLOW', message: 'Show my maintenance tasks', operationId: 'MAINTENANCE_STATUS', style: 'SECONDARY' },
    ],
  };
}

/** The unsupported filter a question asks for, if any: said plainly with the halves Ask can answer. */
export function askUnsupportedFilter(question: string): AskUnsupportedFilter | null {
  return askUnsupportedProjectQuoteFilter(question) ?? askUnsupportedMaintenanceProfessionalFilter(question);
}

/**
 * True for the fallback's own "nothing in the home record answers this" result. It makes no claim about the home, so there is nothing for the
 * relevance check to verify; treating it as an unverified answer produced a dead-end question whose only option was the same fallback.
 */
export function isAskHonestNoAnswerResult(operationId: string, result: { blocks: ReadonlyArray<{ type: string; id?: string; body?: unknown }> }): boolean {
  return operationId === 'GROUNDED_GUIDANCE' && result.blocks.some((block) => (
    block.type === 'SUMMARY' && block.id === 'grounded-guidance' && typeof block.body === 'string' && block.body.includes(ASK_NO_SUPPORTED_CLAIM_TEXT)
  ));
}

const TypedFactRefSchema = z.object({ id: z.string().trim().min(1) }).strict();
export const AskRemoteFallbackTypedClaimSchema = z.object({
  claimType: z.enum(['SEVERITY_STATEMENT', 'DEADLINE_STATEMENT', 'COST_COMPARISON', 'FACT_STATEMENT', 'HOME_EVENT_STATEMENT']),
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
    purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS';
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

// A stored enum value ("ASPHALT_SHINGLE") is shown as a homeowner reads it ("Asphalt shingle"). Shown raw it is also an internal-looking token that the
// answer-trust check refuses, which turned a correct fallback answer into "I couldn't verify this answer" (review screenshot, 2026-11-07).
const ENUM_VALUE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
export function readableStoredValue(value: string): string {
  if (!ENUM_VALUE.test(value)) return value;
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return readableStoredValue(value.trim().slice(0, 160));
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

// Render recorded precision and attribution, never promote an approximate
// date to an exact day or a third-party report to a firsthand fact.
function homeEventText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const entries = value.slice(0, 5).flatMap((row) => {
    if (!row || typeof row !== 'object' || typeof row.title !== 'string') return [];
    const date = typeof row.occurredAt === 'string' ? row.occurredAt : '';
    const when = row.datePrecision === 'YEAR' ? date.slice(0, 4)
      : row.datePrecision === 'MONTH' ? date.slice(0, 7)
      : row.datePrecision === 'EXACT_DATE' ? date.slice(0, 10)
      : row.datePrecision === 'RANGE' ? `${String(row.dateRangeStart ?? '').slice(0, 10)} to ${String(row.dateRangeEnd ?? '').slice(0, 10)}`
      : 'date unknown';
    const attribution = row.attribution === 'THIRD_PARTY_RELAYED' ? 'third-party report'
      : row.attribution === 'INFERRED' ? 'inferred report' : 'recorded';
    return [`${row.title.slice(0, 160)} (${when}; ${attribution})`];
  });
  return entries.length ? `Your home record includes: ${entries.join('; ')}.` : null;
}

export function buildAskRemoteFallbackClaimCandidates(
  facts: readonly AskRemoteFallbackFact[],
): AskRemoteFallbackTypedClaim[] {
  const candidates: AskRemoteFallbackTypedClaim[] = [];
  for (const fact of facts) {
    if (fact.key === 'events.recentHomeEvents' && homeEventText(fact.value)) {
      candidates.push({ claimType: 'HOME_EVENT_STATEMENT', factRefs: [{ id: fact.key }] });
    }
    if (scalar(fact.value) === null) continue;
    if (!severityKey.test(fact.key) && !deadlineKey.test(fact.key)) candidates.push({ claimType: 'FACT_STATEMENT', factRefs: [{ id: fact.key }] });
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
  if (claim.claimType === 'HOME_EVENT_STATEMENT') {
    const text = homeEventText(facts[0].value);
    return text ? { claim, facts, text } : null;
  }
  if (claim.claimType === 'SEVERITY_STATEMENT' || claim.claimType === 'FACT_STATEMENT') {
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
  let selected: typeof candidates = [];
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
    selected = validated.slice(0, ASK_LLM_PURPOSE_CONTRACTS.ASK_COZY_REMOTE_FALLBACK_SYNTHESIS.maxOutputClaims);
  } catch {
    // Fail closed on provider transport or schema failure (FR-ANS-2 / §17.2 #2):
    // never emit top-N arbitrary property claims when selector execution fails.
    selected = [];
  }
  const factsByKey = new Map(input.facts.map((fact) => [fact.key, fact]));
  return selected.map((claim) => renderClaim(claim, factsByKey)).filter((claim): claim is RenderedAskRemoteFallbackClaim => Boolean(claim));
}
