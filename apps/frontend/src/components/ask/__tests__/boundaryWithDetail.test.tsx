import { render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { BoundaryWithDetail } from '../blocks/BoundaryWithDetail';

// A boundary with a longer explanation keeps the short body as the boundary and puts the rest behind a disclosure (FRD v1.393).
type Boundary = Extract<AskPresentationBlock, { type: 'BOUNDARY' }>;
const props = (block: Boundary): React.ComponentProps<typeof BoundaryWithDetail> => ({ block, executionId: 'e', propertyId: 'p', onItemAction: jest.fn(), itemActionsDisabled: false, onFilterClick: jest.fn(), onCollectionPage: jest.fn(), onAccessLost: jest.fn() }) as unknown as React.ComponentProps<typeof BoundaryWithDetail>;
const base: Boundary = { type: 'BOUNDARY', id: 'b', title: 'A home knowledge plan, not a legal will', body: 'Not a legal will. Details are not repeated.', severity: 'INFO', suggestions: [] };

test('a boundary with detail shows the short body and a quiet disclosure for the rest', () => {
  const view = render(<BoundaryWithDetail {...props({ ...base, detail: 'The longer explanation, including gate codes.' })} />);
  expect(screen.getByText(/Not a legal will\. Details are not repeated\./)).toBeInTheDocument();
  expect(screen.getByText('More about this')).toBeInTheDocument();
  expect(screen.getByText('The longer explanation, including gate codes.')).toBeInTheDocument();
  expect(view.container.querySelector('details')).not.toHaveAttribute('open');
});

test('a boundary without detail renders exactly as before, with no disclosure', () => {
  const view = render(<BoundaryWithDetail {...props(base)} />);
  expect(view.container.querySelector('details')).not.toBeInTheDocument();
  expect(screen.getByText(/Details are not repeated/)).toBeInTheDocument();
});
