import React from 'react';
import { render, screen } from '@testing-library/react';
import { GuidancePrimaryCta } from '../GuidancePrimaryCta';
import { GuidanceJourneyStrip } from '../GuidanceJourneyStrip';
import { GuidanceActionCard } from '../GuidanceActionCard';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function buildAction(overrides: Partial<GuidanceActionModel> = {}): GuidanceActionModel {
  return {
    journeyId: 'journey-1',
    journey: {
      id: 'journey-1',
      propertyId: 'property-1',
      homeAssetId: null,
      inventoryItemId: null,
      journeyKey: 'journey_asset_lifecycle_resolution',
      journeyTypeKey: 'asset_lifecycle_resolution',
      templateVersion: null,
      issueDomain: 'ASSET_LIFECYCLE',
      decisionStage: 'DECISION',
      executionReadiness: 'NEEDS_CONTEXT',
      status: 'ACTIVE',
      currentStepOrder: 1,
      currentStepKey: 'repair_replace_decision',
      isLowContext: false,
      missingContextKeys: [],
      contextSnapshot: null,
      derivedSnapshot: null,
      scopeCategory: 'ITEM',
      scopeId: null,
      issueType: null,
      serviceKey: null,
      isUserInitiated: false,
      dismissedReason: null,
      dismissedAt: null,
      startedAt: null,
      completedAt: null,
      updatedAt: null,
      progress: { completedCount: 0, totalCount: 1, percent: 0 },
      primarySignal: null,
      steps: [],
    },
    issueDomain: 'ASSET_LIFECYCLE',
    title: 'HVAC lifecycle risk',
    subtitle: 'Review next step',
    executionReadiness: 'NEEDS_CONTEXT',
    severity: 'HIGH',
    currentStep: null,
    nextStep: null,
    steps: [],
    href: null,
    blockedReason: null,
    warnings: [],
    missingPrerequisites: [],
    progress: { completedCount: 0, totalCount: 1, percent: 0 },
    isLowContext: false,
    priorityScore: 70,
    priorityBucket: 'HIGH',
    priorityGroup: 'IMMEDIATE',
    confidenceScore: 0.7,
    confidenceLabel: 'MEDIUM',
    financialImpactScore: 50,
    fundingGapFlag: false,
    costOfDelay: 200,
    coverageImpact: 'UNKNOWN',
    explanation: null,
    ...overrides,
  };
}

describe('Guidance UI safety', () => {
  it('renders fallback CTA label for empty labels', () => {
    render(
      <GuidancePrimaryCta
        label=""
        executionReadiness="READY"
        href="/dashboard/test"
      />
    );

    expect(screen.getByRole('link', { name: /Review Next Step/i })).toBeInTheDocument();
  });

  it('renders a safe empty state for journey strips with no steps', () => {
    render(<GuidanceJourneyStrip steps={[]} />);
    expect(screen.getByText(/Journey details are still loading/i)).toBeInTheDocument();
  });

  it('renders fallback warning when next step is unavailable', () => {
    const action = buildAction({
      nextStep: null,
      steps: [],
      warnings: [],
      title: '',
      subtitle: '',
      progress: { completedCount: 0, totalCount: 0, percent: 0 },
    });

    render(<GuidanceActionCard action={action} compact />);

    expect(screen.getByText(/Guided Next Step/i)).toBeInTheDocument();
    expect(screen.getByText(/Next step unavailable/i)).toBeInTheDocument();
  });
});
