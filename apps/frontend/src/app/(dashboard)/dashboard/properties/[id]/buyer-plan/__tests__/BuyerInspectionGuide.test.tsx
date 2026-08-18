import { fireEvent, render, screen } from '@testing-library/react';
import { BuyerInspectionGuide } from '../BuyerInspectionGuide';
import type { BuyerInspectionModuleRecommendation } from '@/types';

const poolModule: BuyerInspectionModuleRecommendation = {
  moduleKey: 'buyer.inspection.pool-spa',
  title: 'Pool and spa systems',
  description: 'Internal description',
  whyItMatters: 'Useful context',
  status: 'APPLICABLE',
  reasonCodes: ['POOL_SPA_CONFIRMED'],
  specialistScopes: ['POOL_SPA'],
  questions: ['Is the pool equipment included in the inspection?'],
  usedFactKeys: ['exterior.hasPoolOrSpa'],
  missingFactKeys: [],
  conflictedFactKeys: [],
  correctionPaths: [],
};

describe('BuyerInspectionGuide', () => {
  it('turns property context into plain-language inspection guidance', () => {
    render(<BuyerInspectionGuide address="10 Main St" modules={[poolModule]} unresolvedModules={[]} />);
    expect(screen.getByText('What to review for this home')).toBeInTheDocument();
    expect(screen.getByText('Pool or spa')).toBeInTheDocument();
    expect(screen.getByText(/pool equipment included/i)).toBeInTheDocument();
    expect(screen.queryByText(/exterior\.hasPoolOrSpa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add module/i)).not.toBeInTheDocument();
  });

  it('reveals the comprehensive checklist and opens the checklist-only print view', () => {
    render(
      <BuyerInspectionGuide
        address="10 Main St"
        modules={[]}
        unresolvedModules={[]}
        printHref="/dashboard/properties/property-1/buyer-plan/inspection-checklist/print"
      />,
    );
    expect(screen.getByText(/full printable checklist contains 18/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view full checklist/i }));
    expect(screen.getByText('Structure, foundation and water')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /print checklist/i })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/buyer-plan/inspection-checklist/print',
    );
    expect(screen.getByRole('link', { name: /print checklist/i })).toHaveAttribute('target', '_blank');
  });

  it('renders only the expanded inspection document in print presentation', () => {
    render(
      <BuyerInspectionGuide
        address="10 Main St"
        modules={[]}
        unresolvedModules={[]}
        presentation="print"
      />,
    );

    expect(screen.getByText('Structure, foundation and water')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view full checklist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /print checklist/i })).not.toBeInTheDocument();
  });
});
