import { mergeTrustContract, type TrustContract } from './trustContract';

const PRICING_LOOP_BASE: TrustContract = {
  confidenceLabel: 'Confidence improves with richer quote and vendor context.',
  freshnessLabel: 'Updates with each quote check and negotiation/finalization action.',
  sourceLabel: 'Service Price Radar + negotiation context + finalization records.',
  rationale:
    'This pricing workflow keeps quote review, negotiation, and accepted-term finalization connected.',
  sourceKind: 'pricing_loop',
};

const COVERAGE_LOOP_BASE: TrustContract = {
  confidenceLabel: 'Confidence improves as policy details and inventory coverage state stay current.',
  freshnessLabel: 'Updates when inventory coverage, warranty state, or policy metadata changes.',
  sourceLabel: 'Coverage graph + inventory metadata + policy/warranty records.',
  rationale:
    'Coverage recommendations prioritize uncovered and expiring items before lower-risk gaps.',
  sourceKind: 'coverage_loop',
};

const REFINANCE_LOOP_BASE: TrustContract = {
  confidenceLabel: 'Model confidence improves with complete mortgage profile inputs.',
  freshnessLabel: 'Re-evaluate to refresh against current market-rate data.',
  sourceLabel: 'Mortgage profile + market rate history + CtC refinance opportunity model.',
  rationale:
    'Refinance opportunity scoring weighs rate spread, break-even timing, and closing-cost impact.',
  sourceKind: 'refinance_loop',
};

const NEGOTIATION_LOOP_BASE: TrustContract = {
  confidenceLabel: 'Confidence improves with complete case inputs and evidence documents.',
  freshnessLabel: 'Updates with each saved case input, parsed document, and analysis run.',
  sourceLabel: 'Negotiation case context + uploaded evidence + CtC negotiation analysis engine.',
  rationale:
    'Negotiation recommendations tie evidence-backed findings directly to draftable actions.',
  sourceKind: 'negotiation_loop',
};

function fromBase(base: TrustContract, overrides?: Partial<TrustContract>): TrustContract {
  return mergeTrustContract(base, overrides);
}

export function pricingLoopTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(PRICING_LOOP_BASE, overrides);
}

export function coverageLoopTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(COVERAGE_LOOP_BASE, overrides);
}

export function refinanceLoopTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(REFINANCE_LOOP_BASE, overrides);
}

export function negotiationLoopTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(NEGOTIATION_LOOP_BASE, overrides);
}

export function trustDateLabel(
  timestamp: string | null | undefined,
  fallback: string
): string {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return `Last evaluated ${parsed.toLocaleDateString()}`;
}
