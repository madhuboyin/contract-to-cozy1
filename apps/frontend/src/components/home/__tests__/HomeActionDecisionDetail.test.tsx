import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeActionDecisionDetail } from '@/components/home/HomeActionDecisionDetail';
import type { RankedHomeActionDTO } from '@/types';

jest.mock('@/components/home/HomeActionSpecialistPanel', () => ({
  HomeActionSpecialistPanel: ({ profileLabel }: { profileLabel?: string }) => <div>{profileLabel}</div>,
}));

function actionWithChange(): RankedHomeActionDTO {
  return {
    assumptions: [],
    options: [],
    tradeoffs: [],
    propertyContextFeature: null,
    recommendationResponse: {
      status: 'AVAILABLE',
      reasonCode: 'AVAILABLE',
      message: 'Available',
      safeNextAction: 'Review',
      missingFacts: [],
      retryable: false,
      materialActionAllowed: true,
    },
    governance: {
      safetyTier: 'MATERIAL_FINANCIAL',
      professionalBoundary: null,
      jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
      conservativeFallback: null,
      emergencyEscalation: null,
      commercialDisclosure: {
        involvesCommercialAction: false,
        relationshipType: 'NONE',
        compensationMayOccur: false,
        rankingInfluenced: false,
        summary: '',
        selectionCriteria: [],
        nonCommercialAlternatives: [],
      },
      reviewedBy: [],
      policyVersion: '1',
    },
    decisionLineage: {
      status: 'LINKED',
      decisionDefinitionId: 'COVERAGE_QUESTION',
      primaryEntityId: 'question-1',
      thread: {
        decisionThreadId: 'thread-1',
        lifecycleStatus: 'RECOMMENDATION_AVAILABLE',
        contextStatus: 'CURRENT',
        currentRecommendationSnapshotId: 'snapshot-2',
        recommendationChange: {
          category: 'MATERIAL',
          previousVerdict: 'KEEP_CURRENT',
          currentVerdict: 'ADD_COVERAGE',
          changedFactors: ['policy limit'],
        },
        limitationCodes: [],
      },
    },
  } as unknown as RankedHomeActionDTO;
}

test('renders the persisted change and acknowledges the exact thread and snapshot only on Got it', async () => {
  const acknowledge = jest.fn().mockResolvedValue(undefined);
  render(
    <HomeActionDecisionDetail
      action={actionWithChange()}
      propertyId="property-1"
      onRecommendationChangeAcknowledged={acknowledge}
    />,
  );

  expect(screen.getByText('What changed since you last looked')).toBeInTheDocument();
  expect(acknowledge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  await waitFor(() => expect(acknowledge).toHaveBeenCalledWith('thread-1', 'snapshot-2'));
});

test('renders the shared Specialist entry point for APPLIANCE_REPAIR_REPLACE', () => {
  const action = actionWithChange();
  action.decisionLineage = {
    status: 'NOT_STARTED',
    decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
    primaryEntityId: 'dishwasher-1',
  };
  Object.assign(action, {
    id: 'action-1', lineageId: 'appliance-repair-replace:dishwasher-1',
    source: { entityId: 'analysis-1', version: 'v1' },
  });
  render(<HomeActionDecisionDetail action={action} propertyId="property-1" />);
  expect(screen.getByText('Appliance Repair-or-Replace Specialist')).toBeInTheDocument();
});
