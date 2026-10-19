import React from 'react';
import { render, screen } from '@testing-library/react';
import { AskAdaptiveGrid, AskCollection, AskCollectionState, AskCompactRow, AskDefinitionGrid, AskFocusedPanel, AskReadingMeasure, AskWorkspaceMeasure } from '../presentation/AskLayoutPrimitives';

describe('Ask semantic layout primitives', () => {
  it('provides distinct reading, workspace, collection, grid, and focused-panel semantics', () => {
    const { container } = render(<>
      <AskReadingMeasure data-testid="reading" />
      <AskWorkspaceMeasure data-testid="workspace" />
      <AskCollection aria-label="Records"><AskCompactRow>Record</AskCompactRow></AskCollection>
      <AskDefinitionGrid data-testid="definitions"><div /></AskDefinitionGrid>
      <AskAdaptiveGrid data-testid="grid" />
      <AskFocusedPanel aria-label="Focused decision" />
    </>);
    expect(screen.getByTestId('reading')).toHaveClass('max-w-3xl');
    expect(screen.getByTestId('workspace')).toHaveClass('max-w-[1440px]');
    expect(screen.getByRole('list', { name: 'Records' })).toContainElement(screen.getByRole('listitem'));
    expect(screen.getByRole('listitem')).toHaveClass('min-h-[4.5rem]');
    expect(screen.getByTestId('definitions').tagName).toBe('DL');
    expect(screen.getByTestId('grid')).toHaveClass('sm:grid-cols-2');
    expect(screen.getByRole('region', { name: 'Focused decision' })).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });

  it('keeps empty, unavailable, and not-applicable collection states compact and actionable', () => {
    const { rerender } = render(<AskCollectionState kind="EMPTY" action={<button type="button">Add record</button>} />);
    expect(screen.getByText('Nothing is recorded here yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add record' })).toBeInTheDocument();
    rerender(<AskCollectionState kind="UNAVAILABLE" />);
    expect(screen.getByRole('status')).toHaveTextContent('temporarily unavailable');
    rerender(<AskCollectionState kind="NOT_APPLICABLE" />);
    expect(screen.getByText(/does not apply/)).toBeInTheDocument();
  });
});
