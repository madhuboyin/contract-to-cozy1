export function clampRate(value: number, min = 0, max = 0.25): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function projectValueAtYear(baseValue: number, annualRate: number, yearIndex: number): number {
  const safeBase = Number.isFinite(baseValue) ? baseValue : 0;
  const safeRate = Number.isFinite(annualRate) ? annualRate : 0;
  const years = Math.max(0, yearIndex);
  return safeBase * Math.pow(1 + safeRate, years);
}

export function buildAnnualValueSeries(
  baseValue: number,
  annualRate: number,
  years: number
): number[] {
  const out: number[] = [];
  for (let year = 1; year <= Math.max(0, years); year++) {
    out.push(projectValueAtYear(baseValue, annualRate, year));
  }
  return out;
}

export function buildAnnualGainSeries(
  baseValue: number,
  annualRate: number,
  years: number
): number[] {
  const values = buildAnnualValueSeries(baseValue, annualRate, years);
  const gains: number[] = [];
  let previous = baseValue;

  for (const value of values) {
    gains.push(value - previous);
    previous = value;
  }

  return gains;
}

export function buildAnnualCostSeries(
  annualCostNow: number,
  annualGrowthRate: number,
  years: number
): number[] {
  const out: number[] = [];
  let current = Number.isFinite(annualCostNow) ? annualCostNow : 0;
  const safeGrowth = Number.isFinite(annualGrowthRate) ? annualGrowthRate : 0;

  for (let year = 1; year <= Math.max(0, years); year++) {
    if (year > 1) {
      current = current * (1 + safeGrowth);
    }
    out.push(current);
  }

  return out;
}
