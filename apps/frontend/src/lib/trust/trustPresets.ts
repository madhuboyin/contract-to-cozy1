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

const HIDDEN_ASSET_BASE: TrustContract = {
  confidenceLabel: 'Eligibility confidence varies by program — HIGH means strong match, LOW means worth verifying.',
  freshnessLabel: 'Program database refreshed periodically; verify eligibility directly with the program source.',
  sourceLabel: 'CtC benefit and program database + property profile + location signals.',
  rationale:
    'Matches are ranked by estimated value and eligibility confidence. Always verify with the official program source before applying.',
  sourceKind: 'hidden_asset',
};

const GUIDANCE_ENGINE_BASE: TrustContract = {
  confidenceLabel: 'Journey confidence improves as more property, asset, and signal context is provided.',
  freshnessLabel: 'Updates when property data, linked assets, or issue signals change.',
  sourceLabel: 'CtC guidance engine + property context + linked asset and coverage signals.',
  rationale:
    'Guidance journeys order steps by impact and dependency — completing earlier steps improves the quality of later recommendations.',
  sourceKind: 'guidance_engine',
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

export function hiddenAssetTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(HIDDEN_ASSET_BASE, overrides);
}

export function guidanceEngineTrust(overrides?: Partial<TrustContract>): TrustContract {
  return fromBase(GUIDANCE_ENGINE_BASE, overrides);
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
