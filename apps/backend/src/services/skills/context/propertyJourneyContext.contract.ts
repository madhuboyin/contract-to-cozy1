import type { OnboardingEntryPath, OnboardingOwnershipState, OnboardingPropertyOrigin } from '@prisma/client';
import { PROPERTY_IDENTITY_CONTEXT_OPERATIONS } from './propertyIdentityContext.contract';

export const PROPERTY_JOURNEY_CONTEXT_PROVIDER = Object.freeze({
  id: 'property.journey-context',
  version: '1.0.0',
});

export const PROPERTY_JOURNEY_CONTEXT_OPERATIONS = PROPERTY_IDENTITY_CONTEXT_OPERATIONS;

export type AskOperatingMode = 'BUYING' | 'OWNING' | 'SELLING' | 'UNKNOWN';

export interface PropertyJourneyContext {
  propertyId: string;
  ownershipState: OnboardingOwnershipState;
  operatingMode: AskOperatingMode;
  entryPath: OnboardingEntryPath | null;
  propertyOrigin: OnboardingPropertyOrigin | null;
  contextVersion: string;
  capturedAt: string | null;
}

export function operatingModeForOwnershipState(
  ownershipState: OnboardingOwnershipState | null | undefined,
): AskOperatingMode {
  if (ownershipState === 'SHOPPING' || ownershipState === 'UNDER_CONTRACT') return 'BUYING';
  if (ownershipState === 'RECENT_OWNER' || ownershipState === 'ESTABLISHED_OWNER') return 'OWNING';
  if (ownershipState === 'PREPARING_TRANSFER') return 'SELLING';
  return 'UNKNOWN';
}
