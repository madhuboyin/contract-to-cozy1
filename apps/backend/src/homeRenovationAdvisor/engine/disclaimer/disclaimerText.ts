// apps/backend/src/homeRenovationAdvisor/engine/disclaimer/disclaimerText.ts
//
// Centralized disclaimer text for the Home Renovation Risk Advisor.
// Variant selection is based on session context at evaluation time.
// Disclaimer text is computed at response time — only the version is persisted.

export const DISCLAIMER_VERSION = '1.0.0';

export type DisclaimerVariant = 'standard' | 'unsupported_area' | 'retroactive' | 'low_confidence';

const DISCLAIMER_TEXTS: Record<DisclaimerVariant, string> = {
  standard:
    'Estimates are based on jurisdiction-specific rules where available, and national defaults where local data is limited. This tool provides informational guidance only — always verify permit requirements, tax implications, and contractor licensing with your local building department and qualified professionals before making any decisions.',

  unsupported_area:
    'Local data was not available for your area. All estimates use national default rules as a fallback. Treat these as directional starting points only — verify all permit, tax, and licensing requirements with your local building department before taking any action.',

  retroactive:
    'This retroactive compliance review is informational only and does not constitute legal, financial, or tax advice. Compliance requirements vary by jurisdiction and change over time. Consult a licensed contractor, real estate attorney, or tax advisor before taking action.',

  low_confidence:
    'Some estimates use national fallback rules because detailed local data was unavailable. Treat these as directional starting points — verify specific permit, tax, and licensing requirements with your local authorities before making decisions.',
};

export function getDisclaimerText(variant: DisclaimerVariant): string {
  return DISCLAIMER_TEXTS[variant];
}

export function selectDisclaimerVariant(
  isRetroactive: boolean,
  unsupportedArea: boolean,
  isLowConfidence: boolean,
): DisclaimerVariant {
  if (unsupportedArea) return 'unsupported_area';
  if (isRetroactive) return 'retroactive';
  if (isLowConfidence) return 'low_confidence';
  return 'standard';
}
