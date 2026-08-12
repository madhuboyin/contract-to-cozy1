// Ask Intelligence FRD §12.2/Phase 8C: "A timed-out optional enhancer is
// omitted and disclosed; a timed-out required input produces a typed
// degraded or blocked result according to the contract." This is the single
// enforcement point for both halves of that rule — reused across required
// and optional reads in hvacRepairReplaceEngine.service.ts (and future
// decision families' composers), rather than each composer reimplementing
// its own timeout handling.
//
// Deliberately pure: takes any promise-returning function, so it is
// unit-testable without a database (tests/unit/decisionPlatform/decisionContextEnhancer.test.js).

import { AITimeoutError, withTimeout } from '../../lib/aiResilience';

export interface EnhancerTimeoutResult<T> {
  value: T | null;
  limitationCodes: string[];
}

export async function withEnhancerTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  timeoutLimitationCode: string,
): Promise<EnhancerTimeoutResult<T>> {
  try {
    const value = await withTimeout(work, { timeoutMs, operation: timeoutLimitationCode });
    return { value, limitationCodes: [] };
  } catch (error) {
    if (error instanceof AITimeoutError) {
      return { value: null, limitationCodes: [timeoutLimitationCode] };
    }
    throw error;
  }
}
