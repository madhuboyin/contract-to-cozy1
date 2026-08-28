import { z } from 'zod';

/**
 * Shared issue/decision-intent taxonomy for derived intelligence.
 *
 * Asset identity does not belong here. Roofs, HVAC systems, appliances, and
 * other concrete subjects are carried by typed entity references.
 */
export const INTELLIGENCE_ISSUE_DOMAINS = [
  'SAFETY',
  'MAINTENANCE',
  'INSURANCE',
  'FINANCIAL',
  'COMPLIANCE',
  'MARKET_VALUE',
  'ASSET_LIFECYCLE',
  'CLAIMS',
  'PRICING',
  'NEGOTIATION',
  'BOOKING',
  'DOCUMENTATION',
  'NEIGHBORHOOD',
  'ONBOARDING',
  'WEATHER',
  'ENERGY',
  'OTHER',
] as const;

export const INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION = '1.0' as const;

export const IntelligenceIssueDomainSchema = z.enum(INTELLIGENCE_ISSUE_DOMAINS);

export type IntelligenceIssueDomain = (typeof INTELLIGENCE_ISSUE_DOMAINS)[number];

// Compatibility aliases. Guidance and the Envelope share one vocabulary and
// must never fork independent copies.
export const GUIDANCE_ISSUE_DOMAINS = INTELLIGENCE_ISSUE_DOMAINS;
export type GuidanceIssueDomain = IntelligenceIssueDomain;
export type EnvelopeDomain = IntelligenceIssueDomain;
