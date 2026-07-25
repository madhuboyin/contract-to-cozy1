export type MortgageRateProduct = '30YR' | '15YR';
export type MortgageRateRange = '3M' | '1Y';

export type MortgageRateChartSnapshot = {
  id: string;
  date: string;
  rate30yr: number;
  rate15yr: number;
  source: string;
  sourceRef: string | null;
  createdAt: string;
};

export type MortgageRateChartPoint = MortgageRateChartSnapshot & {
  value: number;
};

const RANGE_POINT_LIMIT: Record<MortgageRateRange, number> = {
  '3M': 13,
  '1Y': 52,
};

const STALE_AFTER_DAYS = 14;

export function buildMortgageRateChartModel(input: {
  snapshots: MortgageRateChartSnapshot[];
  product: MortgageRateProduct;
  range: MortgageRateRange;
  currentMortgageRatePct?: number | null;
  now?: Date;
}) {
  const ordered = [...input.snapshots]
    .filter((snapshot) => Number.isFinite(Date.parse(snapshot.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(-RANGE_POINT_LIMIT[input.range]);
  const points: MortgageRateChartPoint[] = ordered.map((snapshot) => ({
    ...snapshot,
    value: input.product === '30YR' ? snapshot.rate30yr : snapshot.rate15yr,
  }));

  const plottedValues = points.map((point) => point.value);
  if (input.currentMortgageRatePct != null && Number.isFinite(input.currentMortgageRatePct)) {
    plottedValues.push(input.currentMortgageRatePct);
  }

  const rawMin = plottedValues.length > 0 ? Math.min(...plottedValues) : 0;
  const rawMax = plottedValues.length > 0 ? Math.max(...plottedValues) : 1;
  const span = Math.max(0, rawMax - rawMin);
  const padding = Math.max(0.1, span * 0.15);
  const minY = Math.max(0, rawMin - padding);
  const maxY = rawMax + padding;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (portion) => minY + (maxY - minY) * portion,
  );

  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  const changePctPoints = first && latest
    ? Number((latest.value - first.value).toFixed(3))
    : null;
  const latestObservationMs = latest ? Date.parse(latest.date) : Number.NaN;
  const nowMs = (input.now ?? new Date()).getTime();
  const ageDays = Number.isFinite(latestObservationMs)
    ? Math.floor((nowMs - latestObservationMs) / (24 * 60 * 60 * 1000))
    : null;

  return {
    points,
    minY,
    maxY,
    yTicks,
    first,
    latest,
    changePctPoints,
    ageDays,
    isStale: ageDays != null && ageDays > STALE_AFTER_DAYS,
    isCompactHistory: points.length < 8,
  };
}
