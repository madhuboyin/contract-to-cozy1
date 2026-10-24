// The only spellings of the missing-context keys the backend itself writes onto a journey, step or signal. A producer imports these
// instead of typing a string, so a new key cannot appear without being added here, and `tests/ask/guidanceContextKeys.test.js` then fails
// until Ask classifies it (services/ask/askGuidanceContextKeys.ts). Keys an API client supplies when blocking a step are free text and
// are not listed: Ask treats any key it does not recognise as information it cannot collect.

export const GUIDANCE_CONTEXT_KEYS = {
  /** The signal behind a journey is stale (guidanceSignalResolver). */
  REFRESH_SIGNAL: 'refresh_signal_context',
  /** A buyer inspection finding is not tied to an inventory item (buyerAcquisition). */
  INVENTORY_ITEM_LINK: 'inventory_item_link',
} as const;

/** A required or discouraged step was skipped, so the plan carries less context (guidanceStepResolver). */
export const SKIPPED_STEP_PREFIX = 'skipped:';
export const skippedStepContextKey = (stepKey: string): string => `${SKIPPED_STEP_PREFIX}${stepKey}`;
export const skippedStepKeyFrom = (key: string): string | null => (key.startsWith(SKIPPED_STEP_PREFIX) ? key.slice(SKIPPED_STEP_PREFIX.length) : null);
