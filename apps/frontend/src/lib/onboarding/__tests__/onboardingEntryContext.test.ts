import {
  buildOnboardingActivationContext,
  isOnboardingTriggerCompatible,
  onboardingTriggerOptionsForSituation,
} from '@/lib/onboarding/onboardingEntryContext';

const base = {
  triggerType: 'PROJECT' as const,
  triggerLabel: 'Plan a home project',
  triggerDetail: '',
  buyerPurchaseStage: 'UNDER_CONTRACT' as const,
  buyerInspectionStatus: 'NOT_SCHEDULED' as const,
  targetCloseDate: '',
  moveInDate: '',
  buyerConcern: '',
};

describe('buildOnboardingActivationContext', () => {
  it('preserves established-owner trigger-first semantics', () => {
    expect(buildOnboardingActivationContext({ ...base, situation: 'own' })).toMatchObject({
      entryPath: 'EXISTING_OWNER_TRIGGER',
      ownershipState: 'ESTABLISHED_OWNER',
      propertyOrigin: 'EXISTING_HOME',
      activeTrigger: { type: 'PROJECT', label: 'Plan a home project' },
    });
  });

  it('preserves buyer context and inspection-trigger semantics', () => {
    const result = buildOnboardingActivationContext({
      ...base,
      situation: 'buying',
      triggerType: null,
      buyerInspectionStatus: 'REPORT_AVAILABLE',
      targetCloseDate: '2026-10-15',
      buyerConcern: 'Review the inspection deadline',
    });

    expect(result).toMatchObject({
      entryPath: 'EXISTING_HOME_PURCHASE',
      ownershipState: 'UNDER_CONTRACT',
      propertyOrigin: 'EXISTING_HOME',
      activeTrigger: {
        type: 'INSPECTION_FINDING',
        label: 'Review the inspection deadline',
      },
      buyer: {
        inspectionStatus: 'REPORT_AVAILABLE',
        targetCloseDate: '2026-10-15T12:00:00.000Z',
      },
    });
  });

  it('preserves new-home and exploration destinations', () => {
    expect(buildOnboardingActivationContext({ ...base, situation: 'new-build' })).toMatchObject({
      entryPath: 'NEW_HOME_SETUP',
      ownershipState: 'UNDER_CONTRACT',
      propertyOrigin: 'NEW_CONSTRUCTION',
    });
    expect(buildOnboardingActivationContext({
      ...base,
      situation: 'exploring',
      triggerType: 'NONE_EXPLORING',
    })).toMatchObject({
      entryPath: 'EXPLORATION',
      ownershipState: 'SHOPPING',
      propertyOrigin: 'UNKNOWN',
    });
  });

  it('allows setup without forcing an immediate goal', () => {
    expect(onboardingTriggerOptionsForSituation('own').map((option) => option.type))
      .toContain('NONE_EXPLORING');
    expect(onboardingTriggerOptionsForSituation('exploring').map((option) => option.type))
      .toContain('NONE_EXPLORING');
    expect(isOnboardingTriggerCompatible('EXISTING_OWNER_TRIGGER', 'NONE_EXPLORING')).toBe(true);
    expect(buildOnboardingActivationContext({
      ...base,
      situation: 'own',
      triggerType: null,
    })).toMatchObject({
      entryPath: 'EXISTING_OWNER_TRIGGER',
      activeTrigger: { type: 'NONE_EXPLORING', label: 'Set up my home' },
    });
  });
});
