import { fireEvent, render, screen, within } from '@testing-library/react';
import { MaintenanceForecastResultList } from '../MaintenanceForecastResultList';
import { isCalmAdopter } from '@/features/ask/calmAnswers';
import type { AskPresentationBlock } from '@/features/ask/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const block: Block = {
  type: 'GROUPED_LIST', id: 'maintenance-forecast-items', title: 'Upcoming maintenance', description: 'One card per need.', filters: [], actions: [],
  sections: [{
    id: 'coming-soon', title: 'Next 30 days', count: 2, items: [
      { id: 'filter', title: 'Filter Change', description: 'Recommended every three months.', meta: ['Furnace', 'Every 3 months', 'High', 'Next expected Nov 1, 2026'], badgeLabel: 'Nov 1, 2026', status: 'PENDING', tone: 'CAUTION', href: null },
      { id: 'flush', title: 'Tank Flush', description: 'Recommended annually.', meta: ['Water heater', 'Every 12 months', 'Medium', 'Next expected Nov 15, 2026'], badgeLabel: 'Nov 15, 2026', status: 'PENDING', tone: 'DEFAULT', href: null },
    ],
  }],
} as Block;

describe('MaintenanceForecastResultList', () => {
  it('renders a compact grouped artifact without generic presentation controls or duplicate recurrence cards', () => {
    const { container } = render(<MaintenanceForecastResultList block={block} />);
    const artifact = container.querySelector('[data-maintenance-forecast]') as HTMLElement;
    expect(artifact).not.toBeNull();
    expect(within(artifact).getByRole('heading', { name: 'Next 30 days' })).toBeInTheDocument();
    expect(within(artifact).getAllByText('Filter Change')).toHaveLength(1);
    expect(artifact).toHaveTextContent('Every 3 months');
    expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();
  });

  it('progressively discloses forecast reasoning with accessible state', () => {
    render(<MaintenanceForecastResultList block={block} />);
    const why = screen.getAllByRole('button', { name: 'Why this?' })[0];
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Recommended every three months.')).not.toBeInTheDocument();
    fireEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Recommended every three months.')).toBeInTheDocument();
  });

  it('opts the maintenance forecast into the calm answer anatomy', () => {
    expect(isCalmAdopter({ blocks: [block] })).toBe(true);
  });
});
