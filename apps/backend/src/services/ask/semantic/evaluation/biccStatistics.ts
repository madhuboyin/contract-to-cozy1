// BICC-EVAL-013/-018 and BICC-GATE-009/-010 (FRD §6): exact interval arithmetic for evaluation reports. Pure, no I/O.
//
// Clopper–Pearson intervals are exact (conservative) and are the method the FRD names for zero-event bounds. Wilson
// intervals are provided for descriptive per-stratum reporting where the exact bound is not required.

function logGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9); accurate to ~1e-15 for x > 0.
  const coefficients = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const shifted = x - 1;
  let sum = coefficients[0];
  const t = shifted + 7.5;
  for (let i = 1; i < 9; i += 1) sum += coefficients[i] / (shifted + i);
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

// Continued fraction for the incomplete beta function (modified Lentz).
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** The p-quantile of a Beta(a, b) distribution, by bisection on the regularised incomplete beta. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < p) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

function assertCounts(successes: number, trials: number): void {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials < 0 || successes > trials) {
    throw new RangeError(`Invalid counts: ${successes} of ${trials}.`);
  }
}

/** Exact one-sided upper confidence bound on a proportion (for example the failure rate of a zero-failure run). */
export function clopperPearsonUpperOneSided(events: number, trials: number, confidence = 0.95): number {
  assertCounts(events, trials);
  if (trials === 0 || events === trials) return 1;
  return betaQuantile(confidence, events + 1, trials - events);
}

/** Exact one-sided lower confidence bound on a proportion. */
export function clopperPearsonLowerOneSided(events: number, trials: number, confidence = 0.95): number {
  assertCounts(events, trials);
  if (trials === 0 || events === 0) return 0;
  return betaQuantile(1 - confidence, events, trials - events + 1);
}

export interface ProportionInterval { successes: number; trials: number; rate: number | null; lower: number | null; upper: number | null; method: 'CLOPPER_PEARSON' | 'WILSON' }

/** Exact two-sided interval. */
export function clopperPearsonInterval(successes: number, trials: number, confidence = 0.95): ProportionInterval {
  assertCounts(successes, trials);
  if (trials === 0) return { successes, trials, rate: null, lower: null, upper: null, method: 'CLOPPER_PEARSON' };
  const alpha = 1 - confidence;
  return {
    successes, trials, rate: successes / trials, method: 'CLOPPER_PEARSON',
    lower: successes === 0 ? 0 : betaQuantile(alpha / 2, successes, trials - successes + 1),
    upper: successes === trials ? 1 : betaQuantile(1 - alpha / 2, successes + 1, trials - successes),
  };
}

export function wilsonInterval(successes: number, trials: number, z = 1.959964): ProportionInterval {
  assertCounts(successes, trials);
  if (trials === 0) return { successes, trials, rate: null, lower: null, upper: null, method: 'WILSON' };
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const half = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return { successes, trials, rate: p, lower: (centre - half) / denominator, upper: (centre + half) / denominator, method: 'WILSON' };
}

/** The smallest number of zero-failure trials whose exact one-sided upper bound is at most `maxRate`. */
export function zeroFailureTrialsRequired(maxRate: number, confidence = 0.95): number {
  if (!(maxRate > 0 && maxRate < 1)) throw new RangeError('maxRate must be between 0 and 1.');
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - maxRate));
}
