import type {
  OutdoorSpaceType,
  PropertyResponsibilityInput,
  PropertyResponsibilityScope,
  ResponsibleParty,
} from '@/types';

export const RESPONSIBILITY_SCOPES: readonly PropertyResponsibilityScope[] = [
  'ROOF',
  'BUILDING_EXTERIOR',
  'LANDSCAPING',
  'TREES_SHRUBS',
  'DRIVEWAY_WALKWAYS',
  'DECK_PATIO_BALCONY',
  'PLUMBING',
  'HVAC',
  'COMMON_SAFETY',
  'SNOW_ICE',
  'PEST_CONTROL',
  'SHARED_SYSTEMS',
];

export const RESPONSIBLE_PARTY_OPTIONS: readonly ResponsibleParty[] = [
  'OWNER',
  'ASSOCIATION',
  'LANDLORD',
  'SHARED',
  'UNKNOWN',
];

export const OUTDOOR_SPACE_TYPE_OPTIONS: readonly OutdoorSpaceType[] = [
  'PRIVATE_YARD',
  'BALCONY',
  'PATIO',
  'DECK',
  'GARDEN_BED',
  'SHARED_YARD',
  'ROOFTOP',
];

export type ResponsibilityParties = Record<PropertyResponsibilityScope, ResponsibleParty>;

export function defaultResponsibilityParties(party: ResponsibleParty = 'OWNER'): ResponsibilityParties {
  return Object.fromEntries(RESPONSIBILITY_SCOPES.map((scope) => [scope, party])) as ResponsibilityParties;
}

export function mapResponsibilitiesToForm(
  responsibilities: Array<Pick<PropertyResponsibilityInput, 'scope' | 'party'>> | null | undefined,
  fallback: ResponsibleParty = 'UNKNOWN',
): ResponsibilityParties {
  const mapped = defaultResponsibilityParties(fallback);
  for (const responsibility of responsibilities ?? []) {
    if (RESPONSIBILITY_SCOPES.includes(responsibility.scope)) {
      mapped[responsibility.scope] = responsibility.party;
    }
  }
  return mapped;
}

export function mapResponsibilitiesToPayload(parties: ResponsibilityParties): PropertyResponsibilityInput[] {
  return RESPONSIBILITY_SCOPES.map((scope) => ({ scope, party: parties[scope] ?? 'UNKNOWN' }));
}

export function normalizeOutdoorSpaceTypes(
  hasPrivateOutdoorSpace: boolean | null | undefined,
  types: OutdoorSpaceType[] | null | undefined,
): OutdoorSpaceType[] {
  if (hasPrivateOutdoorSpace !== true) return [];
  return Array.from(new Set((types ?? []).filter((type) => OUTDOOR_SPACE_TYPE_OPTIONS.includes(type))));
}
