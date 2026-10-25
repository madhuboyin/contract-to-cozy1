import { render, screen, within } from '@testing-library/react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import { SummaryBlock } from '../blocks/CoreBlocks';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

const block: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
  type: 'TABLE', id: 'sell-hold-rent-projection', title: 'How hold and rent change over time',
  description: 'Annual modeled changes.',
  columns: [{ key: 'year', label: 'Year' }, { key: 'homeValue', label: 'Home value' }, { key: 'hold', label: 'Hold change' }, { key: 'rent', label: 'Rent change' }],
  rows: [
    { id: '2027', values: { year: '2027', homeValue: '$725,000', hold: '$12,000', rent: '$18,000' } },
    { id: '2028', values: { year: '2028', homeValue: '$750,000', hold: '$16,000', rent: '$25,000' } },
    { id: '2029', values: { year: '2029', homeValue: '$776,000', hold: '$21,000', rent: '$33,000' } },
  ],
  actions: [],
};

test('renders the full annual Sell Hold Rent projection as an accessible compact chart with a data-table disclosure', () => {
  render(<AdaptiveTableBlock block={block} renderAction={() => null} />);
  expect(screen.getByRole('img', { name: /Annual modeled changes/ })).toHaveAccessibleName(/Hold moves from \$12K to \$21K; rent moves from \$18K to \$33K/);
  expect(screen.getByText('View annual values')).toBeVisible();
  expect(screen.getAllByText('2029')).toHaveLength(2);
});

test('renders the Sell Hold Rent comparison strip with path economics breakdown and leading badge', () => {
  const comparisonBlock: Extract<AskPresentationBlock, { type: 'COMPARISON' }> = {
    type: 'COMPARISON',
    id: 'sell-hold-rent-comparison',
    title: '5-year path comparison',
    description: 'Modeled side-by-side economics.',
    options: [
      {
        id: 'sell',
        label: 'Sell now',
        summary: 'Estimated net proceeds after selling costs and debt payoff.',
        attributes: [
          { label: 'Modeled outcome', value: '$420,000', tone: 'POSITIVE' },
          { label: 'Current value', value: '$700,000', tone: 'DEFAULT' },
          { label: 'Selling costs', value: '$42,000', tone: 'DEFAULT' },
          { label: 'Debt payoff', value: '$238,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
      {
        id: 'hold',
        label: 'Hold',
        summary: 'Projected net wealth impact over 5 years.',
        badges: [
          {
            policyCode: 'SELL_HOLD_RENT_MODELED_OUTCOME',
            label: 'Leads modeled outcome',
            basis: 'Leads on the canonical model outcome ($465,000 over 5 years).',
          },
        ],
        attributes: [
          { label: 'Modeled outcome', value: '$465,000', tone: 'POSITIVE', leading: true },
          { label: 'Appreciation gain', value: '$112,000', tone: 'DEFAULT' },
          { label: 'Carry costs', value: '$67,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
      {
        id: 'rent',
        label: 'Rent out',
        summary: 'Projected rental cashflow and appreciation.',
        attributes: [
          { label: 'Modeled outcome', value: '$440,000', tone: 'POSITIVE' },
          { label: 'Gross rent', value: '$180,000', tone: 'DEFAULT' },
          { label: 'Operating costs', value: '$52,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
    ],
    actions: [],
  };

  render(<ComparisonStripBlock block={comparisonBlock} renderAction={() => null} />);
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(within(items[1]).getByText('Leads modeled outcome')).toHaveAttribute('data-badge-policy', 'SELL_HOLD_RENT_MODELED_OUTCOME');
  expect(within(items[1]).getByText('$465,000')).toBeVisible();
});

test('renders Sell Hold Rent assumptions with baseline and override tiles alongside table data', () => {
  const assumptionsBlock: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'sell-hold-rent-assumptions',
    title: 'Assumptions used',
    description: 'Inputs for this scenario.',
    columns: [
      { key: 'input', label: 'Input' },
      { key: 'value', label: 'Value' },
      { key: 'source', label: 'Source' },
    ],
    rows: [
      { id: 'home-value', values: { input: 'Home value', value: '$700,000', source: 'Property profile' } },
      { id: 'monthly-rent', values: { input: 'Monthly rent', value: '$3,400', source: 'What-if override' } },
    ],
    actions: [],
  };

  const { container } = render(<AdaptiveTableBlock block={assumptionsBlock} renderAction={() => null} />);
  expect(container.querySelector('[data-sell-hold-rent-assumptions]')).toBeInTheDocument();
  expect(screen.getAllByText('$3,400').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Override')).toBeInTheDocument();
  expect(screen.getByText('Baseline')).toBeInTheDocument();
});

test('renders Break-Even sensitivity cards, assumptions grid, and what-if delta cards', () => {
  const sensitivityBlock: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'break-even-sensitivity',
    title: 'Break-even range',
    description: '2 of 3 scenarios reach break-even within 10 years.',
    columns: [
      { key: 'scenario', label: 'Scenario' },
      { key: 'breakEven', label: 'Breaks even' },
      { key: 'net', label: 'Net at year 10' },
    ],
    rows: [
      { id: 'break-even-conservative', values: { scenario: 'Conservative', breakEven: 'Not within 10 years', net: '-$8,000' } },
      { id: 'break-even-base', values: { scenario: 'Base', breakEven: 'Year 6', net: '$42,000' } },
      { id: 'break-even-optimistic', values: { scenario: 'Optimistic', breakEven: 'Year 4', net: '$90,000' } },
    ],
    actions: [],
  };

  const { container: sensitivityContainer } = render(<AdaptiveTableBlock block={sensitivityBlock} renderAction={() => null} />);
  expect(sensitivityContainer.querySelector('[data-break-even-sensitivity]')).toBeInTheDocument();
  expect(screen.getAllByText('Reached')).toHaveLength(2);
  expect(screen.getByText('Unreached')).toBeInTheDocument();

  const whatIfComparison: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'break-even-what-if-comparison',
    title: 'Your what-if against the standard projection',
    columns: [
      { key: 'measure', label: '' },
      { key: 'standard', label: 'Standard' },
      { key: 'whatIf', label: 'Your what-if' },
    ],
    rows: [
      { id: 'break-even-what-if-when', values: { measure: 'Breaks even', standard: 'Year 6 (2032)', whatIf: 'Year 3 (2029)' } },
    ],
    actions: [],
  };

  const { container: whatIfContainer } = render(<AdaptiveTableBlock block={whatIfComparison} renderAction={() => null} />);
  expect(whatIfContainer.querySelector('[data-break-even-what-if="break-even-what-if-comparison"]')).toBeInTheDocument();
  expect(screen.getAllByText('Year 3 (2029)').length).toBeGreaterThanOrEqual(1);
});

test('renders Ownership Costs category breakdown and forward period range cards alongside accessible tables', () => {
  const categoriesBlock: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'ownership-cost-categories',
    title: 'Cost by category',
    description: 'Included categories in the operating expense lens.',
    preferredPresentation: 'TABLE',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'monthly', label: 'Monthly' },
      { key: 'annual', label: 'Annual' },
      { key: 'evidence', label: 'Evidence' },
    ],
    rows: [
      { id: 'tax', values: { category: 'Property tax', monthly: '$620', annual: '$7,440', evidence: 'Confirmed (tax record)' } },
      { id: 'maintenance', values: { category: 'Maintenance', monthly: '$240', annual: '$2,880', evidence: 'Estimated (regional benchmark)' } },
    ],
    actions: [],
  };

  const { container: categoriesContainer } = render(<AdaptiveTableBlock block={categoriesBlock} renderAction={() => null} />);
  expect(categoriesContainer.querySelector('[data-ownership-cost-categories]')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Cost by category' })).toBeInTheDocument();
  expect(screen.getAllByText('Property tax').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('$620').length).toBeGreaterThanOrEqual(1);

  const forecastPeriodsBlock: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'ownership-cost-forecast-periods',
    title: 'Forward cost range',
    preferredPresentation: 'TABLE',
    columns: [
      { key: 'period', label: 'Period' },
      { key: 'low', label: 'Low' },
      { key: 'base', label: 'Base' },
      { key: 'high', label: 'High' },
      { key: 'confidence', label: 'Confidence' },
    ],
    rows: [
      { id: 'NEXT_12_MONTHS', values: { period: 'Next 12 months', low: '$15,200', base: '$17,040', high: '$19,500', confidence: 'medium' } },
    ],
    actions: [],
  };

  const { container: forecastContainer } = render(<AdaptiveTableBlock block={forecastPeriodsBlock} renderAction={() => null} />);
  expect(forecastContainer.querySelector('[data-ownership-cost-periods="ownership-cost-forecast-periods"]')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Forward cost range' })).toBeInTheDocument();
  expect(screen.getAllByText('$17,040').length).toBeGreaterThanOrEqual(1);
});

test('renders Coverage Gaps executive summary card and 2-column grouped item grid without view toggles', () => {
  const coverageSummary: Extract<AskPresentationBlock, { type: 'SUMMARY' }> = {
    type: 'SUMMARY',
    id: 'coverage-summary',
    title: 'Protection gaps and missing coverage evidence',
    body: 'This review separates confirmed coverage gaps from items where coverage is unclear or supporting documents are missing: 2 confirmed missing or expired, 0 unclear, and 4 missing supporting evidence.',
    tone: 'WARNING',
    actions: [],
  };

  const { container: summaryContainer } = render(<SummaryBlock block={coverageSummary} renderAction={() => null} />);
  expect(summaryContainer.querySelector('[data-coverage-summary="coverage-summary"]')).toBeInTheDocument();
  expect(screen.getByText('Coverage Intelligence')).toBeInTheDocument();
  expect(screen.getByText('2 Confirmed Gaps')).toBeInTheDocument();
  expect(screen.getByText('Confirmed Gaps')).toBeInTheDocument();
  expect(screen.getByText('Coverage Unclear')).toBeInTheDocument();
  expect(screen.getByText('Evidence Missing')).toBeInTheDocument();

  const coverageGroups: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
    type: 'GROUPED_LIST',
    id: 'coverage-groups',
    title: 'Coverage review',
    sections: [
      {
        id: 'coverage-confirmed-gaps',
        title: 'No coverage confirmed',
        description: 'Recorded inventory or policy data shows no active coverage or expired coverage.',
        items: [
          {
            id: 'microwave',
            title: 'Microwave',
            subtitle: 'No warranty or insurance coverage is linked to Microwave.',
            badge: 'NO_COVERAGE',
            meta: ['Kitchen'],
            actions: [],
          },
        ],
      },
      {
        id: 'coverage-evidence-missing',
        title: 'Evidence missing',
        description: 'Coverage is linked, but policy details or supporting documents are incomplete.',
        items: [
          {
            id: 'hvac-furnace',
            title: 'HVAC Furnace',
            subtitle: 'HVAC Furnace is marked covered, but no warranty or insurance document is linked.',
            badge: 'EVIDENCE_MISSING',
            meta: ['hvac', '$6,000 recorded exposure'],
            actions: [],
          },
        ],
      },
    ],
    filters: [],
    actions: [],
  };

  const { container: groupsContainer } = render(<GenericGroupedListBlock block={coverageGroups} renderAction={() => null} />);
  expect(groupsContainer.querySelector('[data-coverage-groups-list="coverage-groups"]')).toBeInTheDocument();
  expect(groupsContainer.querySelectorAll('[data-coverage-groups-grid]').length).toBe(2);
  expect(screen.getByText('Item-Level Protection')).toBeInTheDocument();
  expect(screen.getByText('HVAC')).toBeInTheDocument();
  expect(screen.getAllByText('$6,000 recorded exposure').length).toBeGreaterThanOrEqual(1);
  expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();
});
