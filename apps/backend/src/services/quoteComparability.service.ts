export type QuoteReadinessStage =
  | 'PLANNING_ESTIMATE'
  | 'INCOMPLETE_QUOTE'
  | 'REVIEW_READY'
  | 'COMPARISON_READY';

export interface QuoteLineItemInput {
  description: string;
  kind?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  total?: number | null;
}

export interface QuoteTermInput {
  type: string;
  value: string;
  included?: boolean | null;
}

export interface QuoteProposalFacts {
  id?: string;
  vendorName?: string | null;
  quoteAmount?: number | null;
  serviceCategory?: string | null;
  scopeKind?: string | null;
  scopeSummary?: string | null;
  serviceLocation?: string | null;
  quoteDate?: Date | string | null;
  lineItems?: QuoteLineItemInput[];
  terms?: QuoteTermInput[];
  homeownerConfirmedAt?: Date | string | null;
}

export interface QuoteReadinessIssue {
  key: string;
  label: string;
  whyItMatters: string;
  requiredFor: 'REVIEW_READY' | 'COMPARISON_READY';
}

export interface QuoteAmbiguity {
  key: string;
  message: string;
}

export interface QuoteReadinessEvaluation {
  stage: QuoteReadinessStage;
  score: number;
  comparabilityKey: string | null;
  missingFacts: QuoteReadinessIssue[];
  ambiguities: QuoteAmbiguity[];
}

const meaningful = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;

const hasTerm = (terms: QuoteTermInput[], types: string[]) =>
  terms.some((term) => types.includes(term.type) && meaningful(term.value));

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function evaluateQuoteReadiness(input: QuoteProposalFacts): QuoteReadinessEvaluation {
  const lineItems = input.lineItems ?? [];
  const terms = input.terms ?? [];
  const missingFacts: QuoteReadinessIssue[] = [];
  const ambiguities: QuoteAmbiguity[] = [];

  const requireFact = (
    present: boolean,
    key: string,
    label: string,
    whyItMatters: string,
    requiredFor: QuoteReadinessIssue['requiredFor'],
  ) => {
    if (!present) missingFacts.push({ key, label, whyItMatters, requiredFor });
  };

  requireFact(meaningful(input.vendorName), 'vendorName', 'Provider name', 'Identifies who made the offer.', 'REVIEW_READY');
  requireFact(
    typeof input.quoteAmount === 'number' && input.quoteAmount > 0,
    'quoteAmount',
    'Quoted total',
    'Establishes the price being reviewed.',
    'REVIEW_READY',
  );
  requireFact(meaningful(input.serviceCategory), 'serviceCategory', 'Service category', 'Prevents unlike services from being compared.', 'REVIEW_READY');
  requireFact(meaningful(input.quoteDate), 'quoteDate', 'Quote date', 'Shows whether the offer is current.', 'REVIEW_READY');
  requireFact(
    input.scopeKind !== undefined && input.scopeKind !== null && input.scopeKind !== 'UNKNOWN',
    'scopeKind',
    'Repair, replacement, or work type',
    'Repair and replacement offers are not interchangeable.',
    'REVIEW_READY',
  );
  requireFact(
    meaningful(input.scopeSummary) || lineItems.length > 0,
    'scope',
    'Scope of work',
    'Defines what the quoted total actually buys.',
    'REVIEW_READY',
  );

  requireFact(lineItems.length > 0, 'lineItems', 'Itemized work', 'Enables scope-by-scope comparison.', 'COMPARISON_READY');
  requireFact(
    lineItems.every((item) => meaningful(item.description)),
    'lineItemDescriptions',
    'Line-item descriptions',
    'Every price component must identify its work or material.',
    'COMPARISON_READY',
  );
  requireFact(
    hasTerm(terms, ['INCLUSION']),
    'inclusions',
    'Included work',
    'Avoids treating omitted work as a lower price.',
    'COMPARISON_READY',
  );
  requireFact(
    hasTerm(terms, ['EXCLUSION']),
    'exclusions',
    'Excluded work',
    'Surfaces likely additions and change orders.',
    'COMPARISON_READY',
  );
  requireFact(
    hasTerm(terms, ['WARRANTY']),
    'warranty',
    'Warranty terms',
    'Distinguishes price from post-work protection.',
    'COMPARISON_READY',
  );
  requireFact(
    hasTerm(terms, ['PAYMENT']),
    'payment',
    'Payment terms',
    'Makes deposits and payment timing visible.',
    'COMPARISON_READY',
  );
  requireFact(
    Boolean(input.homeownerConfirmedAt),
    'homeownerConfirmation',
    'Homeowner confirmation',
    'Extracted facts must be verified before comparison.',
    'COMPARISON_READY',
  );

  for (const [index, item] of lineItems.entries()) {
    if (item.quantity !== null && item.quantity !== undefined && !meaningful(item.unit)) {
      ambiguities.push({
        key: `lineItems.${index}.unit`,
        message: `${item.description || `Line item ${index + 1}`} has a quantity but no unit.`,
      });
    }
    if (
      typeof item.quantity === 'number' &&
      typeof item.unitPrice === 'number' &&
      typeof item.total === 'number' &&
      Math.abs(item.quantity * item.unitPrice - item.total) > Math.max(1, item.total * 0.01)
    ) {
      ambiguities.push({
        key: `lineItems.${index}.total`,
        message: `${item.description || `Line item ${index + 1}`} does not reconcile with quantity × unit price.`,
      });
    }
  }

  const reviewMissing = missingFacts.filter((fact) => fact.requiredFor === 'REVIEW_READY');
  const comparisonMissing = missingFacts.filter((fact) => fact.requiredFor === 'COMPARISON_READY');
  const hasQuoteShape =
    meaningful(input.vendorName) ||
    (typeof input.quoteAmount === 'number' && input.quoteAmount > 0) ||
    lineItems.length > 0;

  let stage: QuoteReadinessStage = 'PLANNING_ESTIMATE';
  if (hasQuoteShape) stage = 'INCOMPLETE_QUOTE';
  if (reviewMissing.length === 0) stage = 'REVIEW_READY';
  if (reviewMissing.length === 0 && comparisonMissing.length === 0 && ambiguities.length === 0) {
    stage = 'COMPARISON_READY';
  }

  const totalRequirements = 11;
  const score = Math.max(
    0,
    Math.round(((totalRequirements - missingFacts.length - Math.min(ambiguities.length, 2)) / totalRequirements) * 100),
  );
  const lineItemSignature = lineItems
    .map((item) => normalizeToken(item.description))
    .filter(Boolean)
    .sort()
    .join('+');
  const comparabilityKey =
    stage === 'COMPARISON_READY' && input.serviceCategory && input.scopeKind
      ? [input.serviceCategory, input.scopeKind, normalizeToken(input.serviceLocation ?? ''), lineItemSignature].join('|')
      : null;

  return { stage, score, comparabilityKey, missingFacts, ambiguities };
}

export interface QuoteComparisonEvaluation {
  status: 'COMPARABLE' | 'NOT_COMPARABLE' | 'NEEDS_MORE_INFORMATION';
  eligibleQuoteIds: string[];
  reasons: string[];
}

export function evaluateQuoteComparability(proposals: QuoteProposalFacts[]): QuoteComparisonEvaluation {
  if (proposals.length < 2) {
    return {
      status: 'NEEDS_MORE_INFORMATION',
      eligibleQuoteIds: [],
      reasons: ['Add at least two proposals before checking comparability.'],
    };
  }

  const evaluated = proposals.map((proposal) => ({
    proposal,
    readiness: evaluateQuoteReadiness(proposal),
  }));
  const ready = evaluated.filter(({ readiness }) => readiness.stage === 'COMPARISON_READY');
  if (ready.length < 2) {
    return {
      status: 'NEEDS_MORE_INFORMATION',
      eligibleQuoteIds: ready.flatMap(({ proposal }) => (proposal.id ? [proposal.id] : [])),
      reasons: ['At least two homeowner-confirmed, comparison-ready proposals are required.'],
    };
  }

  const keys = new Set(ready.map(({ readiness }) => readiness.comparabilityKey));
  if (keys.size !== 1) {
    return {
      status: 'NOT_COMPARABLE',
      eligibleQuoteIds: ready.flatMap(({ proposal }) => (proposal.id ? [proposal.id] : [])),
      reasons: ['The ready proposals cover different work, locations, or line-item scope.'],
    };
  }

  return {
    status: 'COMPARABLE',
    eligibleQuoteIds: ready.flatMap(({ proposal }) => (proposal.id ? [proposal.id] : [])),
    reasons: ['The confirmed proposals share the same category, work type, location, and itemized scope.'],
  };
}
