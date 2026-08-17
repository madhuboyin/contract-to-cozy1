import { render, screen } from '@testing-library/react';
import type { BuyerClosingHomeOverview } from '@/types';
import { BuyerClosingHome } from '../BuyerClosingHome';

function overview(): BuyerClosingHomeOverview {
  return {
    property: { id: 'property-1', address: '10 Main St', city: 'Boston', state: 'MA', zipCode: '02108' },
    journey: {
      status: 'ACTIVE',
      stage: 'DUE_DILIGENCE',
      targetCloseDate: '2026-09-15T12:00:00.000Z',
      moveInDate: null,
      progress: { completed: 2, total: 8, percent: 25 },
    },
    nextAction: null,
    blockers: [],
    milestones: [],
    readinessLanes: [
      { key: 'CONTRACT', label: 'Contract', completed: 2, total: 2, blocked: 0 },
      { key: 'DUE_DILIGENCE', label: 'Due diligence', completed: 2, total: 4, blocked: 0 },
      { key: 'CLOSING', label: 'Closing readiness', completed: 0, total: 0, blocked: 0 },
      { key: 'MOVE', label: 'Move & possession', completed: 0, total: 2, blocked: 1 },
    ],
    evidence: {
      inspectionState: 'NOT_STARTED',
      inspectionReportCount: 0,
      openMaterialFindingCount: 0,
      documentCount: 0,
      verifiedDocumentCount: 0,
      documentsNeedingReviewCount: 0,
    },
    people: { contactCount: 0, assignedTaskCount: 0 },
    routes: {
      plan: '/dashboard/properties/property-1/buyer-plan',
      documents: '/dashboard/properties/property-1/documents',
      inspection: '/dashboard/properties/property-1/inspection-hub',
      ask: '/dashboard/ask?propertyId=property-1',
    },
  };
}

describe('BuyerClosingHome readiness semantics', () => {
  it('exposes overall progress to assistive technology', () => {
    render(<BuyerClosingHome overview={overview()} />);

    const progress = screen.getByRole('progressbar', { name: 'Closing Plan progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(progress).toHaveAttribute('aria-valuetext', '2 of 8 ready');
  });

  it('distinguishes complete, open, blocked, and no-action readiness lanes', () => {
    render(<BuyerClosingHome overview={overview()} />);

    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('2 open')).toBeInTheDocument();
    expect(screen.getByText('1 blocked')).toBeInTheDocument();
    expect(screen.getByText('No actions yet')).toBeInTheDocument();
    expect(screen.getByText('No applicable actions are in this lane yet.')).toBeInTheDocument();
  });
});
