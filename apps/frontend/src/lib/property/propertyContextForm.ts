import type {
  DwellingType,
  OutdoorSpaceType,
  PropertyResponsibilityInput,
  PropertyResponsibilityScope,
  ResponsibleParty,
} from '@/types';

export const DWELLING_TYPE_OPTIONS = [
  'DETACHED_SINGLE_FAMILY',
  'ATTACHED_SINGLE_FAMILY',
  'TOWNHOUSE',
  'CONDO_UNIT',
  'APARTMENT_UNIT',
  'DUPLEX',
  'MULTI_FAMILY',
  'MANUFACTURED_HOME',
  'OTHER',
  'UNKNOWN',
] as const satisfies readonly DwellingType[];

export const DWELLING_TYPE_LABELS: Record<DwellingType, string> = {
  DETACHED_SINGLE_FAMILY: 'Detached house',
  ATTACHED_SINGLE_FAMILY: 'Attached house',
  TOWNHOUSE: 'Townhouse',
  CONDO_UNIT: 'Condo unit',
  APARTMENT_UNIT: 'Apartment unit',
  DUPLEX: 'Duplex',
  MULTI_FAMILY: 'Multi-family property',
  MANUFACTURED_HOME: 'Manufactured or mobile home',
  OTHER: 'Something else',
  UNKNOWN: 'I’m not sure',
};

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
export type ResponsibilityPreset = Exclude<ResponsibleParty, 'UNKNOWN'> | 'CUSTOM' | 'UNKNOWN';

export function defaultResponsibilityParties(party: ResponsibleParty = 'OWNER'): ResponsibilityParties {
  return Object.fromEntries(RESPONSIBILITY_SCOPES.map((scope) => [scope, party])) as ResponsibilityParties;
}

export function getResponsibilityPreset(
  responsibilities: ResponsibilityParties | null | undefined,
): ResponsibilityPreset {
  const parties = RESPONSIBILITY_SCOPES.map((scope) => responsibilities?.[scope] ?? 'UNKNOWN');
  const first = parties[0];
  if (parties.every((party) => party === 'UNKNOWN')) return 'UNKNOWN';
  if (first !== 'UNKNOWN' && parties.every((party) => party === first)) return first;
  return 'CUSTOM';
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
