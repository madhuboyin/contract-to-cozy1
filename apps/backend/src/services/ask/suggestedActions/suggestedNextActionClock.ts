// Plan §9 Phase 2: an injected clock so creation/expiry are deterministic in tests.
export interface SuggestedNextActionClock {
  now(): Date;
}

export const systemSuggestedNextActionClock: SuggestedNextActionClock = { now: () => new Date() };

export function fixedSuggestedNextActionClock(at: Date | string | number): SuggestedNextActionClock {
  const fixed = new Date(at);
  return { now: () => new Date(fixed.getTime()) };
}
