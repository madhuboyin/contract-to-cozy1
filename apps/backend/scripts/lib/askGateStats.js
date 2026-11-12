// Gate statistics for the understanding-reliability programme (FRD §4.4, FR-EVAL-14, D4). Pure functions, no I/O. The gates are evaluated at SOURCE-FAMILY level:
// rows of one family are not independent, so Wilson bounds apply to family-level successes and the cluster bootstrap resamples families, never rows.
const z95 = 1.959964;
/** One-sided 95% uses z = 1.644854; two-sided 95% (reported intervals) uses 1.959964. */
const Z = { oneSided95: 1.644854, twoSided95: z95 };

function wilson(k, n, z = Z.twoSided95) {
  if (!Number.isInteger(n) || n <= 0 || k < 0 || k > n) throw new RangeError(`bad counts ${k}/${n}`);
  const p = k / n; const d = 1 + (z * z) / n; const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { rate: p, lo: Math.max(0, (c - h) / d), hi: Math.min(1, (c + h) / d) };
}

/** Smallest n with zero failures whose Wilson UPPER bound on the failure rate is <= maxRate (FRD §4.4 uses the two-sided 95% z): n >= z^2 (1 - r) / r. 1% -> 381, 2% -> 189, 10% -> 35. */
function zeroFailureSampleSize(maxRate, z = Z.twoSided95) { return Math.ceil((z * z * (1 - maxRate)) / maxRate); }

/** Smallest n such that, if every prompt is honored but `allowedFailures` fail, the Wilson lower bound is still >= target. */
function minSampleForLowerBound(target, allowedFailures = 0, z = Z.twoSided95) {
  for (let n = Math.max(1, allowedFailures + 1); n < 100000; n += 1) if (wilson(n - allowedFailures, n, z).lo >= target) return n;
  throw new RangeError('no sample size under 100000');
}

/** Family-level aggregation: rows -> [{family, honored, total}] -> Wilson on families weighted equally (each family counts once, as its own honor share >= 0.5? no: strict). */
function familyCounts(rows, familyOf, honoredOf) {
  const by = new Map();
  for (const r of rows) { const f = familyOf(r); const x = by.get(f) ?? { family: f, honored: 0, total: 0 }; x.total += 1; if (honoredOf(r)) x.honored += 1; by.set(f, x); }
  return [...by.values()];
}

/** Seeded PRNG (mulberry32) so a gate result is reproducible. */
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Cluster bootstrap over families for a fractional per-prompt expectation (the end-to-end honor expectation is fractional, so Wilson on counts does not apply).
 * `families` is [{ family, values: number[] }] (each value a per-prompt honor expectation in [0,1]); returns the pooled mean and a one-sided lower percentile.
 */
function clusterBootstrapLowerBound(families, { resamples = 4000, quantile = 0.05, seed = 20261111 } = {}) {
  if (!families.length) throw new RangeError('no families');
  const rand = rng(seed); const mean = (fs) => { let s = 0; let n = 0; for (const f of fs) for (const v of f.values) { s += v; n += 1; } return s / n; };
  const draws = [];
  for (let i = 0; i < resamples; i += 1) { const pick = []; for (let j = 0; j < families.length; j += 1) pick.push(families[Math.floor(rand() * families.length)]); draws.push(mean(pick)); }
  draws.sort((a, b) => a - b);
  return { mean: mean(families), lower: draws[Math.floor(quantile * (draws.length - 1))], resamples, families: families.length };
}

/** The honor-rate gate for one stratum: lower bound >= target. Returns the evidence, not just a boolean. */
function gate({ honored, total, target = 0.9, z = Z.oneSided95 }) { const w = wilson(honored, total, z); return { ...w, target, pass: w.lo >= target, honored, total }; }

module.exports = { wilson, zeroFailureSampleSize, minSampleForLowerBound, familyCounts, clusterBootstrapLowerBound, gate, Z };
