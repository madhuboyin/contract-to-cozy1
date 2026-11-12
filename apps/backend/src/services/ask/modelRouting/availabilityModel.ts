// Availability model for the model-assisted route (reliability FRD FR-UND-14, D6a). Pure arithmetic: nothing here calls a provider.
// p = probability the provider is available for the turn (a SHARED outage: when it is down every call of the turn fails); q_d / q_t = probability that one
// domain-selection / target (or single) call succeeds given the provider is available (independent across calls given availability). A degraded-provider mixture
// replaces (q_d, q_t) with lower values for a fraction d of turns. All numbers below are PROVISIONAL owner assumptions (D6a); D6b replaces them with measurements.
export interface AvailabilityParameters { readonly p: number; readonly qd: number; readonly qt: number; readonly degraded?: { readonly share: number; readonly qd: number; readonly qt: number } }
export type RoutePath = { readonly kind: 'NO_MODEL' } | { readonly kind: 'SINGLE_CALL' } | { readonly kind: 'TWO_STAGE'; readonly targetCalls: number };

/** Named scenarios (FR-UND-14 reports all four; the baseline gates). */
export const AVAILABILITY_SCENARIOS: Readonly<Record<'optimistic' | 'baseline' | 'correlatedOutage' | 'degradedProvider', AvailabilityParameters>> = Object.freeze({
  optimistic: { p: 1, qd: 1, qt: 1 },
  baseline: { p: 0.999, qd: 0.997, qt: 0.995 },
  correlatedOutage: { p: 0.99, qd: 0.997, qt: 0.995 },
  degradedProvider: { p: 0.999, qd: 0.997, qt: 0.995, degraded: { share: 0.02, qd: 0.95, qt: 0.9 } },
});

const probability = (x: number, name: string) => { if (!(x >= 0 && x <= 1) || Number.isNaN(x)) throw new RangeError(`${name} must be a probability in [0, 1], got ${x}`); return x; };

/** P(every model call of the turn succeeds). NO_MODEL needs no call. */
export function routingSuccessProbability(path: RoutePath, a: AvailabilityParameters): number {
  probability(a.p, 'p'); probability(a.qd, 'qd'); probability(a.qt, 'qt');
  const given = (qd: number, qt: number) => (path.kind === 'NO_MODEL' ? 1 : path.kind === 'SINGLE_CALL' ? qt : qd * qt ** path.targetCalls);
  if (path.kind === 'NO_MODEL') return 1;
  if (path.kind === 'TWO_STAGE' && (!Number.isInteger(path.targetCalls) || path.targetCalls < 1)) throw new RangeError('a two-stage turn makes at least one target call');
  const mixture = a.degraded
    ? (1 - probability(a.degraded.share, 'degraded.share')) * given(a.qd, a.qt) + a.degraded.share * given(probability(a.degraded.qd, 'degraded.qd'), probability(a.degraded.qt, 'degraded.qt'))
    : given(a.qd, a.qt);
  return a.p * mixture;
}

/**
 * End-to-end honor expectation of one prompt: success -> the model-available honor probability h; failure -> the no-model fallback honor probability hFail
 * (0 unless a certified no-model path honors it). A provider failure is NEVER counted as honored (FR-UND-14 scoring), so hFail is an input the caller must justify.
 */
export function expectedHonor(path: RoutePath, a: AvailabilityParameters, hModelAvailable: number, hFail = 0): number {
  probability(hModelAvailable, 'h'); probability(hFail, 'hFail');
  const ok = routingSuccessProbability(path, a);
  return ok * hModelAvailable + (1 - ok) * hFail;
}

/** The end-to-end rate over a set of prompts, each with its path and model-available honor probability. */
export function endToEndHonorRate(prompts: ReadonlyArray<{ path: RoutePath; h: number; hFail?: number }>, a: AvailabilityParameters): number {
  if (!prompts.length) throw new RangeError('no prompts');
  return prompts.reduce((sum, x) => sum + expectedHonor(x.path, a, x.h, x.hFail ?? 0), 0) / prompts.length;
}
