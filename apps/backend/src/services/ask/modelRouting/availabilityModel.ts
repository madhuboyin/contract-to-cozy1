// Availability model for the model-assisted route (reliability FRD FR-UND-14, D6a). Pure arithmetic: nothing here calls a provider.
// p = probability the provider is available for the turn (a SHARED outage: when it is down every call of the turn fails); q_d / q_t = probability that one
// domain-selection / target (or single) call succeeds given the provider is available (independent across calls given availability). A degraded-provider mixture
// replaces (q_d, q_t) with lower values for a fraction d of turns. All numbers below are PROVISIONAL owner assumptions (D6a); D6b replaces them with measurements.
export interface AvailabilityParameters { readonly p: number; readonly qd: number; readonly qt: number; readonly degraded?: { readonly share: number; readonly qd: number; readonly qt: number } }
export type RoutePath = { readonly kind: 'NO_MODEL' } | { readonly kind: 'SINGLE_CALL' } | { readonly kind: 'TWO_STAGE'; readonly targetCalls: number };

/** Named scenarios (FR-UND-14 reports all four; the baseline gates). Optimistic is p = 99.99%, q_d = 99.9%, q_t = 99.9% (not certainty: a scenario with no failures cannot show what an outage costs). */
export const AVAILABILITY_SCENARIOS: Readonly<Record<'optimistic' | 'baseline' | 'correlatedOutage' | 'degradedProvider', AvailabilityParameters>> = Object.freeze({
  optimistic: { p: 0.9999, qd: 0.999, qt: 0.999 },
  baseline: { p: 0.999, qd: 0.997, qt: 0.995 },
  correlatedOutage: { p: 0.99, qd: 0.997, qt: 0.995 },
  degradedProvider: { p: 0.999, qd: 0.997, qt: 0.995, degraded: { share: 0.02, qd: 0.95, qt: 0.9 } },
});

/** FR-UND-14: the total availability-tested call count is capped (N_max, proposed 6) so the failure subsets stay at most 2^6 = 64. */
export const MAX_AVAILABILITY_TESTED_CALLS = 6;

const probability = (x: number, name: string) => { if (!(x >= 0 && x <= 1) || Number.isNaN(x)) throw new RangeError(`${name} must be a probability in [0, 1], got ${x}`); return x; };

function checkPath(path: RoutePath) {
  if (path.kind === 'TWO_STAGE' && (!Number.isInteger(path.targetCalls) || path.targetCalls < 1)) throw new RangeError('a two-stage turn makes at least one target call');
  if (path.kind === 'TWO_STAGE' && path.targetCalls > MAX_AVAILABILITY_TESTED_CALLS) throw new RangeError(`at most ${MAX_AVAILABILITY_TESTED_CALLS} concurrent target calls are availability-tested`);
}

/** P(every model call of the turn succeeds). NO_MODEL needs no call. */
export function routingSuccessProbability(path: RoutePath, a: AvailabilityParameters): number {
  probability(a.p, 'p'); probability(a.qd, 'qd'); probability(a.qt, 'qt');
  const given = (qd: number, qt: number) => (path.kind === 'NO_MODEL' ? 1 : path.kind === 'SINGLE_CALL' ? qt : qd * qt ** path.targetCalls);
  if (path.kind === 'NO_MODEL') return 1;
  checkPath(path);
  const mixture = a.degraded
    ? (1 - probability(a.degraded.share, 'degraded.share')) * given(a.qd, a.qt) + a.degraded.share * given(probability(a.degraded.qd, 'degraded.qd'), probability(a.degraded.qt, 'degraded.qt'))
    : given(a.qd, a.qt);
  return a.p * mixture;
}

/** P(exactly the failure subset F of S independent target calls fails) = q_t^(S-|F|) (1-q_t)^|F|, given the provider is available and stage one succeeded. */
export function failureSubsetProbability(S: number, qt: number, failedCount: number): number {
  if (!Number.isInteger(S) || S < 1 || failedCount < 0 || failedCount > S) throw new RangeError('invalid subset size');
  return probability(qt, 'qt') ** (S - failedCount) * (1 - qt) ** failedCount;
}

/** Every failure subset F of {1..S} (2^S of them), as sets of 1-based call numbers, in bitmask order (the empty set first, all calls last). */
export function failureSubsets(S: number): ReadonlyArray<ReadonlySet<number>> {
  if (!Number.isInteger(S) || S < 1 || S > MAX_AVAILABILITY_TESTED_CALLS) throw new RangeError(`S must be 1..${MAX_AVAILABILITY_TESTED_CALLS}`);
  return Array.from({ length: 2 ** S }, (_, mask) => new Set(Array.from({ length: S }, (_, i) => i + 1).filter((call) => mask & (1 << (call - 1)))));
}

/** The honor outcome of one prompt (or one facet) when exactly the calls in `failed` failed after stage one succeeded. For a single-call path `failed` is empty or {1}. */
export type SubsetHonor = (failed: ReadonlySet<number>) => number;

/**
 * FR-UND-14 expectation over failure subsets. Two-stage path: E = p [ (1-q_d) h_s1 + q_d sum_F q_t^(S-|F|) (1-q_t)^|F| h(F) ] + (1-p) h_s1, where h_s1 is the outcome when stage one (or the whole provider) fails
 * and h(F) the outcome when exactly the target calls in F fail. Single call: the same with S = 1 and no stage one. No model: h(empty). A degraded-provider mixture is the share-weighted mixture of the same expectation under
 * its own (q_d, q_t). A provider failure is never counted as honored: h_s1 is 0 unless a certified no-model path honors it, and the caller must justify any other value.
 */
export function expectedHonorOverSubsets(path: RoutePath, a: AvailabilityParameters, h: SubsetHonor, hStage1Fail = 0): number {
  probability(a.p, 'p'); probability(a.qd, 'qd'); probability(a.qt, 'qt'); probability(hStage1Fail, 'hStage1Fail');
  checkPath(path);
  const outcome = (failed: ReadonlySet<number>) => probability(h(failed), 'h(F)');
  if (path.kind === 'NO_MODEL') return outcome(new Set());
  const S = path.kind === 'SINGLE_CALL' ? 1 : path.targetCalls;
  const subsets = failureSubsets(S);
  const model = (qd: number, qt: number) => {
    const targetStage = subsets.reduce((sum, F) => sum + failureSubsetProbability(S, qt, F.size) * outcome(F), 0);
    return path.kind === 'SINGLE_CALL' ? targetStage : (1 - qd) * hStage1Fail + qd * targetStage;
  };
  const conditional = a.degraded
    ? (1 - probability(a.degraded.share, 'degraded.share')) * model(a.qd, a.qt) + a.degraded.share * model(probability(a.degraded.qd, 'degraded.qd'), probability(a.degraded.qt, 'degraded.qt'))
    : model(a.qd, a.qt);
  return a.p * conditional + (1 - a.p) * hStage1Fail;
}

/** Facet-level expectations (FR-EVAL-14): h_facet_i(F) for each facet, under the SAME failure subsets, so the macro metrics are computed end to end at facet level. */
export function expectedFacetHonors(path: RoutePath, a: AvailabilityParameters, facetCount: number, hFacet: (facet: number, failed: ReadonlySet<number>) => number, hStage1Fail: (facet: number) => number = () => 0): number[] {
  if (!Number.isInteger(facetCount) || facetCount < 1) throw new RangeError('a prompt has at least one facet');
  return Array.from({ length: facetCount }, (_, i) => expectedHonorOverSubsets(path, a, (F) => hFacet(i, F), hStage1Fail(i)));
}

/**
 * End-to-end honor expectation of one prompt whose outcome only distinguishes "every call succeeded" (h) from "something failed" (hFail). It is the special case of the subset expectation with
 * h(empty) = h and h(F) = hFail otherwise, so the all-or-nothing figure is no longer a separate formula.
 */
export function expectedHonor(path: RoutePath, a: AvailabilityParameters, hModelAvailable: number, hFail = 0): number {
  probability(hModelAvailable, 'h'); probability(hFail, 'hFail');
  return expectedHonorOverSubsets(path, a, (F) => (F.size === 0 ? hModelAvailable : hFail), hFail);
}

/** The end-to-end rate over a set of prompts, each with its path and model-available honor probability. */
export function endToEndHonorRate(prompts: ReadonlyArray<{ path: RoutePath; h: number; hFail?: number }>, a: AvailabilityParameters): number {
  if (!prompts.length) throw new RangeError('no prompts');
  return prompts.reduce((sum, x) => sum + expectedHonor(x.path, a, x.h, x.hFail ?? 0), 0) / prompts.length;
}

/** The uncertainty of the availability inputs: each parameter lies in [low, high] (the owner's D6a assumptions are provisional until D6b measures them). */
export interface AvailabilityInterval { readonly p: readonly [number, number]; readonly qd: readonly [number, number]; readonly qt: readonly [number, number] }

/**
 * Lower bound of the end-to-end honor expectation over the whole availability interval (FR-UND-14: the gate carries the uncertainty of its inputs, it does not use a point estimate). The expectation is increasing
 * in p, q_d and q_t exactly when (1) a further failure never raises the outcome, h(G) <= h(F) for F a subset of G, and (2) no outcome beats the model path's best, i.e. h(F) >= h_s1 (a partial failure is never worse than
 * the no-model fallback). Under those conditions the bound is the value at the pessimistic corner; if either condition fails the corner is NOT a bound, so this refuses instead of returning a number.
 */
export function availabilityLowerBound(path: RoutePath, interval: AvailabilityInterval, h: SubsetHonor, hStage1Fail = 0, degraded?: AvailabilityParameters['degraded']): number {
  for (const [name, range] of [['p', interval.p], ['qd', interval.qd], ['qt', interval.qt]] as const) { probability(range[0], `${name}.low`); probability(range[1], `${name}.high`); if (range[0] > range[1]) throw new RangeError(`${name} interval is reversed`); }
  if (path.kind !== 'NO_MODEL') {
    checkPath(path);
    const S = path.kind === 'SINGLE_CALL' ? 1 : path.targetCalls; const subsets = failureSubsets(S);
    for (const F of subsets) {
      if (h(F) < hStage1Fail - 1e-12) throw new RangeError('a partial failure honors less than the no-model fallback, so the pessimistic corner is not a lower bound');
      for (const G of subsets) if ([...F].every((x) => G.has(x)) && h(G) > h(F) + 1e-12) throw new RangeError('a further failure raises the outcome, so the pessimistic corner is not a lower bound');
    }
  }
  return expectedHonorOverSubsets(path, { p: interval.p[0], qd: interval.qd[0], qt: interval.qt[0], ...(degraded ? { degraded } : {}) }, h, hStage1Fail);
}
