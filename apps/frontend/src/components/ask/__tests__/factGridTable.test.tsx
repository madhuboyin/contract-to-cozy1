import { render } from '@testing-library/react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

// The home record summary renders as a grid of label/value tiles with no view switch (FRD Appendix C.10); any other table is unchanged.
type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;
const table = (id: string): TableBlock => ({
  type: 'TABLE', id, title: 'Home record summary', description: 'Recorded facts. Not recorded yet: bedrooms.', preferredPresentation: 'TABLE', actions: [],
  columns: [{ key: 'detail', label: 'Detail' }, { key: 'recordedValue', label: 'Recorded value' }],
  rows: [{ id: 'home-type', values: { detail: 'Home type', recordedValue: 'Townhouse' } }, { id: 'year-built', values: { detail: 'Year built', recordedValue: '1993' } }, { id: 'roof', values: { detail: 'Roof', recordedValue: 'Shingle' } }],
});

describe('home record summary fact grid', () => {
  it('shows each fact as a tile in a one, two, three column grid, with the description and no view switch or record count', () => {
    const { container } = render(<AdaptiveTableBlock block={table('property-summary-facts')} renderAction={() => null} />);
    const grid = container.querySelector('[data-fact-grid="property-summary-facts"] dl') as HTMLElement;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(container.querySelectorAll('[data-fact-tile]')).toHaveLength(3);
    expect(container.querySelector('[data-fact-tile="year-built"]')).toHaveTextContent('Year built');
    expect(container.querySelector('[data-fact-tile="year-built"]')).toHaveTextContent('1993');
    expect(container).toHaveTextContent('Not recorded yet: bedrooms.');
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container).not.toHaveTextContent(/records\./);
  });

  it('any other table keeps the adaptive table', () => {
    const { container } = render(<AdaptiveTableBlock block={table('some-other-table')} renderAction={() => null} />);
    expect(container.querySelector('[data-fact-grid]')).toBeNull();
    expect(container).toHaveTextContent('3 records.');
  });
});
