import { PropertyContextScope } from '../domain/contracts';

export interface PropertyFactDefinition {
  key: string;
  scope: PropertyContextScope;
  canonicalOwner: string;
  correctionPath: string | null;
  writable: boolean;
}

const propertyPath = (section: string) => `/dashboard/properties/:propertyId/edit#${section}`;

export const PROPERTY_FACT_CATALOG = [
  { key: 'core.dwellingType', scope: 'CORE', canonicalOwner: 'Property.dwellingType', correctionPath: propertyPath('property-type'), writable: true },
  { key: 'core.ownershipForm', scope: 'CORE', canonicalOwner: 'Property.ownershipForm', correctionPath: propertyPath('property-type'), writable: true },
  { key: 'core.propertyUse', scope: 'CORE', canonicalOwner: 'Property.propertyUse', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.occupancyStatus', scope: 'CORE', canonicalOwner: 'Property.occupancyStatus', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.isPrimary', scope: 'CORE', canonicalOwner: 'Property.isPrimary', correctionPath: propertyPath('occupancy'), writable: true },
  { key: 'core.yearBuilt', scope: 'CORE', canonicalOwner: 'Property.yearBuilt', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.propertySizeSqFt', scope: 'CORE', canonicalOwner: 'Property.propertySize', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.bedrooms', scope: 'CORE', canonicalOwner: 'Property.bedrooms', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.bathrooms', scope: 'CORE', canonicalOwner: 'Property.bathrooms', correctionPath: propertyPath('structure'), writable: true },
  { key: 'core.activationStatus', scope: 'CORE', canonicalOwner: 'Property.activationStatus', correctionPath: null, writable: false },
  { key: 'location.city', scope: 'LOCATION', canonicalOwner: 'Property.city', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.state', scope: 'LOCATION', canonicalOwner: 'Property.state', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.zipCode', scope: 'LOCATION', canonicalOwner: 'Property.zipCode', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.timezone', scope: 'LOCATION', canonicalOwner: 'Property.timezone', correctionPath: propertyPath('address'), writable: true },
  { key: 'location.geocoded', scope: 'LOCATION', canonicalOwner: 'Property.latitude/longitude', correctionPath: propertyPath('address'), writable: false },
  { key: 'exterior.hasPrivateOutdoorSpace', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasPrivateOutdoorSpace', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.outdoorSpaceTypes', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.outdoorSpaceTypes', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.lotSizeSqFt', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.lotSizeSqFt', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasLawn', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasLawn', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasTreesOrShrubs', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasTreesOrShrubs', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasDriveway', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasDriveway', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasFence', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasFence', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasPoolOrSpa', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasPoolOrSpa', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasIrrigation', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasIrrigation', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasOutdoorFaucets', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasOutdoorFaucets', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'exterior.hasDrainageIssues', scope: 'EXTERIOR', canonicalOwner: 'PropertyExteriorProfile.hasDrainageIssues', correctionPath: propertyPath('exterior'), writable: true },
  { key: 'responsibility.roof', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.ROOF', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.buildingExterior', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.BUILDING_EXTERIOR', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.landscaping', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.LANDSCAPING', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.treesShrubs', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.TREES_SHRUBS', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.drivewayWalkways', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.DRIVEWAY_WALKWAYS', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.deckPatioBalcony', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.DECK_PATIO_BALCONY', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.plumbing', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.PLUMBING', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.hvac', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.HVAC', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.commonSafety', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.COMMON_SAFETY', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.snowIce', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.SNOW_ICE', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.pestControl', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.PEST_CONTROL', correctionPath: propertyPath('responsibility'), writable: true },
  { key: 'responsibility.sharedSystems', scope: 'RESPONSIBILITY', canonicalOwner: 'PropertyResponsibility.SHARED_SYSTEMS', correctionPath: propertyPath('responsibility'), writable: true },
] as const satisfies readonly PropertyFactDefinition[];

const catalogByKey = new Map<string, PropertyFactDefinition>(
  PROPERTY_FACT_CATALOG.map((definition) => [definition.key, definition]),
);

export function getFactDefinition(key: string): PropertyFactDefinition {
  const definition = catalogByKey.get(key);
  if (!definition) throw new Error(`Property Context fact key is not allowlisted: ${key}`);
  return definition;
}

export function getFactDefinitionsForScope(scope: PropertyContextScope): PropertyFactDefinition[] {
  return PROPERTY_FACT_CATALOG.filter((definition) => definition.scope === scope);
}

export function isAllowlistedFactKey(key: string): boolean {
  return catalogByKey.has(key);
}
