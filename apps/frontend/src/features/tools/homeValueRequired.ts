// The API answers 422 PLANNING_HOME_VALUE_REQUIRED when Sell/Hold/Rent or Break-even has no home value to start from (no appraisal, no purchase price).
// The pages recognise it deliberately and ask inline. A value entered here is sent as the per-request `homeValueNow` and applies to that analysis only.
export const PLANNING_HOME_VALUE_REQUIRED = 'PLANNING_HOME_VALUE_REQUIRED';

export class HomeValueRequiredError extends Error {
  constructor(message = 'No home value is on record for this home.') {
    super(message);
    this.name = 'HomeValueRequiredError';
  }
}

/** True when an API error body carries the structured home-value-required code. */
export function isHomeValueRequiredPayload(payload: unknown): boolean {
  const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined;
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === PLANNING_HOME_VALUE_REQUIRED);
}

export function isHomeValueRequiredError(error: unknown): error is HomeValueRequiredError {
  return error instanceof HomeValueRequiredError;
}

/** Parses the text field of the prompt: a positive dollar amount, tolerating "$" and commas. Null when it is not usable. */
export function parsePlanningHomeValue(text: string): number | null {
  const value = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(value) && value >= 10_000 && value <= 100_000_000 ? value : null;
}
