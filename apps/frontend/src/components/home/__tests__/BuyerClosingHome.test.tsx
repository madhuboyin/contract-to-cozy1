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
    personalization: { setupStatus: 'PERSONALIZED', questionsRemaining: 0 },
    nextAction: null,
    nextActionGuidance: null,
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

describe('BuyerClosingHome closing command center', () => {
  it('establishes the closing, current status and plain-language journey before task guidance', () => {
    render(<BuyerClosingHome overview={overview()} />);

    expect(screen.getByRole('heading', { name: 'Your closing at 10 Main St' })).toBeInTheDocument();
    expect(screen.getByText('Your home closing')).toBeInTheDocument();
    expect(screen.getAllByText('Inspection and decisions').length).toBeGreaterThan(0);
    expect(screen.getByText('Current step: Inspection and decisions')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Closing journey' })).toBeInTheDocument();
    expect(screen.getByText('You are here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open closing guide/ })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/buyer-plan',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('reassures the buyer when there is nothing urgent and keeps records behind the full guide', () => {
    render(<BuyerClosingHome overview={overview()} />);

    expect(screen.getByText('No urgent issues recorded')).toBeInTheDocument();
    expect(screen.getByText('You’re clear to continue')).toBeInTheDocument();
    expect(screen.queryByText('Needs your attention')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View full timeline/ })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/buyer-plan',
    );
    expect(screen.getByText('No other confirmed dates are coming up.')).toBeInTheDocument();
  });

  it('uses the unified deadline stream and never repeats the selected action as an attention item', () => {
    const fixture = overview();
    fixture.nextAction = {
      id: 'task-1', actionKey: 'buyer:loan', title: 'Send lender documents', description: null,
      status: 'PENDING', phase: 'DUE_DILIGENCE', priority: 'NOW', checklistSection: null,
      dueAt: '2026-09-10T12:00:00.000Z', assignedToUserId: null,
    };
    fixture.blockers = [fixture.nextAction];
    fixture.upcomingDeadlines = [
      { id: 'task:task-2', source: 'TASK', sourceId: 'task-2', label: 'Confirm contract dates', dueAt: '2026-09-05T12:00:00.000Z' },
      { id: 'milestone:closing', source: 'MILESTONE', sourceId: 'closing', label: 'Closing', dueAt: '2026-09-15T12:00:00.000Z' },
    ];

    render(<BuyerClosingHome overview={fixture} />);

    expect(screen.getByText('Next confirmed deadline')).toBeInTheDocument();
    expect(screen.getAllByText('Confirm contract dates').length).toBeGreaterThan(0);
    expect(screen.queryByText('Needs attention now')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Send lender documents' })).toBeInTheDocument();
  });

  it('shows deadline urgency and flags dates that fall after closing', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-29T12:00:00.000Z'));
    const fixture = overview();
    fixture.upcomingDeadlines = [
      { id: 'task:urgent', source: 'TASK', sourceId: 'urgent', label: 'Confirm contract dates', dueAt: '2026-08-31T12:00:00.000Z' },
      { id: 'task:after-close', source: 'TASK', sourceId: 'after-close', label: 'Late document review', dueAt: '2026-09-16T12:00:00.000Z' },
    ];

    render(<BuyerClosingHome overview={fixture} />);

    expect(screen.getByText('Due in 2 days')).toBeInTheDocument();
    expect(screen.getByText('Date needs review')).toBeInTheDocument();
    jest.useRealTimers();
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
    expect(within(mobileBar as HTMLElement).getByText('Inspection and decisions')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByText('Upload earnest money receipt · No confirmed deadline')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByRole('link', {
      name: 'Continue: Upload earnest money receipt',
    })).toHaveAttribute('href', fixture.routes.plan);
  });

  it('switches the mobile continuation to paused recovery copy', () => {
    const fixture = overview();
    fixture.journey.status = 'PAUSED';

    const { container } = render(<BuyerClosingHome overview={fixture} />);
    const mobileBar = container.querySelector('[data-chat-collision-zone="true"]');

    expect(within(mobileBar as HTMLElement).getByText('Closing guide paused')).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByText(
      'Your dates, documents, and completed work are preserved.',
    )).toBeInTheDocument();
    expect(within(mobileBar as HTMLElement).getByRole('link', {
      name: 'Review paused Closing Guide',
    })).toHaveAttribute('href', fixture.routes.plan);
  });
});
