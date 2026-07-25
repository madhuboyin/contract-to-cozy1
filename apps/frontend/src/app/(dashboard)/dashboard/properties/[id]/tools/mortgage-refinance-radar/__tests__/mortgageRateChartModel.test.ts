import { buildMortgageRateChartModel } from '../mortgageRateChartModel';

function snapshots(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 2 + index * 7));
    return {
      id: `snapshot-${index}`,
      date: date.toISOString().slice(0, 10),
      rate30yr: 7 - index * 0.01,
      rate15yr: 6.25 - index * 0.008,
      source: 'FRED',
      sourceRef: 'FRED/MORTGAGE30US+MORTGAGE15US',
      createdAt: date.toISOString(),
    };
  }).reverse();
}

describe('mortgage rate chart model', () => {
  it('orders observations oldest-first and limits the one-year view to 52 weeks', () => {
    const model = buildMortgageRateChartModel({
      snapshots: snapshots(60),
      product: '30YR',
      range: '1Y',
      now: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(model.points).toHaveLength(52);
    expect(Date.parse(model.points[0].date)).toBeLessThan(Date.parse(model.points[51].date));
    expect(model.latest?.id).toBe('snapshot-59');
    expect(model.changePctPoints).toBeLessThan(0);
  });

  it('uses 13 observations for three months and switches to the 15-year series', () => {
    const model = buildMortgageRateChartModel({
      snapshots: snapshots(20),
      product: '15YR',
      range: '3M',
      now: new Date('2025-06-01T00:00:00.000Z'),
    });

    expect(model.points).toHaveLength(13);
    expect(model.points[12].value).toBe(model.points[12].rate15yr);
  });

  it('includes the homeowner rate in the padded scale and identifies stale data', () => {
    const model = buildMortgageRateChartModel({
      snapshots: snapshots(4),
      product: '30YR',
      range: '1Y',
      currentMortgageRatePct: 8.5,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(model.maxY).toBeGreaterThan(8.5);
    expect(model.isCompactHistory).toBe(true);
    expect(model.isStale).toBe(true);
  });
});
