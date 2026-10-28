import type { AskPresentationBlock } from '@/features/ask/types';
import { ensureRefinanceRateHistoryChart } from '../blocks/registry';

test('recovers a refinance rate chart from governed weekly table data when the server chart is absent', () => {
  const table: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE', id: 'refinance-rate-history', title: '3 weeks of governed mortgage-rate history',
    columns: [{ key: 'date', label: 'Date' }, { key: 'thirty', label: '30-year fixed' }, { key: 'fifteen', label: '15-year fixed' }],
    rows: [
      { id: 'latest', values: { date: '2026-10-22', thirty: '7.320%', fifteen: '6.680%' } },
      { id: 'middle', values: { date: '2026-10-15', thirty: '7.400%', fifteen: '6.710%' } },
      { id: 'oldest', values: { date: '2026-10-08', thirty: '7.100%', fifteen: '6.500%' } },
    ],
    actions: [],
  };
  const recovered = ensureRefinanceRateHistoryChart([table]);
  expect(recovered.map((block) => block.id)).toEqual(['refinance-rate-history-chart', 'refinance-rate-history']);
  expect(recovered[0]).toMatchObject({
    type: 'TREND_CHART',
    categories: ['10/08', '10/15', '10/22'],
    series: [
      { id: 'rate-30', values: [7.1, 7.4, 7.32] },
      { id: 'rate-15', values: [6.5, 6.71, 6.68] },
    ],
  });
});

test('keeps the richer server-authored refinance chart without adding a duplicate', () => {
  const chart = { type: 'TREND_CHART', id: 'refinance-rate-history-chart' } as AskPresentationBlock;
  const table = { type: 'TABLE', id: 'refinance-rate-history' } as AskPresentationBlock;
  const blocks = [chart, table];
  expect(ensureRefinanceRateHistoryChart(blocks)).toBe(blocks);
});

test('the recovery chart keeps every weekly observation instead of downsampling a full year', () => {
  const rows = Array.from({ length: 52 }, (_, index) => ({
    id: `week-${index}`,
    values: { date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`, thirty: `${(7 - index / 100).toFixed(3)}%`, fifteen: `${(6.4 - index / 100).toFixed(3)}%` },
  }));
  const table = { type: 'TABLE', id: 'refinance-rate-history', title: '52 weeks', columns: [], rows, actions: [] } as Extract<AskPresentationBlock, { type: 'TABLE' }>;
  const chart = ensureRefinanceRateHistoryChart([table])[0] as Extract<AskPresentationBlock, { type: 'TREND_CHART' }>;
  expect(chart.categories).toHaveLength(52);
  expect(chart.series[0].values).toHaveLength(52);
  expect(chart.highlights?.map((item) => item.id)).toEqual(['rate-30-low', 'rate-30-high']);
});
