import type { ActivationEntryContextInput } from '@/types';

export type OnboardingSituation = 'own' | 'buying' | 'new-build' | 'exploring';
export type OnboardingTriggerType = ActivationEntryContextInput['activeTrigger']['type'];
export type BuyerPurchaseStage = NonNullable<ActivationEntryContextInput['buyer']>['purchaseStage'];
export type BuyerInspectionStatus = NonNullable<ActivationEntryContextInput['buyer']>['inspectionStatus'];

export const ONBOARDING_TRIGGER_OPTIONS: ReadonlyArray<{
  type: OnboardingTriggerType;
  label: string;
}> = [
  { type: 'REPAIR', label: 'Something needs repair' },
  { type: 'REPLACEMENT', label: 'Repair or replace a system' },
  { type: 'CONTRACTOR_QUOTE', label: 'Review a contractor quote' },
  { type: 'MAINTENANCE_BACKLOG', label: 'Catch up on maintenance' },
  { type: 'INSURANCE_COVERAGE', label: 'Insurance or warranty question' },
  { type: 'PROJECT', label: 'Plan a home project' },
  { type: 'ANTICIPATED_COST', label: 'Prepare for a future cost' },
  { type: 'NONE_EXPLORING', label: 'Just understand my home' },
];

export function onboardingTriggerOptionsForSituation(
  situation: OnboardingSituation,
) {
  return ONBOARDING_TRIGGER_OPTIONS.filter((option) =>
    option.type !== 'NONE_EXPLORING' || situation === 'exploring');
}

export function isOnboardingTriggerCompatible(
  entryPath: string,
  triggerType: string,
): boolean {
  return triggerType !== 'NONE_EXPLORING' || entryPath === 'EXPLORATION';
}

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
  const entryPath = options.situation === 'new-build'
    ? 'NEW_HOME_SETUP'
    : options.situation === 'exploring'
      ? 'EXPLORATION'
      : 'EXISTING_OWNER_TRIGGER';
  if (!isOnboardingTriggerCompatible(entryPath, options.triggerType)) {
    throw new Error('Choose a goal that matches where you are in your home journey.');
  }
  return {
    entryPath,
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
