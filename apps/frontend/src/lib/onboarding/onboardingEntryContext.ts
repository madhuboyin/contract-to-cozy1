import type { ActivationEntryContextInput } from '@/types';

export type OnboardingSituation = 'own' | 'buying' | 'new-build' | 'exploring';
export type OnboardingTriggerType = ActivationEntryContextInput['activeTrigger']['type'];
export type BuyerPurchaseStage = NonNullable<ActivationEntryContextInput['buyer']>['purchaseStage'];
export type BuyerInspectionStatus = NonNullable<ActivationEntryContextInput['buyer']>['inspectionStatus'];

type OnboardingEntryContextOptions = {
  situation: OnboardingSituation;
  triggerType: OnboardingTriggerType | null;
  triggerLabel?: string;
  triggerDetail: string;
  buyerPurchaseStage: BuyerPurchaseStage;
  buyerInspectionStatus: BuyerInspectionStatus;
  targetCloseDate: string;
  moveInDate: string;
  buyerConcern: string;
};

function isoFromDateInput(value: string): string | null {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

export function buildOnboardingActivationContext(
  options: OnboardingEntryContextOptions,
): ActivationEntryContextInput {
  if (options.situation === 'buying') {
    const buyerLabel = options.buyerConcern.trim()
      || (options.buyerPurchaseStage === 'EXPLORING'
        ? 'Compare this home before making an offer'
        : options.buyerPurchaseStage === 'OFFER_MADE'
          ? 'Prepare for a possible contract'
          : 'Prepare for closing');
    return {
      entryPath: 'EXISTING_HOME_PURCHASE',
      ownershipState: options.buyerPurchaseStage === 'UNDER_CONTRACT' ? 'UNDER_CONTRACT' : 'SHOPPING',
      propertyOrigin: 'EXISTING_HOME',
      activeTrigger: {
        type: ['REPORT_AVAILABLE', 'REVIEWED'].includes(options.buyerInspectionStatus)
          ? 'INSPECTION_FINDING'
          : 'OTHER',
        label: buyerLabel,
        detail: options.buyerConcern.trim() || null,
        entityType: 'PROPERTY',
        entityId: null,
        source: 'USER_SELECTED',
      },
      buyer: {
        purchaseStage: options.buyerPurchaseStage,
        targetCloseDate: isoFromDateInput(options.targetCloseDate),
        inspectionStatus: options.buyerInspectionStatus,
        moveInDate: isoFromDateInput(options.moveInDate),
        immediateConcern: options.buyerConcern.trim() || null,
      },
      consentContext: 'User submitted buyer journey context to prepare a property-scoped closing plan.',
      sourceMetadata: { onboardingSurface: 'address', experienceMode: 'BUYER_CLOSING' },
    };
  }

  if (!options.triggerType) throw new Error('Choose what brought you here.');
  return {
    entryPath: options.situation === 'new-build'
      ? 'NEW_HOME_SETUP'
      : options.situation === 'exploring'
        ? 'EXPLORATION'
        : 'EXISTING_OWNER_TRIGGER',
    ownershipState: options.situation === 'new-build'
      ? 'UNDER_CONTRACT'
      : options.situation === 'exploring'
        ? 'SHOPPING'
        : 'ESTABLISHED_OWNER',
    propertyOrigin: options.situation === 'new-build'
      ? 'NEW_CONSTRUCTION'
      : options.situation === 'exploring'
        ? 'UNKNOWN'
        : 'EXISTING_HOME',
    activeTrigger: {
      type: options.triggerType,
      label: options.triggerLabel ?? 'Home planning question',
      detail: options.triggerDetail.trim() || null,
      entityType: 'PROPERTY',
      entityId: null,
      source: 'USER_SELECTED',
    },
    consentContext: 'User submitted this trigger to receive property-specific onboarding guidance.',
    sourceMetadata: { onboardingSurface: 'address' },
  };
}
