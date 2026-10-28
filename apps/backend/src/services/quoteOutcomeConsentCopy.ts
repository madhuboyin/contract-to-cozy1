// The one definition of the service-quote outcome-sharing consent: its policy version, the fields it covers and the words a person agrees to.
// Ask and the Desktop quote comparison page both show this text; tests/ask/quoteOutcomeConsent.test.js fails if the Desktop page's copy stops matching.
export const SERVICE_QUOTE_OUTCOME_POLICY_VERSION = 'service-quote-outcomes-v1' as const;

export const SERVICE_QUOTE_OUTCOME_CONSENT_COPY = {
  title: 'Help improve future price guidance',
  scope: 'Voluntarily share the final price and material change-order totals after completed work.',
  exclusions: 'Estimates, contractor notes, and quote text are never included.',
  revocation: 'You can turn this off at any time to stop future capture; this choice does not affect recommendations or booking.',
  ownerOnly: 'Only the home’s owner can change this choice.',
} as const;

/** What is collected when the owner agrees. Fixed: Ask never widens it. */
export const SERVICE_QUOTE_OUTCOME_CONSENT_FIELDS = { finalPrice: true, changeOrders: true } as const;
