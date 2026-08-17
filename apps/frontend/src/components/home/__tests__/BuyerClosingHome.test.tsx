import { render, screen, within } from '@testing-library/react';
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

describe('BuyerClosingHome mobile continuation', () => {
  it('keeps the buyer stage and ranked next action in a bottom-safe collision zone', () => {
    const fixture = overview();
    fixture.nextAction = {
      id: 'task-1',
      actionKey: 'UPLOAD_EARNEST_MONEY_RECEIPT',
      title: 'Upload earnest money receipt',
      description: 'Keep the payment evidence with the purchase record.',
      status: 'PENDING',
      phase: 'DUE_DILIGENCE',
      priority: 'NOW',
      checklistSection: 'CONTRACT_CONTINGENCIES',
      dueAt: null,
      assignedToUserId: null,
    };

    const { container } = render(<BuyerClosingHome overview={fixture} />);
    const mobileBar = container.querySelector('[data-chat-collision-zone="true"]');

    expect(mobileBar).toBeInTheDocument();
    expect(mobileBar).toHaveClass('fixed');
    expect(mobileBar?.className).toContain('env(safe-area-inset-bottom)');
    expect(within(mobileBar as HTMLElement).getByText('Closing journey · Due diligence')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByText('Upload earnest money receipt · No deadline recorded')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByRole('link', {
      name: 'Continue Closing Plan: Upload earnest money receipt',
    })).toHaveAttribute('href', fixture.routes.plan);
  });

  it('switches the mobile continuation to paused recovery copy', () => {
    const fixture = overview();
    fixture.journey.status = 'PAUSED';

    const { container } = render(<BuyerClosingHome overview={fixture} />);
    const mobileBar = container.querySelector('[data-chat-collision-zone="true"]');

    expect(within(mobileBar as HTMLElement).getByText('Closing journey · Paused')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByText(
      'Your dates, evidence, and completed work are preserved.',
    )).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByRole('link', {
      name: 'Review paused Closing Plan',
    })).toHaveAttribute('href', fixture.routes.plan);
  });
});
