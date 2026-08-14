import type { HouseholdRole, OnboardingOwnershipState } from '@prisma/client';
import type { PropertyAccess } from '../propertyAccess.service';
import type { PropertyJourneyContext, AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import type { AskAccountRole } from './askAccountEligibility';

export const ASK_AUDIENCE_CONTEXT_SCHEMA_VERSION = '1.0' as const;

export type AskPropertyRelationship =
  | 'PRIMARY_OWNER'
  | 'HOUSEHOLD_MEMBER'
  | 'PROSPECTIVE_BUYER'
  | 'NONE';

export interface AskAudienceContext {
  schemaVersion: typeof ASK_AUDIENCE_CONTEXT_SCHEMA_VERSION;
  accountRole: AskAccountRole;
  householdRole: HouseholdRole | null;
  ownershipState: OnboardingOwnershipState;
  operatingMode: AskOperatingMode;
  propertyRelationship: AskPropertyRelationship;
  entryPath: string | null;
  sourceVersion: string | null;
  observedAt: string;
}

export function resolveAskAudienceContext(input: {
  accountRole: AskAccountRole;
  propertyAccess?: PropertyAccess | null;
  journeyContext?: PropertyJourneyContext | null;
  observedAt?: string;
}): AskAudienceContext {
  const access = input.propertyAccess ?? null;
  const journey = input.journeyContext ?? null;
  return {
    schemaVersion: ASK_AUDIENCE_CONTEXT_SCHEMA_VERSION,
    accountRole: input.accountRole,
    householdRole: access?.role ?? null,
    ownershipState: journey?.ownershipState ?? 'UNKNOWN',
    operatingMode: journey?.operatingMode ?? 'UNKNOWN',
    propertyRelationship: !access
      ? 'NONE'
      : access.isPrimaryOwner ? 'PRIMARY_OWNER' : 'HOUSEHOLD_MEMBER',
    entryPath: journey?.entryPath ?? null,
    sourceVersion: journey?.contextVersion ?? null,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}
